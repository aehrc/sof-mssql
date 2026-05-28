## Context

The transpiler turns ViewDefinition column `path` expressions into T-SQL via a
FHIRPath visitor (`src/fhirpath/visitor.ts`) driven by a `TranspilerContext`,
and a tree walker (`src/queryGenerator/treeWalker/`) that emits the surrounding
`SELECT` / `APPLY` / CTE structure. Iteration constructs already thread context
to the visitor:

- `forEach` / `forEachOrNull` (`operators/forEach.ts`) emit `CROSS APPLY` /
  `OUTER APPLY OPENJSON(...)` and set `currentForEachAlias`; the iterated
  element's 0-based position is the `OPENJSON` `[key]` column, already exposed
  to `$index` via `visitIndexInvocation` (`visitor.ts:398`).
- `repeat` (`operators/repeat.ts`, `cteTemplates.ts`) emits a recursive CTE that
  accumulates a `.`-joined `__path` of element keys for stable identity, and
  also sets `currentForEachAlias` to the CTE alias.
- `unionAll` (`operators/unionAll.ts`) walks every branch in the **same** parent
  context (`unionAll.ts:73`), so a branch carries whatever iteration context
  encloses the `unionAll`.

Today `%rowIndex` is unhandled: `visitExternalConstant` (`visitor.ts:444`)
throws `Constant '%rowIndex' is not defined` for any name not present in the
ViewDefinition's `constant` list. The nine in-scope tests in
`sqlonfhir/tests/row_index.json` therefore fail. See `proposal.md` for
motivation and `specs/row-index-variable/spec.md` for the normative behaviour.

## Goals / Non-Goals

**Goals:**

- Resolve `%rowIndex` to the 0-based index of the innermost active iteration
  (`forEach`, `forEachOrNull`, `repeat`), and to `0` when no iteration is
  active, producing valid T-SQL `INT`.
- Make all nine in-scope `row_index.json` tests pass without tagging any
  `#experimental` (constitution Principle I).
- Keep the change additive and behaviour-preserving for every other test.

**Non-Goals:**

- Changing the behaviour of the `$index` FHIRPath built-in
  (`visitIndexInvocation`). It overlaps conceptually but is out of scope here;
  see Open Questions.
- Supporting `%rowIndex` anywhere other than column `path` expressions (the spec
  scopes it to iteration over `select` columns).
- General-purpose user-defined environment variables beyond the existing
  `constant` mechanism.

## Decisions

### Decision 1: Resolve `%rowIndex` from a dedicated context field

Add an optional `rowIndexExpr?: string` to `TranspilerContext`. In
`visitExternalConstant`, special-case the name `rowIndex` **before** the
constants lookup and the "not defined" error, returning
`this.context.rowIndexExpr ?? "0"`.

Each iteration operator populates `rowIndexExpr` with the SQL expression that
yields that iteration's 0-based index. The resolved expression is an integer, so
columns typed `integer` cast cleanly and `%rowIndex` is correct even when used
without an explicit type.

_Why a dedicated field rather than reusing `currentForEachAlias`._ For `forEach`
the index is `currentForEachAlias.[key]`, but `repeat` sets
`currentForEachAlias` to a **CTE** alias that has no `[key]` column and needs a
different, traversal-ordered expression. A single `[key]`-based rule cannot
serve both. A dedicated field lets each operator supply the right expression and
decouples `%rowIndex` from the `$index` logic.

_Alternative considered._ Compute the expression inside the visitor from
`currentForEachAlias`. Rejected: the visitor cannot distinguish a `forEach`
alias from a `repeat` CTE alias, and does not know the partition keys needed for
the `repeat` window function.

### Decision 2: `forEach` / `forEachOrNull` set `rowIndexExpr` from `[key]`

`buildInnerCtx` sets `rowIndexExpr = COALESCE(CAST(<alias>.[key] AS INT), 0)`.

The `CAST` makes the `NVARCHAR` `[key]` an `INT`. The `COALESCE(..., 0)` covers
`forEachOrNull` over an empty collection: `OUTER APPLY` yields a single row with
a `NULL` `[key]`, and the spec requires `%rowIndex = 0` for that null-padded row
(`spec.md` scenario "forEachOrNull on an empty collection reports zero").

Nested `forEach` works for free: each level's `buildInnerCtx` overwrites
`rowIndexExpr` with its own alias, and a column resolves against the context of
its own `select` level.

