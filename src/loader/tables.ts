/**
 * Table management for NDJSON loader.
 * Creates and manages the single fhir_resources table.
 *
 * @author John Grimes
 */

import sql, { type ConnectionPool } from "mssql";

/**
 * Check if a table exists in the database.
 *
 * @param pool - Database connection pool.
 * @param schemaName - Schema name.
 * @param tableName - Name of the table to check.
 * @returns Promise that resolves to true if the table exists.
 */
export async function tableExists(
  pool: ConnectionPool,
  schemaName: string,
  tableName: string,
): Promise<boolean> {
  const result = await pool
    .request()
    .input("schemaName", sql.NVarChar, schemaName)
    .input("tableName", sql.NVarChar, tableName).query(`
      SELECT COUNT(*) as count
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = @schemaName AND TABLE_NAME = @tableName
    `);

  return result.recordset[0].count > 0;
}

/**
 * Create the fhir_resources table with an index on resource_type.
 * Table schema: id (INT IDENTITY PRIMARY KEY), resource_type (NVARCHAR(64)), json (NVARCHAR(MAX))
 *
 * @param pool - Database connection pool.
 * @param schemaName - Schema name.
 * @param tableName - Name of the table to create.
 */
export async function createTable(
  pool: ConnectionPool,
  schemaName: string,
  tableName: string,
): Promise<void> {
  // Create the table.
  await pool.request().query(`
    CREATE TABLE [${schemaName}].[${tableName}] (
      [id] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
      [resource_type] NVARCHAR(64) NOT NULL,
      [json] NVARCHAR(MAX) NOT NULL
    )
  `);

  // Create an index on resource_type for efficient filtering by resource type.
  await pool.request().query(`
    CREATE INDEX [IX_${tableName}_resource_type]
    ON [${schemaName}].[${tableName}] ([resource_type])
  `);
}

/**
 * Truncate a table (remove all rows).
 *
 * @param pool - Database connection pool.
 * @param schemaName - Schema name.
 * @param tableName - Name of the table to truncate.
 */
export async function truncateTable(
  pool: ConnectionPool,
  schemaName: string,
  tableName: string,
): Promise<void> {
  await pool.request().query(`TRUNCATE TABLE [${schemaName}].[${tableName}]`);
}

/**
 * Ensure the fhir_resources table exists, creating it if necessary.
 *
 * @param pool - Database connection pool.
 * @param schemaName - Schema name.
 * @param tableName - Name of the table.
 * @param truncate - Whether to truncate the table if it exists.
 */
export async function ensureTable(
  pool: ConnectionPool,
  schemaName: string,
  tableName: string,
  truncate: boolean = false,
): Promise<void> {
  const exists = await tableExists(pool, schemaName, tableName);

  if (exists) {
    if (truncate) {
      await truncateTable(pool, schemaName, tableName);
    }
  } else {
    await createTable(pool, schemaName, tableName);
  }
}
