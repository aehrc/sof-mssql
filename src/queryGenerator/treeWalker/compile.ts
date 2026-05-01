/**
 * Public entry point for the tree-walker query generator.
 *
 * Wraps viewDef.select as a synthetic Group node, walks it, and renders
 * the resulting Fragment as a single T-SQL statement.
 */

import { Transpiler, TranspilerContext } from "../../fhirpath/transpiler.js";
import type {
  ColumnInfo,
  TranspilationResult,
  ViewDefinition,
  ViewDefinitionSelect,
} from "../../types.js";
import { ColumnExpressionGenerator } from "../ColumnExpressionGenerator.js";
import { PathParser } from "../PathParser.js";
import { WhereClauseBuilder } from "../WhereClauseBuilder.js";
import { renderRoot } from "./render.js";
import type { Context, PartitionKey } from "./types.js";
import { makeWalker } from "./walker.js";

export interface CompileOptions {
  tableName: string;
  schemaName: string;
  testId?: string;
  transpilerCtx: TranspilerContext;
}

export function compileViewDefinition(
  viewDef: ViewDefinition,
  options: CompileOptions,
): TranspilationResult {
  const resourceAlias = options.transpilerCtx.resourceAlias;
  const ctx = buildRootContext(resourceAlias, options.transpilerCtx);

  const columnGenerator = new ColumnExpressionGenerator();
  const whereClauseBuilder = new WhereClauseBuilder();
  const pathParser = new PathParser();

  const rootNode: ViewDefinitionSelect = { select: viewDef.select };
  const walk = makeWalker({
    columnGenerator,
    pathParser,
    schemaName: options.schemaName,
    tableName: options.tableName,
  });
  const fragment = walk(rootNode, ctx);

  const sql = renderRoot(fragment, viewDef, {
    resourceAlias,
    schemaName: options.schemaName,
    tableName: options.tableName,
    testId: options.testId,
    whereClauseBuilder,
    transpilerCtx: options.transpilerCtx,
  });

  return { sql, columns: collectColumnMetadata(viewDef.select) };
}

function buildRootContext(
  resourceAlias: string,
  transpilerCtx: TranspilerContext,
): Context {
  const idKey: PartitionKey = {
    name: "id",
    sqlExpr: `[${resourceAlias}].[id]`,
    sqlType: "INT",
  };
  return {
    resourceAlias,
    // Use unbracketed `r.json` for the JSON source: matches the FHIRPath
    // transpiler's expectations (see visitor.ts handleJsonQueryMember which
    // pattern-matches on the source string).
    source: `${resourceAlias}.json`,
    partitionKeys: [idKey],
    scalarColumns: [],
    ancestorApplies: "",
    nullable: false,
    cteCounter: { value: 0 },
    transpilerCtx,
  };
}

/**
 * Walk the select tree and collect ColumnInfo metadata in lexical order.
 * Mirrors the behaviour of QueryGenerator.collectAllColumns so the public
 * TranspilationResult.columns shape is unchanged.
 */
function collectColumnMetadata(selects: ViewDefinitionSelect[]): ColumnInfo[] {
  const out: ColumnInfo[] = [];
  for (const select of selects) {
    if (select.column) {
      for (const column of select.column) {
        out.push({
          name: column.name,
          type: Transpiler.inferSqlType(column.type, column.tag),
          nullable: true,
          description: column.description,
        });
      }
    }
    if (select.select) out.push(...collectColumnMetadata(select.select));
    if (select.unionAll) out.push(...collectColumnMetadata(select.unionAll));
  }
  return out;
}
