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

/**
 * Walker for Group nodes — visits each child select and merges their Fragments.
 *
 * If the node has both `column[]` and `select[]`, the columns are emitted as
 * an implicit first ColumnsOnly child so they appear before the child select
 * projections in lexical order.  All children are walked with the same
 * unmodified `ctx`; their Fragments are merged via `mergeSiblings`.
 *
 * Returns an empty Fragment when the node has neither `column[]` nor
 * `select[]` children.
 *
 * @param node - The Group select node, which may carry `column[]`, `select[]`,
 *   or both.
 * @param ctx - The current walker context passed unchanged to every child.
 * @param walk - The recursive walk function used to visit each child select
 *   node.
 * @param columnGenerator - The generator forwarded to `walkColumnsOnly` when
 *   the node also carries inline `column[]` entries.
 * @returns A merged Fragment whose columns, CTEs, and FROM extensions are the
 *   ordered union of all child Fragments.
 */
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
      fromExtensions: "",
      columns: [],
      partitionKeys: ctx.partitionKeys,
    };
  }

  return mergeSiblings(children, ctx);
}

// Re-export so other operators can call into ColumnsOnly through Group.
export { projectColumns };
