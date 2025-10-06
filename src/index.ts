/**
 * SQL on FHIR MS SQL Server library.
 * Main API for transpiling ViewDefinitions to T-SQL queries.
 */

export {
  ViewDefinition,
  ViewDefinitionSelect,
  ViewDefinitionColumn,
  ViewDefinitionWhere,
  TranspilationResult,
  ColumnInfo,
  TestSuite,
  TestCase,
} from "./types.js";
export { ViewDefinitionParser } from "./parser.js";
export { QueryGenerator, QueryGeneratorOptions } from "./queryGenerator";
export { Transpiler, TranspilerContext } from "./fhirpath/transpiler";

import { ViewDefinitionParser } from "./parser.js";
import { QueryGenerator, QueryGeneratorOptions } from "./queryGenerator";
import { TranspilationResult, ViewDefinition } from "./types.js";

/**
 * Type alias for ViewDefinition input that can be a parsed object, JSON string, or raw object.
 */
export type ViewDefinitionInput = ViewDefinition | string | object;

/**
 * Main class for SQL on FHIR operations.
 */
export class SqlOnFhir {
  private readonly queryGenerator: QueryGenerator;

  constructor(options: QueryGeneratorOptions = {}) {
    this.queryGenerator = new QueryGenerator(options);
  }

  /**
   * Transpile a ViewDefinition to a T-SQL query.
   *
   * @param viewDefinition - The ViewDefinition to transpile
   * @param testId - Optional test identifier for filtering test data
   */
  transpile(
    viewDefinition: ViewDefinitionInput,
    testId?: string,
  ): TranspilationResult {
    let viewDef: ViewDefinition;

    if (
      typeof viewDefinition === "string" ||
      (typeof viewDefinition === "object" && "resourceType" in viewDefinition)
    ) {
      viewDef = ViewDefinitionParser.parseViewDefinition(viewDefinition);
    } else {
      viewDef = viewDefinition as ViewDefinition;
    }

    return this.queryGenerator.generateQuery(viewDef, testId);
  }

  /**
   * Generate a CREATE VIEW statement.
   */
  createView(viewDefinition: ViewDefinitionInput, viewName?: string): string {
    let viewDef: ViewDefinition;

    if (
      typeof viewDefinition === "string" ||
      (typeof viewDefinition === "object" && "resourceType" in viewDefinition)
    ) {
      viewDef = ViewDefinitionParser.parseViewDefinition(viewDefinition);
    } else {
      viewDef = viewDefinition as ViewDefinition;
    }

    return this.queryGenerator.generateCreateView(viewDef, viewName);
  }

  /**
   * Generate a CREATE TABLE statement for materialised views.
   */
  createTable(viewDefinition: ViewDefinitionInput, tableName?: string): string {
    let viewDef: ViewDefinition;

    if (
      typeof viewDefinition === "string" ||
      (typeof viewDefinition === "object" && "resourceType" in viewDefinition)
    ) {
      viewDef = ViewDefinitionParser.parseViewDefinition(viewDefinition);
    } else {
      viewDef = viewDefinition as ViewDefinition;
    }

    return this.queryGenerator.generateCreateTable(viewDef, tableName);
  }

  /**
   * Parse a ViewDefinition from JSON.
   */
  static parseViewDefinition(json: string | object): ViewDefinition {
    return ViewDefinitionParser.parseViewDefinition(json);
  }

  /**
   * Get column names from a ViewDefinition.
   */
  static getColumnNames(viewDefinition: ViewDefinition): string[] {
    return ViewDefinitionParser.getColumnNames(viewDefinition);
  }

  /**
   * Validate a ViewDefinition structure.
   */
  static validate(viewDefinition: ViewDefinitionInput): boolean {
    try {
      ViewDefinitionParser.parseViewDefinition(viewDefinition);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Convenience function to transpile a ViewDefinition to T-SQL.
 */
export function transpile(
  viewDefinition: ViewDefinitionInput,
  options: QueryGeneratorOptions = {},
): TranspilationResult {
  const sqlOnFhir = new SqlOnFhir(options);
  return sqlOnFhir.transpile(viewDefinition);
}

/**
 * Convenience function to create a VIEW statement.
 */
export function createView(
  viewDefinition: ViewDefinitionInput,
  viewName?: string,
  options: QueryGeneratorOptions = {},
): string {
  const sqlOnFhir = new SqlOnFhir(options);
  return sqlOnFhir.createView(viewDefinition, viewName);
}

/**
 * Convenience function to create a TABLE statement.
 */
export function createTable(
  viewDefinition: ViewDefinitionInput,
  tableName?: string,
  options: QueryGeneratorOptions = {},
): string {
  const sqlOnFhir = new SqlOnFhir(options);
  return sqlOnFhir.createTable(viewDefinition, tableName);
}
