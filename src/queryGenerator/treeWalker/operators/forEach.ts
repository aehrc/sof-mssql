/**
 * Walker for ForEach / ForEachOrNull nodes.
 *
 * Emits a CROSS APPLY (or OUTER APPLY) clause that iterates over a JSON
 * array. Threads `ctx.source` and `ctx.transpilerCtx` so child nodes
 * project columns relative to the iteration value, and appends a
 * `<alias>_key` partition key.
 *
 * Path-handling parity is delegated to PathParser (`.where()`, `.first()`,
 * array indexing, multi-segment array flattening).
 */

import type { TranspilerContext } from "../../../fhirpath/transpiler.js";
import type { ViewDefinitionSelect } from "../../../types.js";
import type { PathParser } from "../../PathParser.js";
import { freshAlias } from "../aliasGenerator.js";
import type { Context, Fragment, PartitionKey } from "../types.js";

interface ForEachDeps {
  pathParser: PathParser;
}

export function walkForEach(
  node: ViewDefinitionSelect,
  ctx: Context,
  walk: (n: ViewDefinitionSelect, c: Context) => Fragment,
  deps: ForEachDeps,
): Fragment {
  const isOrNull = node.forEachOrNull !== undefined;
  const rawPath = (node.forEach ?? node.forEachOrNull) ?? "";
  const applyType = isOrNull ? "OUTER APPLY" : "CROSS APPLY";
  const alias = freshAlias(ctx, "forEach");

  const applyClause = buildForEachApply(
    rawPath,
    ctx.source,
    alias,
    applyType,
    ctx.transpilerCtx,
    deps.pathParser,
  );

  const innerCtx = buildInnerCtx(ctx, alias, rawPath, applyClause, isOrNull);
  const innerNode: ViewDefinitionSelect = {
    column: node.column,
    select: node.select,
    unionAll: node.unionAll,
  };
  const inner = walk(innerNode, innerCtx);

  return {
    ...inner,
    fromExtensions: applyClause + inner.fromExtensions,
    nullableHere: isOrNull || inner.nullableHere,
  };
}

function buildInnerCtx(
  ctx: Context,
  alias: string,
  rawPath: string,
  applyClause: string,
  isOrNull: boolean,
): Context {
  const innerTranspilerCtx: TranspilerContext = {
    ...ctx.transpilerCtx,
    iterationContext: `${alias}.value`,
    currentForEachAlias: alias,
    forEachSource: ctx.source,
    forEachPath: `$.${rawPath}`,
  };
  const innerKey: PartitionKey = {
    name: `${alias}_key`,
    sqlExpr: `${alias}.[key]`,
    sqlType: "NVARCHAR(4000)",
  };
  return {
    ...ctx,
    source: `${alias}.value`,
    partitionKeys: [...ctx.partitionKeys, innerKey],
    ancestorApplies: ctx.ancestorApplies + applyClause,
    nullable: ctx.nullable || isOrNull,
    transpilerCtx: innerTranspilerCtx,
  };
}

/**
 * Builds the CROSS/OUTER APPLY clause string for a forEach path, handling
 * `.where()`, `.first()`, array indexing, and multi-segment array
 * flattening.
 */
function buildForEachApply(
  rawPath: string,
  source: string,
  alias: string,
  applyType: string,
  transpilerCtx: TranspilerContext,
  pathParser: PathParser,
): string {
  const {
    path: pathWithoutWhere,
    whereCondition,
    useFirst,
  } = pathParser.parseFhirPathWhere(rawPath, transpilerCtx);
  const { path: forEachPath, arrayIndex } =
    pathParser.parseArrayIndexing(pathWithoutWhere);
  const arrayPaths = pathParser.detectArrayFlatteningPaths(forEachPath);

  if (arrayPaths.length > 1) {
    return buildNestedApply(
      arrayPaths,
      source,
      alias,
      applyType,
      pathParser,
      arrayIndex,
      whereCondition,
    );
  }

  return buildSimpleApply(
    applyType,
    source,
    forEachPath,
    alias,
    arrayIndex,
    whereCondition,
    useFirst,
  );
}

function buildSimpleApply(
  applyType: string,
  source: string,
  path: string,
  alias: string,
  arrayIndex: number | null,
  whereCondition: string | null,
  useFirst: boolean,
): string {
  const whereClauses: string[] = [];
  if (arrayIndex !== null) whereClauses.push(`[key] = '${arrayIndex}'`);
  if (whereCondition !== null) whereClauses.push(whereCondition);

  if (whereClauses.length > 0 || useFirst) {
    const topClause = useFirst ? "TOP 1 " : "";
    const orderBy = useFirst ? " ORDER BY [key]" : "";
    const whereClause =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    return `\n${applyType} (
        SELECT ${topClause}* FROM OPENJSON(${source}, '$.${path}')
        ${whereClause}${orderBy}
      ) AS ${alias}`;
  }

  return `\n${applyType} OPENJSON(${source}, '$.${path}') AS ${alias}`;
}

function buildNestedApply(
  arrayPaths: string[],
  source: string,
  finalAlias: string,
  applyType: string,
  pathParser: PathParser,
  arrayIndex: number | null,
  whereCondition: string | null,
): string {
  let clauses = "";
  let currentSource = source;

  for (let i = 0; i < arrayPaths.length; i++) {
    const isLast = i === arrayPaths.length - 1;
    const alias = isLast ? finalAlias : `${finalAlias}_nest${i}`;
    const segment = pathParser.extractPathSegment(arrayPaths, i);
    const { cleanSegment, segmentIndex } =
      pathParser.parseSegmentIndexing(segment);
    const jsonPath = `$.${cleanSegment}`;

    const whereClauses: string[] = [];
    if (segmentIndex !== null) {
      whereClauses.push(`[key] = '${segmentIndex}'`);
    } else if (isLast && arrayIndex !== null) {
      whereClauses.push(`[key] = '${arrayIndex}'`);
    }
    if (isLast && whereCondition !== null) whereClauses.push(whereCondition);

    if (whereClauses.length > 0) {
      clauses += `\n${applyType} (
        SELECT * FROM OPENJSON(${currentSource}, '${jsonPath}')
        WHERE ${whereClauses.join(" AND ")}
      ) AS ${alias}`;
    } else {
      clauses += `\n${applyType} OPENJSON(${currentSource}, '${jsonPath}') AS ${alias}`;
    }

    currentSource = `${alias}.value`;
  }

  return clauses;
}
