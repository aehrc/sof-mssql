/**
 * T-SQL query generator for ViewDefinition structures.
 * Generates SQL queries that can be executed against MS SQL Server.
 */

import { Transpiler, TranspilerContext } from "./fhirpath/transpiler.js";
import {
  ColumnExpressionGenerator,
  ForEachProcessor,
  PathParser,
  SelectClauseBuilder,
  SelectCombination,
  SelectCombinationExpander,
  WhereClauseBuilder,
} from "./queryGenerator/index.js";
import {
  ColumnInfo,
  ParameterMap,
  TranspilationResult,
  ViewDefinition,
  ViewDefinitionConstant,
  ViewDefinitionSelect,
} from "./types.js";

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
      const {statements, parameters} = this.generateAllSelectStatements(
        viewDef,
        context,
      );

      const sql =
        statements.length > 1
          ? statements.join("\nUNION ALL\n")
          : statements[0];

      return {
        sql,
        columns,
        parameters,
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
  ): {statements: string[], parameters: ParameterMap} {
    const unionCombinations = this.combinationExpander.expandCombinations(
      viewDef.select,
    );

    const statements: string[] = [];
    const parameters: ParameterMap = {};

    for (const combination of unionCombinations) {
      const {statement, params} = this.generateStatementForCombination(combination, viewDef, context);
      statements.push(statement);
      // Merge parameters (all combinations should have the same resourceType and testId)
      Object.assign(parameters, params);
    }

    return {statements, parameters};
  }

  /**
   * Generate a complete SQL statement for a specific combination.
   */
  private generateStatementForCombination(
    combination: SelectCombination,
    viewDef: ViewDefinition,
    context: TranspilerContext,
  ): {statement: string, params: ParameterMap} {
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
  ): {statement: string, params: ParameterMap} {
    const selectClause = this.selectClauseBuilder.generateSimpleSelectClause(
      combination,
      context,
    );
    const fromClause = this.generateFromClause(context);
    const whereClauseResult = this.whereClauseBuilder.buildWhereClause(
      viewDef.resource,
      context.resourceAlias,
      context.testId,
      viewDef.where,
      context,
    );

    let statement = `${selectClause}\n${fromClause}`;
    if (whereClauseResult.sql) {
      statement += `\n${whereClauseResult.sql}`;
    }

    return {statement, params: whereClauseResult.parameters};
  }

  /**
   * Generate a SELECT statement with forEach using CROSS APPLY.
   */
  private generateForEachStatement(
    combination: SelectCombination,
    viewDef: ViewDefinition,
    context: TranspilerContext,
  ): {statement: string, params: ParameterMap} {
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
    const whereClauseResult = this.whereClauseBuilder.buildWhereClause(
      viewDef.resource,
      context.resourceAlias,
      context.testId,
      viewDef.where,
      context,
    );

    let statement = `${selectClause}\n${fromClause}${applyClauses}`;
    if (whereClauseResult.sql) {
      statement += `\n${whereClauseResult.sql}`;
    }

    return {statement, params: whereClauseResult.parameters};
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
}
