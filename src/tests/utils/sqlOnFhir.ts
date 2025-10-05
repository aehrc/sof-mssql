/**
 * Shared utilities for SQL-on-FHIR Vitest tests.
 *
 * Provides functions for ViewDefinition transpilation, SQL execution,
 * result comparison, and other common test operations.
 */

import { Request } from "mssql";
import { SqlOnFhir } from "../../index";
import { ViewDefinition } from "../../types";
import { getDatabasePool } from "./database";

let sqlOnFhirInstance: SqlOnFhir | null = null;

/**
 * Get or create the SqlOnFhir instance with database configuration.
 */
function getSqlOnFhirInstance(): SqlOnFhir {
  if (!sqlOnFhirInstance) {
    sqlOnFhirInstance = new SqlOnFhir({
      tableName: process.env.MSSQL_TABLE || "fhir_resources",
      schemaName: process.env.MSSQL_SCHEMA || "dbo",
      resourceIdColumn: "id",
      resourceJsonColumn: "json",
    });
  }
  return sqlOnFhirInstance;
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
 * @returns Object containing results array and column names in SQL order
 */
export async function executeViewDefinition(
  viewDefinition: ViewDefinition | any,
): Promise<ViewDefinitionResult> {
  try {
    // Get database connection
    const pool = getDatabasePool();
    const sqlOnFhir = getSqlOnFhirInstance();

    // Transpile ViewDefinition to SQL
    const transpilationResult = sqlOnFhir.transpile(viewDefinition);
    const sql = transpilationResult.sql;

    // Log the generated SQL for debugging
    console.log("Generated SQL:", sql);

    // Execute the query
    const request = new Request(pool);
    const queryResult = await request.query(sql);

    // Extract column names from the query result metadata
    // This preserves the actual SQL column order
    const columns = Object.keys(queryResult.recordset.columns || {});

    // Parse JSON strings in results and return with column metadata
    return {
      results: parseJsonStringsInResults(queryResult.recordset),
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
      actualColumns ||
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
    Object.keys(obj)
      .sort()
      .forEach((key) => {
        sorted[key] = normalizeObject(obj[key]);
      });
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

  if (a == null && b == null) return true;
  if (a == null || b == null) return false;

  if (typeof a !== typeof b) {
    // Handle boolean/number conversions for SQL Server BIT columns
    // SQL Server returns BIT as 0/1, but tests may expect true/false
    if (typeof a === "boolean" && typeof b === "number") {
      return (a ? 1 : 0) === b;
    }
    if (typeof b === "boolean" && typeof a === "number") {
      return (b ? 1 : 0) === a;
    }
    return false;
  }

  if (typeof a === "object") {
    if (Array.isArray(a) !== Array.isArray(b)) return false;

    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!deepEqual(a[i], b[i])) return false;
      }
      return true;
    }

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) => deepEqual(a[key], b[key]));
  }

  return false;
}

/**
 * Check if two arrays are equal (same elements in same order).
 */
function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((val, i) => val === b[i]);
}

/**
 * Parse JSON strings in query results into actual arrays/objects.
 *
 * SQL Server may return some values as JSON strings that need to be parsed.
 */
function parseJsonStringsInResults(results: any[]): any[] {
  return results.map((row) => {
    const parsedRow: any = {};
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === "string" && looksLikeJson(value)) {
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

/**
 * Handle special equality comparison cases for FHIR data.
 */
function isEqual(a: any, b: any): boolean {
  // Handle null/undefined comparison
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;

  // Handle boolean conversion
  if (typeof a === "boolean" && typeof b === "number") {
    return a === Boolean(b);
  }
  if (typeof b === "boolean" && typeof a === "number") {
    return b === Boolean(a);
  }

  return a === b;
}
