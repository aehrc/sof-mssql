/**
 * T-SQL query generator for ViewDefinition structures.
 * Generates SQL queries that can be executed against MS SQL Server.
 */

import { Transpiler, TranspilerContext } from "./fhirpath/transpiler.js";
import {
  ColumnInfo,
  TranspilationResult,
  ViewDefinition,
  ViewDefinitionConstant,
  ViewDefinitionSelect,
} from "./types.js";
import { PathParser } from "./queryGenerator/PathParser.js";
import {
  SelectCombination,
  SelectCombinationExpander,
} from "./queryGenerator/SelectCombinationExpander.js";
import { ForEachProcessor } from "./queryGenerator/ForEachProcessor.js";
import { SelectClauseBuilder } from "./queryGenerator/SelectClauseBuilder.js";
import { WhereClauseBuilder } from "./queryGenerator/WhereClauseBuilder.js";
import { ColumnExpressionGenerator } from "./queryGenerator/ColumnExpressionGenerator.js";

export interface QueryGeneratorOptions {
  tableName?: string;
  schemaName?: string;
  resourceIdColumn?: string;
  resourceJsonColumn?: string;
}

/**
 * Main query generator that orchestrates SQL generation from ViewDefinitions.
 */
export class QueryGenerator {
  private readonly options: Required<QueryGeneratorOptions>;
  private readonly pathParser: PathParser;
  private readonly combinationExpander: SelectCombinationExpander;
  private readonly forEachProcessor: ForEachProcessor;
  private readonly selectClauseBuilder: SelectClauseBuilder;
  private readonly whereClauseBuilder: WhereClauseBuilder;
  private readonly columnGenerator: ColumnExpressionGenerator;

  constructor(options: QueryGeneratorOptions = {}) {
    this.options = {
      tableName: "fhir_resources",
      schemaName: "dbo",
      resourceIdColumn: "id",
      resourceJsonColumn: "json",
      ...options,
    };

    // Initialise specialised processors.
    this.pathParser = new PathParser();
    this.combinationExpander = new SelectCombinationExpander();
    this.columnGenerator = new ColumnExpressionGenerator();
    this.forEachProcessor = new ForEachProcessor(this.pathParser);
    this.selectClauseBuilder = new SelectClauseBuilder(this.columnGenerator);
    this.whereClauseBuilder = new WhereClauseBuilder();
  }

  /**
   * Generate a T-SQL query from a ViewDefinition.
   */
  generateQuery(viewDef: ViewDefinition, testId?: string): TranspilationResult {
    try {
      const context = this.createBaseContext(viewDef, testId);
      const columns = this.collectAllColumns(viewDef.select);
      const selectStatements = this.generateAllSelectStatements(
        viewDef,
        context,
      );

      const sql =
        selectStatements.length > 1
          ? selectStatements.join("\nUNION ALL\n")
          : selectStatements[0];

      return {
        sql,
        columns,
        parameters: {},
      };
    } catch (error) {
      throw new Error(`Failed to generate query for ViewDefinition: ${error}`);
    }
  }

  /**
   * Generate all complete SELECT statements, handling unionAll properly.
   */
  private generateAllSelectStatements(
    viewDef: ViewDefinition,
    context: TranspilerContext,
  ): string[] {
    const unionCombinations = this.combinationExpander.expandCombinations(
      viewDef.select,
    );

    return unionCombinations.map((combination) =>
      this.generateStatementForCombination(combination, viewDef, context),
    );
  }

  /**
   * Generate a complete SQL statement for a specific combination.
   */
  private generateStatementForCombination(
    combination: SelectCombination,
    viewDef: ViewDefinition,
    context: TranspilerContext,
  ): string {
    const hasForEach = this.forEachProcessor.combinationHasForEach(combination);

    return hasForEach
      ? this.generateForEachStatement(combination, viewDef, context)
      : this.generateSimpleStatement(combination, viewDef, context);
  }

  /**
   * Generate a simple SELECT statement without forEach.
   */
  private generateSimpleStatement(
    combination: SelectCombination,
    viewDef: ViewDefinition,
    context: TranspilerContext,
  ): string {
    const selectClause = this.selectClauseBuilder.generateSimpleSelectClause(
      combination,
      context,
    );
    const fromClause = this.generateFromClause(context);
    const whereClause = this.whereClauseBuilder.buildWhereClause(
      viewDef.resource,
      context.resourceAlias,
      context.testId,
      viewDef.where,
      context,
    );

    let statement = `${selectClause}\n${fromClause}`;
    if (whereClause) {
      statement += `\n${whereClause}`;
    }

    return statement;
  }

