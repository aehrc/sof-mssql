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
}
