/**
 * Processes repeat operations and generates recursive CTEs.
 *
 * The repeat directive recursively traverses a tree structure by following
 * one or more FHIRPath expressions at each level. This is implemented using
 * SQL Server recursive Common Table Expressions (CTEs).
 *
 * @author John Grimes
 */

import type { TranspilerContext } from "../fhirpath/transpiler.js";
import { ViewDefinitionSelect } from "../types.js";
import { SelectCombination } from "./SelectCombinationExpander.js";

/**
 * Counter state for generating unique repeat CTE aliases.
 */
interface CounterState {
  value: number;
}

/**
 * Context specific to a repeat operation.
 */
export interface RepeatContext {
  /** Unique alias for the CTE (e.g., "repeat_0"). */
  cteAlias: string;
  /** FHIRPath expressions to follow recursively. */
  paths: string[];
  /** JSON source expression for the anchor member. */
  sourceExpression: string;
  /** The transpiler context for columns within this repeat. */
  transpilerContext: TranspilerContext;
}

/**
 * Result of building repeat context map.
 */
export interface RepeatContextMapResult {
  repeatContextMap: Map<ViewDefinitionSelect, RepeatContext>;
  topLevelRepeat: ViewDefinitionSelect[];
}

/**
 * Handles all repeat-related processing and recursive CTE generation.
 *
 * The repeat directive works similarly to forEach but traverses tree structures
 * of arbitrary depth. For example, `repeat: ["item"]` follows the `item` array
 * at each level until no more items exist.
 *
 * Multiple paths can be specified (e.g., `["item", "answer.item"]`) to follow
 * different traversal patterns at each level, with results unioned together.
 */
