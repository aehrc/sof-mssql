/**
 * Walker for Group nodes — visits each child and merges their fragments.
 *
 * If the node has both `column` and `select`, the columns are emitted as
 * an implicit first ColumnsOnly child so they appear before the children's
 * projections in lexical order.
 */

import type { ViewDefinitionSelect } from "../../../types.js";
import type { ColumnExpressionGenerator } from "../../ColumnExpressionGenerator.js";
import { mergeSiblings } from "../mergeSiblings.js";
import type { Context, Fragment } from "../types.js";
import { projectColumns, walkColumnsOnly } from "./columnsOnly.js";

export function walkGroup(
  node: ViewDefinitionSelect,
  ctx: Context,
  walk: (n: ViewDefinitionSelect, c: Context) => Fragment,
  columnGenerator: ColumnExpressionGenerator,
): Fragment {
  const children: Fragment[] = [];

  if (node.column && node.column.length > 0) {
    children.push(walkColumnsOnly(node, ctx, columnGenerator));
  }

  if (node.select) {
    for (const child of node.select) {
      children.push(walk(child, ctx));
    }
  }

  if (children.length === 0) {
    return {
      ctes: [],
      fromClause: "",
      fromExtensions: "",
      columns: [],
      partitionKeys: ctx.partitionKeys,
      rowOrigin: "row",
    };
  }

  return mergeSiblings(children, ctx);
}

// Re-export so other operators can call into ColumnsOnly through Group.
export { projectColumns };