### Decision 3: `repeat` sets `rowIndexExpr` to a traversal-ordered row number

`%rowIndex` inside `repeat` must be the position within the flattened
depth-first (pre-order) traversal - `0, 1, 2, 3` for items `1, 1.1, 1.2, 2`
(`spec.md` scenario "repeat reports flattened traversal position").

`buildRepeatInnerCtx` sets:

```
rowIndexExpr = (ROW_NUMBER() OVER (PARTITION BY <ancestor partition keys>
                                   ORDER BY <cteAlias>.__order) - 1)
```

where `<ancestor partition keys>` are `ctx.partitionKeys` from before the repeat
key is appended (so each resource - and each enclosing `forEach` element - gets
its own 0-based sequence). The window function lives in the outer `SELECT`,
which already `INNER JOIN`s the CTE, so the reference is in scope.

To order pre-order correctly, extend the recursive CTE
(`cteTemplates.ts`) to accumulate an ordering key `__order` exactly as it builds
`__path`, but with each segment's `[key]` zero-padded to a fixed width
(e.g. `RIGHT('0000000000' + CAST(... AS NVARCHAR(10)), 10)`). Lexical ordering of
the padded, `.`-joined key path is then equivalent to numeric pre-order.

_Alternative considered._ Order by the existing `__path` directly. Rejected:
`__path` zero-pads nothing, so lexical order breaks once any level has ten or
more elements (`"10" < "2"`). The test data stays single-digit, but ordering on
unpadded keys is a latent conformance bug (Principle I) for no real saving.

_Alternative considered._ Compute the row number inside the CTE. Rejected:
`ROW_NUMBER()` cannot reference the full recursive result from within the
recursive member; the outer query is the correct place.

### Decision 4: `unionAll` needs no change

`walkUnionAll` already walks each branch in the enclosing context
(`unionAll.ts:73`). A branch that introduces its own `forEach` / `repeat`
overwrites `rowIndexExpr` within its own walk; a branch with no iteration keeps
the enclosing `rowIndexExpr` (the enclosing `forEach` index, or unset → `0` at
top level). Because the `CROSS APPLY (… UNION ALL …)` derived table is
correlated, an inherited `forEach` alias remains in scope inside the branch.
This delivers all three `unionAll` scenarios in `spec.md` with no operator
change.

### Decision 5: Top level resolves to `0`

No operator sets `rowIndexExpr` at the resource root, so `visitExternalConstant`
returns the `"0"` fallback - one value per resource row, matching the top-level
scenario.

## Risks / Trade-offs

- **Recursive CTE output order is not guaranteed by SQL Server** → the
  `%rowIndex` window function uses an explicit `ORDER BY <cteAlias>.__order`
  rather than relying on physical row order.
- **Multi-digit array indices breaking lexical pre-order** → mitigated by
  zero-padding each key segment in `__order` (Decision 3).
- **Generated SQL must execute, not merely parse** (Principle II) → verify the
  `ROW_NUMBER() OVER (…)` column, the `OUTER APPLY` `COALESCE`, and the
  `unionAll`-inherited alias references against a real SQL Server via the test
  suite, not by string inspection.
- **Over-broad special-casing** → only the exact name `rowIndex` is intercepted;
  every other unknown `%name` still raises the existing "not defined" error, and
  a user `constant` literally named `rowIndex` is intentionally shadowed (the
  spec reserves the name).
- **Padding width assumption** → a fixed 10-character pad assumes no single
  collection level exceeds `10^10` elements, which is safe for FHIR resources.

## Migration Plan

Additive change; no data or API migration. Rollback is a straight revert of the
commit. Validation is the existing quality gate run with the database sourced:
`set -a && source .env && set +a && npm run test:coverage`, plus `npm run lint`,
`npm run format:check`, and `npm run build`.

## Open Questions

- Should `$index` (`visitIndexInvocation`) be unified with `%rowIndex` by
  routing it through `rowIndexExpr`? It would fix `$index` inside `repeat` (which
  currently emits a non-existent `<cteAlias>.[key]`) and remove duplication, but
  risks changing untested `$index` behaviour. Deferred unless a failing test
  demands it.
- The SoF specification text on `%rowIndex` within `repeat` is light; this design
  treats the `row_index.json` expectations (depth-first pre-order) as the source
  of truth per the constitution.
