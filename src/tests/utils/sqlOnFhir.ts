/**
 * Shared utilities for SQL-on-FHIR Vitest tests.
 *
 * Provides functions for ViewDefinition transpilation, SQL execution,
 * result comparison, and other common test operations.
 */

import { Request } from "mssql";
import { QueryGenerator } from "../../queryGenerator";
import { ViewDefinition } from "../../types";
import { getDatabasePool } from "./database";

let queryGeneratorInstance: QueryGenerator | null = null;

/**
 * Get or create the QueryGenerator instance with database configuration.
 */
function getQueryGeneratorInstance(): QueryGenerator {
  queryGeneratorInstance ??= new QueryGenerator({
    tableName: process.env.MSSQL_TEST_TABLE ?? "fhir_resources_test",
    schemaName: process.env.MSSQL_SCHEMA ?? "dbo",
    resourceIdColumn: "id",
    resourceJsonColumn: "json",
  });
  return queryGeneratorInstance;
}

/**
 * Result of executing a ViewDefinition with column metadata.
 */
export interface ViewDefinitionResult {
  results: any[];
  columns: string[];
}

/**
 * Execute a ViewDefinition against the database and return the results with column metadata.
 *
 * @param viewDefinition - The ViewDefinition to transpile and execute
 * @param testId - Unique test identifier for data isolation
 * @returns Object containing results array and column names in SQL order
 */
