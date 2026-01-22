/**
 * Builds SELECT clauses for SQL queries.
 */

import { TranspilerContext } from "../fhirpath/transpiler.js";
import { ViewDefinitionColumn, ViewDefinitionSelect } from "../types.js";
import { SelectCombination } from "./SelectCombinationExpander.js";
import { ColumnExpressionGenerator } from "./ColumnExpressionGenerator.js";
import { RepeatContext } from "./RepeatProcessor.js";

/**
 * Handles generation of SELECT clauses.
 */
export class SelectClauseBuilder {
  private readonly columnGenerator: ColumnExpressionGenerator;

  constructor(columnGenerator: ColumnExpressionGenerator) {
    this.columnGenerator = columnGenerator;
  }

  /**
   * Generate SELECT clause for a simple (non-forEach) statement.
   */
  generateSimpleSelectClause(
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
   * Generate SELECT clause specifically for forEach statements.
   */
  generateForEachSelectClause(
    combination: SelectCombination,
    context: TranspilerContext,
    forEachContextMap: Map<ViewDefinitionSelect, TranspilerContext>,
  ): string {
    const columnParts: string[] = [];

    for (let i = 0; i < combination.selects.length; i++) {
      const select = combination.selects[i];
      const unionChoice = combination.unionChoices[i];

      if (this.isForEachSelect(select)) {
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
   * Generate SELECT clause for repeat statements.
   *
   * For repeat selects, columns are extracted from the CTE's item_json column.
   * Non-repeat columns use the base context (resource JSON).
   * If forEach is also present, those columns use the forEach context.
   *
   * @param combination - The select combination being processed.
   * @param context - The base transpiler context.
   * @param repeatContextMap - Map of repeat selects to their contexts.
   * @param forEachContextMap - Optional map of forEach selects to their contexts.
   * @returns The generated SELECT clause.
   */
  generateRepeatSelectClause(
    combination: SelectCombination,
    context: TranspilerContext,
    repeatContextMap: Map<ViewDefinitionSelect, RepeatContext>,
    forEachContextMap?: Map<ViewDefinitionSelect, TranspilerContext>,
  ): string {
    const columnParts: string[] = [];

    for (let i = 0; i < combination.selects.length; i++) {
      const select = combination.selects[i];
      const unionChoice = combination.unionChoices[i];

      if (this.isRepeatSelect(select)) {
        this.addRepeatSelectColumns(
          select,
          unionChoice,
          columnParts,
          repeatContextMap,
          forEachContextMap,
        );
      } else if (this.isForEachSelect(select) && forEachContextMap) {
        this.addForEachSelectColumns(
          select,
          unionChoice,
          columnParts,
          forEachContextMap,
        );
      } else {
        this.addNonRepeatSelectColumns(
          select,
          unionChoice,
          columnParts,
          context,
          repeatContextMap,
          forEachContextMap,
        );
      }
    }

    return `SELECT\n  ${columnParts.join(",\n  ")}`;
  }

  /**
   * Add columns for a repeat select.
   *
   * Columns within the repeat use the repeat context (CTE item_json).
   * Nested forEach within the repeat use their forEach context.
   */
  private addRepeatSelectColumns(
    select: ViewDefinitionSelect,
    unionChoice: number,
    columnParts: string[],
    repeatContextMap: Map<ViewDefinitionSelect, RepeatContext>,
    forEachContextMap?: Map<ViewDefinitionSelect, TranspilerContext>,
  ): void {
    const repeatContext = repeatContextMap.get(select);
    if (!repeatContext) {
      return;
    }

    // Add columns from the repeat select using its transpiler context.
    if (select.column) {
      this.addColumnsToList(
        select.column,
        columnParts,
        repeatContext.transpilerContext,
      );
    }

    this.addNestedSelectColumnsForRepeat(
      select,
      columnParts,
      repeatContext.transpilerContext,
      forEachContextMap,
    );

    this.addRepeatUnionAllColumns(
      select,
      unionChoice,
      columnParts,
      repeatContext.transpilerContext,
      repeatContextMap,
    );
  }

  /**
   * Add nested select columns for a repeat select.
   *
   * Nested forEach selects use their own context, while other nested selects
   * use the repeat context.
   */
  private addNestedSelectColumnsForRepeat(
    select: ViewDefinitionSelect,
    columnParts: string[],
    repeatTranspilerContext: TranspilerContext,
    forEachContextMap?: Map<ViewDefinitionSelect, TranspilerContext>,
  ): void {
    if (!select.select) {
      return;
    }

    for (const nestedSelect of select.select) {
      if (this.isForEachSelect(nestedSelect) && forEachContextMap) {
        // Nested forEach uses its own context (source updated to use repeat CTE).
        const nestedContext = forEachContextMap.get(nestedSelect);
        if (nestedContext && nestedSelect.column) {
          this.addColumnsToList(
            nestedSelect.column,
            columnParts,
            nestedContext,
          );
        }
      } else if (nestedSelect.column) {
        // Non-forEach nested selects use the repeat context.
        this.addColumnsToList(
          nestedSelect.column,
          columnParts,
          repeatTranspilerContext,
        );
      }
    }
  }

  /**
   * Add columns for unionAll branches within a repeat select.
   */
  private addRepeatUnionAllColumns(
    select: ViewDefinitionSelect,
    unionChoice: number,
    columnParts: string[],
    defaultContext: TranspilerContext,
    repeatContextMap: Map<ViewDefinitionSelect, RepeatContext>,
  ): void {
    if (unionChoice < 0 || !select.unionAll?.[unionChoice]) {
      return;
    }

    const chosenBranch = select.unionAll[unionChoice];
    if (!chosenBranch.column) {
      return;
    }

    // Check if the chosen branch is also a repeat.
    const branchRepeatContext = repeatContextMap.get(chosenBranch);
    const branchContext = branchRepeatContext
      ? branchRepeatContext.transpilerContext
      : defaultContext;

    this.addColumnsToList(chosenBranch.column, columnParts, branchContext);
  }

  /**
   * Add columns for a non-repeat select (when repeat is present elsewhere).
   */
  private addNonRepeatSelectColumns(
    select: ViewDefinitionSelect,
    unionChoice: number,
    columnParts: string[],
    context: TranspilerContext,
    repeatContextMap: Map<ViewDefinitionSelect, RepeatContext>,
    forEachContextMap?: Map<ViewDefinitionSelect, TranspilerContext>,
  ): void {
    if (select.column) {
      this.addColumnsToList(select.column, columnParts, context);
    }

    // Handle nested selects.
    if (select.select) {
      for (const nestedSelect of select.select) {
        if (this.isRepeatSelect(nestedSelect)) {
          this.addRepeatSelectColumns(
            nestedSelect,
            -1,
            columnParts,
            repeatContextMap,
            forEachContextMap,
          );
        } else if (this.isForEachSelect(nestedSelect) && forEachContextMap) {
          const nestedContext = forEachContextMap.get(nestedSelect);
          if (nestedContext && nestedSelect.column) {
            this.addColumnsToList(
              nestedSelect.column,
              columnParts,
              nestedContext,
            );
          }
        } else if (nestedSelect.column) {
          this.addColumnsToList(nestedSelect.column, columnParts, context);
        }
      }
    }

    // Handle unionAll within non-repeat select.
    this.addUnionAllColumnsForRepeatContext(
      select,
      unionChoice,
      columnParts,
      context,
      repeatContextMap,
      forEachContextMap,
    );
  }

  /**
   * Add unionAll columns when repeat context is available.
   */
  private addUnionAllColumnsForRepeatContext(
    select: ViewDefinitionSelect,
    unionChoice: number,
    columnParts: string[],
    defaultContext: TranspilerContext,
    repeatContextMap: Map<ViewDefinitionSelect, RepeatContext>,
    forEachContextMap?: Map<ViewDefinitionSelect, TranspilerContext>,
  ): void {
    if (unionChoice < 0 || !select.unionAll?.[unionChoice]) {
      return;
    }

    const chosenBranch = select.unionAll[unionChoice];
    if (!chosenBranch.column) {
      return;
    }

    // Determine context based on directive type.
    let branchContext: TranspilerContext = defaultContext;

    if (this.isRepeatSelect(chosenBranch)) {
      const repeatContext = repeatContextMap.get(chosenBranch);
      if (repeatContext) {
        branchContext = repeatContext.transpilerContext;
      }
    } else if (this.isForEachSelect(chosenBranch) && forEachContextMap) {
      const forEachContext = forEachContextMap.get(chosenBranch);
      if (forEachContext) {
        branchContext = forEachContext;
      }
    }

    this.addColumnsToList(chosenBranch.column, columnParts, branchContext);
  }

  /**
   * Check if a select is a repeat select.
   */
  private isRepeatSelect(select: ViewDefinitionSelect): boolean {
    return !!(select.repeat && select.repeat.length > 0);
  }

  /**
   * Add columns from a select element to the column parts array.
   */
  private addSelectElementColumns(
    select: ViewDefinitionSelect,
    columnParts: string[],
    context: TranspilerContext,
  ): void {
    // Skip forEach selects - handled separately.
    if (this.isForEachSelect(select)) {
      return;
    }

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
      !select.unionAll ||
      unionChoice < 0 ||
      unionChoice >= select.unionAll.length
    ) {
      return;
    }

    const chosenUnion = select.unionAll[unionChoice];

    if (this.isForEachSelect(chosenUnion) && forEachContextMap) {
      const unionForEachContext = forEachContextMap.get(chosenUnion);
      if (unionForEachContext && chosenUnion.column) {
        this.addColumnsToList(
          chosenUnion.column,
          columnParts,
          unionForEachContext,
        );
      }
    } else if (chosenUnion.column) {
      this.addColumnsToList(chosenUnion.column, columnParts, context);
    }
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
      if (this.isForEachSelect(nestedSelect)) {
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
      if (this.isForEachSelect(nestedSelect)) {
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

    const branchContext = this.isForEachSelect(chosenBranch)
      ? forEachContextMap.get(chosenBranch)
      : defaultContext;

    if (branchContext) {
      this.addColumnsToList(chosenBranch.column, columnParts, branchContext);
    }
  }

  /**
   * Add columns to the column parts list.
   */
  private addColumnsToList(
    columns: ViewDefinitionColumn[],
    columnParts: string[],
    context: TranspilerContext,
  ): void {
    for (const column of columns) {
      const columnSql = this.columnGenerator.generateExpression(
        column,
        context,
      );
      columnParts.push(`${columnSql} AS [${column.name}]`);
    }
  }

  /**
   * Check if a select is a forEach or forEachOrNull.
   */
  private isForEachSelect(select: ViewDefinitionSelect): boolean {
    return !!(select.forEach ?? select.forEachOrNull);
  }
}
