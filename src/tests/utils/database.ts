/**
 * Database setup and teardown utilities for Vitest tests.
 *
 * Provides functions to manage database connections, table creation,
 * and test data lifecycle during Vitest test execution.
 *
 * @author John Grimes
 */

import { stringify as losslessStringify } from "lossless-json";
import { ConnectionPool, config as MSSQLConfig, Request } from "mssql";
import {
  normaliseResourceJsonDataType,
  type ResourceJsonDataType,
} from "../../validation";

// Global connection pool
let globalPool: ConnectionPool | null = null;
let isConnected = false;

// Track inserted row IDs for each test for cleanup
const globalTestData = new Map<string, number[]>();

/**
 * Database configuration loaded from environment variables.
 */
const getDatabaseConfig = (): MSSQLConfig => {
  return {
    server: process.env.MSSQL_HOST ?? "localhost",
    port: parseInt(process.env.MSSQL_PORT ?? "1433"),
    database: process.env.MSSQL_DATABASE ?? "testdb",
    user: process.env.MSSQL_USER ?? "sa",
    password: process.env.MSSQL_PASSWORD ?? "",
    pool: {
      max: 30, // Support concurrent test execution
      min: 5,
      idleTimeoutMillis: 30000,
    },
    options: {
      encrypt: process.env.MSSQL_ENCRYPT !== "false",
      trustServerCertificate: process.env.MSSQL_TRUST_CERT !== "false",
    },
  };
};

/**
 * Get table configuration from environment variables.
 * Uses a test-specific table name to avoid conflicts with production data.
 *
 * The `json` column's storage type is governed by MSSQL_RESOURCE_JSON_DATA_TYPE
 * (default `NVARCHAR(MAX)`); setting it to `JSON` exercises the native JSON type
 * and requires a SQL Server 2025 instance. This lets the full conformance suite
 * run against both column types (FR-011).
 */
const getTableConfig = (): {
  tableName: string;
  schemaName: string;
  resourceIdColumn: string;
  resourceJsonColumn: string;
  resourceJsonDataType: ResourceJsonDataType;
} => ({
  tableName: process.env.MSSQL_TEST_TABLE ?? "fhir_resources_test",
  schemaName: process.env.MSSQL_SCHEMA ?? "dbo",
  resourceIdColumn: "id",
  resourceJsonColumn: "json",
  resourceJsonDataType: process.env.MSSQL_RESOURCE_JSON_DATA_TYPE
    ? normaliseResourceJsonDataType(process.env.MSSQL_RESOURCE_JSON_DATA_TYPE)
    : "NVARCHAR(MAX)",
});

/**
 * Setup database connection and create the FHIR resources table.
 * This should be called once before running tests.
 */
