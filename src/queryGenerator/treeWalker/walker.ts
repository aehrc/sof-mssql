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
