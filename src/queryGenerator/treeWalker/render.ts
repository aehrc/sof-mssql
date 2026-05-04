/**
 * Renders a root Fragment into the final T-SQL statement:
 *
 *   WITH <ctes> SELECT <cols> FROM <root> <applies> <joins> WHERE <pred>
 */

import type { TranspilerContext } from "../../fhirpath/transpiler.js";
import type { ViewDefinition } from "../../types.js";
import type { WhereClauseBuilder } from "../WhereClauseBuilder.js";
import type { Fragment } from "./types.js";

export interface RenderOptions {
  resourceAlias: string;
  schemaName: string;
  tableName: string;
  testId?: string;
  whereClauseBuilder: WhereClauseBuilder;
  transpilerCtx: TranspilerContext;
}

export function renderRoot(
  fragment: Fragment,
  viewDef: ViewDefinition,
  options: RenderOptions,
): string {
  const { resourceAlias, schemaName, tableName } = options;
  const tableRef = `[${schemaName}].[${tableName}]`;

  const cteSection =
    fragment.ctes.length > 0
      ? `WITH\n${fragment.ctes.map((c) => `${c.alias} AS (\n${c.body}\n)`).join(",\n")}\n`
      : "";

  const selectList = fragment.columns
    .map((c) => `${c.sqlExpr} AS [${c.name}]`)
    .join(",\n  ");

  const fromClause = `FROM ${tableRef} AS [${resourceAlias}]`;

  const whereClause = options.whereClauseBuilder.buildWhereClause(
    viewDef.resource,
    resourceAlias,
    options.testId,
    viewDef.where,
    options.transpilerCtx,
  );

  let body = `SELECT\n  ${selectList}\n${fromClause}${fragment.fromExtensions}`;
  if (whereClause !== null) {
    body += `\n${whereClause}`;
  }

  return `${cteSection}${body}`;
}