export async function setupDatabase(): Promise<void> {
  if (isConnected) {
    return;
  }

  const config = getDatabaseConfig();
  // ConnectionPool constructor accepts either a config object or a connection string
  globalPool = new ConnectionPool(config);

  try {
    await globalPool.connect();
    isConnected = true;

    // Create the table if it doesn't exist
    await createTableIfNotExists();

    // Clear any existing test data from previous runs
    await clearTestTable();
  } catch (error) {
    throw new Error(
      `Failed to setup database: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Cleanup database connection.
 * This should be called once after all tests are complete.
 */
export async function cleanupDatabase(): Promise<void> {
  if (globalPool && isConnected) {
    try {
      await globalPool.close();
    } catch {
      // Ignore cleanup errors
    } finally {
      globalPool = null;
      isConnected = false;
    }
  }
}

/**
 * Setup test data by inserting FHIR resources into the table.
 * This should be called before each test case.
 *
 * @param resources - FHIR resources to insert
 * @param testId - Unique test identifier for isolation (prepended to resource IDs)
 */
export async function setupTestData(
  resources: any[],
  testId: string,
): Promise<void> {
  if (!globalPool || !isConnected) {
    throw new Error("Database not connected. Call setupDatabase() first.");
  }

  const tableConfig = getTableConfig();

  // Keep track of inserted IDs for cleanup
  const insertedIds: number[] = [];

  // Insert test resources with test_id for isolation
  for (let i = 0; i < resources.length; i++) {
    const resource = resources[i];
    try {
      const insertSql = `
        INSERT INTO [${tableConfig.schemaName}].[${tableConfig.tableName}]
        ([resource_type], [${tableConfig.resourceJsonColumn}], [test_id])
        OUTPUT INSERTED.[${tableConfig.resourceIdColumn}]
        VALUES (@resource_type, @json, @test_id)
      `;

      const insertRequest = new Request(globalPool);
      insertRequest.input("resource_type", resource.resourceType);
      // Serialise with lossless-json so decimal lexemes (including trailing
      // zeros, e.g. 1.0) are preserved in the stored JSON. This relies on the
      // resource having been parsed losslessly upstream (see the dynamic test
      // generator); plain JSON.stringify would collapse 1.0 to 1 and strip the
      // precision the boundary functions depend on (FR-011). Non-numeric values
      // are unaffected.
      insertRequest.input("json", losslessStringify(resource) ?? "null");
      insertRequest.input("test_id", testId);

      const result = await insertRequest.query(insertSql);
      const insertedId = result.recordset[0]?.[tableConfig.resourceIdColumn];
      if (insertedId) {
        insertedIds.push(insertedId);
      }
    } catch (error) {
      throw new Error(
        `Failed to insert resource ${resource.id ?? `at index ${i}`}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Store inserted IDs for cleanup (using a Map keyed by testId)
  if (!globalTestData.has(testId)) {
    globalTestData.set(testId, []);
  }
  const testData = globalTestData.get(testId);
  if (testData) {
    testData.push(...insertedIds);
  }
}

/**
 * Cleanup test data by removing resources for a specific test.
 * This should be called after each test case.
 *
 * @param testId - Unique test identifier to clean up
 */
export async function cleanupTestData(testId: string): Promise<void> {
  if (!globalPool || !isConnected) {
    return;
  }

  const tableConfig = getTableConfig();
  const tableName = `[${tableConfig.schemaName}].[${tableConfig.tableName}]`;

  try {
    // Check if table exists first
    const checkTableSql = `
      SELECT COUNT(*) as table_count
      FROM sys.tables t
      JOIN sys.schemas s ON t.schema_id = s.schema_id
      WHERE t.name = '${tableConfig.tableName}' AND s.name = '${tableConfig.schemaName}'
    `;

    const checkRequest = new Request(globalPool);
    const checkResult = await checkRequest.query(checkTableSql);
    const tableExists = checkResult.recordset[0]?.table_count > 0;

    if (!tableExists) {
      return;
    }

    // Delete rows by test_id
    const deleteRequest = new Request(globalPool);
    deleteRequest.input("test_id", testId);
    await deleteRequest.query(
      `DELETE FROM ${tableName} WHERE [test_id] = @test_id`,
    );

    // Clean up the tracking data
    globalTestData.delete(testId);
  } catch (error) {
    // Don't silently ignore cleanup failures - they cause subsequent test failures
    throw new Error(
      `Failed to clean up test data: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Clear all data from the test table.
 * This should be called once before running tests to ensure a clean state.
 */
async function clearTestTable(): Promise<void> {
  if (!globalPool) {
    throw new Error("Database not connected");
  }

  const tableConfig = getTableConfig();
  const tableName = `[${tableConfig.schemaName}].[${tableConfig.tableName}]`;

  try {
    // Check if table exists first
    const checkTableSql = `
      SELECT COUNT(*) as table_count
      FROM sys.tables t
      JOIN sys.schemas s ON t.schema_id = s.schema_id
      WHERE t.name = '${tableConfig.tableName}' AND s.name = '${tableConfig.schemaName}'
    `;

    const checkRequest = new Request(globalPool);
    const checkResult = await checkRequest.query(checkTableSql);
    const tableExists = checkResult.recordset[0]?.table_count > 0;

    if (!tableExists) {
      return;
    }

    // Truncate the table to remove all data
    const truncateRequest = new Request(globalPool);
    await truncateRequest.query(`TRUNCATE TABLE ${tableName}`);
  } catch (error) {
    throw new Error(
      `Failed to clear test table: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Determine the existing test table's json column type.
 *
 * Maps the INFORMATION_SCHEMA representation to a canonical type: `json` for the
 * native type, otherwise `NVARCHAR(MAX)` (the test table only ever uses these
 * two). Used to decide whether the persisted table needs recreating when the
 * configured type changes.
 *
 * @param tableConfig - The resolved test table configuration.
 * @returns The canonical existing json column type.
 */
async function getExistingTestTableJsonType(tableConfig: {
  tableName: string;
  schemaName: string;
  resourceJsonColumn: string;
}): Promise<ResourceJsonDataType> {
  if (!globalPool) {
    throw new Error("Database not connected");
  }

  const request = new Request(globalPool);
  request.input("schemaName", tableConfig.schemaName);
  request.input("tableName", tableConfig.tableName);
  request.input("columnName", tableConfig.resourceJsonColumn);
  const result = await request.query(`
    SELECT DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @schemaName
      AND TABLE_NAME = @tableName
      AND COLUMN_NAME = @columnName
  `);

  return result.recordset[0]?.DATA_TYPE === "json" ? "JSON" : "NVARCHAR(MAX)";
}

/**
 * Create the FHIR resources table if it doesn't exist.
 */
async function createTableIfNotExists(): Promise<void> {
  if (!globalPool) {
    throw new Error("Database not connected");
  }

  const tableConfig = getTableConfig();
  const tableName = `[${tableConfig.schemaName}].[${tableConfig.tableName}]`;

  try {
    // Check if table exists
    const checkTableSql = `
      SELECT COUNT(*) as table_count 
      FROM sys.tables t 
      JOIN sys.schemas s ON t.schema_id = s.schema_id 
      WHERE t.name = '${tableConfig.tableName}' AND s.name = '${tableConfig.schemaName}'
    `;

    const checkRequest = new Request(globalPool);
    const checkResult = await checkRequest.query(checkTableSql);
    const tableExists = checkResult.recordset[0]?.table_count > 0;

    if (tableExists) {
      // The shared test table persists between runs. If its json column type no
      // longer matches the configured type (e.g. switching
      // MSSQL_RESOURCE_JSON_DATA_TYPE between NVARCHAR(MAX) and JSON), drop it so
      // it is recreated with the right type; otherwise leave it as is.
      const existingType = await getExistingTestTableJsonType(tableConfig);
      if (existingType === tableConfig.resourceJsonDataType) {
        return;
      }
      await new Request(globalPool).query(`DROP TABLE ${tableName}`);
    }

    // Create test table with test_id column for concurrent test isolation. The
    // json column type is configurable so the same suite can prove conformance
    // over both NVARCHAR(MAX) and the native JSON type. The type is a canonical,
    // allowlisted value (see getTableConfig), so it carries no injection risk.
    const createTableSql = `
      CREATE TABLE ${tableName} (
        [${tableConfig.resourceIdColumn}] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [resource_type] NVARCHAR(64) NOT NULL,
        [${tableConfig.resourceJsonColumn}] ${tableConfig.resourceJsonDataType} NOT NULL,
        [test_id] NVARCHAR(255) NOT NULL
      )
    `;

    const createRequest = new Request(globalPool);
    await createRequest.query(createTableSql);
  } catch (error) {
    throw new Error(
      `Failed to create table: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Get the current database connection pool.
 * Used by test utilities that need direct database access.
 */
export function getDatabasePool(): ConnectionPool {
  if (!globalPool || !isConnected) {
    throw new Error("Database not connected. Call setupDatabase() first.");
  }
  return globalPool;
}
