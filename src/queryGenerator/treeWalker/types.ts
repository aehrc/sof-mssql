/**
 * Core types for the tree-walker query generator.
 *
 * Each select-tree node produces a Fragment; sibling fragments are merged
 * via partition-key joins. Context threads through descent, accumulating
 * the current JSON source, partition keys, and scalar columns to bake into
 * any enclosed recursive CTE.
 */

import type { TranspilerContext } from "../../fhirpath/transpiler.js";

export type NodeKind =
  | "ColumnsOnly"
  | "Group"
  | "ForEach"
  | "ForEachOrNull"
  | "Repeat"
  | "UnionAll";

export interface PartitionKey {
  /** Logical name, e.g. "id", "fe_0_key", "repeat_2_path". */
  name: string;
  /** SQL expression that yields it in the *defining* scope. */
  sqlExpr: string;
  /** Type used when projecting it through a CTE column list. */
  sqlType: string;
}

export interface ScalarColumn {
  /** Bracketed identifier, e.g. "[groupLinkId]". */
  name: string;
  /** SQL expression evaluated in the outer scope, baked into a CTE anchor. */
  sqlExpr: string;
}

export interface ProjectedColumn {
  /** Bracketed identifier as it appears in the final SELECT list. */
  name: string;
  sqlExpr: string;
}

export interface CteDefinition {
  alias: string;
  /** Full SQL body without the "alias AS (...)" wrapper. */
  body: string;
}

export type RowOrigin = "row" | "set";

export interface Context {
  resourceAlias: string;
  /** Current JSON source expression, e.g. "r.json", "forEach_0.value". */
  source: string;
  /** Ordered, monotonically appended as the walker descends. */
  partitionKeys: PartitionKey[];
  /** Columns lexically captured above; baked into the next enclosed CTE anchor. */
  scalarColumns: ScalarColumn[];
  /**
   * CROSS/OUTER APPLY chain accumulated above this point, needed so any
   * enclosed Repeat CTE anchor can reach `ctx.source`. Each element starts
   * with "\n".
   */
  ancestorApplies: string;
  /** True if any forEachOrNull ancestor is in scope. */
  nullable: boolean;
  /** Shared mutable counter for unique CTE/alias names across the whole compile. */
  cteCounter: { value: number };
  /** Pass-through context for the FHIRPath transpiler. */
  transpilerCtx: TranspilerContext;
}

export interface Fragment {
  ctes: CteDefinition[];
  /** "FROM <ref>" or "" if the fragment inherits its FROM from the caller. */
  fromClause: string;
  /**
   * Ordered sequence of FROM-clause extensions: a mix of CROSS/OUTER APPLY
   * and INNER/LEFT/FULL OUTER JOIN clauses, each prefixed by "\n". Order is
   * preserved so that aliases are always introduced before they are
   * referenced (e.g. an INNER JOIN to a Repeat CTE precedes any CROSS APPLY
   * that reads from the CTE's `item_json`).
   */
  fromExtensions: string;
  columns: ProjectedColumn[];
  /** Keys exposed by this fragment for use by sibling joins. */
  partitionKeys: PartitionKey[];
  /** "set" = fragment exposes a CTE that participates in a join. */
  rowOrigin: RowOrigin;
  /** Alias usable as a join anchor when rowOrigin === "set". */
  fromAlias?: string;
  /** True if this fragment introduces a forEachOrNull (drives chooseJoinType). */
  nullableHere?: boolean;
}
