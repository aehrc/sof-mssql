/**
 * T-SQL query generator for ViewDefinition structures.
 * Generates SQL queries that can be executed against MS SQL Server.
 */

import { Transpiler, TranspilerContext } from "./fhirpath/transpiler.js";
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
    // Check if we have ANY forEach operations (including nested) that need CROSS APPLY
    // Must check the actual selected unionAll branches, not just the parent selects
    const hasForEach = this.combinationHasForEach(combination);

    if (hasForEach) {
      return this.generateForEachStatement(combination, viewDef, context);
    } else {
      return this.generateSimpleStatement(combination, viewDef, context);
    }
  }

  /**
   * Check if a specific combination has forEach operations.
   * This checks the actual selected unionAll branches, not just the parent selects.
   */
  private combinationHasForEach(combination: SelectCombination): boolean {
    for (let i = 0; i < combination.selects.length; i++) {
      const select = combination.selects[i];
      const unionChoice = combination.unionChoices[i];

      // Always check the parent select first (it may have forEach in nested selects)
      if (this.selectHasForEach(select)) {
        return true;
      }

      // If this select has a unionAll choice, also check the chosen branch
      if (unionChoice >= 0 && select.unionAll?.[unionChoice]) {
        const chosenBranch = select.unionAll[unionChoice];
        if (this.selectHasForEach(chosenBranch)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Check if any select in the tree has forEach operations.
   */
  private hasForEachInSelects(selects: ViewDefinitionSelect[]): boolean {
    for (const select of selects) {
      if (this.selectHasForEach(select)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a single select has forEach operations (including nested).
   */
  private selectHasForEach(select: ViewDefinitionSelect): boolean {
    // Check direct forEach
    if (select.forEach || select.forEachOrNull) {
      return true;
    }

    // Check nested selects
    if (select.select && this.hasForEachInSelects(select.select)) {
      return true;
    }

    // Check unionAll options
    return !!(select.unionAll && this.unionAllHasForEach(select.unionAll));
  }

  /**
   * Check if any unionAll option has forEach operations.
   */
  private unionAllHasForEach(unionAllOptions: ViewDefinitionSelect[]): boolean {
    for (const unionOption of unionAllOptions) {
      if (unionOption.forEach || unionOption.forEachOrNull) {
        return true;
      }
      if (unionOption.select && this.hasForEachInSelects(unionOption.select)) {
        return true;
      }
    }
    return false;
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
    const resourceTypeFilter = this.generateResourceTypeFilter(
      viewDef,
      context,
    );
    const whereClause = this.generateWhereClause(viewDef.where, context);

    let statement = `${selectClause}\n${fromClause}`;

    // Build WHERE clause combining resource type filter and view-level filters
    const whereConditions = [resourceTypeFilter];
    if (whereClause) {
      whereConditions.push(whereClause);
    }

    if (whereConditions.length > 0) {
      statement += `\nWHERE ${whereConditions.join(" AND ")}`;
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
  ): string {
    const fromClause = this.generateFromClause(context);
    const { forEachContextMap, topLevelForEach } = this.buildForEachContextMap(
      combination.selects,
      context,
      combination,
    );
    const applyClauses = this.buildApplyClauses(
      forEachContextMap,
      topLevelForEach,
      combination,
    );
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
   * Build the forEach context map by generating contexts for all forEach.
   * Only processes top-level forEach - nested forEach are handled recursively.
   * Must be aware of the combination to process the correct unionAll branches.
   */
  private buildForEachContextMap(
    selects: ViewDefinitionSelect[],
    context: TranspilerContext,
    combination?: SelectCombination,
  ): {
    forEachContextMap: Map<ViewDefinitionSelect, TranspilerContext>;
    topLevelForEach: ViewDefinitionSelect[];
  } {
    const forEachContextMap = new Map<
      ViewDefinitionSelect,
      TranspilerContext
    >();
    const counterState = { value: 0 };

    // Collect all top-level forEach (including those in nested select arrays and unionAll branches)
    const topLevelForEach = this.collectTopLevelForEach(selects, combination);

    // Process each top-level forEach
    for (const select of topLevelForEach) {
      this.generateForEachClauses(
        select,
        context.resourceAlias + ".json",
        context,
        forEachContextMap,
        counterState,
      );
    }

    return { forEachContextMap, topLevelForEach };
  }

  /**
   * Helper to add forEach from a select array to the topLevelForEach list.
   */
  private addForEachFromSelectArray(
    selects: ViewDefinitionSelect[],
    topLevelForEach: ViewDefinitionSelect[],
  ): void {
    for (const nestedSelect of selects) {
      if (nestedSelect.forEach || nestedSelect.forEachOrNull) {
        topLevelForEach.push(nestedSelect);
      }
    }
  }

  /**
   * Collect all forEach that should be treated as top-level.
   * This includes:
   * 1. Selects that directly have forEach
   * 2. forEach inside select arrays of non-forEach selects
   * 3. forEach inside the chosen unionAll branches (when combination is provided)
   *    ONLY if the parent select doesn't have forEach
   */
  private collectTopLevelForEach(
    selects: ViewDefinitionSelect[],
    combination?: SelectCombination,
  ): ViewDefinitionSelect[] {
    const topLevelForEach: ViewDefinitionSelect[] = [];

    for (const element of selects) {
      const select = element;

      // Process the select itself (handles both forEach in select and nested selects)
      this.processSelectForEach(select, topLevelForEach);

      // Also process unionAll choices if present and parent doesn't have forEach
      // If parent has forEach, unionAll forEach are nested, not top-level
      if (combination && !(select.forEach || select.forEachOrNull)) {
        this.processUnionAllChoice(select, combination, topLevelForEach);
      }
    }

    return topLevelForEach;
  }

  /**
   * Process a select with a unionAll choice from a combination.
   * Adds forEach from the chosen unionAll branch to topLevelForEach.
   */
  private processUnionAllChoice(
    select: ViewDefinitionSelect,
    combination: SelectCombination,
    topLevelForEach: ViewDefinitionSelect[],
  ): void {
    const selectIndex = combination.selects.indexOf(select);
    const unionChoice =
      selectIndex >= 0 ? combination.unionChoices[selectIndex] : -1;

    if (unionChoice >= 0 && select.unionAll?.[unionChoice]) {
      const chosenBranch = select.unionAll[unionChoice];
      if (chosenBranch.forEach || chosenBranch.forEachOrNull) {
        topLevelForEach.push(chosenBranch);
      } else if (chosenBranch.select) {
        this.addForEachFromSelectArray(chosenBranch.select, topLevelForEach);
      }
    }
  }

  /**
   * Process a select for forEach, handling both direct forEach and nested selects.
   */
  private processSelectForEach(
    select: ViewDefinitionSelect,
    topLevelForEach: ViewDefinitionSelect[],
  ): void {
    if (select.forEach || select.forEachOrNull) {
      topLevelForEach.push(select);
    } else if (select.select) {
      this.addForEachFromSelectArray(select.select, topLevelForEach);
    }
  }

  /**
   * Build CROSS APPLY clauses in reverse order for forEach processing.
   * Only processes top-level forEach - nested forEach clauses are generated recursively.
   */
  private buildApplyClauses(
    forEachContextMap: Map<ViewDefinitionSelect, TranspilerContext>,
    topLevelForEach: ViewDefinitionSelect[],
    combination: SelectCombination,
  ): string {
    // Generate CROSS APPLY clauses in reverse order for top-level forEach only
    return [...topLevelForEach]
      .reverse()
      .map((select) => {
        const forEachContext = forEachContextMap.get(select);
        if (!forEachContext) {
          throw new Error("forEach context not found");
        }
        return this.generateForEachClause(
          select,
          forEachContext,
          forEachContextMap,
          combination,
        );
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
    const resourceTypeFilter = this.generateResourceTypeFilter(
      viewDef,
      context,
    );
    const whereClause = this.generateWhereClause(viewDef.where, context);

    let statement = `${selectClause}\n${fromClause}${applyClauses}`;

    const whereConditions = [resourceTypeFilter];
    if (whereClause) {
      whereConditions.push(whereClause);
    }

    if (whereConditions.length > 0) {
      statement += `\nWHERE ${whereConditions.join(" AND ")}`;
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
    const clause = this.buildForEachClause(
      forEachSelect,
      sourceExpression,
      applyAlias,
      baseContext,
    );
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
   * Handles array flattening for paths that traverse multiple arrays (e.g., contact.telecom).
   */
  private buildForEachClause(
    forEachSelect: ViewDefinitionSelect,
    sourceExpression: string,
    applyAlias: string,
    context: TranspilerContext,
  ): string {
    const rawPath = forEachSelect.forEach ?? forEachSelect.forEachOrNull;
    const isOrNull = !!forEachSelect.forEachOrNull;
    const applyType = isOrNull ? "OUTER APPLY" : "CROSS APPLY";

    const { path: pathWithoutWhere, whereCondition } = this.parseFHIRPathWhere(
      rawPath ?? "",
      context,
    );
    const { path: forEachPath, arrayIndex } =
      this.parseArrayIndexing(pathWithoutWhere);
    const arrayPaths = this.detectArrayFlatteningPaths(forEachPath);

    if (arrayPaths.length > 1) {
      return this.buildNestedForEachClause(
        arrayPaths,
        sourceExpression,
        applyAlias,
        applyType,
        arrayIndex,
        whereCondition,
      );
    }

    return this.buildSimpleForEachClause(
      applyType,
      sourceExpression,
      forEachPath,
      applyAlias,
      arrayIndex,
      whereCondition,
    );
  }

  /**
   * Build a simple forEach clause for single array paths.
   */
  private buildSimpleForEachClause(
    applyType: string,
    sourceExpression: string,
    forEachPath: string,
    applyAlias: string,
    arrayIndex: number | null,
    whereCondition: string | null,
  ): string {
    if (arrayIndex !== null || whereCondition !== null) {
      const whereClauses: string[] = [];
      if (arrayIndex !== null) {
        whereClauses.push(`[key] = '${arrayIndex}'`);
      }
      if (whereCondition !== null) {
        whereClauses.push(whereCondition);
      }

      return `\n${applyType} (
        SELECT * FROM OPENJSON(${sourceExpression}, '$.${forEachPath}')
        WHERE ${whereClauses.join(" AND ")}
      ) AS ${applyAlias}`;
    }

    return `\n${applyType} OPENJSON(${sourceExpression}, '$.${forEachPath}') AS ${applyAlias}`;
  }

  /**
   * Parse FHIRPath .where() function from a forEach path.
   * Transpiles the where condition to SQL using the FHIRPath transpiler.
   */
  private parseFHIRPathWhere(
    path: string,
    context: TranspilerContext,
  ): {
    path: string;
    whereCondition: string | null;
  } {
    const whereMatch = /^(.+)\.where\((.*)\)$/.exec(path);
    if (whereMatch) {
      const basePath = whereMatch[1];
      const condition = whereMatch[2].trim();

      // Handle .where(false) - filter out everything
      if (condition === "false") {
        return {
          path: basePath,
          whereCondition: "1 = 0", // Always false
        };
      }

      // Transpile the where condition using FHIRPath transpiler
      // The condition will be evaluated in the context of items in the OPENJSON result
      // We need to create a context where expressions refer to the 'value' column
      try {
        const itemContext: TranspilerContext = {
          resourceAlias: "forEach_item",
          constants: context.constants,
          iterationContext: "value",
        };

        const sqlCondition = Transpiler.transpile(condition, itemContext);
        return {
          path: basePath,
          whereCondition: sqlCondition,
        };
      } catch (error) {
        throw new Error(
          `Failed to transpile .where() condition "${condition}": ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return { path, whereCondition: null };
  }

  /**
   * Parse array indexing from a forEach path.
   * For paths like "contact.telecom[0]", interpret as "contact[0].telecom[0]" - apply index to all array segments.
   */
  private parseArrayIndexing(path: string): {
    path: string;
    arrayIndex: number | null;
  } {
    // Check if the last segment has array indexing
    const match = /^(.+)\[(\d+)]$/.exec(path);
    if (match) {
      const basePath = match[1];
      const arrayIndex = parseInt(match[2], 10);

      // Check if this is a multi-segment path (e.g., contact.telecom[0])
      const segments = basePath.split(".");
      if (segments.length > 1) {
        // For contact.telecom[0], interpret as contact[0].telecom[0]
        // Apply the index to ALL array segments
        const knownArrays = [
          "name",
          "telecom",
          "address",
          "contact",
          "identifier",
          "communication",
          "link",
        ];

        const indexedPath = segments
          .map((seg) => {
            const cleanSeg = seg.replace(/\[.*]/, "");
            if (knownArrays.includes(cleanSeg)) {
              return `${cleanSeg}[${arrayIndex}]`;
            }
            return cleanSeg;
          })
          .join(".");

        return {
          path: indexedPath,
          arrayIndex: null, // Index already applied in path
        };
      }

      return {
        path: basePath,
        arrayIndex: arrayIndex,
      };
    }
    return { path, arrayIndex: null };
  }

  /**
   * Detect if a forEach path requires array flattening.
   * Returns array of path segments that are arrays in FHIR Patient resource.
   */
  private detectArrayFlatteningPaths(path: string): string[] {
    // Known array fields in FHIR Patient that could be traversed
    const knownArrays = [
      "name",
      "telecom",
      "address",
      "contact",
      "identifier",
      "communication",
      "link",
    ];

    const segments = path.split(".");
    const arraySegments: string[] = [];

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      // Remove array indexing if present (e.g., telecom[0] -> telecom)
      const cleanSegment = segment.replace(/\[.*]/, "");

      if (knownArrays.includes(cleanSegment)) {
        // Build the path up to this array
        arraySegments.push(segments.slice(0, i + 1).join("."));
      }
    }

    return arraySegments;
  }

  /**
   * Build nested CROSS APPLY clauses for array flattening.
   */
  private buildNestedForEachClause(
    arrayPaths: string[],
    sourceExpression: string,
    finalAlias: string,
    applyType: string,
    arrayIndex?: number | null,
    whereCondition?: string | null,
  ): string {
    let clauses = "";
    let currentSource = sourceExpression;

    for (let i = 0; i < arrayPaths.length; i++) {
      const isLast = i === arrayPaths.length - 1;
      const alias = isLast ? finalAlias : `${finalAlias}_nest${i}`;

      const pathSegment = this.extractPathSegment(arrayPaths, i);
      const { cleanSegment, segmentIndex } =
        this.parseSegmentIndexing(pathSegment);
      const jsonPath = `$.${cleanSegment}`;

      const whereClauses = this.buildWhereClauses(
        isLast,
        segmentIndex,
        arrayIndex,
        whereCondition,
      );

      clauses += this.buildApplyWithOptionalWhere(
        applyType,
        currentSource,
        jsonPath,
        alias,
        whereClauses,
      );

      currentSource = `${alias}.value`;
    }

    return clauses;
  }

  /**
   * Extract path segment for a specific level in array paths.
   */
  private extractPathSegment(arrayPaths: string[], index: number): string {
    const fullPath = arrayPaths[index];
    const previousPath = index > 0 ? arrayPaths[index - 1] : "";
    return previousPath
      ? fullPath.substring(previousPath.length + 1)
      : fullPath;
  }

  /**
   * Parse array indexing from a path segment.
   */
  private parseSegmentIndexing(pathSegment: string): {
    cleanSegment: string;
    segmentIndex: number | null;
  } {
    const segmentMatch = /^(.+)\[(\d+)]$/.exec(pathSegment);
    return {
      cleanSegment: segmentMatch ? segmentMatch[1] : pathSegment,
      segmentIndex: segmentMatch ? parseInt(segmentMatch[2], 10) : null,
    };
  }

  /**
   * Build WHERE clause conditions for array filtering.
   */
  private buildWhereClauses(
    isLast: boolean,
    segmentIndex: number | null,
    arrayIndex: number | null | undefined,
    whereCondition: string | null | undefined,
  ): string[] {
    const whereClauses: string[] = [];

    if (segmentIndex !== null) {
      whereClauses.push(`[key] = '${segmentIndex}'`);
    } else if (isLast && arrayIndex !== null && arrayIndex !== undefined) {
      whereClauses.push(`[key] = '${arrayIndex}'`);
    }

    if (isLast && whereCondition !== null && whereCondition !== undefined) {
      whereClauses.push(whereCondition);
    }

    return whereClauses;
  }

  /**
   * Build APPLY clause with optional WHERE conditions.
   */
  private buildApplyWithOptionalWhere(
    applyType: string,
    source: string,
    jsonPath: string,
    alias: string,
    whereClauses: string[],
  ): string {
    if (whereClauses.length > 0) {
      return `\n${applyType} (
        SELECT * FROM OPENJSON(${source}, '${jsonPath}')
        WHERE ${whereClauses.join(" AND ")}
      ) AS ${alias}`;
    }
    return `\n${applyType} OPENJSON(${source}, '${jsonPath}') AS ${alias}`;
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
      .filter(
        (nestedSelect) => nestedSelect.forEach ?? nestedSelect.forEachOrNull,
      )
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
   * Handles array flattening for paths that traverse multiple arrays and array indexing.
   */
  private buildApplyClause(
    forEachSelect: ViewDefinitionSelect,
    forEachContext: TranspilerContext,
  ): string {
    const rawPath = forEachSelect.forEach ?? forEachSelect.forEachOrNull;
    const isOrNull = !!forEachSelect.forEachOrNull;
    const applyType = isOrNull ? "OUTER APPLY" : "CROSS APPLY";
    const applyAlias = forEachContext.currentForEachAlias ?? "";
    const sourceExpression = forEachContext.forEachSource ?? "";

    const { path: pathWithoutWhere, whereCondition } = this.parseFHIRPathWhere(
      rawPath ?? "",
      forEachContext,
    );
    const { path: forEachPath, arrayIndex } =
      this.parseArrayIndexing(pathWithoutWhere);
    const arrayPaths = this.detectArrayFlatteningPaths(forEachPath);

    if (arrayPaths.length > 1) {
      return this.buildNestedForEachClause(
        arrayPaths,
        sourceExpression,
        applyAlias,
        applyType,
        arrayIndex,
        whereCondition,
      );
    }

    return this.buildSimpleApplyClause(
      applyType,
      sourceExpression,
      forEachPath,
      applyAlias,
      arrayIndex,
      whereCondition,
    );
  }

  /**
   * Build a simple APPLY clause for single array paths.
   */
  private buildSimpleApplyClause(
    applyType: string,
    sourceExpression: string,
    forEachPath: string,
    applyAlias: string,
    arrayIndex: number | null,
    whereCondition: string | null,
  ): string {
    const whereClauses = this.buildWhereClausesForApply(
      arrayIndex,
      whereCondition,
    );

    if (whereClauses.length > 0) {
      return `\n${applyType} (
        SELECT * FROM OPENJSON(${sourceExpression}, '$.${forEachPath}')
        WHERE ${whereClauses.join(" AND ")}
      ) AS ${applyAlias}`;
    }

    return `\n${applyType} OPENJSON(${sourceExpression}, '$.${forEachPath}') AS ${applyAlias}`;
  }

  /**
   * Build WHERE clauses for APPLY operations.
   */
  private buildWhereClausesForApply(
    arrayIndex: number | null,
    whereCondition: string | null,
  ): string[] {
    const whereClauses: string[] = [];
    if (arrayIndex !== null) {
      whereClauses.push(`[key] = '${arrayIndex}'`);
    }
    if (whereCondition !== null) {
      whereClauses.push(whereCondition);
    }
    return whereClauses;
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
      .filter(
        (nestedSelect) => nestedSelect.forEach ?? nestedSelect.forEachOrNull,
      )
      .map((nestedSelect) => {
        const nestedContext = forEachContextMap.get(nestedSelect);
        if (!nestedContext) {
          throw new Error("Nested forEach context not found");
        }
        return this.generateForEachClause(
          nestedSelect,
          nestedContext,
          forEachContextMap,
          combination,
        );
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

    const selectedUnionOption = this.getSelectedUnionOption(
      forEachSelect,
      combination,
    );
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

    return this.generateForEachClause(
      selectedUnionOption,
      nestedContext,
      forEachContextMap,
      combination,
    );
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
    const selectedUnionIndex =
      selectIndex >= 0 ? combination.unionChoices[selectIndex] : -1;

    if (
      selectedUnionIndex < 0 ||
      selectedUnionIndex >= forEachSelect.unionAll.length
    ) {
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

    for (let i = 0; i < combination.selects.length; i++) {
      const select = combination.selects[i];
      const unionChoice = combination.unionChoices[i];

      if (select.forEach || select.forEachOrNull) {
        this.addForEachSelectColumns(
          select,
          unionChoice,
          columnParts,
          forEachContextMap,
        );
      } else {
        this.addNonForEachSelectColumns(
          select,
          unionChoice,
          columnParts,
          context,
          forEachContextMap,
        );
      }
    }

    return `SELECT\n  ${columnParts.join(",\n  ")}`;
  }

  /**
   * Add columns for a forEach select.
   */
  private addForEachSelectColumns(
    select: ViewDefinitionSelect,
    unionChoice: number,
    columnParts: string[],
    forEachContextMap: Map<ViewDefinitionSelect, TranspilerContext>,
  ): void {
    const forEachContext = forEachContextMap.get(select);
    if (!forEachContext) {
      return;
    }

    if (select.column) {
      this.addColumnsToList(select.column, columnParts, forEachContext);
    }

    this.addNestedSelectColumnsForForEach(
      select,
      columnParts,
      forEachContext,
      forEachContextMap,
    );
    this.addUnionAllColumnsForSelect(
      select,
      unionChoice,
      columnParts,
      forEachContext,
      forEachContextMap,
    );
  }

  /**
   * Add columns for a non-forEach select.
   */
  private addNonForEachSelectColumns(
    select: ViewDefinitionSelect,
    unionChoice: number,
    columnParts: string[],
    context: TranspilerContext,
    forEachContextMap: Map<ViewDefinitionSelect, TranspilerContext>,
  ): void {
    if (select.column) {
      this.addColumnsToList(select.column, columnParts, context);
    }

    this.addNestedSelectColumnsForNonForEach(
      select,
      columnParts,
      context,
      forEachContextMap,
    );
    this.addUnionAllColumnsForSelect(
      select,
      unionChoice,
      columnParts,
      context,
      forEachContextMap,
    );
  }

  /**
   * Add nested select columns for forEach select.
   */
  private addNestedSelectColumnsForForEach(
    select: ViewDefinitionSelect,
    columnParts: string[],
    parentContext: TranspilerContext,
    forEachContextMap: Map<ViewDefinitionSelect, TranspilerContext>,
  ): void {
    if (!select.select) {
      return;
    }

    for (const nestedSelect of select.select) {
      if (nestedSelect.forEach || nestedSelect.forEachOrNull) {
        const nestedContext = forEachContextMap.get(nestedSelect);
        if (nestedContext && nestedSelect.column) {
          this.addColumnsToList(
            nestedSelect.column,
            columnParts,
            nestedContext,
          );
        }
      } else if (nestedSelect.column) {
        this.addColumnsToList(nestedSelect.column, columnParts, parentContext);
      }
    }
  }

  /**
   * Add nested select columns for non-forEach select.
   */
  private addNestedSelectColumnsForNonForEach(
    select: ViewDefinitionSelect,
    columnParts: string[],
    context: TranspilerContext,
    forEachContextMap: Map<ViewDefinitionSelect, TranspilerContext>,
  ): void {
    if (!select.select) {
      return;
    }

    for (const nestedSelect of select.select) {
      if (nestedSelect.forEach || nestedSelect.forEachOrNull) {
        const forEachContext = forEachContextMap.get(nestedSelect);
        if (forEachContext && nestedSelect.column) {
          this.addColumnsToList(
            nestedSelect.column,
            columnParts,
            forEachContext,
          );
        }
      } else if (nestedSelect.column) {
        this.addColumnsToList(nestedSelect.column, columnParts, context);
      }
    }
  }

  /**
   * Add unionAll columns for a select.
   */
  private addUnionAllColumnsForSelect(
    select: ViewDefinitionSelect,
    unionChoice: number,
    columnParts: string[],
    defaultContext: TranspilerContext,
    forEachContextMap: Map<ViewDefinitionSelect, TranspilerContext>,
  ): void {
    if (unionChoice < 0 || !select.unionAll?.[unionChoice]) {
      return;
    }

    const chosenBranch = select.unionAll[unionChoice];
    if (!chosenBranch.column) {
      return;
    }

    const branchContext =
      chosenBranch.forEach || chosenBranch.forEachOrNull
        ? forEachContextMap.get(chosenBranch)
        : defaultContext;

    if (branchContext) {
      this.addColumnsToList(chosenBranch.column, columnParts, branchContext);
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
        this.processNestedForEachSelect(
          nestedSelect,
          columnParts,
          forEachContextMap,
        );
      } else {
        this.processRegularNestedSelect(
          nestedSelect,
          columnParts,
          parentContext,
          forEachContextMap,
        );
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
      this.addColumnsToList(
        nestedSelect.column,
        columnParts,
        nestedForEachContext,
      );
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
        expression = this.generateCollectionExpression(column.path, context);
      } else if (column.collection === false) {
        expression = this.generateSingleValueExpression(column.path, context);
      } else {
        expression = Transpiler.transpile(column.path, context);
      }

      // Handle type casting if specified
      if (column.type && column.collection !== true) {
        expression = this.applyTypeCasting(expression, column.type);
      }

      return expression;
    } catch (error) {
      throw new Error(
        `Failed to transpile column '${column.name}' with path '${column.path}': ${error}`,
      );
    }
  }

  /**
   * Apply type casting to an expression.
   */
  private applyTypeCasting(expression: string, type: string): string {
    const sqlType = Transpiler.inferSqlType(type);
    if (sqlType === "NVARCHAR(MAX)") {
      return expression;
    }

    // Special handling for boolean type
    if (sqlType === "BIT") {
      return this.generateBooleanCaseExpression(expression);
    }

    return `CAST(${expression} AS ${sqlType})`;
  }

  /**
   * Generate a CASE expression for boolean conversion.
   * Handles both simple JSON_VALUE fields and boolean expressions.
   */
  private generateBooleanCaseExpression(expression: string): string {
    const hasComparisonOperator =
      expression.includes("=") ||
      expression.includes("<") ||
      expression.includes(">") ||
      expression.includes("NOT") ||
      expression.includes(" OR ") ||
      expression.includes(" AND ");

    if (expression.includes("JSON_VALUE") && !hasComparisonOperator) {
      // Simple JSON_VALUE - compare to 'true'/'false' strings
      return `CASE WHEN ${expression} = 'true' THEN 1 WHEN ${expression} = 'false' THEN 0 ELSE NULL END`;
    }

    // Boolean expression - use as-is in CASE
    return `CASE WHEN ${expression} THEN 1 WHEN NOT ${expression} THEN 0 ELSE NULL END`;
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
  private generateFromClause(context: TranspilerContext): string {
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
          conditions.push(
            `(CASE WHEN ${condition} = 'true' THEN 1 ELSE 0 END = 1)`,
          );
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
   * Handles nested unionAll by recursively expanding them.
   */
  private expandSelectCombinations(
    select: ViewDefinitionSelect,
    currentCombinations: SelectCombination[],
  ): SelectCombination[] {
    const newCombinations: SelectCombination[] = [];

    for (const combination of currentCombinations) {
      if (select.unionAll && select.unionAll.length > 0) {
        this.expandUnionAllOptions(select, combination, newCombinations);
      } else {
        this.addNonUnionCombination(select, combination, newCombinations);
      }
    }

    return newCombinations;
  }

  /**
   * Expand unionAll options for a select.
   */
  private expandUnionAllOptions(
    select: ViewDefinitionSelect,
    combination: SelectCombination,
    newCombinations: SelectCombination[],
  ): void {
    const unionAll = select.unionAll;
    if (!unionAll) return;

    for (let i = 0; i < unionAll.length; i++) {
      const unionOption = unionAll[i];

      if (unionOption.unionAll && unionOption.unionAll.length > 0) {
        this.expandNestedUnion(
          select,
          i,
          unionOption,
          combination,
          newCombinations,
        );
      } else {
        this.addSimpleUnionCombination(select, i, combination, newCombinations);
      }
    }
  }

  /**
   * Expand nested unionAll within a unionAll option.
   */
  private expandNestedUnion(
    select: ViewDefinitionSelect,
    unionIndex: number,
    unionOption: ViewDefinitionSelect,
    combination: SelectCombination,
    newCombinations: SelectCombination[],
  ): void {
    const nestedCombinations = this.expandSelectCombinations(unionOption, [
      { selects: [], unionChoices: [] },
    ]);

    for (const nestedComb of nestedCombinations) {
      const newCombination: SelectCombination = {
        selects: [...combination.selects, select, ...nestedComb.selects],
        unionChoices: [
          ...combination.unionChoices,
          unionIndex,
          ...nestedComb.unionChoices,
        ],
      };
      newCombinations.push(newCombination);
    }
  }

  /**
   * Add a simple unionAll combination (no nested unionAll).
   */
  private addSimpleUnionCombination(
    select: ViewDefinitionSelect,
    unionIndex: number,
    combination: SelectCombination,
    newCombinations: SelectCombination[],
  ): void {
    const newCombination: SelectCombination = {
      selects: [...combination.selects, select],
      unionChoices: [...combination.unionChoices, unionIndex],
    };
    newCombinations.push(newCombination);
  }

  /**
   * Add a combination for a select without unionAll.
   */
  private addNonUnionCombination(
    select: ViewDefinitionSelect,
    combination: SelectCombination,
    newCombinations: SelectCombination[],
  ): void {
    const newCombination: SelectCombination = {
      selects: [...combination.selects, select],
      unionChoices: [...combination.unionChoices, -1],
    };
    newCombinations.push(newCombination);
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
      if (
        (chosenUnion.forEach || chosenUnion.forEachOrNull) &&
        forEachContextMap
      ) {
        const unionForEachContext = forEachContextMap.get(chosenUnion);
        if (unionForEachContext && chosenUnion.column) {
          // Use the forEach context for columns
          this.addColumnsToList(
            chosenUnion.column,
            columnParts,
            unionForEachContext,
          );
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
  private getConstantValue(
    constant: ViewDefinitionConstant,
  ): string | number | boolean | null {
    // Check all possible simple value types (primitives only, not complex types)
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

    // Count how many values are defined
    const definedValues = primitiveKeys.filter(
      (key) => constant[key] !== undefined,
    );

    // Validate that exactly one value is defined
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

    // Return the single defined value
    const key = definedValues[0];
    return constant[key] as string | number | boolean;
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
