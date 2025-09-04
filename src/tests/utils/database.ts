/**
 * Database setup and teardown utilities for Vitest tests.
 * 
 * Provides functions to manage database connections, table creation,
 * and test data lifecycle during Vitest test execution.
 */

import { config as MSSQLConfig, ConnectionPool, Request } from "mssql";

// Global connection pool
let globalPool: ConnectionPool | null = null;
let isConnected = false;

/**
 * Database configuration loaded from environment variables.
 */
const getDatabaseConfig = () => {
  const config: MSSQLConfig = {
    server: process.env.MSSQL_HOST || "localhost",
    port: parseInt(process.env.MSSQL_PORT || "1433"),
    database: process.env.MSSQL_DATABASE || "testdb",
    user: process.env.MSSQL_USER || "sa",
    password: process.env.MSSQL_PASSWORD || "",
    options: {
      encrypt: process.env.MSSQL_ENCRYPT === "false" ? false : true,
      trustServerCertificate: process.env.MSSQL_TRUST_CERT === "false" ? false : true,
    },
  };

  // Use connection string if provided
  if (process.env.MSSQL_CONNECTION_STRING) {
    return { connectionString: process.env.MSSQL_CONNECTION_STRING } as any;
  }

  return config;
};

/**
 * Get table configuration from environment variables.
 */
const getTableConfig = () => ({
  tableName: process.env.MSSQL_TABLE || "fhir_resources",
  schemaName: process.env.MSSQL_SCHEMA || "dbo",
  resourceIdColumn: "id",
  resourceJsonColumn: "json",
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
  globalPool = new ConnectionPool(config);

  try {
    await globalPool.connect();
    isConnected = true;

    // Create the table if it doesn't exist
    await createTableIfNotExists();
  } catch (error) {
    throw new Error(`Failed to setup database: ${error instanceof Error ? error.message : String(error)}`);
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
    } catch (error) {
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
 */
export async function setupTestData(resources: any[]): Promise<void> {
  if (!globalPool || !isConnected) {
    throw new Error("Database not connected. Call setupDatabase() first.");
  }

  const tableConfig = getTableConfig();

  // Insert test resources
  for (const resource of resources) {
    try {
      const insertSql = `
        INSERT INTO [${tableConfig.schemaName}].[${tableConfig.tableName}] 
        ([${tableConfig.resourceIdColumn}], [resource_type], [${tableConfig.resourceJsonColumn}])
        VALUES (@id, @resource_type, @json)
      `;

      const insertRequest = new Request(globalPool);
      insertRequest.input("id", resource.id);
      insertRequest.input("resource_type", resource.resourceType);
      insertRequest.input("json", JSON.stringify(resource));

      await insertRequest.query(insertSql);
    } catch (error) {
      throw new Error(`Failed to insert resource ${resource.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * Cleanup test data by removing all resources from the table.
 * This should be called after each test case.
 */
export async function cleanupTestData(): Promise<void> {
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

    // Use DELETE instead of TRUNCATE to avoid issues with foreign keys and ensure reliability
    const deleteRequest = new Request(globalPool);
    await deleteRequest.query(`DELETE FROM ${tableName}`);
    
    // Verify cleanup was successful
    const verifyRequest = new Request(globalPool);
    const verifyResult = await verifyRequest.query(`SELECT COUNT(*) as remaining_count FROM ${tableName}`);
    const remainingCount = verifyResult.recordset[0]?.remaining_count;
    
    if (remainingCount > 0) {
      throw new Error(`Failed to clean up all test data. ${remainingCount} records remaining.`);
    }
  } catch (error) {
    // Don't silently ignore cleanup failures - they cause subsequent test failures
    throw new Error(`Failed to clean up test data: ${error instanceof Error ? error.message : String(error)}`);
  }
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
      return;
    }

    // Create table with composite primary key
    const createTableSql = `
      CREATE TABLE ${tableName} (
        [${tableConfig.resourceIdColumn}] NVARCHAR(64) NOT NULL,
        [resource_type] NVARCHAR(64) NOT NULL,
        [${tableConfig.resourceJsonColumn}] NVARCHAR(MAX) NOT NULL,
        PRIMARY KEY ([${tableConfig.resourceIdColumn}], [resource_type])
      )
    `;

    const createRequest = new Request(globalPool);
    await createRequest.query(createTableSql);
  } catch (error) {
    throw new Error(`Failed to create table: ${error instanceof Error ? error.message : String(error)}`);
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