export class RepeatProcessor {
  /**
   * Check if a specific combination has repeat operations.
   *
   * @param combination - The select combination to check.
   * @returns True if any select in the combination has repeat.
   */
  combinationHasRepeat(combination: SelectCombination): boolean {
    for (let i = 0; i < combination.selects.length; i++) {
      const select = combination.selects[i];
      const unionChoice = combination.unionChoices[i];

      if (this.selectHasRepeat(select)) {
        return true;
      }

      // If this select has a unionAll choice, also check the chosen branch.
      if (unionChoice >= 0 && select.unionAll?.[unionChoice]) {
        const chosenBranch = select.unionAll[unionChoice];
        if (this.selectHasRepeat(chosenBranch)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Check if a single select has repeat operations (including nested).
   *
   * @param select - The select element to check.
   * @returns True if the select or any nested select has repeat.
   */
  selectHasRepeat(select: ViewDefinitionSelect): boolean {
    if (this.isRepeatSelect(select)) {
      return true;
    }

    if (select.select && this.hasRepeatInSelects(select.select)) {
      return true;
    }

    return !!(select.unionAll && this.unionAllHasRepeat(select.unionAll));
  }

  /**
   * Check if any select in the array has repeat operations.
   */
  private hasRepeatInSelects(selects: ViewDefinitionSelect[]): boolean {
    return selects.some((select) => this.selectHasRepeat(select));
  }

  /**
   * Check if any unionAll option has repeat operations.
   */
  private unionAllHasRepeat(unionAllOptions: ViewDefinitionSelect[]): boolean {
    return unionAllOptions.some(
      (unionOption) =>
        this.isRepeatSelect(unionOption) ||
        (unionOption.select && this.hasRepeatInSelects(unionOption.select)),
    );
  }

  /**
   * Check if a select is a repeat select.
   */
  isRepeatSelect(select: ViewDefinitionSelect): boolean {
    return !!(select.repeat && select.repeat.length > 0);
  }

  /**
   * Build the repeat context map by generating contexts for all repeat operations.
   *
   * @param selects - The top-level select elements.
   * @param context - The base transpiler context.
   * @param combination - Optional combination for unionAll handling.
   * @param externalCounter - Optional external counter for shared CTE aliases across combinations.
   * @returns Map of repeat selects to their contexts and list of top-level repeats.
   */
  buildRepeatContextMap(
    selects: ViewDefinitionSelect[],
    context: TranspilerContext,
    combination?: SelectCombination,
    externalCounter?: CounterState,
  ): RepeatContextMapResult {
    const repeatContextMap = new Map<ViewDefinitionSelect, RepeatContext>();
    // Use external counter if provided, otherwise create a local one.
    const counterState: CounterState = externalCounter ?? { value: 0 };

    const topLevelRepeat = this.collectTopLevelRepeat(selects, combination);

    for (const select of topLevelRepeat) {
      this.generateRepeatContext(
        select,
        context.resourceAlias + ".json",
        context,
        repeatContextMap,
        counterState,
      );
    }

    return { repeatContextMap, topLevelRepeat };
  }

  /**
   * Collect all repeat selects that should be treated as top-level.
   */
  private collectTopLevelRepeat(
    selects: ViewDefinitionSelect[],
    combination?: SelectCombination,
  ): ViewDefinitionSelect[] {
    const topLevelRepeat: ViewDefinitionSelect[] = [];

    for (const select of selects) {
      this.processSelectRepeat(select, topLevelRepeat);

      // Also process unionAll choices if present and parent doesn't have repeat.
      if (combination && !this.isRepeatSelect(select)) {
        this.processUnionAllChoice(select, combination, topLevelRepeat);
      }
    }

    return topLevelRepeat;
  }

  /**
   * Process a select for repeat, handling both direct repeat and nested selects.
   */
  private processSelectRepeat(
    select: ViewDefinitionSelect,
    topLevelRepeat: ViewDefinitionSelect[],
  ): void {
    if (this.isRepeatSelect(select)) {
      topLevelRepeat.push(select);
    } else if (select.select) {
      this.addRepeatFromSelectArray(select.select, topLevelRepeat);
    }
  }

  /**
   * Process a select with a unionAll choice from a combination.
   */
  private processUnionAllChoice(
    select: ViewDefinitionSelect,
    combination: SelectCombination,
    topLevelRepeat: ViewDefinitionSelect[],
  ): void {
    const selectIndex = combination.selects.indexOf(select);
    const unionChoice =
      selectIndex >= 0 ? combination.unionChoices[selectIndex] : -1;

    if (unionChoice >= 0 && select.unionAll?.[unionChoice]) {
      const chosenBranch = select.unionAll[unionChoice];
      if (this.isRepeatSelect(chosenBranch)) {
        topLevelRepeat.push(chosenBranch);
      } else if (chosenBranch.select) {
        this.addRepeatFromSelectArray(chosenBranch.select, topLevelRepeat);
      }
    }
  }

  /**
   * Add repeat selects from a select array to the topLevelRepeat list.
   */
  private addRepeatFromSelectArray(
    selects: ViewDefinitionSelect[],
    topLevelRepeat: ViewDefinitionSelect[],
  ): void {
    for (const nestedSelect of selects) {
      if (this.isRepeatSelect(nestedSelect)) {
        topLevelRepeat.push(nestedSelect);
      }
    }
  }

  /**
   * Generate repeat context for a single repeat select.
   */
  private generateRepeatContext(
    repeatSelect: ViewDefinitionSelect,
    sourceExpression: string,
    baseContext: TranspilerContext,
    repeatContextMap: Map<ViewDefinitionSelect, RepeatContext>,
    counterState: CounterState,
  ): void {
    const cteAlias = `repeat_${counterState.value++}`;
    const paths = repeatSelect.repeat ?? [];

    const repeatContext: RepeatContext = {
      cteAlias,
      paths,
      sourceExpression,
      transpilerContext: {
        ...baseContext,
        // The iteration context points to the CTE's item_json column.
        iterationContext: `${cteAlias}.item_json`,
        currentForEachAlias: cteAlias,
        forEachSource: sourceExpression,
        forEachPath: paths.join(", "),
      },
    };

    repeatContextMap.set(repeatSelect, repeatContext);
  }

  /**
   * Generate CTE definitions as an array for repeat operations.
   *
   * This method returns the CTE definitions without the WITH keyword,
   * allowing them to be consolidated when multiple unionAll branches
   * each have their own repeat CTEs.
   *
   * @param repeatContextMap - Map of repeat selects to their contexts.
   * @param topLevelRepeat - List of top-level repeat selects.
   * @param resourceAlias - The alias for the resource table (e.g., "r").
   * @param resourceType - The FHIR resource type.
   * @param testId - Optional test ID for filtering.
   * @param tableName - The fully qualified table name (e.g., "[dbo].[fhir_resources]").
   * @returns Array of CTE definition strings (without WITH keyword).
   */
  buildRepeatCteDefinitions(
    repeatContextMap: Map<ViewDefinitionSelect, RepeatContext>,
    topLevelRepeat: ViewDefinitionSelect[],
    resourceAlias: string,
    resourceType: string,
    testId?: string,
    tableName: string = "[dbo].[fhir_resources]",
  ): string[] {
    if (topLevelRepeat.length === 0) {
      return [];
    }

    const cteDefinitions: string[] = [];

    for (const select of topLevelRepeat) {
      const repeatContext = repeatContextMap.get(select);
      if (!repeatContext) {
        throw new Error("Repeat context not found for select.");
      }

      const cteDef = this.generateSingleCte(
        repeatContext,
        resourceAlias,
        resourceType,
        testId,
        tableName,
      );
      cteDefinitions.push(cteDef);
    }

    return cteDefinitions;
  }

  /**
   * Generate a single recursive CTE definition.
   *
   * The CTE has the following structure:
   * - Anchor member: Selects initial items using the FIRST path from the root.
   *   Only the first path is used for the anchor because subsequent paths
   *   (like `answer.item`) represent traversal patterns that should only be
   *   followed during recursion, not at the root level.
   * - Recursive member: For each path in repeat, follows that path from the
   *   current level and unions all results.
   *
   * The CTE columns are:
   * - resource_id: Links back to the source resource.
   * - item_json: The JSON content of the current item (used for column extraction).
   * - depth: Recursion depth (used to prevent infinite loops).
   */
  private generateSingleCte(
    repeatContext: RepeatContext,
    resourceAlias: string,
    resourceType: string,
    testId?: string,
    tableName: string = "[dbo].[fhir_resources]",
  ): string {
    const { cteAlias, paths, sourceExpression } = repeatContext;

    // Build anchor member using only the FIRST path.
    // The anchor represents the entry point into the tree structure.
    // For example, with `repeat: ["item", "answer.item"]`, the anchor uses
    // `$.item` to get the root items. The `answer.item` path is only followed
    // during recursion when traversing from an item that has answers.
    const firstPath = paths[0];
    const anchorJsonPath = this.buildJsonPath(firstPath);
    const anchorSql = `SELECT
    [${resourceAlias}].[id] AS resource_id,
    anchor.value AS item_json,
    0 AS depth
  FROM ${tableName} AS [${resourceAlias}]
  CROSS APPLY OPENJSON(${sourceExpression}, '${anchorJsonPath}') AS anchor
  WHERE [${resourceAlias}].[resource_type] = '${resourceType}'${this.buildTestIdCondition(resourceAlias, testId)}`;

    // Build recursive member: for each path, follows that path from current item.
    // All paths are used during recursion to traverse the tree structure.
    // Multi-segment paths like "answer.item" require nested CROSS APPLY.
    const recursiveMembers = paths.map((path, index) => {
      return this.buildRecursiveMember(path, cteAlias, index);
    });

    const recursiveSql = recursiveMembers.join("\n  UNION ALL\n");

    return `${cteAlias} AS (
  ${anchorSql}
  UNION ALL
  ${recursiveSql}
)`;
  }

  /**
   * Build a recursive member for a single path.
   *
   * Multi-segment paths like "answer.item" require nested CROSS APPLY clauses
   * to traverse through each array. For example, "answer.item" means:
   * 1. Iterate over the `answer` array
   * 2. For each answer, iterate over the `item` array within it
   *
   * @param path - The FHIRPath expression (e.g., "item" or "answer.item").
   * @param cteAlias - The alias of the recursive CTE.
   * @param index - Index of this path for alias generation.
   * @returns SQL fragment for the recursive member.
   */
  private buildRecursiveMember(
    path: string,
    cteAlias: string,
    index: number,
  ): string {
    const segments = path.split(".");

    if (segments.length === 1) {
      // Simple path: single CROSS APPLY.
      const jsonPath = `$.${segments[0]}`;
      const alias = `child_${index}`;
      return `SELECT
    cte.resource_id,
    ${alias}.value AS item_json,
    cte.depth + 1
  FROM ${cteAlias} AS cte
  CROSS APPLY OPENJSON(cte.item_json, '${jsonPath}') AS ${alias}`;
    }

    // Multi-segment path: nested CROSS APPLY for each segment.
    // Build from inside out: the last segment is the final result.
    let crossApplies = "";
    let currentSource = "cte.item_json";

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const alias = `child_${index}_${i}`;
      crossApplies += `\n  CROSS APPLY OPENJSON(${currentSource}, '$.${segment}') AS ${alias}`;
      currentSource = `${alias}.value`;
    }

    const finalAlias = `child_${index}_${segments.length - 1}`;
    return `SELECT
    cte.resource_id,
    ${finalAlias}.value AS item_json,
    cte.depth + 1
  FROM ${cteAlias} AS cte${crossApplies}`;
  }

  /**
   * Build a JSON path from a FHIRPath expression.
   * Handles simple paths and dot-separated paths like "answer.item".
   */
  private buildJsonPath(fhirPath: string): string {
    // Convert FHIRPath to JSON path (simple case: just prefix with $.).
    return `$.${fhirPath}`;
  }

  /**
   * Build the test ID condition for filtering test data.
   *
   * @param resourceAlias - The alias for the resource table.
   * @param testId - Optional test ID for filtering.
   * @returns SQL condition string or empty string if no testId.
   */
  private buildTestIdCondition(resourceAlias: string, testId?: string): string {
    if (!testId) {
      return "";
    }
    return `\n    AND [${resourceAlias}].[test_id] = '${testId}'`;
  }

  /**
   * Build CROSS APPLY clause to join CTE results to the main query.
   *
   * @param repeatContextMap - Map of repeat selects to their contexts.
   * @param topLevelRepeat - List of top-level repeat selects.
   * @param resourceAlias - The alias for the resource table.
   * @returns The CROSS APPLY clause(s) for joining CTE results.
   */
  buildRepeatApplyClauses(
    repeatContextMap: Map<ViewDefinitionSelect, RepeatContext>,
    topLevelRepeat: ViewDefinitionSelect[],
    resourceAlias: string,
  ): string {
    if (topLevelRepeat.length === 0) {
      return "";
    }

    const applyClauses: string[] = [];

    for (const select of topLevelRepeat) {
      const repeatContext = repeatContextMap.get(select);
      if (!repeatContext) {
        throw new Error("Repeat context not found for select.");
      }

      // Join the CTE to the resource table by resource_id.
      applyClauses.push(
        `\nINNER JOIN ${repeatContext.cteAlias} ON ${repeatContext.cteAlias}.resource_id = [${resourceAlias}].[id]`,
      );
    }

    return applyClauses.join("");
  }
}
