/**
 * Merges sibling fragments produced by walking children of a Group.
 *
 * Row-shaped siblings compose horizontally — APPLY chains and columns
 * concatenate. Set-shaped siblings (Repeat CTEs) contribute INNER JOIN
 * clauses to their CTEs; the outer FROM remains the resource table so row
 * siblings can reference its scope.
 *
 * For multiple set siblings (Step 5 onward), the partition-key composite
 * join logic ensures rows align correctly within the enclosing scope.
 */

import type { Context, Fragment } from "./types.js";

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
