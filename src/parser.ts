/**
 * Parser for ViewDefinition JSON structures.
 */

import { TestSuite, ViewDefinition } from "./types.js";

export class ViewDefinitionParser {
  /**
   * Parse a ViewDefinition from JSON.
   */
  static parseViewDefinition(json: string | object): ViewDefinition {
    const data = typeof json === "string" ? JSON.parse(json) : json;

    // Only check resourceType if it's present (for backwards compatibility with test cases)
    if (data.resourceType && data.resourceType !== "ViewDefinition") {
      throw new Error("Invalid resource type. Expected ViewDefinition.");
    }

    return this.validateViewDefinition(data);
  }

  /**
   * Parse a test suite from the sql-on-fhir-v2 format.
   */
  static parseTestSuite(json: string | object): TestSuite {
    const data = typeof json === "string" ? JSON.parse(json) : json;

    if (!data.title || !data.resources || !data.tests) {
      throw new Error("Invalid test suite format. Missing required fields.");
    }

    return data as TestSuite;
  }

  /**
   * Validate a ViewDefinition structure.
   */
  private static validateViewDefinition(data: any): ViewDefinition {
    if (!data.resource) {
      throw new Error("ViewDefinition must specify a resource type.");
    }

    if (
      !data.select ||
      !Array.isArray(data.select) ||
      data.select.length === 0
    ) {
      throw new Error("ViewDefinition must have at least one select element.");
    }

    // Status is optional for test cases, but recommended for production use
    // The SQL-on-FHIR spec requires status, but test cases may omit it
    // Default to 'active' if not specified
    data.status ??= "active";

    // Validate select elements
    this.validateSelectElements(data.select);

    return data as ViewDefinition;
  }

  /**
   * Validate select elements recursively.
   */
  private static validateSelectElements(selects: any[]): void {
    for (const select of selects) {
      this.validateSelectElement(select);
    }
  }

  /**
   * Validate a single select element.
   */
  private static validateSelectElement(select: any): void {
    this.validateSelectElementStructure(select);
    this.validateSelectElementContent(select);
    this.validateSelectElementExpressions(select);
  }

  /**
   * Validate select element has required structure.
   */
  private static validateSelectElementStructure(select: any): void {
    if (!select.column && !select.select && !select.unionAll) {
      throw new Error(
        "Select element must have columns, nested selects, or unionAll.",
      );
    }
  }

  /**
   * Validate select element content (columns and nested elements).
   */
  private static validateSelectElementContent(select: any): void {
    if (select.column) {
      this.validateColumns(select.column, select);
    }

    if (select.select) {
      this.validateSelectElements(select.select);
    }

    if (select.unionAll) {
      this.validateSelectElements(select.unionAll);
      this.validateUnionAllColumns(select.unionAll);
    }
  }

  /**
   * Validate forEach and forEachOrNull expressions.
   */
  private static validateSelectElementExpressions(select: any): void {
    if (select.forEach && typeof select.forEach !== "string") {
      throw new Error("forEach must be a string FHIRPath expression.");
    }

    if (select.forEachOrNull && typeof select.forEachOrNull !== "string") {
      throw new Error("forEachOrNull must be a string FHIRPath expression.");
    }
  }

  /**
   * Validate column definitions.
   */
  private static validateColumns(columns: any[], selectContext?: any): void {
    for (const column of columns) {
      if (!column.name || typeof column.name !== "string") {
        throw new Error("Column must have a valid name.");
      }

      if (!column.path || typeof column.path !== "string") {
        throw new Error("Column must have a valid FHIRPath expression.");
      }

      // Validate column name is database-friendly
      if (!/^[a-zA-Z_]\w*$/.test(column.name)) {
        throw new Error(
          `Column name '${column.name}' is not database-friendly. Use alphanumeric and underscores only.`,
        );
      }

      // Validate collection constraints
      this.validateCollectionConstraints(column, selectContext);
    }
  }

