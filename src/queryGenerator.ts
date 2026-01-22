/**
 * T-SQL query generator for ViewDefinition structures.
 * Generates SQL queries that can be executed against MS SQL Server.
 */

import { Transpiler, TranspilerContext } from "./fhirpath/transpiler.js";
import {
  ColumnExpressionGenerator,
  ForEachProcessor,
  PathParser,
  RepeatContext,
  RepeatProcessor,
  SelectClauseBuilder,
  SelectCombination,
  SelectCombinationExpander,
  WhereClauseBuilder,
} from "./queryGenerator/index.js";
import {
  ColumnInfo,
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
  private readonly repeatProcessor: RepeatProcessor;
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
    this.repeatProcessor = new RepeatProcessor();
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
      const { statements, allCteDefinitions } =
        this.generateAllSelectStatements(viewDef, context);

      let sql: string;
      if (statements.length > 1) {
        // Multiple statements (unionAll). If any have CTEs, consolidate them.
        if (allCteDefinitions.length > 0) {
          const withClause = `WITH\n${allCteDefinitions.join(",\n")}\n`;
          sql = withClause + statements.join("\nUNION ALL\n");
        } else {
          sql = statements.join("\nUNION ALL\n");
        }
      } else {
        // Single statement. If it has CTEs, they're already included.
        sql = statements[0];
      }

      return {
        sql,
        columns,
      };
    } catch (error) {
      throw new Error(`Failed to generate query for ViewDefinition: ${error}`);
    }
  }

  /**
   * Result of generating all SELECT statements.
   */
  private generateAllSelectStatements(
    viewDef: ViewDefinition,
    context: TranspilerContext,
  ): { statements: string[]; allCteDefinitions: string[] } {
    const unionCombinations = this.combinationExpander.expandCombinations(
      viewDef.select,
    );

    const statements: string[] = [];
    const allCteDefinitions: string[] = [];
    const isMultiUnion = unionCombinations.length > 1;

    // Shared counter state to ensure unique CTE aliases across all combinations.
    const cteCounter = { value: 0 };

    for (const combination of unionCombinations) {
      const { statement, cteDefinitions } =
        this.generateStatementForCombination(
          combination,
          viewDef,
          context,
          isMultiUnion,
          cteCounter,
        );
      statements.push(statement);
      allCteDefinitions.push(...cteDefinitions);
    }

    return { statements, allCteDefinitions };
  }

  /**
   * Generate a complete SQL statement for a specific combination.
   *
   * Routes to the appropriate statement generator based on the directives
   * present in the combination:
   * - Repeat statements use recursive CTEs.
   * - ForEach statements use CROSS APPLY.
   * - Simple statements have neither.
   *
   * @param combination - The select combination to generate.
   * @param viewDef - The ViewDefinition being processed.
   * @param context - The transpiler context.
   * @param isMultiUnion - If true, CTEs are returned separately for consolidation.
   * @param cteCounter - Shared counter for unique CTE aliases across combinations.
   * @returns The statement and any CTE definitions (empty if not repeat or single statement).
   */
  private generateStatementForCombination(
    combination: SelectCombination,
    viewDef: ViewDefinition,
    context: TranspilerContext,
    isMultiUnion: boolean,
    cteCounter: { value: number },
  ): { statement: string; cteDefinitions: string[] } {
    const hasRepeat = this.repeatProcessor.combinationHasRepeat(combination);
    const hasForEach = this.forEachProcessor.combinationHasForEach(combination);

    // Repeat takes precedence if both are present (forEach will be nested).
    if (hasRepeat) {
      return this.generateRepeatStatement(
        combination,
        viewDef,
        context,
        isMultiUnion,
        cteCounter,
      );
    } else if (hasForEach) {
      return {
        statement: this.generateForEachStatement(combination, viewDef, context),
        cteDefinitions: [],
      };
    } else {
      return {
        statement: this.generateSimpleStatement(combination, viewDef, context),
        cteDefinitions: [],
      };
    }
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
    if (whereClause !== null) {
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
    if (whereClause !== null) {
      statement += `\n${whereClause}`;
    }

    return statement;
  }

  /**
   * Generate a SELECT statement with repeat using recursive CTEs.
   *
   * The repeat directive generates a recursive CTE that traverses a tree
   * structure by following one or more paths at each level. The CTE is then
   * joined to the main query using INNER JOIN.
   *
   * If the combination also contains forEach, the forEach is processed after
   * the repeat CTE, using the repeat context as its source.
   *
   * @param combination - The select combination being processed.
   * @param viewDef - The ViewDefinition.
   * @param context - The transpiler context.
   * @param isMultiUnion - If true, return CTE definitions separately for consolidation.
   * @param cteCounter - Shared counter for unique CTE aliases across combinations.
   * @returns Statement and CTE definitions.
   */
  private generateRepeatStatement(
    combination: SelectCombination,
    viewDef: ViewDefinition,
    context: TranspilerContext,
    isMultiUnion: boolean,
    cteCounter: { value: number },
  ): { statement: string; cteDefinitions: string[] } {
    // Build repeat contexts and CTEs.
    const { repeatContextMap, topLevelRepeat } =
      this.repeatProcessor.buildRepeatContextMap(
        combination.selects,
        context,
        combination,
        cteCounter,
      );

    const tableName = `[${this.options.schemaName}].[${this.options.tableName}]`;
    const cteDefinitions = this.repeatProcessor.buildRepeatCteDefinitions(
      repeatContextMap,
      topLevelRepeat,
      context.resourceAlias,
      viewDef.resource,
      context.testId,
      tableName,
    );

    const joinClauses = this.repeatProcessor.buildRepeatApplyClauses(
      repeatContextMap,
      topLevelRepeat,
      context.resourceAlias,
    );

    const { selectClause, forEachApplyClauses } =
      this.buildRepeatSelectAndForEach(combination, context, repeatContextMap);

    const fromClause = this.generateFromClause(context);
    const statement = this.assembleRepeatStatement(
      selectClause,
      fromClause,
      joinClauses,
      forEachApplyClauses,
      cteDefinitions,
      isMultiUnion,
    );

    return { statement, cteDefinitions: isMultiUnion ? cteDefinitions : [] };
  }

  /**
   * Build select clause and forEach apply clauses for repeat statements.
   */
  private buildRepeatSelectAndForEach(
    combination: SelectCombination,
    context: TranspilerContext,
    repeatContextMap: Map<ViewDefinitionSelect, RepeatContext>,
  ): { selectClause: string; forEachApplyClauses: string } {
    const hasNestedForEach =
      this.forEachProcessor.combinationHasForEach(combination);

    if (!hasNestedForEach) {
      return {
        selectClause: this.selectClauseBuilder.generateRepeatSelectClause(
          combination,
          context,
          repeatContextMap,
        ),
        forEachApplyClauses: "",
      };
    }

    const { forEachContextMap, topLevelForEach } =
      this.forEachProcessor.buildForEachContextMap(
        combination.selects,
        context,
        combination,
      );

    this.updateForEachSourcesForRepeat(forEachContextMap, repeatContextMap);

    return {
      selectClause: this.selectClauseBuilder.generateRepeatSelectClause(
        combination,
        context,
        repeatContextMap,
        forEachContextMap,
      ),
      forEachApplyClauses: this.forEachProcessor.buildApplyClauses(
        forEachContextMap,
        topLevelForEach,
        combination,
      ),
    };
  }

  /**
   * Assemble the final repeat statement from its components.
   */
  private assembleRepeatStatement(
    selectClause: string,
    fromClause: string,
    joinClauses: string,
    forEachApplyClauses: string,
    cteDefinitions: string[],
    isMultiUnion: boolean,
  ): string {
    const baseStatement = `${selectClause}\n${fromClause}${joinClauses}${forEachApplyClauses}`;

    if (isMultiUnion) {
      return baseStatement;
    }

    const withClause =
      cteDefinitions.length > 0 ? `WITH\n${cteDefinitions.join(",\n")}\n` : "";
    return `${withClause}${baseStatement}`;
  }

  /**
   * Update forEach source expressions to use repeat CTE instead of resource JSON.
   *
   * When forEach is nested inside repeat, the forEach should iterate over
   * arrays within the repeat context (e.g., repeat_0.item_json) rather than
   * the root resource JSON.
   */
  private updateForEachSourcesForRepeat(
    forEachContextMap: Map<ViewDefinitionSelect, TranspilerContext>,
    repeatContextMap: Map<ViewDefinitionSelect, RepeatContext>,
  ): void {
    // Find the repeat select that contains each forEach.
    for (const [forEachSelect, forEachContext] of forEachContextMap) {
      const containingRepeat = this.findContainingRepeat(
        forEachSelect,
        repeatContextMap,
      );

      if (containingRepeat) {
        const repeatContext = repeatContextMap.get(containingRepeat);
        if (repeatContext) {
          // Update the forEach source to use the repeat CTE's item_json.
          forEachContext.forEachSource = `${repeatContext.cteAlias}.item_json`;
        }
      }
    }
  }

  /**
   * Find the repeat select that contains a given forEach select.
   */
  private findContainingRepeat(
    forEachSelect: ViewDefinitionSelect,
    repeatContextMap: Map<ViewDefinitionSelect, RepeatContext>,
  ): ViewDefinitionSelect | undefined {
    // Check each repeat select to see if the forEach is nested within it.
    for (const [repeatSelect] of repeatContextMap) {
      if (this.isForEachNestedInRepeat(forEachSelect, repeatSelect)) {
        return repeatSelect;
      }
    }
    return undefined;
  }

  /**
   * Check if a forEach select is nested within a repeat select.
   */
  private isForEachNestedInRepeat(
    forEachSelect: ViewDefinitionSelect,
    repeatSelect: ViewDefinitionSelect,
  ): boolean {
    if (!repeatSelect.select) {
      return false;
    }
    return this.isSelectNestedIn(forEachSelect, repeatSelect.select);
  }

  /**
   * Recursively check if a select is nested within a list of selects.
   */
  private isSelectNestedIn(
    target: ViewDefinitionSelect,
    selects: ViewDefinitionSelect[],
  ): boolean {
    for (const select of selects) {
      if (select === target) {
        return true;
      }
      if (select.select && this.isSelectNestedIn(target, select.select)) {
        return true;
      }
    }
    return false;
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
            type: Transpiler.inferSqlType(column.type, column.tag),
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
