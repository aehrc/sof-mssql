/**
 * Processes forEach operations and generates CROSS APPLY clauses.
 */

import { TranspilerContext } from "../fhirpath/transpiler.js";
import { ViewDefinitionSelect } from "../types.js";
import { SelectCombination } from "./SelectCombinationExpander.js";
import { PathParser } from "./PathParser.js";

/**
 * Counter state for generating unique forEach aliases.
 */
interface CounterState {
  value: number;
}

/**
 * Result of building forEach context map.
 */
interface ForEachContextMapResult {
  forEachContextMap: Map<ViewDefinitionSelect, TranspilerContext>;
  topLevelForEach: ViewDefinitionSelect[];
}

/**
 * Handles all forEach-related processing and CROSS APPLY generation.
 */
export class ForEachProcessor {
  private readonly pathParser: PathParser;

  constructor(pathParser: PathParser) {
    this.pathParser = pathParser;
  }

  /**
   * Check if a specific combination has forEach operations.
   */
  combinationHasForEach(combination: SelectCombination): boolean {
    for (let i = 0; i < combination.selects.length; i++) {
      const select = combination.selects[i];
      const unionChoice = combination.unionChoices[i];

      if (this.selectHasForEach(select)) {
        return true;
      }

      // If this select has a unionAll choice, also check the chosen branch.
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
   * Check if a single select has forEach operations (including nested).
   */
  selectHasForEach(select: ViewDefinitionSelect): boolean {
    if (select.forEach || select.forEachOrNull) {
      return true;
    }

    if (select.select && this.hasForEachInSelects(select.select)) {
      return true;
    }

    return !!(select.unionAll && this.unionAllHasForEach(select.unionAll));
  }

  /**
   * Check if any select in the tree has forEach operations.
   */
  private hasForEachInSelects(selects: ViewDefinitionSelect[]): boolean {
    return selects.some((select) => this.selectHasForEach(select));
  }

  /**
   * Check if any unionAll option has forEach operations.
   */
  private unionAllHasForEach(unionAllOptions: ViewDefinitionSelect[]): boolean {
    return unionAllOptions.some(
      (unionOption) =>
        unionOption.forEach ||
        unionOption.forEachOrNull ||
        (unionOption.select && this.hasForEachInSelects(unionOption.select)),
    );
  }

  /**
   * Build the forEach context map by generating contexts for all forEach.
   */
  buildForEachContextMap(
    selects: ViewDefinitionSelect[],
    context: TranspilerContext,
    combination?: SelectCombination,
  ): ForEachContextMapResult {
    const forEachContextMap = new Map<
      ViewDefinitionSelect,
      TranspilerContext
    >();
    const counterState: CounterState = { value: 0 };

    const topLevelForEach = this.collectTopLevelForEach(selects, combination);

    for (const select of topLevelForEach) {
      this.generateForEachContexts(
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
   * Collect all forEach that should be treated as top-level.
   */
  private collectTopLevelForEach(
    selects: ViewDefinitionSelect[],
    combination?: SelectCombination,
  ): ViewDefinitionSelect[] {
    const topLevelForEach: ViewDefinitionSelect[] = [];

    for (const select of selects) {
      this.processSelectForEach(select, topLevelForEach);

      // Also process unionAll choices if present and parent doesn't have forEach.
      if (combination && !this.isForEachSelect(select)) {
        this.processUnionAllChoice(select, combination, topLevelForEach);
      }
    }

    return topLevelForEach;
  }

  /**
   * Process a select for forEach, handling both direct forEach and nested selects.
   */
  private processSelectForEach(
    select: ViewDefinitionSelect,
    topLevelForEach: ViewDefinitionSelect[],
  ): void {
    if (this.isForEachSelect(select)) {
      topLevelForEach.push(select);
    } else if (select.select) {
      this.addForEachFromSelectArray(select.select, topLevelForEach);
    }
  }

  /**
   * Process a select with a unionAll choice from a combination.
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
      if (this.isForEachSelect(chosenBranch)) {
        topLevelForEach.push(chosenBranch);
      } else if (chosenBranch.select) {
        this.addForEachFromSelectArray(chosenBranch.select, topLevelForEach);
      }
    }
  }

  /**
   * Add forEach from a select array to the topLevelForEach list.
   */
  private addForEachFromSelectArray(
    selects: ViewDefinitionSelect[],
    topLevelForEach: ViewDefinitionSelect[],
  ): void {
    for (const nestedSelect of selects) {
      if (this.isForEachSelect(nestedSelect)) {
        topLevelForEach.push(nestedSelect);
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
   * Generate forEach contexts recursively.
   */
  private generateForEachContexts(
    forEachSelect: ViewDefinitionSelect,
    sourceExpression: string,
    baseContext: TranspilerContext,
    forEachContextMap: Map<ViewDefinitionSelect, TranspilerContext>,
    counterState: CounterState,
  ): void {
    const applyAlias = `forEach_${counterState.value++}`;
    const forEachContext = this.createForEachContext(
      baseContext,
      applyAlias,
      sourceExpression,
      forEachSelect,
    );

    forEachContextMap.set(forEachSelect, forEachContext);

    this.generateNestedForEachContexts(
      forEachSelect,
      applyAlias,
      forEachContext,
      forEachContextMap,
      counterState,
    );
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
   * Generate nested forEach contexts within this forEach's select and unionAll options.
   */
  private generateNestedForEachContexts(
    forEachSelect: ViewDefinitionSelect,
    applyAlias: string,
    baseContext: TranspilerContext,
    forEachContextMap: Map<ViewDefinitionSelect, TranspilerContext>,
    counterState: CounterState,
  ): void {
    if (forEachSelect.select) {
      this.generateNestedSelectContexts(
        forEachSelect.select,
        applyAlias,
        baseContext,
        forEachContextMap,
        counterState,
      );
    }

    if (forEachSelect.unionAll) {
      this.generateNestedUnionAllContexts(
        forEachSelect.unionAll,
        applyAlias,
        baseContext,
        forEachContextMap,
        counterState,
      );
    }
  }

  /**
   * Generate forEach contexts for nested selects.
   */
  private generateNestedSelectContexts(
    nestedSelects: ViewDefinitionSelect[],
    applyAlias: string,
    forEachContext: TranspilerContext,
    forEachContextMap: Map<ViewDefinitionSelect, TranspilerContext>,
    counterState: CounterState,
  ): void {
    for (const nestedSelect of nestedSelects) {
      if (this.isForEachSelect(nestedSelect)) {
        this.generateForEachContexts(
          nestedSelect,
          `${applyAlias}.value`,
          forEachContext,
          forEachContextMap,
          counterState,
        );
      }
    }
  }

  /**
   * Generate forEach contexts for nested unionAll options.
   */
  private generateNestedUnionAllContexts(
    unionAllOptions: ViewDefinitionSelect[],
    applyAlias: string,
    forEachContext: TranspilerContext,
    forEachContextMap: Map<ViewDefinitionSelect, TranspilerContext>,
    counterState: CounterState,
  ): void {
    for (const unionOption of unionAllOptions) {
      if (this.isForEachSelect(unionOption)) {
        this.generateForEachContexts(
          unionOption,
          `${applyAlias}.value`,
          forEachContext,
          forEachContextMap,
          counterState,
        );
      }
    }
  }

  /**
   * Build CROSS APPLY clauses in reverse order for forEach processing.
   */
  buildApplyClauses(
    forEachContextMap: Map<ViewDefinitionSelect, TranspilerContext>,
    topLevelForEach: ViewDefinitionSelect[],
    combination: SelectCombination,
  ): string {
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
   * Generate CROSS APPLY clauses for a forEach and its nested forEach.
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
    const rawPath = forEachSelect.forEach ?? forEachSelect.forEachOrNull;
    const isOrNull = !!forEachSelect.forEachOrNull;
    const applyType = isOrNull ? "OUTER APPLY" : "CROSS APPLY";
    const applyAlias = forEachContext.currentForEachAlias ?? "";
    const sourceExpression = forEachContext.forEachSource ?? "";

    const { path: pathWithoutWhere, whereCondition } =
      this.pathParser.parseFhirPathWhere(rawPath ?? "", forEachContext);
    const { path: forEachPath, arrayIndex } =
      this.pathParser.parseArrayIndexing(pathWithoutWhere);
    const arrayPaths = this.pathParser.detectArrayFlatteningPaths(forEachPath);

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
    const whereClauses = this.buildWhereClauses(arrayIndex, whereCondition);

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
  private buildWhereClauses(
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

      const pathSegment = this.pathParser.extractPathSegment(arrayPaths, i);
      const { cleanSegment, segmentIndex } =
        this.pathParser.parseSegmentIndexing(pathSegment);
      const jsonPath = `$.${cleanSegment}`;

      const whereClauses = this.buildNestedWhereClauses(
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
   * Build WHERE clause conditions for nested array filtering.
   */
  private buildNestedWhereClauses(
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
      .filter((nestedSelect) => this.isForEachSelect(nestedSelect))
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
    if (!selectedUnionOption || !this.isForEachSelect(selectedUnionOption)) {
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
}
