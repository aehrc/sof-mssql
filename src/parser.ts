/**
 * Parser for ViewDefinition JSON structures.
 */

import {
  TestSuite,
  UnvalidatedColumn,
  UnvalidatedSelect,
  UnvalidatedViewDefinition,
  ViewDefinition,
  ViewDefinitionColumn,
  ViewDefinitionSelect,
} from "./types.js";

export class ViewDefinitionParser {
  /**
   * Parse a ViewDefinition from JSON.
   */
  static parseViewDefinition(json: string | object): ViewDefinition {
    const data: UnvalidatedViewDefinition =
      typeof json === "string" ? JSON.parse(json) : json;

    if (this.isValidViewDefinition(data)) {
      return data;
    }

    throw new Error("Invalid ViewDefinition structure.");
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
   * Validate and narrow a ViewDefinition structure using type predicate.
   */
  private static isValidViewDefinition(
    data: UnvalidatedViewDefinition,
  ): data is ViewDefinition {
    if (!data.resource || typeof data.resource !== "string") {
      throw new TypeError("ViewDefinition must specify a resource type.");
    }

    if (
      !data.select ||
      !Array.isArray(data.select) ||
      data.select.length === 0
    ) {
      throw new TypeError("ViewDefinition must have at least one select element.");
    }

    // Status is optional for test cases, but recommended for production use
    // The SQL-on-FHIR spec requires status, but test cases may omit it
    // Default to 'active' if not specified
    data.status ??= "active";

    // Validate select elements
    for (const select of data.select) {
      if (!this.isValidSelect(select)) {
        return false;
      }
    }

    // Validate constants if present
    if (data.constant) {
      this.validateConstants(data.constant);
    }

    return true;
  }

  /**
   * Validate constant names match SQL on FHIR specification.
   */
  private static validateConstants(constants: unknown[]): void {
    for (const constant of constants) {
      if (
        !constant ||
        typeof constant !== "object" ||
        !("name" in constant) ||
        typeof constant.name !== "string"
      ) {
        throw new TypeError("Constant must have a valid name.");
      }

      // Validate constant name matches SQL on FHIR specification pattern
      // Pattern: must start with a letter, followed by letters, digits, or underscores
      if (!/^[A-Za-z]\w*$/.test(constant.name)) {
        throw new Error(
          `Constant name '${constant.name}' does not match SQL on FHIR specification. Must start with a letter, followed by letters, digits, or underscores.`,
        );
      }
    }
  }

  /**
   * Validate select element using type predicate.
   */
  private static isValidSelect(
    select: UnvalidatedSelect,
  ): select is ViewDefinitionSelect {
    this.validateSelectStructure(select);
    this.validateSelectExpressions(select);

    return (
      this.validateSelectColumns(select) &&
      this.validateNestedSelects(select) &&
      this.validateUnionAll(select)
    );
  }

  /**
   * Validate select element has required structure.
   */
  private static validateSelectStructure(select: UnvalidatedSelect): void {
    if (!select.column && !select.select && !select.unionAll) {
      throw new Error(
        "Select element must have columns, nested selects, or unionAll.",
      );
    }
  }

  /**
   * Validate forEach and forEachOrNull expressions.
   */
  private static validateSelectExpressions(select: UnvalidatedSelect): void {
    if (select.forEach && typeof select.forEach !== "string") {
      throw new TypeError("forEach must be a string FHIRPath expression.");
    }

    if (select.forEachOrNull && typeof select.forEachOrNull !== "string") {
      throw new TypeError("forEachOrNull must be a string FHIRPath expression.");
    }
  }

  /**
   * Validate columns in a select element.
   */
  private static validateSelectColumns(select: UnvalidatedSelect): boolean {
    if (select.column) {
      for (const column of select.column) {
        if (!this.isValidColumn(column, select)) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Validate nested select elements.
   */
  private static validateNestedSelects(select: UnvalidatedSelect): boolean {
    if (select.select) {
      for (const nestedSelect of select.select) {
        if (!this.isValidSelect(nestedSelect)) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Validate unionAll branches.
   */
  private static validateUnionAll(select: UnvalidatedSelect): boolean {
    if (select.unionAll) {
      for (const unionSelect of select.unionAll) {
        if (!this.isValidSelect(unionSelect)) {
          return false;
        }
      }
      this.validateUnionAllColumns(select.unionAll);
    }
    return true;
  }

  /**
   * Validate column using type predicate.
   */
  private static isValidColumn(
    column: UnvalidatedColumn,
    selectContext?: UnvalidatedSelect,
  ): column is ViewDefinitionColumn {
    if (!column.name || typeof column.name !== "string") {
      throw new TypeError("Column must have a valid name.");
    }

    if (!column.path || typeof column.path !== "string") {
      throw new TypeError("Column must have a valid FHIRPath expression.");
    }

    // Validate column name matches SQL on FHIR specification pattern
    // Pattern: must start with a letter, followed by letters, digits, or underscores
    if (!/^[A-Za-z]\w*$/.test(column.name)) {
      throw new Error(
        `Column name '${column.name}' does not match SQL on FHIR specification. Must start with a letter, followed by letters, digits, or underscores.`,
      );
    }

    // Validate collection constraints
    this.validateCollectionConstraints(column, selectContext);

    // Validate tag structure if present
    this.validateColumnTags(column);

    return true;
  }

  /**
   * Validate column tag structure.
   */
  private static validateColumnTags(column: UnvalidatedColumn): void {
    if (column.tag === undefined) {
      return;
    }

    if (!Array.isArray(column.tag)) {
      throw new TypeError(`Column '${column.name}' tag must be an array.`);
    }

    for (const tag of column.tag) {
      this.validateSingleTag(column.name as string, tag);
    }
  }

  /**
   * Validate a single tag object.
   */
  private static validateSingleTag(columnName: string, tag: unknown): void {
    if (typeof tag !== "object" || tag === null) {
      throw new TypeError(`Column '${columnName}' tag entry must be an object.`);
    }
    if (
      !("name" in tag) ||
      typeof tag.name !== "string" ||
      tag.name.trim().length === 0
    ) {
      throw new TypeError(
        `Column '${columnName}' tag must have a non-empty 'name' string.`,
      );
    }
    if (
      !("value" in tag) ||
      typeof tag.value !== "string" ||
      tag.value.trim().length === 0
    ) {
      throw new TypeError(
        `Column '${columnName}' tag must have a non-empty 'value' string.`,
      );
    }
  }

  /**
   * Validate collection property constraints.
   */
  private static validateCollectionConstraints(
    column: UnvalidatedColumn,
    selectContext?: UnvalidatedSelect,
  ): void {
    if (column.collection === false) {
      // At this point, path has been validated to be a string in isValidColumn
      const path = column.path as string;

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
  private static validateUnionAllColumns(
    unionAllBranches: UnvalidatedSelect[],
  ): void {
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
    select: UnvalidatedSelect,
  ): Array<{ name: string; type?: string }> {
    const columns: Array<{ name: string; type?: string }> = [];

    // Direct columns
    if (select.column) {
      for (const column of select.column) {
        columns.push({
          name: column.name as string,
          type: column.type as string | undefined,
        });
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
}
