/**
 * Tree-walker query generator.
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
  ProjectedColumn,
  CteDefinition,
  NodeKind,
} from "./types.js";
