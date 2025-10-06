/**
 * Builds SELECT clauses for SQL queries.
 */

import { TranspilerContext } from "../fhirpath/transpiler.js";
import { ViewDefinitionColumn, ViewDefinitionSelect } from "../types.js";
import { SelectCombination } from "./SelectCombinationExpander.js";
import { ColumnExpressionGenerator } from "./ColumnExpressionGenerator.js";

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
