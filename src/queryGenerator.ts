/**
 * T-SQL query generator for ViewDefinition structures.
 * Generates SQL queries that can be executed against MS SQL Server.
 */

import {
  Transpiler,
  TranspilerContext,
} from "./fhirpath/transpiler.js";
import {
  ColumnInfo,
  TranspilationResult,
  ViewDefinition,
  ViewDefinitionColumn,
  ViewDefinitionConstant,
  ViewDefinitionSelect,
  ViewDefinitionWhere,
} from "./types.js";

interface SelectCombination {
  selects: ViewDefinitionSelect[];
  unionChoices: number[]; // -1 means no union choice, >= 0 means index in unionAll array
}

export interface QueryGeneratorOptions {
  tableName?: string;
  schemaName?: string;
  resourceIdColumn?: string;
  resourceJsonColumn?: string;
}

export class QueryGenerator {
  private readonly options: Required<QueryGeneratorOptions>;

  constructor(options: QueryGeneratorOptions = {}) {
    this.options = {
      tableName: "fhir_resources",
      schemaName: "dbo",
      resourceIdColumn: "id",
      resourceJsonColumn: "json",
      ...options,
    };
  }

  /**
   * Generate a T-SQL query from a ViewDefinition.
   */
  generateQuery(viewDef: ViewDefinition): TranspilationResult {
    try {
      const context = this.createBaseContext(viewDef);
      const columns = this.collectAllColumns(viewDef.select);

      // Check if we need to generate multiple SELECT statements for UNION ALL
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
    // Find all unionAll combinations
    const unionCombinations = this.expandUnionCombinations(viewDef.select);

    const statements: string[] = [];

    for (const combination of unionCombinations) {
      const statement = this.generateStatementForCombination(
        combination,
        viewDef,
        context,
      );
      statements.push(statement);
    }

    return statements;
  }

  /**
   * Generate a complete SQL statement for a specific combination.
   */
  private generateStatementForCombination(
    combination: SelectCombination,
    viewDef: ViewDefinition,
    context: TranspilerContext,
  ): string {
    // Check if we have forEach operations that need CROSS APPLY
    // Only find top-level forEach - nested forEach are handled recursively
    const topLevelForEachSelects = combination.selects.filter(
      (s) => s.forEach ?? s.forEachOrNull,
    );

    if (topLevelForEachSelects.length > 0) {
      return this.generateForEachStatement(
        combination,
        viewDef,
        context,
        topLevelForEachSelects,
      );
    } else {
      return this.generateSimpleStatement(combination, viewDef, context);
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
    const selectClause = this.generateSelectClauseForCombination(
      combination,
      context,
    );
    const fromClause = this.generateFromClause(context);
    const resourceTypeFilter = this.generateResourceTypeFilter(viewDef, context);
    const whereClause = this.generateWhereClause(viewDef.where, context);

    let statement = `${selectClause}\n${fromClause}`;

    // Build WHERE clause combining resource type filter and view-level filters
    const whereConditions = [resourceTypeFilter];
    if (whereClause) {
      whereConditions.push(whereClause);
    }
    
    if (whereConditions.length > 0) {
      statement += `\nWHERE ${whereConditions.join(' AND ')}`;
    }

    // Debug logging removed

    return statement;
  }

  /**
   * Generate a SELECT statement with forEach using CROSS APPLY.
   */
  private generateForEachStatement(
    combination: SelectCombination,
    viewDef: ViewDefinition,
    context: TranspilerContext,
    forEachSelects: ViewDefinitionSelect[],
  ): string {
    const fromClause = this.generateFromClause(context);
    const forEachContextMap = this.buildForEachContextMap(forEachSelects, context);
    const applyClauses = this.buildApplyClauses(forEachContextMap, combination);
    const selectClause = this.generateForEachSelectClause(
      combination,
      context,
      forEachContextMap,
    );

    return this.assembleForEachStatement(
      selectClause,
      fromClause,
      applyClauses,
      viewDef,
      context,
    );
  }

  /**
   * Build the forEach context map by generating contexts for all forEach in original order.
   * Only processes top-level forEach - nested forEach are handled recursively.
   */
  private buildForEachContextMap(
    topLevelForEachSelects: ViewDefinitionSelect[],
    context: TranspilerContext,
  ): Map<ViewDefinitionSelect, TranspilerContext> {
    const forEachContextMap = new Map<ViewDefinitionSelect, TranspilerContext>();
    const counterState = { value: 0 };

    for (const select of topLevelForEachSelects) {
      this.generateForEachClauses(
        select,
        context.resourceAlias + ".json",
        context,
        forEachContextMap,
        counterState,
      );
    }

    return forEachContextMap;
  }

  /**
   * Build CROSS APPLY clauses in reverse order for forEach processing.
   * Only processes top-level forEach - nested forEach are handled recursively.
   */
  private buildApplyClauses(
    forEachContextMap: Map<ViewDefinitionSelect, TranspilerContext>,
    combination: SelectCombination,
  ): string {
    // Only process top-level forEach from combination.selects
    const topLevelForEach = combination.selects.filter(
      (s) => s.forEach ?? s.forEachOrNull,
    );

    return [...topLevelForEach]
      .reverse()
      .map((select) => {
        const forEachContext = forEachContextMap.get(select);
        if (!forEachContext) {
          throw new Error("forEach context not found");
        }
        return this.generateForEachClause(select, forEachContext, forEachContextMap, combination);
      })
      .join("");
  }

  /**
   * Assemble the final forEach statement with WHERE clause.
   */
  private assembleForEachStatement(
    selectClause: string,
    fromClause: string,
    applyClauses: string,
    viewDef: ViewDefinition,
    context: TranspilerContext,
  ): string {
    const resourceTypeFilter = this.generateResourceTypeFilter(viewDef, context);
    const whereClause = this.generateWhereClause(viewDef.where, context);

    let statement = `${selectClause}\n${fromClause}${applyClauses}`;

    const whereConditions = [resourceTypeFilter];
    if (whereClause) {
      whereConditions.push(whereClause);
    }

    if (whereConditions.length > 0) {
      statement += `\nWHERE ${whereConditions.join(' AND ')}`;
    }

    return statement;
  }

  /**
   * Recursively generate CROSS APPLY clauses for forEach, tracking parent contexts.
   * Returns the CROSS APPLY clause(s) for this forEach and any nested forEach.
   */
  private generateForEachClauses(
    forEachSelect: ViewDefinitionSelect,
    sourceExpression: string,
    baseContext: TranspilerContext,
    forEachContextMap: Map<ViewDefinitionSelect, TranspilerContext>,
    counterState: { value: number },
  ): string {
    const applyAlias = `forEach_${counterState.value++}`;
    const clause = this.buildForEachClause(forEachSelect, sourceExpression, applyAlias);
    const forEachContext = this.createForEachContext(
      baseContext,
      applyAlias,
      sourceExpression,
      forEachSelect,
    );

    forEachContextMap.set(forEachSelect, forEachContext);

    const nestedClauses = this.generateNestedForEachClauses(
      forEachSelect,
      applyAlias,
      forEachContext,
      forEachContextMap,
      counterState,
    );

    return clause + nestedClauses;
  }

  /**
   * Build the CROSS APPLY or OUTER APPLY clause for a forEach.
   */
  private buildForEachClause(
    forEachSelect: ViewDefinitionSelect,
    sourceExpression: string,
    applyAlias: string,
  ): string {
    const forEachPath = forEachSelect.forEach ?? forEachSelect.forEachOrNull;
    const isOrNull = !!forEachSelect.forEachOrNull;
    const applyType = isOrNull ? "OUTER APPLY" : "CROSS APPLY";

    return `\n${applyType} OPENJSON(${sourceExpression}, '$.${forEachPath}') AS ${applyAlias}`;
  }

  /**
   * Create a transpiler context specific to a forEach.
   */
  private createForEachContext(
    baseContext: TranspilerContext,
    applyAlias: string,
    sourceExpression: string,
    forEachSelect: ViewDefinitionSelect,
  ): TranspilerContext {
    const forEachPath = forEachSelect.forEach ?? forEachSelect.forEachOrNull;

    return {
      ...baseContext,
      iterationContext: `${applyAlias}.value`,
      currentForEachAlias: applyAlias,
      forEachSource: sourceExpression,
      forEachPath: `$.${forEachPath}`,
    };
  }

  /**
   * Generate nested forEach clauses within this forEach's select and unionAll options.
   */
  private generateNestedForEachClauses(
    forEachSelect: ViewDefinitionSelect,
    applyAlias: string,
    baseContext: TranspilerContext,
    forEachContextMap: Map<ViewDefinitionSelect, TranspilerContext>,
    counterState: { value: number },
  ): string {
    let nestedClauses = "";

    if (forEachSelect.select) {
      nestedClauses += this.generateNestedSelectForEachClauses(
        forEachSelect.select,
        applyAlias,
        baseContext,
        forEachContextMap,
        counterState,
      );
    }

    if (forEachSelect.unionAll) {
      nestedClauses += this.generateNestedUnionAllForEachClauses(
        forEachSelect.unionAll,
        applyAlias,
        baseContext,
        forEachContextMap,
        counterState,
      );
    }

    return nestedClauses;
  }

  /**
   * Generate forEach clauses for nested selects.
   */
  private generateNestedSelectForEachClauses(
    nestedSelects: ViewDefinitionSelect[],
    applyAlias: string,
    forEachContext: TranspilerContext,
    forEachContextMap: Map<ViewDefinitionSelect, TranspilerContext>,
    counterState: { value: number },
  ): string {
    return nestedSelects
      .filter((nestedSelect) => nestedSelect.forEach ?? nestedSelect.forEachOrNull)
      .map((nestedSelect) =>
        this.generateForEachClauses(
          nestedSelect,
          `${applyAlias}.value`,
          forEachContext,
          forEachContextMap,
          counterState,
        ),
      )
      .join("");
  }

  /**
   * Generate forEach clauses for nested unionAll options.
   */
  private generateNestedUnionAllForEachClauses(
    unionAllOptions: ViewDefinitionSelect[],
    applyAlias: string,
    forEachContext: TranspilerContext,
    forEachContextMap: Map<ViewDefinitionSelect, TranspilerContext>,
    counterState: { value: number },
  ): string {
    let clauses = "";

    for (const unionOption of unionAllOptions) {
      if (unionOption.forEach || unionOption.forEachOrNull) {
        clauses += this.generateForEachClauses(
          unionOption,
          `${applyAlias}.value`,
          forEachContext,
          forEachContextMap,
          counterState,
        );
      }
    }

    return clauses;
  }

  /**
   * Generate CROSS APPLY clauses for a forEach and its nested forEach using pre-generated contexts.
   * This is used when we need to generate CROSS APPLY clauses in a different order
   * than context generation.
   */
  private generateForEachClause(
    forEachSelect: ViewDefinitionSelect,
    forEachContext: TranspilerContext,
    forEachContextMap: Map<ViewDefinitionSelect, TranspilerContext>,
    combination?: SelectCombination,
  ): string {
    const clause = this.buildApplyClause(forEachSelect, forEachContext);
    const nestedSelectClauses = this.processNestedSelectClauses(
      forEachSelect,
      forEachContextMap,
      combination,
    );
    const nestedUnionClauses = this.processNestedUnionAllClauses(
      forEachSelect,
      forEachContextMap,
      combination,
    );

    return clause + nestedSelectClauses + nestedUnionClauses;
  }

  /**
   * Build the APPLY clause for a forEach using its pre-generated context.
   */
  private buildApplyClause(
    forEachSelect: ViewDefinitionSelect,
    forEachContext: TranspilerContext,
  ): string {
    const forEachPath = forEachSelect.forEach ?? forEachSelect.forEachOrNull;
    const isOrNull = !!forEachSelect.forEachOrNull;
    const applyType = isOrNull ? "OUTER APPLY" : "CROSS APPLY";
    const applyAlias = forEachContext.currentForEachAlias;
    const sourceExpression = forEachContext.forEachSource;

    return `\n${applyType} OPENJSON(${sourceExpression}, '$.${forEachPath}') AS ${applyAlias}`;
  }

  /**
   * Process nested forEach within this forEach's select.
   */
  private processNestedSelectClauses(
    forEachSelect: ViewDefinitionSelect,
    forEachContextMap: Map<ViewDefinitionSelect, TranspilerContext>,
    combination?: SelectCombination,
  ): string {
    if (!forEachSelect.select) {
      return "";
    }

    return forEachSelect.select
      .filter((nestedSelect) => nestedSelect.forEach ?? nestedSelect.forEachOrNull)
      .map((nestedSelect) => {
        const nestedContext = forEachContextMap.get(nestedSelect);
        if (!nestedContext) {
          throw new Error("Nested forEach context not found");
        }
        return this.generateForEachClause(nestedSelect, nestedContext, forEachContextMap, combination);
      })
      .join("");
  }

  /**
   * Process nested forEach within this forEach's unionAll options.
   */
  private processNestedUnionAllClauses(
    forEachSelect: ViewDefinitionSelect,
    forEachContextMap: Map<ViewDefinitionSelect, TranspilerContext>,
    combination?: SelectCombination,
  ): string {
    if (!forEachSelect.unionAll || !combination) {
      return "";
    }

    const selectedUnionOption = this.getSelectedUnionOption(forEachSelect, combination);
    if (!selectedUnionOption) {
      return "";
    }

    if (!(selectedUnionOption.forEach || selectedUnionOption.forEachOrNull)) {
      return "";
    }

    const nestedContext = forEachContextMap.get(selectedUnionOption);
    if (!nestedContext) {
      return "";
    }

    return this.generateForEachClause(selectedUnionOption, nestedContext, forEachContextMap, combination);
  }

  /**
   * Get the selected unionAll option for a forEach in a combination.
   */
  private getSelectedUnionOption(
    forEachSelect: ViewDefinitionSelect,
    combination: SelectCombination,
  ): ViewDefinitionSelect | null {
    if (!forEachSelect.unionAll) {
      return null;
    }

    const selectIndex = combination.selects.indexOf(forEachSelect);
    const selectedUnionIndex = selectIndex >= 0 ? combination.unionChoices[selectIndex] : -1;

    if (selectedUnionIndex < 0 || selectedUnionIndex >= forEachSelect.unionAll.length) {
      return null;
    }

    return forEachSelect.unionAll[selectedUnionIndex];
  }

  /**
   * Generate SELECT clause specifically for forEach statements.
   */
  private generateForEachSelectClause(
    combination: SelectCombination,
    context: TranspilerContext,
    forEachContextMap: Map<ViewDefinitionSelect, TranspilerContext>,
  ): string {
    const columnParts: string[] = [];

    this.addNonForEachColumns(combination, columnParts, context);

    // Only process top-level forEach (not nested ones)
    const topLevelForEachSelects = combination.selects.filter(
      (s) => s.forEach ?? s.forEachOrNull,
    );
    this.addForEachColumns(topLevelForEachSelects, columnParts, forEachContextMap, combination);

    return `SELECT\n  ${columnParts.join(",\n  ")}`;
  }

  /**
   * Add non-forEach columns to the column parts.
   */
  private addNonForEachColumns(
    combination: SelectCombination,
    columnParts: string[],
    context: TranspilerContext,
  ): void {
    for (let i = 0; i < combination.selects.length; i++) {
      const select = combination.selects[i];
      const unionChoice = combination.unionChoices[i];

      if (!select.forEach && !select.forEachOrNull) {
        this.addSelectElementColumns(select, columnParts, context);
        this.addUnionAllColumns(select, unionChoice, columnParts, context);
      }
    }
  }

  /**
   * Add top-level forEach columns to the column parts.
   * Only processes forEach that are direct children of the combination, not nested forEach.
   * Columns are added in reverse order to match the reversed CROSS APPLY order.
   */
  private addForEachColumns(
    topLevelForEachSelects: ViewDefinitionSelect[],
    columnParts: string[],
    forEachContextMap: Map<ViewDefinitionSelect, TranspilerContext>,
    combination: SelectCombination,
  ): void {
    // Reverse the order to match the reversed CROSS APPLY clause order
    const reversedForEach = [...topLevelForEachSelects].reverse();

    // First pass: Add unionAll columns first (they come before parent columns)
    for (const forEachSelect of reversedForEach) {
      const forEachContext = forEachContextMap.get(forEachSelect);
      if (!forEachContext) {
        throw new Error("forEach context not found in map");
      }

      // Find the index of this forEach in the original combination.selects array
      const originalIndex = combination.selects.indexOf(forEachSelect);
      const unionChoice = originalIndex >= 0 ? combination.unionChoices[originalIndex] : -1;

      // Handle unionAll for forEach
      if (unionChoice >= 0) {
        this.addUnionAllColumns(forEachSelect, unionChoice, columnParts, forEachContext, forEachContextMap);
      }
    }

    // Second pass: Add parent columns and nested select columns after unionAll
    for (const forEachSelect of reversedForEach) {
      const forEachContext = forEachContextMap.get(forEachSelect);
      if (!forEachContext) {
        throw new Error("forEach context not found in map");
      }

      if (forEachSelect.column) {
        this.addColumnsToList(forEachSelect.column, columnParts, forEachContext);
      }

      if (forEachSelect.select) {
        this.addNestedForEachColumns(
          forEachSelect.select,
          columnParts,
          forEachContext,
          forEachContextMap,
        );
      }
    }
  }

  /**
   * Add nested forEach columns to the column parts.
   * This handles both regular nested columns and nested forEach.
   */
  private addNestedForEachColumns(
    nestedSelects: ViewDefinitionSelect[],
    columnParts: string[],
    parentContext: TranspilerContext,
    forEachContextMap?: Map<ViewDefinitionSelect, TranspilerContext>,
  ): void {
    for (const nestedSelect of nestedSelects) {
      if (this.isForEachSelect(nestedSelect) && forEachContextMap) {
        this.processNestedForEachSelect(nestedSelect, columnParts, forEachContextMap);
      } else {
        this.processRegularNestedSelect(nestedSelect, columnParts, parentContext, forEachContextMap);
      }
    }
  }

  /**
   * Check if a select is a forEach or forEachOrNull.
   */
  private isForEachSelect(select: ViewDefinitionSelect): boolean {
    return !!(select.forEach ?? select.forEachOrNull);
  }

  /**
   * Process a nested select that is a forEach.
   */
  private processNestedForEachSelect(
    nestedSelect: ViewDefinitionSelect,
    columnParts: string[],
    forEachContextMap: Map<ViewDefinitionSelect, TranspilerContext>,
  ): void {
    const nestedForEachContext = forEachContextMap.get(nestedSelect);
    if (!nestedForEachContext) {
      return;
    }

    if (nestedSelect.column) {
      this.addColumnsToList(nestedSelect.column, columnParts, nestedForEachContext);
    }

    if (nestedSelect.select) {
      this.addNestedForEachColumns(
        nestedSelect.select,
        columnParts,
        nestedForEachContext,
        forEachContextMap,
      );
    }
  }

  /**
   * Process a regular nested select (not forEach).
   */
  private processRegularNestedSelect(
    nestedSelect: ViewDefinitionSelect,
    columnParts: string[],
    parentContext: TranspilerContext,
    forEachContextMap?: Map<ViewDefinitionSelect, TranspilerContext>,
  ): void {
    if (nestedSelect.column) {
      this.addColumnsToList(nestedSelect.column, columnParts, parentContext);
    }

    if (nestedSelect.select) {
      this.addNestedForEachColumns(
        nestedSelect.select,
        columnParts,
        parentContext,
        forEachContextMap,
      );
    }
  }

  /**
   * Create the base transpiler context.
   */
  private createBaseContext(viewDef: ViewDefinition): TranspilerContext {
    const constants: { [key: string]: string | number | boolean | null } = {};

    if (viewDef.constant) {
      for (const constant of viewDef.constant) {
        constants[constant.name] = this.getConstantValue(constant);
      }
    }

    return {
      resourceAlias: "r",
      constants,
    };
  }

  /**
   * Generate SQL expression for a column.
   */
  private generateColumnExpression(
    column: ViewDefinitionColumn,
    context: TranspilerContext,
  ): string {
    try {
      let expression: string;

      // Handle collection property
      if (column.collection === true) {
        // For collection=true, use JSON_QUERY to return arrays
        expression = this.generateCollectionExpression(column.path, context);
      } else if (column.collection === false) {
        // For collection=false, validate and use JSON_VALUE
        expression = this.generateSingleValueExpression(column.path, context);
      } else {
        // Default behaviour (collection not specified)
        expression = Transpiler.transpile(column.path, context);
      }

      // Handle type casting if specified
      if (column.type && column.collection !== true) {
        const sqlType = Transpiler.inferSqlType(column.type);
        if (sqlType !== "NVARCHAR(MAX)") {
          return `CAST(${expression} AS ${sqlType})`;
        }
      }

      return expression;
    } catch (error) {
      throw new Error(
        `Failed to transpile column '${column.name}' with path '${column.path}': ${error}`,
      );
    }
  }

  /**
   * Generate collection expression that returns an array.
   */
  private generateCollectionExpression(
    path: string,
    context: TranspilerContext,
  ): string {
    // For collection=true, we need to return all values as a JSON array
    // We need to construct the proper JSON path for the collection

    if (context.iterationContext) {
      // We're in a forEach context - use the iteration context
      return `JSON_QUERY(${context.iterationContext}, '$.${path}')`;
    } else {
      // Top-level collection - build JSON path from the FHIRPath expression
      return this.buildCollectionJsonPath(path, context);
    }
  }

  /**
   * Build a JSON path expression for collection=true.
   */
  private buildCollectionJsonPath(
    path: string,
    context: TranspilerContext,
  ): string {
    const pathParts = path.split(".");

    if (
      pathParts.length === 2 &&
      pathParts[0] === "name" &&
      pathParts[1] === "family"
    ) {
      // For name.family with collection=true, we need to get all family values from all name objects
      // family is a single string property in each name object, not an array
      return `(
        SELECT CASE
          WHEN COUNT(JSON_VALUE(names.value, '$.family')) = 0 THEN JSON_QUERY('[]')
          ELSE JSON_QUERY('[' + STRING_AGG(CONCAT('"', JSON_VALUE(names.value, '$.family'), '"'), ',') + ']')
        END
        FROM OPENJSON(${context.resourceAlias}.json, '$.name') AS names
        WHERE JSON_VALUE(names.value, '$.family') IS NOT NULL
      )`;
    } else if (
      pathParts.length === 2 &&
      pathParts[0] === "name" &&
      pathParts[1] === "given"
    ) {
      // For name.given with collection=true, flatten all given arrays into one array
      return `(
        SELECT CASE
          WHEN COUNT(n.value) = 0 THEN JSON_QUERY('[]')
          ELSE JSON_QUERY('[' + STRING_AGG(CONCAT('"', n.value, '"'), ',') + ']')
        END
        FROM OPENJSON(${context.resourceAlias}.json, '$.name') AS names
        CROSS APPLY OPENJSON(names.value, '$.given') AS n
        WHERE n.value IS NOT NULL
      )`;
    } else {
      // For other paths, try to use JSON_QUERY to get the array directly
      return `JSON_QUERY(${context.resourceAlias}.json, '$.${path}')`;
    }
  }

  /**
   * Generate single value expression for collection=false.
   */
  private generateSingleValueExpression(
    path: string,
    context: TranspilerContext,
  ): string {
    // For collection=false, use standard transpilation which returns single values
    return Transpiler.transpile(path, context);
  }

  /**
   * Generate the FROM clause.
   */
  private generateFromClause(
    context: TranspilerContext,
  ): string {
    const tableName = `[${this.options.schemaName}].[${this.options.tableName}]`;
    return `FROM ${tableName} AS [${context.resourceAlias}]`;
  }

  /**
   * Generate the resource type filter for WHERE clause.
   */
  private generateResourceTypeFilter(
    viewDef: ViewDefinition,
    context: TranspilerContext,
  ): string {
    return `[${context.resourceAlias}].[resource_type] = '${viewDef.resource}'`;
  }

  /**
   * Generate the WHERE clause for view-level filters.
   */
  private generateWhereClause(
    whereConditions: ViewDefinitionWhere[] | undefined,
    context: TranspilerContext,
  ): string | null {
    if (!whereConditions || whereConditions.length === 0) {
      return null;
    }

    const conditions: string[] = [];

    for (const where of whereConditions) {
      try {
        const condition = Transpiler.transpile(where.path, context);

        // Check if this looks like a simple boolean field reference that needs to be cast
        // Only apply this to simple field references, not complex expressions
        const booleanFields = ["active", "deceased", "multipleBirth"];
        const simpleBooleanFieldPattern = new RegExp(
          `^JSON_VALUE\\([^,]+,\\s*'\\$\\.(${booleanFields.join("|")})'\\)$`,
        );

        if (simpleBooleanFieldPattern.test(condition.trim())) {
          // Convert JSON_VALUE result to boolean: handle 'true'/'false' string conversion
          conditions.push(`(CASE WHEN ${condition} = 'true' THEN 1 ELSE 0 END = 1)`);
        } else {
          conditions.push(condition);
        }
      } catch (error) {
        throw new Error(
          `Failed to transpile where condition '${where.path}': ${error}`,
        );
      }
    }

    return `(${conditions.join(") AND (")})`;
  }

  /**
   * Expand all possible unionAll combinations from select elements.
   */
  private expandUnionCombinations(
    selects: ViewDefinitionSelect[],
  ): SelectCombination[] {
    let combinations: SelectCombination[] = [{ selects: [], unionChoices: [] }];

    for (const select of selects) {
      combinations = this.expandSelectCombinations(select, combinations);
    }

    return combinations;
  }

  /**
   * Expand combinations for a single select element.
   */
  private expandSelectCombinations(
    select: ViewDefinitionSelect,
    currentCombinations: SelectCombination[],
  ): SelectCombination[] {
    const newCombinations: SelectCombination[] = [];

    for (const combination of currentCombinations) {
      if (select.unionAll && select.unionAll.length > 0) {
        // Create one combination for each unionAll choice
        for (let i = 0; i < select.unionAll.length; i++) {
          const newCombination: SelectCombination = {
            selects: [...combination.selects, select],
            unionChoices: [...combination.unionChoices, i],
          };
          newCombinations.push(newCombination);
        }
      } else {
        // No unionAll, just add the select to existing combinations
        const newCombination: SelectCombination = {
          selects: [...combination.selects, select],
          unionChoices: [...combination.unionChoices, -1], // -1 means no union choice
        };
        newCombinations.push(newCombination);
      }
    }

    return newCombinations;
  }

  /**
   * Generate SELECT clause for a specific combination.
   */
  private generateSelectClauseForCombination(
    combination: SelectCombination,
    context: TranspilerContext,
  ): string {
    const columnParts: string[] = [];

    for (let i = 0; i < combination.selects.length; i++) {
      const select = combination.selects[i];
      const unionChoice = combination.unionChoices[i];

      this.addSelectElementColumns(select, columnParts, context);
      this.addUnionAllColumns(select, unionChoice, columnParts, context);
    }

    return `SELECT\n  ${columnParts.join(",\n  ")}`;
  }

  /**
   * Add columns from a select element to the column parts array.
   */
  private addSelectElementColumns(
    select: ViewDefinitionSelect,
    columnParts: string[],
    context: TranspilerContext,
  ): void {
    // Handle forEach/forEachOrNull - these should not add regular columns in the simple case
    if (select.forEach || select.forEachOrNull) {
      // Skip adding columns here - they will be handled in the forEach statement generation
      return;
    }

    // Add regular columns
    if (select.column) {
      this.addColumnsToList(select.column, columnParts, context);
    }

    // Add nested select columns
    if (select.select) {
      for (const nestedSelect of select.select) {
        const nestedColumns = this.generateSelectElementColumns(
          nestedSelect,
          context,
        );
        columnParts.push(...nestedColumns);
      }
    }
  }

  /**
   * Add unionAll columns for the chosen combination.
   */
  private addUnionAllColumns(
    select: ViewDefinitionSelect,
    unionChoice: number,
    columnParts: string[],
    context: TranspilerContext,
    forEachContextMap?: Map<ViewDefinitionSelect, TranspilerContext>,
  ): void {
    if (
      select.unionAll &&
      unionChoice >= 0 &&
      unionChoice < select.unionAll.length
    ) {
      const chosenUnion = select.unionAll[unionChoice];

      // Check if this unionAll option has forEach
      if ((chosenUnion.forEach || chosenUnion.forEachOrNull) && forEachContextMap) {
        const unionForEachContext = forEachContextMap.get(chosenUnion);
        if (unionForEachContext && chosenUnion.column) {
          // Use the forEach context for columns
          this.addColumnsToList(chosenUnion.column, columnParts, unionForEachContext);
        }
      } else if (chosenUnion.column) {
        // No forEach, use the parent context
        this.addColumnsToList(chosenUnion.column, columnParts, context);
      }
    }
  }

  /**
   * Add columns to the column parts list (shared logic to reduce duplication).
   */
  private addColumnsToList(
    columns: ViewDefinitionColumn[],
    columnParts: string[],
    context: TranspilerContext,
  ): void {
    for (const column of columns) {
      const columnSql = this.generateColumnExpression(column, context);
      columnParts.push(`${columnSql} AS [${column.name}]`);
    }
  }

  /**
   * Generate column expressions for a select element (used for nested selects).
   */
  private generateSelectElementColumns(
    select: ViewDefinitionSelect,
    context: TranspilerContext,
  ): string[] {
    const columnParts: string[] = [];

    if (select.column) {
      this.addColumnsToList(select.column, columnParts, context);
    }

    if (select.select) {
      for (const nestedSelect of select.select) {
        const nestedColumns = this.generateSelectElementColumns(
          nestedSelect,
          context,
        );
        columnParts.push(...nestedColumns);
      }
    }

    return columnParts;
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
            nullable: true, // FHIR data is generally nullable
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
   * Extract the value from a ViewDefinitionConstant.
   */
  private getConstantValue(constant: ViewDefinitionConstant): string | number | boolean | null {
    // Check all possible simple value types (primitives only, not complex types)
    const primitiveKeys: (keyof ViewDefinitionConstant)[] = [
      "valueString", "valueInteger", "valueDecimal", "valueBoolean",
      "valueDate", "valueDateTime", "valueTime", "valueInstant",
      "valueCode", "valueId", "valueUri", "valueUrl",
      "valueCanonical", "valueUuid", "valueOid", "valueMarkdown",
      "valueBase64Binary", "valuePositiveInt", "valueUnsignedInt", "valueInteger64",
    ];

    for (const key of primitiveKeys) {
      const value = constant[key];
      if (value !== undefined) {
        return value as string | number | boolean;
      }
    }

    return null;
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
   * Generate table creation SQL for materialized views.
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
