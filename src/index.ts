/**
 * SQL on FHIR MS SQL Server library.
 * Main API for transpiling ViewDefinitions to T-SQL queries.
 */

export { ViewDefinition, ViewDefinitionSelect, ViewDefinitionColumn, ViewDefinitionWhere, TranspilationResult, ColumnInfo, TestSuite, TestCase } from './types.js';
export { ViewDefinitionParser } from './parser.js';
export { QueryGenerator, QueryGeneratorOptions } from './query-generator.js';
export { FHIRPathTranspiler, TranspilerContext } from './fhirpath-transpiler.js';

import { ViewDefinition, TranspilationResult } from './types.js';
import { ViewDefinitionParser } from './parser.js';
import { QueryGenerator, QueryGeneratorOptions } from './query-generator.js';

/**
 * Main class for SQL on FHIR operations.
 */
export class SqlOnFhir {
  private queryGenerator: QueryGenerator;

  constructor(options: QueryGeneratorOptions = {}) {
    this.queryGenerator = new QueryGenerator(options);
  }

  /**
   * Transpile a ViewDefinition to a T-SQL query.
   */
  transpile(viewDefinition: ViewDefinition | string | object): TranspilationResult {
    let viewDef: ViewDefinition;
    
    if (typeof viewDefinition === 'string' || (typeof viewDefinition === 'object' && 'resourceType' in viewDefinition)) {
      viewDef = ViewDefinitionParser.parseViewDefinition(viewDefinition);
    } else {
      viewDef = viewDefinition as ViewDefinition;
    }

    return this.queryGenerator.generateQuery(viewDef);
  }

  /**
   * Generate a CREATE VIEW statement.
   */
  createView(viewDefinition: ViewDefinition | string | object, viewName?: string): string {
    let viewDef: ViewDefinition;
    
    if (typeof viewDefinition === 'string' || (typeof viewDefinition === 'object' && 'resourceType' in viewDefinition)) {
      viewDef = ViewDefinitionParser.parseViewDefinition(viewDefinition);
    } else {
      viewDef = viewDefinition as ViewDefinition;
    }

    return this.queryGenerator.generateCreateView(viewDef, viewName);
  }

  /**
   * Generate a CREATE TABLE statement for materialised views.
   */
  createTable(viewDefinition: ViewDefinition | string | object, tableName?: string): string {
    let viewDef: ViewDefinition;
    
    if (typeof viewDefinition === 'string' || (typeof viewDefinition === 'object' && 'resourceType' in viewDefinition)) {
      viewDef = ViewDefinitionParser.parseViewDefinition(viewDefinition);
    } else {
      viewDef = viewDefinition as ViewDefinition;
    }

    return this.queryGenerator.generateCreateTable(viewDef, tableName);
  }

  /**
   * Generate an INSERT statement to populate a materialised view table.
   */
  insertFromView(viewDefinition: ViewDefinition | string | object, tableName?: string): string {
    let viewDef: ViewDefinition;
    
    if (typeof viewDefinition === 'string' || (typeof viewDefinition === 'object' && 'resourceType' in viewDefinition)) {
      viewDef = ViewDefinitionParser.parseViewDefinition(viewDefinition);
    } else {
      viewDef = viewDefinition as ViewDefinition;
    }

    return this.queryGenerator.generateInsertFromView(viewDef, tableName);
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
  static validate(viewDefinition: ViewDefinition | string | object): boolean {
    try {
      ViewDefinitionParser.parseViewDefinition(viewDefinition);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Convenience function to create a new SqlOnFhir instance.
 */
export function createSqlOnFhir(options: QueryGeneratorOptions = {}): SqlOnFhir {
  return new SqlOnFhir(options);
}

/**
 * Convenience function to transpile a ViewDefinition to T-SQL.
 */
export function transpile(viewDefinition: ViewDefinition | string | object, options: QueryGeneratorOptions = {}): TranspilationResult {
  const sqlOnFhir = new SqlOnFhir(options);
  return sqlOnFhir.transpile(viewDefinition);
}

/**
 * Convenience function to create a VIEW statement.
 */
export function createView(viewDefinition: ViewDefinition | string | object, viewName?: string, options: QueryGeneratorOptions = {}): string {
  const sqlOnFhir = new SqlOnFhir(options);
  return sqlOnFhir.createView(viewDefinition, viewName);
}

/**
 * Convenience function to create a TABLE statement.
 */
export function createTable(viewDefinition: ViewDefinition | string | object, tableName?: string, options: QueryGeneratorOptions = {}): string {
  const sqlOnFhir = new SqlOnFhir(options);
  return sqlOnFhir.createTable(viewDefinition, tableName);
}

// Default export
export default SqlOnFhir;