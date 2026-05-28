## 1. Establish the failing baseline (Red)

- [x] 1.1 Run the row_index suite with the database sourced (`set -a && source .env && set +a && SQLONFHIR_TEST_PATH=sqlonfhir/tests/row_index.json npm test`) and confirm all nine cases fail with the "Constant '%rowIndex' is not defined" error - establishing the red baseline before any change.
- [x] 1.2 Confirm the nine cases are not tagged `#experimental` and are therefore in scope for CI (`npm run test:ci`).

## 2. Resolve %rowIndex in the visitor

- [x] 2.1 Add an optional `rowIndexExpr?: string` field to `TranspilerContext` in `src/fhirpath/visitor.ts` (and re-export point in `src/fhirpath/transpiler.ts`), documented as the SQL expression yielding the current iteration's 0-based index.
- [x] 2.2 In `visitExternalConstant`, special-case the name `rowIndex` before the constants lookup and the "not defined" error, returning `this.context.rowIndexExpr ?? "0"`.
- [x] 2.3 Verify the top-level scenario passes: `%rowIndex at top level` returns `0` for every resource row.
- [x] 2.4 Confirm no regression to the existing "Constant is not defined" behaviour for genuinely unknown `%` constants (the existing transpiler/visitor unit tests still pass).

## 3. forEach and forEachOrNull index

- [x] 3.1 In `buildInnerCtx` (`src/queryGenerator/treeWalker/operators/forEach.ts`), set `rowIndexExpr` to `COALESCE(CAST(<alias>.[key] AS INT), 0)` so the iterated element's 0-based position is exposed, with the null-padded `OUTER APPLY` row mapping to `0`.
- [x] 3.2 Verify the `%rowIndex with forEach`, `%rowIndex with forEachOrNull`, `%rowIndex for surrogate key`, and `%rowIndex with nested forEach` cases pass, including independent indices per nesting level.

## 4. repeat traversal index

- [x] 4.1 Extend the recursive CTE in `src/queryGenerator/treeWalker/cteTemplates.ts` to accumulate an ordering key `__order` alongside `__path`, zero-padding each segment's `[key]` to a fixed width (e.g. `RIGHT('0000000000' + CAST([key] AS NVARCHAR(10)), 10)`) so lexical ordering equals numeric depth-first pre-order.
- [x] 4.2 In `buildRepeatInnerCtx` (`src/queryGenerator/treeWalker/operators/repeat.ts`), set `rowIndexExpr` to `(ROW_NUMBER() OVER (PARTITION BY <ancestor partition keys> ORDER BY <cteAlias>.__order) - 1)`, partitioning on `ctx.partitionKeys` captured before the repeat key is appended.
- [x] 4.3 Verify the `%rowIndex with repeat` case returns `0, 1, 2, 3` for the depth-first item sequence, and inspect the generated SQL to confirm the window function references the joined CTE correctly.

## 5. unionAll composition

- [x] 5.1 Confirm `walkUnionAll` requires no change: the three unionAll cases (`%rowIndex with unionAll`, `%rowIndex in unionAll without forEach`, `%rowIndex in unionAll inside forEach`) pass because branches inherit or override `rowIndexExpr` via the shared context.
- [x] 5.2 If any unionAll case fails, verify whether the inherited `forEach` alias remains in scope inside the correlated `CROSS APPLY (… UNION ALL …)` derived table, and adjust only if necessary. (No change needed; all three unionAll cases pass.)

## 6. Quality gates and documentation

- [x] 6.1 Run the full suite with coverage and the database sourced (`set -a && source .env && set +a && npm run test:coverage`) and confirm all nine row_index cases pass with no regressions elsewhere.
- [x] 6.2 Run `npm run build`, `npm run lint`, and `npm run format:check` with zero errors, warnings, or formatting differences.
- [x] 6.3 Add or update narrative comments referencing the SQL on FHIR `%rowIndex` definition at the new resolution points, and add `John Grimes` as author on any file significantly changed.
- [x] 6.4 Review the diff for simplicity and remove any dead code before opening the PR (Fixes #11).