export async function executeViewDefinition(
  viewDefinition: ViewDefinition,
  testId: string,
): Promise<ViewDefinitionResult> {
  try {
    // Get database connection
    const pool = getDatabasePool();
    const queryGenerator = getQueryGeneratorInstance();

    // Generate T-SQL query with test_id filter
    const transpilationResult = queryGenerator.generateQuery(
      viewDefinition,
      testId,
    );
    const sql = transpilationResult.sql;
    const parameters = transpilationResult.parameters;

    // Log the generated SQL for debugging
    console.log("Generated SQL:", sql);
    console.log("Parameters:", parameters);

    // Execute the query with parameterized values
    const request = new Request(pool);

    // Bind parameters to prevent SQL injection
    for (const [name, value] of Object.entries(parameters)) {
      request.input(name, value);
    }

    const queryResult = await request.query(sql);

    // Extract column names from the query result metadata
    // This preserves the actual SQL column order
    const columns = Object.keys(queryResult.recordset.columns || {});

    // Extract boolean column names from ViewDefinition
    const booleanColumns = extractBooleanColumns(viewDefinition);

    // Parse JSON strings and convert boolean columns in results
    return {
      results: parseJsonStringsInResults(queryResult.recordset, booleanColumns),
      columns,
    };
  } catch (error) {
    throw new Error(
      `Failed to execute ViewDefinition: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Compare actual results with expected results, handling various data types and formats.
 *
 * @param actualResults - The actual query results
 * @param expectedResults - The expected results from the test case
 * @param expectedColumns - Optional array of expected column names
 * @param actualColumns - Optional array of actual column names from SQL metadata
 * @returns true if results match, false otherwise
 */
export function compareResults(
  actualResults: any[],
  expectedResults: any[],
  expectedColumns?: string[],
  actualColumns?: string[],
): boolean {
  // Check column ordering if specified
  if (expectedColumns && expectedColumns.length > 0) {
    // Use actualColumns from SQL metadata if provided, otherwise fall back to Object.keys
    const columnsToCheck =
      actualColumns ??
      (actualResults.length > 0 ? Object.keys(actualResults[0]) : []);
    if (!arraysEqual(columnsToCheck, expectedColumns)) {
      console.log("Column mismatch:");
      console.log("  Expected:", expectedColumns);
      console.log("  Actual:  ", columnsToCheck);
      return false;
    }
  }

  // Normalize objects by sorting keys before comparing
  const normalizeObject = (obj: any): any => {
    if (obj === null || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(normalizeObject);

    const sorted: any = {};
    for (const key of Object.keys(obj).sort((a, b) => a.localeCompare(b))) {
      sorted[key] = normalizeObject(obj[key]);
    }
    return sorted;
  };

  // Sort both arrays to ignore row ordering, using normalized objects for consistent sorting
  const sortedActual = [...actualResults]
    .map(normalizeObject)
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const sortedExpected = [...expectedResults]
    .map(normalizeObject)
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

  // Check if lengths match
  if (sortedActual.length !== sortedExpected.length) {
    return false;
  }

  // Compare each result object
  for (let i = 0; i < sortedActual.length; i++) {
    if (!deepEqual(sortedActual[i], sortedExpected[i])) {
      return false;
    }
  }

  return true;
}

/**
 * Deep equality comparison with special handling for FHIR data types.
 */
function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;

  if (bothNullOrUndefined(a, b)) return true;
  if (eitherNullOrUndefined(a, b)) return false;

  if (typeof a !== typeof b) {
    return handleBooleanNumberConversion(a, b);
  }

  if (typeof a === "object") {
    return compareObjects(a, b);
  }

  return false;
}

/**
 * Check if both values are null or undefined.
 */
function bothNullOrUndefined(a: any, b: any): boolean {
  return (a === null || a === undefined) && (b === null || b === undefined);
}

/**
 * Check if either value is null or undefined (but not both).
 */
function eitherNullOrUndefined(a: any, b: any): boolean {
  return a === null || a === undefined || b === null || b === undefined;
}

/**
 * Handle boolean/number conversions for SQL Server BIT columns.
 */
function handleBooleanNumberConversion(a: any, b: any): boolean {
  if (typeof a === "boolean" && typeof b === "number") {
    return (a ? 1 : 0) === b;
  }
  if (typeof b === "boolean" && typeof a === "number") {
    return (b ? 1 : 0) === a;
  }
  return false;
}

/**
 * Compare objects (arrays or plain objects).
 */
function compareObjects(a: any, b: any): boolean {
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a)) {
    return compareArrays(a, b);
  }

  return comparePlainObjects(a, b);
}

/**
 * Compare two arrays element by element.
 */
function compareArrays(a: any[], b: any[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!deepEqual(a[i], b[i])) return false;
  }
  return true;
}

/**
 * Compare two plain objects key by key.
 */
function comparePlainObjects(a: any, b: any): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => deepEqual(a[key], b[key]));
}

/**
 * Check if two arrays are equal (same elements in same order).
 */
function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((val, i) => val === b[i]);
}

/**
 * Extract boolean column names from ViewDefinition.
 *
 * @param viewDefinition - The ViewDefinition to extract from
 * @returns Set of column names that are declared as boolean type
 */
function extractBooleanColumns(viewDefinition: ViewDefinition): Set<string> {
  const booleanColumns = new Set<string>();

  // Recursively extract columns from select definitions
  function extractFromSelect(selectDef: any): void {
    if (selectDef.column) {
      for (const col of selectDef.column) {
        if (col.type === "boolean") {
          booleanColumns.add(col.name);
        }
      }
    }

    if (selectDef.select) {
      for (const nestedSelect of selectDef.select) {
        extractFromSelect(nestedSelect);
      }
    }

    if (selectDef.forEach) {
      for (const forEachDef of selectDef.forEach) {
        extractFromSelect(forEachDef);
      }
    }

    if (selectDef.unionAll) {
      for (const unionDef of selectDef.unionAll) {
        extractFromSelect(unionDef);
      }
    }
  }

  if (viewDefinition.select) {
    for (const selectDef of viewDefinition.select) {
      extractFromSelect(selectDef);
    }
  }

  return booleanColumns;
}

/**
 * Parse JSON strings in query results into actual arrays/objects.
 * Also converts numeric boolean values (0/1) to actual booleans for columns marked as boolean type.
 *
 * SQL Server may return some values as JSON strings that need to be parsed.
 * SQL Server also returns CASE expressions as TINYINT (0/1) instead of boolean.
 *
 * @param results - The query results to parse
 * @param booleanColumns - Set of column names that should be treated as booleans
 */
function parseJsonStringsInResults(
  results: any[],
  booleanColumns: Set<string>,
): any[] {
  return results.map((row) => {
    const parsedRow: any = {};
    for (const [key, value] of Object.entries(row)) {
      // Convert numeric boolean values to actual booleans
      if (booleanColumns.has(key) && typeof value === "number") {
        parsedRow[key] = Boolean(value);
      } else if (typeof value === "string" && looksLikeJson(value)) {
        try {
          parsedRow[key] = JSON.parse(value);
        } catch {
          // If parsing fails, keep the original string
          parsedRow[key] = value;
        }
      } else {
        parsedRow[key] = value;
      }
    }
    return parsedRow;
  });
}

/**
 * Check if a string looks like JSON (starts with [ or {).
 */
function looksLikeJson(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("[") || trimmed.startsWith("{");
}
