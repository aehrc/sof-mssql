/**
 * Tree-walker query generator (greenfield, gated by USE_TREE_WALKER).
 */

export { compileViewDefinition } from "./compile.js";
export type { CompileOptions } from "./compile.js";
export { classifyNode } from "./classify.js";
export { freshAlias } from "./aliasGenerator.js";
export { makeWalker } from "./walker.js";
export { mergeSiblings } from "./mergeSiblings.js";
export { renderRoot } from "./render.js";
export type {
  Context,
  Fragment,
  PartitionKey,
  ScalarColumn,
  ProjectedColumn,
  CteDefinition,
  NodeKind,
  RowOrigin,
} from "./types.js";
