/**
 * Walker for ColumnsOnly nodes — emits the projected columns for the
 * select.column[] array using the current transpiler context.
 */

import type {
  ViewDefinitionColumn,
  ViewDefinitionSelect,
} from "../../../types.js";
import type { ColumnExpressionGenerator } from "../../ColumnExpressionGenerator.js";
import type { Context, Fragment, ProjectedColumn } from "../types.js";

/**
 * Projects an array of ViewDefinition column descriptors into SQL expressions.
 *
 * Delegates expression generation to `ColumnExpressionGenerator`, which
 * translates each column's FHIRPath expression into a T-SQL expression
 * relative to the current transpiler context (iteration source, aliases, etc.).
 *
 * @param columns - The column descriptors from the ViewDefinition select node.
 * @param ctx - The current walker context supplying the transpiler context
 *   used for FHIRPath-to-SQL translation.
 * @param columnGenerator - The generator that converts each column descriptor
 *   into its SQL expression string.
 * @returns An ordered array of `ProjectedColumn` objects, each pairing the
 *   column's logical name with its SQL expression.
 */
export function projectColumns(
  columns: ViewDefinitionColumn[],
  ctx: Context,
  columnGenerator: ColumnExpressionGenerator,
): ProjectedColumn[] {
  return columns.map((column) => ({
    name: column.name,
    sqlExpr: columnGenerator.generateExpression(column, ctx.transpilerCtx),
  }));
}

/**
 * Walker for ColumnsOnly nodes — emits the projected columns for a leaf select node.
 *
 * Produces a Fragment with no CTEs, no FROM extensions, and columns derived
 * from `node.column[]` via `projectColumns`.  If `node.column` is absent or
 * empty, the returned Fragment has an empty columns array.
 *
 * @param node - The leaf select node whose `column[]` array is projected.
 * @param ctx - The current walker context supplying partition keys and the
 *   transpiler context for expression generation.
 * @param columnGenerator - The generator that converts column descriptors into
 *   T-SQL expressions.
 * @returns A Fragment carrying only projected columns; `ctes` and
 *   `fromExtensions` are always empty.
 */
export function walkColumnsOnly(
  node: ViewDefinitionSelect,
  ctx: Context,
  columnGenerator: ColumnExpressionGenerator,
): Fragment {
  const columns = node.column
    ? projectColumns(node.column, ctx, columnGenerator)
    : [];
  return {
    ctes: [],
    fromExtensions: "",
    columns,
    partitionKeys: ctx.partitionKeys,
  };
}
