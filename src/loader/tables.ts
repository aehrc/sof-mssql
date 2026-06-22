/**
 * Table management for NDJSON loader.
 * Creates and manages the single fhir_resources table.
 *
 * @author John Grimes
 */

import sql, { type ConnectionPool } from "mssql";
import {
  type ResourceJsonDataType,
  validateSqlServerIdentifier,
} from "../validation.js";

/**
 * The DDL statements needed to create the resources table and its index.
 */
export interface CreateTableStatements {
  /** The `CREATE TABLE` statement. */
  createTable: string;
  /** The `CREATE INDEX` statement for the `resource_type` column. */
  createIndex: string;
}

/**
 * Build the DDL statements for the resources table and its index.
 *
 * This is a pure function so the generated SQL can be unit-tested without a
 * database. The `json` column is typed with the resolved {@link
 * ResourceJsonDataType}; with the default `NVARCHAR(MAX)` the output is
 * byte-for-byte identical to earlier releases (SC-001). Identifiers are assumed
 * to have been validated by the caller (see {@link createTable}).
 *
 * @param schemaName - Schema name (already validated).
 * @param tableName - Table name (already validated).
 * @param jsonType - Resolved canonical storage type for the `json` column.
 * @returns The `CREATE TABLE` and `CREATE INDEX` statements.
 */
export function buildCreateTableStatements(
  schemaName: string,
  tableName: string,
  jsonType: ResourceJsonDataType,
): CreateTableStatements {
  // Only the json column's type varies; every other part of the DDL is held
  // constant so the default path is unchanged from earlier releases.
  const createTable = `
    CREATE TABLE [${schemaName}].[${tableName}] (
      [id] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
      [resource_type] NVARCHAR(64) NOT NULL,
      [json] ${jsonType} NOT NULL
    )
  `;

  const createIndex = `
    CREATE INDEX [IX_${tableName}_resource_type]
    ON [${schemaName}].[${tableName}] ([resource_type])
  `;

  return { createTable, createIndex };
}

/**
 * Render an INFORMATION_SCHEMA column type for a diagnostic message.
 *
 * Length-bearing types are shown with their declared length, with the `-1`
 * sentinel rendered as `MAX`; types reported without a length (such as the
 * native `JSON` type) are shown as the bare type name.
 *
 * @param dataType - The INFORMATION_SCHEMA DATA_TYPE.
 * @param characterMaximumLength - The INFORMATION_SCHEMA CHARACTER_MAXIMUM_LENGTH.
 * @returns A readable type such as `VARCHAR(100)`, `NVARCHAR(MAX)` or `JSON`.
 */
function formatColumnType(
  dataType: string,
  characterMaximumLength: number | null,
): string {
  const baseType = dataType.trim().toUpperCase();
  if (characterMaximumLength === null) {
    return baseType;
  }
  const length =
    characterMaximumLength === -1 ? "MAX" : String(characterMaximumLength);
  return `${baseType}(${length})`;
}

/**
 * Resolve an INFORMATION_SCHEMA column description to a canonical json type.
 *
 * Only two column shapes can faithfully hold a serialised FHIR resource: the
 * native type (`data_type = 'json'`) and `NVARCHAR(MAX)` (`data_type =
 * 'nvarchar'` with `character_maximum_length = -1`). Any other shape - a bounded
 * `NVARCHAR(64)`, a non-Unicode `VARCHAR`, `TEXT`, and so on - is rejected here
 * rather than silently coerced to `NVARCHAR(MAX)`. Coercion would let the
 * mismatch check pass and the loader write into a column that cannot hold the
 * data, surfacing later as a `String or binary data would be truncated` error
 * or, under non-Unicode `VARCHAR`, silent character corruption. Failing fast
 * turns that late, data-dependent failure into an early, actionable
 * configuration error (Constitution Principle IV).
 *
 * @param dataType - The INFORMATION_SCHEMA DATA_TYPE.
 * @param characterMaximumLength - The INFORMATION_SCHEMA CHARACTER_MAXIMUM_LENGTH.
 * @returns The canonical resource json data type (`JSON` or `NVARCHAR(MAX)`).
 * @throws Error if the column is neither native `JSON` nor `NVARCHAR(MAX)`. The
 *   message names the offending type and the two acceptable types.
 */
export function resolveColumnJsonDataType(
  dataType: string,
  characterMaximumLength: number | null,
): ResourceJsonDataType {
  const normalised = dataType.trim().toLowerCase();
  if (normalised === "json") {
    return "JSON";
  }
  // NVARCHAR(MAX) is the only nvarchar form that can hold an arbitrarily long
  // resource; bounded lengths would truncate, so the length is required here.
  if (normalised === "nvarchar" && characterMaximumLength === -1) {
    return "NVARCHAR(MAX)";
  }
  throw new Error(
    `Existing [json] column is ` +
      `${formatColumnType(dataType, characterMaximumLength)}, which cannot ` +
      `safely hold serialised FHIR resources. Expected NVARCHAR(MAX) or JSON. ` +
      `Alter or drop the column before loading.`,
  );
}

/**
 * Build a warning for an existing table whose json column type differs from the
 * requested type.
 *
 * @param schemaName - Schema name.
 * @param tableName - Table name.
 * @param existingType - The table's current json column type.
 * @param requestedType - The requested json column type.
 * @returns A warning message naming both types, or null when they match.
 */
