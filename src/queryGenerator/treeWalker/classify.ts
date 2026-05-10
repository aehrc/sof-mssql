/**
 * Classifies a ViewDefinition select node into one of the walker's NodeKinds.
 */

import type { ViewDefinitionSelect } from "../../types.js";
import type { NodeKind } from "./types.js";

/**
 * Classifies a ViewDefinition select node into one of the walker's NodeKinds.
 *
 * Operators are tested outer-to-inner: `forEachOrNull` first, then `forEach`,
 * `repeat`, `unionAll`, `select` (Group), and finally `ColumnsOnly` as the
 * base case. A node that carries multiple operator fields is classified as the
 * outermost one; inner operators surface when the walker descends.
 *
 * @param node - The select node to classify.
 * @returns The `NodeKind` string discriminant that determines which operator
 *   walker handles this node.
 */
export function classifyNode(node: ViewDefinitionSelect): NodeKind {
  // Operators are ordered outer-to-inner. A node with multiple operators
  // (e.g. `{forEach, unionAll}`) is processed as the outer one; the inner
  // operator surfaces when the walker descends into the node's
  // `{column, select, unionAll}` sub-node.
  if (node.forEachOrNull !== undefined) return "ForEachOrNull";
  if (node.forEach !== undefined) return "ForEach";
  if (node.repeat && node.repeat.length > 0) return "Repeat";
  if (node.unionAll && node.unionAll.length > 0) return "UnionAll";
  if (node.select && node.select.length > 0) return "Group";
  return "ColumnsOnly";
}