  /**
   * Validate collection property constraints.
   */
  private static validateCollectionConstraints(
    column: any,
    selectContext?: any,
  ): void {
    if (column.collection === false) {
      // Check if the path could return multiple values
      const path = column.path;

      // Known array fields in FHIR Patient that could return multiple values
      const multiValuedPaths = [
        "name.family",
        "name.given",
        "telecom.value",
        "address.line",
        "identifier.value",
        "extension.value",
      ];

      // Check if this path could return multiple values without forEach context
      const isInForEachContext =
        selectContext && (selectContext.forEach ?? selectContext.forEachOrNull);

      if (
        !isInForEachContext &&
        multiValuedPaths.some((multiPath) => path.includes(multiPath))
      ) {
        throw new Error(
          `Path '${path}' can return multiple values. Use collection=true or place within a forEach context.`,
        );
      }
    }
  }

  /**
   * Validate that all branches of a unionAll have the same columns in the same order.
   */
  private static validateUnionAllColumns(unionAllBranches: any[]): void {
    if (unionAllBranches.length < 2) {
      return; // Nothing to validate
    }

    // Extract column definitions from each branch
    const branchColumns: Array<Array<{ name: string; type?: string }>> = [];

    for (const branch of unionAllBranches) {
      const columns = this.extractColumnsFromSelect(branch);
      branchColumns.push(columns);
    }

    // Compare first branch with all other branches
    const firstBranch = branchColumns[0];

    for (let i = 1; i < branchColumns.length; i++) {
      const currentBranch = branchColumns[i];

      // Check if column count matches
      if (firstBranch.length !== currentBranch.length) {
        throw new Error(
          `unionAll branches must have the same columns. ` +
            `Branch 1 has ${firstBranch.length} columns, but branch ${i + 1} has ${currentBranch.length} columns.`,
        );
      }

      // Check if column names and order match
      for (let j = 0; j < firstBranch.length; j++) {
        if (firstBranch[j].name !== currentBranch[j].name) {
          throw new Error(
            `unionAll branches must have the same columns in the same order. ` +
              `Column at position ${j + 1}: branch 1 has "${firstBranch[j].name}", ` +
              `but branch ${i + 1} has "${currentBranch[j].name}".`,
          );
        }
      }
    }
  }

  /**
   * Extract column definitions from a select element.
   * Handles direct columns, forEach columns, and nested select columns.
   */
  private static extractColumnsFromSelect(
    select: any,
  ): Array<{ name: string; type?: string }> {
    const columns: Array<{ name: string; type?: string }> = [];

    // Direct columns
    if (select.column) {
      for (const column of select.column) {
        columns.push({ name: column.name, type: column.type });
      }
    }

    // Nested select columns
    if (select.select) {
      for (const nestedSelect of select.select) {
        const nestedColumns = this.extractColumnsFromSelect(nestedSelect);
        columns.push(...nestedColumns);
      }
    }

    // UnionAll - take columns from first branch (all branches should be validated to match)
    if (select.unionAll && select.unionAll.length > 0) {
      const unionColumns = this.extractColumnsFromSelect(select.unionAll[0]);
      columns.push(...unionColumns);
    }

    return columns;
  }

  /**
   * Get all column names from a ViewDefinition in the order they appear.
   */
  static getColumnNames(viewDef: ViewDefinition): string[] {
    const columns: string[] = [];
    this.collectColumnNames(viewDef.select, columns);
    return columns;
  }

  /**
   * Recursively collect column names from select elements.
   */
  private static collectColumnNames(selects: any[], columns: string[]): void {
    for (const select of selects) {
      // Add columns from this select
      if (select.column) {
        for (const column of select.column) {
          if (!columns.includes(column.name)) {
            columns.push(column.name);
          }
        }
      }

      // Add columns from nested selects
      if (select.select) {
        this.collectColumnNames(select.select, columns);
      }

      // Add columns from unionAll
      if (select.unionAll) {
        this.collectColumnNames(select.unionAll, columns);
      }
    }
  }
}
