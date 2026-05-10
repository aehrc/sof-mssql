/**
 * Merges sibling fragments produced by walking children of a Group.
 *
 * Flattens CTE lists, concatenates `fromExtensions` strings and `columns`
 * arrays in order, and passes `partitionKeys` through unchanged from `ctx`.
 */

import type { Context, Fragment } from "./types.js";

/**
 * Merges sibling Fragments produced by walking children of a Group node.
 *
 * Flattens each fragment's `ctes` list, concatenates `fromExtensions` strings
 * (preserving order so aliases are introduced before they are referenced), and
 * concatenates `columns` arrays in lexical order.  `partitionKeys` are passed
 * through unchanged from `ctx` — siblings share the same partition scope.
 *
 * Returns an empty Fragment (no CTEs, no extensions, no columns) when
 * `fragments` is empty, and returns the sole fragment unchanged when only one
 * is provided.
 *
 * @param fragments - Ordered array of sibling Fragments to merge.
 * @param ctx - The context of the parent Group node, used to supply
 *   `partitionKeys` for the merged result and as the base for the empty-array
 *   case.
 * @returns A single merged Fragment whose columns, CTEs, and FROM extensions
 *   are the ordered union of all input fragments.
 */
export function mergeSiblings(fragments: Fragment[], ctx: Context): Fragment {
  if (fragments.length === 0) {
    return {
      ctes: [],
      fromExtensions: "",
      columns: [],
      partitionKeys: ctx.partitionKeys,
    };
  }

  if (fragments.length === 1) return fragments[0];

  const ctes = fragments.flatMap((f) => f.ctes);
  const fromExtensions = fragments.map((f) => f.fromExtensions).join("");
  const columns = fragments.flatMap((f) => f.columns);

  // Row siblings + zero or more set siblings: each set fragment already carries
  // its own INNER JOIN to its CTE, joined on the partition keys it inherited
  // from `ctx`. The outer FROM stays as the resource table so row siblings can
  // keep their references to `r` valid.
  return {
    ctes,
    fromExtensions,
    columns,
    partitionKeys: ctx.partitionKeys,
  };
}