  /**
   * Generate a SELECT statement with forEach using CROSS APPLY.
   */
  private generateForEachStatement(
    combination: SelectCombination,
    viewDef: ViewDefinition,
    context: TranspilerContext,
  ): string {
    const fromClause = this.generateFromClause(context);
    const { forEachContextMap, topLevelForEach } =
      this.forEachProcessor.buildForEachContextMap(
        combination.selects,
        context,
        combination,
      );
    const applyClauses = this.forEachProcessor.buildApplyClauses(
      forEachContextMap,
      topLevelForEach,
      combination,
    );
    const selectClause = this.selectClauseBuilder.generateForEachSelectClause(
      combination,
      context,
      forEachContextMap,
    );
    const whereClause = this.whereClauseBuilder.buildWhereClause(
      viewDef.resource,
      context.resourceAlias,
      context.testId,
      viewDef.where,
      context,
    );

    let statement = `${selectClause}\n${fromClause}${applyClauses}`;
    if (whereClause) {
      statement += `\n${whereClause}`;
    }

    return statement;
  }

  /**
   * Generate the FROM clause.
   */
  private generateFromClause(context: TranspilerContext): string {
    const tableName = `[${this.options.schemaName}].[${this.options.tableName}]`;
    return `FROM ${tableName} AS [${context.resourceAlias}]`;
  }

  /**
   * Create the base transpiler context.
   */
  private createBaseContext(
    viewDef: ViewDefinition,
    testId?: string,
  ): TranspilerContext {
    const constants: { [key: string]: string | number | boolean | null } = {};

    if (viewDef.constant) {
      for (const constant of viewDef.constant) {
        constants[constant.name] = this.getConstantValue(constant);
      }
    }

    return {
      resourceAlias: "r",
      constants,
      testId,
    };
  }

  /**
   * Extract the value from a ViewDefinitionConstant.
   */
  private getConstantValue(
    constant: ViewDefinitionConstant,
  ): string | number | boolean | null {
    const primitiveKeys: (keyof ViewDefinitionConstant)[] = [
      "valueString",
      "valueInteger",
      "valueDecimal",
      "valueBoolean",
      "valueDate",
      "valueDateTime",
      "valueTime",
      "valueInstant",
      "valueCode",
      "valueId",
      "valueUri",
      "valueUrl",
      "valueCanonical",
      "valueUuid",
      "valueOid",
      "valueMarkdown",
      "valueBase64Binary",
      "valuePositiveInt",
      "valueUnsignedInt",
      "valueInteger64",
    ];

    const definedValues = primitiveKeys.filter(
      (key) => constant[key] !== undefined,
    );

    if (definedValues.length === 0) {
      throw new Error(
        `Constant '${constant.name}' must have exactly one value[x] element defined`,
      );
    }

    if (definedValues.length > 1) {
      throw new Error(
        `Constant '${constant.name}' must have exactly one value[x] element defined, but has ${definedValues.length}`,
      );
    }

    const key = definedValues[0];
    return constant[key] as string | number | boolean;
  }

  /**
   * Collect all column definitions from select elements.
   */
  private collectAllColumns(selects: ViewDefinitionSelect[]): ColumnInfo[] {
    const columns: ColumnInfo[] = [];

    for (const select of selects) {
      if (select.column) {
        for (const column of select.column) {
          columns.push({
            name: column.name,
            type: Transpiler.inferSqlType(column.type),
            nullable: true, // FHIR data is generally nullable.
            description: column.description,
          });
        }
      }

      if (select.select) {
        columns.push(...this.collectAllColumns(select.select));
      }

      if (select.unionAll) {
        columns.push(...this.collectAllColumns(select.unionAll));
      }
    }

    return columns;
  }

  /**
   * Generate a CREATE VIEW statement.
   */
  generateCreateView(viewDef: ViewDefinition, viewName?: string): string {
    const result = this.generateQuery(viewDef);
    const actualViewName = viewName ?? viewDef.name ?? "generated_view";

    return `CREATE VIEW [${this.options.schemaName}].[${actualViewName}] AS\n${result.sql}`;
  }

  /**
   * Generate table creation SQL for materialised views.
   */
  generateCreateTable(viewDef: ViewDefinition, tableName?: string): string {
    const columns = this.collectAllColumns(viewDef.select);
    const actualTableName =
      tableName ?? (viewDef.name ? `${viewDef.name}_table` : "generated_table");

    const columnDefinitions = columns.map(
      (col) =>
        `  [${col.name}] ${col.type}${col.nullable ? " NULL" : " NOT NULL"}`,
    );

    return `CREATE TABLE [${this.options.schemaName}].[${actualTableName}]
            (
                ${columnDefinitions.join(",\n")}
            )`;
  }
}
