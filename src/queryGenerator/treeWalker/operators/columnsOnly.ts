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
    fromClause: "",
    fromExtensions: "",
    columns,
    partitionKeys: ctx.partitionKeys,
    rowOrigin: "row",
  };
}
