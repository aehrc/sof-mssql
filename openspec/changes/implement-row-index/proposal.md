## Why

The SQL on FHIR v2 specification defines a `%rowIndex` environment variable that
holds the 0-based position of the current element within a collection being
iterated by `forEach`, `forEachOrNull`, or `repeat`. It lets views capture
element position for ordering or surrogate keys. The transpiler does not yet
recognise it, so the nine in-scope tests in `sqlonfhir/tests/row_index.json`
(pulled in by the submodule bump in #9) currently fail and show as red in the
test report. Per the project constitution (Principle I), in-scope tests must
pass.

## What Changes

- Recognise `%rowIndex` as a built-in FHIRPath environment variable during
  column expression transpilation, instead of rejecting it as an undefined
  constant.
- Resolve `%rowIndex` to the 0-based index of the innermost active iteration:
  - Inside `forEach` / `forEachOrNull`: the iterated element's position, using
    the `OPENJSON` `[key]` column already captured by the walker.
  - Inside `repeat`: the position within the flattened depth-first traversal of
    the recursive result.
  - With no active iteration (resource level, or a `unionAll` branch with no
    iteration of its own): `0`.
- Ensure correct behaviour across nesting and composition: nested `forEach`
  levels each resolve to their own index, and `unionAll` branches resolve
  independently based on whether the branch introduces its own iteration.
- Cast the resolved value to T-SQL `INT` so it satisfies the `integer` column
  type.

## Capabilities

### New Capabilities

- `row-index-variable`: Resolution of the `%rowIndex` FHIRPath environment
  variable to a 0-based T-SQL integer reflecting the current element's position
  within the active `forEach`, `forEachOrNull`, or `repeat` iteration, or `0`
  when no iteration is active.

### Modified Capabilities

<!-- None: no existing specs under openspec/specs/ define behaviour changed by this work. -->

## Impact

- `src/fhirpath/visitor.ts`: `visitExternalConstant` must resolve `%rowIndex`
  from the transpiler context rather than throwing.
- `src/fhirpath/transpiler.ts` and `TranspilerContext`: may need to expose the
  active iteration's index expression to the visitor.
- `src/queryGenerator/treeWalker/operators/forEach.ts`, `repeat.ts`,
  `unionAll.ts`: thread the current iteration's index expression into the
  transpiler context so `%rowIndex` resolves correctly across nesting and
  composition.
- `src/queryGenerator/treeWalker/cteTemplates.ts`: the `repeat` recursive CTE
  must expose a stable depth-first traversal index for `%rowIndex` to reference.
- Tests: the nine in-scope cases in `sqlonfhir/tests/row_index.json` move from
  failing to passing; no production API surface changes.
