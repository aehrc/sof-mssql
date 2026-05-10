/**
 * Walker for Repeat nodes — emits a recursive CTE and returns a set Fragment.
 *
 * The CTE projects the current partition keys and any baked scalar columns
 * plus a content-derived `__path` for stable identity across re-evaluations.
 * The Fragment's `fromExtensions` is an INNER JOIN to the CTE on the partition key
 * `[id]`; sibling-level composite-key joins are added by `mergeSiblings`.
 */

import type { TranspilerContext } from "../../../fhirpath/transpiler.js";
import type { ViewDefinitionSelect } from "../../../types.js";
import { freshAlias } from "../aliasGenerator.js";
import { buildRepeatCte } from "../cteTemplates.js";
import {
  type Context,
  type Fragment,
  type PartitionKey,
  SQL_NVARCHAR_MAX,
} from "../types.js";

export interface RepeatDeps {
  schemaName: string;
  tableName: string;
}

/**
 * Walker for Repeat nodes — emits a recursive CTE and returns a set Fragment.
 *
 * Generates a `WITH RECURSIVE`-style CTE (via `buildRepeatCte`) whose anchor
 * member starts at the resource root and whose recursive members re-expand
 * each element's `item_json` using the same path list.  The CTE accumulates a
 * `__path` string for stable per-element identity across recursion levels.
 *
 * The returned Fragment contains the CTE plus an `INNER JOIN` to it in
 * `fromExtensions`; the join is keyed on all current partition keys so that
 * only rows belonging to the enclosing resource (and any ancestor forEach)
 * are included.  The inner context updates `source` to `<cteAlias>.item_json`
 * and appends a new `<cteAlias>_path` partition key so that nested operators
 * can further partition the result set.
 *
 * @param node - The Repeat select node; `node.repeat` supplies the ordered
 *   list of FHIRPath strings used as the anchor and recursive paths.
 * @param ctx - The current walker context; the inner context is derived from
 *   it by updating `source`, `partitionKeys`, `ancestorApplies`, and
 *   `transpilerCtx`.
 * @param walk - The recursive walk function used to visit the inner sub-tree
 *   (`column`, `select`, `unionAll`) in the repeat-item context.
 * @param deps - Schema and table name needed to construct the resource FROM
 *   clause inside the CTE anchor.
 * @returns A Fragment whose `ctes` list begins with the recursive CTE,
 *   `fromExtensions` begins with the INNER JOIN to that CTE, and `columns`
 *   are those produced by the inner walk.
 * @throws {Error} When `node.repeat` is absent or empty.
 */
export function walkRepeat(
  node: ViewDefinitionSelect,
  ctx: Context,
  walk: (n: ViewDefinitionSelect, c: Context) => Fragment,
  deps: RepeatDeps,
): Fragment {
  const cteAlias = freshAlias(ctx, "repeat");
  const paths = node.repeat ?? [];
  if (paths.length === 0) {
    throw new Error("walkRepeat: repeat node has empty paths array");
  }

  const tableRef = `[${deps.schemaName}].[${deps.tableName}]`;
  const cte = buildRepeatCte({
    cteAlias,
    paths,
    source: ctx.source,
    fromClause: `FROM ${tableRef} AS [${ctx.resourceAlias}]`,
    ancestorApplies: ctx.ancestorApplies,
    partitionKeys: ctx.partitionKeys,
    resourcePredicate: null, // Resource-level WHERE goes in the outer SELECT.
  });

  const joinClause = buildJoinClause(cteAlias, ctx);
  const innerCtx = buildRepeatInnerCtx(ctx, cteAlias, paths, joinClause);
  const innerNode: ViewDefinitionSelect = {
    column: node.column,
    select: node.select,
    unionAll: node.unionAll,
  };
  const inner = walk(innerNode, innerCtx);

  return {
    ctes: [cte, ...inner.ctes],
    // Join the CTE FIRST so subsequent applies/joins inside the repeat
    // (which reference `<cteAlias>.item_json`) have the alias in scope.
    fromExtensions: joinClause + inner.fromExtensions,
    columns: inner.columns,
    partitionKeys: innerCtx.partitionKeys,
  };
}

/**
 * Outer-SELECT join condition aligning this CTE's rows with the enclosing
 * partition (resource id plus any forEach/repeat keys above this scope).
 */
function buildJoinClause(cteAlias: string, ctx: Context): string {
  const joinConditions = ctx.partitionKeys
    .map((k) => `${cteAlias}.[${k.name}] = ${k.sqlExpr}`)
    .join(" AND ");
  return `\nINNER JOIN ${cteAlias} ON ${joinConditions}`;
}

function buildRepeatInnerCtx(
  ctx: Context,
  cteAlias: string,
  paths: string[],
  joinClause: string,
): Context {
  const newKey: PartitionKey = {
    name: `${cteAlias}_path`,
    sqlExpr: `${cteAlias}.__path`,
    sqlType: SQL_NVARCHAR_MAX,
  };
  const innerTranspilerCtx: TranspilerContext = {
    ...ctx.transpilerCtx,
    iterationContext: `${cteAlias}.item_json`,
    currentForEachAlias: cteAlias,
    forEachSource: ctx.source,
    forEachPath: paths.map((p) => `$.${p}`).join(", "),
  };
  // Propagate the join into ancestorApplies so any *nested* Repeat builds
  // its CTE anchor with this CTE in scope.
  return {
    ...ctx,
    source: `${cteAlias}.item_json`,
    partitionKeys: [...ctx.partitionKeys, newKey],
    ancestorApplies: ctx.ancestorApplies + joinClause,
    transpilerCtx: innerTranspilerCtx,
  };
}
