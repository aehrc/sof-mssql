/**
 * Recursive dispatch — visits a select-tree node and produces a Fragment.
 *
 * Each node kind has its own walker; this module just dispatches via
 * classifyNode. Operators not yet implemented throw a clear error.
 */

import type { ViewDefinitionSelect } from "../../types.js";
import type { ColumnExpressionGenerator } from "../ColumnExpressionGenerator.js";
import type { PathParser } from "../PathParser.js";
import { classifyNode } from "./classify.js";
import { walkColumnsOnly } from "./operators/columnsOnly.js";
import { walkForEach } from "./operators/forEach.js";
import { walkGroup } from "./operators/group.js";
import { walkRepeat } from "./operators/repeat.js";
import { walkUnionAll } from "./operators/unionAll.js";
import type { Context, Fragment } from "./types.js";

export interface WalkerDeps {
  columnGenerator: ColumnExpressionGenerator;
  pathParser: PathParser;
  schemaName: string;
  tableName: string;
}

/**
 * Creates the recursive walk function used to traverse the select tree.
 *
 * The returned `walk` function classifies each `ViewDefinitionSelect` node via
 * `classifyNode` and dispatches to the appropriate operator walker
 * (`walkColumnsOnly`, `walkGroup`, `walkForEach`, `walkRepeat`, or
 * `walkUnionAll`). The same `walk` reference is threaded into every operator
 * so they can recurse into child nodes without circular imports.
 *
 * @param deps - External service dependencies shared across all operator
 *   walkers: a `ColumnExpressionGenerator`, a `PathParser`, and the target
 *   schema/table names used by the Repeat CTE builder.
 * @returns A `walk` function that accepts a node and a `Context` and returns
 *   the corresponding `Fragment`.
 * @throws {Error} When a node's kind is not handled (should not occur given
 *   the exhaustive `classifyNode` discriminants, but TypeScript exhaustiveness
 *   checking requires the switch to be complete).
 */
export function makeWalker(
  deps: WalkerDeps,
): (node: ViewDefinitionSelect, ctx: Context) => Fragment {
  function walk(node: ViewDefinitionSelect, ctx: Context): Fragment {
    const kind = classifyNode(node);
    switch (kind) {
      case "ColumnsOnly":
        return walkColumnsOnly(node, ctx, deps.columnGenerator);
      case "Group":
        return walkGroup(node, ctx, walk, deps.columnGenerator);
      case "ForEach":
      case "ForEachOrNull":
        return walkForEach(node, ctx, walk, { pathParser: deps.pathParser });
      case "Repeat":
        return walkRepeat(node, ctx, walk, {
          schemaName: deps.schemaName,
          tableName: deps.tableName,
        });
      case "UnionAll":
        return walkUnionAll(node, ctx, walk, {
          columnGenerator: deps.columnGenerator,
        });
    }
  }
  return walk;
}
