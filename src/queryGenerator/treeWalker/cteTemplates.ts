/**
 * SQL string templates for the recursive CTE produced by `repeat`.
 *
 * Builds the anchor + recursive members, propagating partition keys and
 * baked scalar columns through both. Multi-segment paths chain CROSS APPLY
 * OPENJSON per segment.
 *
 * Note: `__path` is built by string-concatenating each child's `[key]`.
 * If a JSON object key contains a literal `.`, two distinct nodes could
 * theoretically produce equal `__path` strings. FHIR JSON keys do not
 * contain dots in practice; not a blocker.
 */

import type { CteDefinition, PartitionKey } from "./types.js";

interface OpenJsonChain {
  applyClauses: string;
  lastAlias: string;
}

export interface BuildRepeatCteArgs {
  cteAlias: string;
  /** FHIRPath strings — first is the anchor path; all are recursive paths. */
  paths: string[];
  /** JSON source expression for the anchor (e.g. "r.json", "forEach_0.value"). */
  source: string;
  /** "FROM <table> AS [r]" — the resource table reference for the anchor. */
  fromClause: string;
  /** CROSS/OUTER APPLY chain inherited from ancestors (each starts with "\n"). */
  ancestorApplies: string;
  /** Partition keys propagated through anchor and recursive members. */
  partitionKeys: PartitionKey[];
  /** Resource-level WHERE applied to the anchor (or null to omit). */
  resourcePredicate: string | null;
}

/**
 * Builds the SQL body of the recursive CTE used by the Repeat operator.
 *
 * Produces a `CteDefinition` whose body is an anchor SELECT followed by one
 * `UNION ALL` recursive SELECT per path in `args.paths`.  The anchor starts
 * at the resource root and expands each array element via `OPENJSON`; each
 * recursive member re-expands from the CTE's own `item_json` column,
 * appending `.[key]` to the `__path` accumulator for stable per-element
 * identity.  Multi-segment paths (e.g. `"a.b.c"`) produce a chain of nested
 * `CROSS APPLY OPENJSON` calls.
 *
 * @param args - Parameters controlling CTE generation: the CTE alias, the
 *   FHIRPath repeat paths, the JSON source expression for the anchor, the
 *   resource table FROM clause, any ancestor APPLY chain, the partition keys
 *   to propagate, and an optional resource-level WHERE predicate for the
 *   anchor.
 * @returns A `CteDefinition` with `alias` set to `args.cteAlias` and `body`
 *   containing the full anchor + recursive SQL (without the outer
 *   `alias AS (...)` wrapper, which `renderRoot` adds).
 */
export function buildRepeatCte(args: BuildRepeatCteArgs): CteDefinition {
  const anchor = buildAnchorMember(args);
  const recBlocks = args.paths.map((p, i) => buildRecursiveMember(args, p, i));
  const body = `${anchor}
  UNION ALL
${recBlocks.join("\n  UNION ALL\n")}`;
  return { alias: args.cteAlias, body };
}

function buildAnchorMember(args: BuildRepeatCteArgs): string {
  const {
    paths,
    source,
    fromClause,
    ancestorApplies,
    partitionKeys,
    resourcePredicate,
  } = args;
  const projLines = partitionKeys
    .map((k) => `${k.sqlExpr} AS [${k.name}]`)
    .join(",\n    ");
  const chain = buildOpenJsonChain(source, paths[0], "anchor");
  const wherePart = resourcePredicate ? `\n  ${resourcePredicate}` : "";

  return `  SELECT
    ${projLines},
    CAST(${chain.lastAlias}.[key] AS NVARCHAR(MAX)) AS __path,
    ${chain.lastAlias}.value AS item_json,
    0 AS depth
  ${fromClause}${ancestorApplies}
  ${chain.applyClauses}${wherePart}`;
}

function buildRecursiveMember(
  args: BuildRepeatCteArgs,
  path: string,
  index: number,
): string {
  const { cteAlias, partitionKeys } = args;
  const head = partitionKeys.map((k) => `cte.[${k.name}]`).join(", ");
  const chain = buildOpenJsonChain("cte.item_json", path, `child_${index}`);
  return `  SELECT
    ${head},
    cte.__path + '.' + CAST(${chain.lastAlias}.[key] AS NVARCHAR(4000)) AS __path,
    ${chain.lastAlias}.value AS item_json,
    cte.depth + 1
  FROM ${cteAlias} AS cte
  ${chain.applyClauses}`;
}

/**
 * Builds the CROSS APPLY OPENJSON chain for a (possibly multi-segment) path.
 * For "a.b.c" produces three chained APPLYs; the last alias is `finalAlias`.
 */
function buildOpenJsonChain(
  source: string,
  path: string,
  finalAlias: string,
): OpenJsonChain {
  const segments = path.split(".");
  if (segments.length === 1) {
    return {
      applyClauses: `CROSS APPLY OPENJSON(${source}, '$.${segments[0]}') AS ${finalAlias}`,
      lastAlias: finalAlias,
    };
  }

  let chain = "";
  let currentSource = source;
  for (let i = 0; i < segments.length; i++) {
    const isLast = i === segments.length - 1;
    const alias = isLast ? finalAlias : `${finalAlias}_${i}`;
    if (i > 0) chain += "\n  ";
    chain += `CROSS APPLY OPENJSON(${currentSource}, '$.${segments[i]}') AS ${alias}`;
    currentSource = `${alias}.value`;
  }
  return { applyClauses: chain, lastAlias: finalAlias };
}