export function buildJsonTypeMismatchWarning(
  schemaName: string,
  tableName: string,
  existingType: ResourceJsonDataType,
  requestedType: ResourceJsonDataType,
): string | null {
  if (existingType === requestedType) {
    return null;
  }
  return (
    `Warning: table [${schemaName}].[${tableName}] already exists with a json ` +
    `column of type ${existingType}, but ${requestedType} was requested. The ` +
    `existing table is left unaltered and loading continues into it.`
  );
}

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
 * Read the effective json column type for an existing table.
 *
 * @param pool - Database connection pool.
 * @param schemaName - Schema name.
 * @param tableName - Name of the table.
 * @returns The canonical json column type, or null if the table or its `json`
 *   column does not exist.
 * @throws Error if the column exists but is neither native `JSON` nor
 *   `NVARCHAR(MAX)` (see {@link resolveColumnJsonDataType}).
 */
export async function getExistingJsonColumnType(
  pool: ConnectionPool,
  schemaName: string,
  tableName: string,
): Promise<ResourceJsonDataType | null> {
  const result = await pool
    .request()
    .input("schemaName", sql.NVarChar, schemaName)
    .input("tableName", sql.NVarChar, tableName).query(`
      SELECT DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @schemaName
        AND TABLE_NAME = @tableName
        AND COLUMN_NAME = 'json'
    `);

  const row = result.recordset[0];
  if (!row) {
    return null;
  }
  return resolveColumnJsonDataType(row.DATA_TYPE, row.CHARACTER_MAXIMUM_LENGTH);
}

/**
 * Emit a warning if an existing table's json column type differs from the
 * requested type. The table is never altered; this only surfaces the mismatch
 * so it is visible rather than silently ignored (FR-008, SC-005).
 *
 * An existing column that is neither native `JSON` nor `NVARCHAR(MAX)` cannot
 * hold a serialised FHIR resource, so it is rejected outright rather than
 * warned about: the error is raised here before any rows are loaded.
 *
 * @param pool - Database connection pool.
 * @param schemaName - Schema name.
 * @param tableName - Name of the table.
 * @param requestedType - The requested json column type.
 * @throws Error if the existing `json` column is neither native `JSON` nor
 *   `NVARCHAR(MAX)` (see {@link resolveColumnJsonDataType}).
 */
export async function warnIfJsonTypeMismatch(
  pool: ConnectionPool,
  schemaName: string,
  tableName: string,
  requestedType: ResourceJsonDataType,
): Promise<void> {
  const existingType = await getExistingJsonColumnType(
    pool,
    schemaName,
    tableName,
  );
  if (existingType === null) {
    return;
  }
  const warning = buildJsonTypeMismatchWarning(
    schemaName,
    tableName,
    existingType,
    requestedType,
  );
  if (warning !== null) {
    // The warning is emitted regardless of quiet mode so the misconfiguration
    // is always visible (SC-005).
    console.warn(warning);
  }
}

/**
 * Create the fhir_resources table with an index on resource_type.
 * Table schema: id (INT IDENTITY PRIMARY KEY), resource_type (NVARCHAR(64)),
 * json (the configured storage type, NVARCHAR(MAX) by default).
 *
 * @param pool - Database connection pool.
 * @param schemaName - Schema name.
 * @param tableName - Name of the table to create.
 * @param jsonType - Storage type for the `json` column (default `NVARCHAR(MAX)`).
 */
export async function createTable(
  pool: ConnectionPool,
  schemaName: string,
  tableName: string,
  jsonType: ResourceJsonDataType = "NVARCHAR(MAX)",
): Promise<void> {
  // Validate identifiers to prevent SQL injection. The json type is already a
  // canonical, allowlisted value, so it carries no injection risk.
  validateSqlServerIdentifier(schemaName, "Schema name");
  validateSqlServerIdentifier(tableName, "Table name");

  const { createTable: createTableSql, createIndex: createIndexSql } =
    buildCreateTableStatements(schemaName, tableName, jsonType);

  // Create the table.
  await pool.request().query(createTableSql);

  // Create an index on resource_type for efficient filtering by resource type.
  await pool.request().query(createIndexSql);
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
  // Validate identifiers to prevent SQL injection
  validateSqlServerIdentifier(schemaName, "Schema name");
  validateSqlServerIdentifier(tableName, "Table name");

  await pool.request().query(`TRUNCATE TABLE [${schemaName}].[${tableName}]`);
}

/**
 * Ensure the fhir_resources table exists, creating it if necessary.
 *
 * When the table already exists it is never altered; the requested `json`
 * column type only governs creation of a new table.
 *
 * @param pool - Database connection pool.
 * @param schemaName - Schema name.
 * @param tableName - Name of the table.
 * @param truncate - Whether to truncate the table if it exists.
 * @param jsonType - Storage type for the `json` column when creating the table
 *   (default `NVARCHAR(MAX)`).
 */
export async function ensureTable(
  pool: ConnectionPool,
  schemaName: string,
  tableName: string,
  truncate: boolean = false,
  jsonType: ResourceJsonDataType = "NVARCHAR(MAX)",
): Promise<void> {
  const exists = await tableExists(pool, schemaName, tableName);

  if (exists) {
    // The table already exists, so the requested type cannot take effect. Warn
    // if it differs from the existing column type, then leave the table as is.
    await warnIfJsonTypeMismatch(pool, schemaName, tableName, jsonType);
    if (truncate) {
      await truncateTable(pool, schemaName, tableName);
    }
  } else {
    await createTable(pool, schemaName, tableName, jsonType);
  }
}
