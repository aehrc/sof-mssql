/**
 * Parser for ViewDefinition JSON structures.
 */

import { ViewDefinition, TestSuite } from "./types.js";

export class ViewDefinitionParser {
  /**
   * Parse a ViewDefinition from JSON.
   */
  static parseViewDefinition(json: string | object): ViewDefinition {
    const data = typeof json === "string" ? JSON.parse(json) : json;

    if (data.resourceType !== "ViewDefinition") {
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

    if (!data.status) {
      throw new Error("ViewDefinition must have a status.");
    }

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
      this.validateColumns(select.column);
    }

    if (select.select) {
      this.validateSelectElements(select.select);
    }

    if (select.unionAll) {
      this.validateSelectElements(select.unionAll);
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
  private static validateColumns(columns: any[]): void {
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
    }
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
