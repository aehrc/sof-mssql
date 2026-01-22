/**
 * Database connection management for NDJSON loader.
 *
 * @author John Grimes
 */

import sql, { type ConnectionPool, type config as SqlConfig } from "mssql";
import type { DatabaseConfig } from "./types.js";

/**
 * Create a connection pool to the SQL Server database.
 *
 * @param config - Database connection configuration.
 * @returns Promise that resolves to the connection pool.
 */
export async function createConnectionPool(
  config: DatabaseConfig,
): Promise<ConnectionPool> {
  // Build the mssql configuration object.
  const sqlConfig: SqlConfig = {
    server: config.host,
    port: config.port ?? 1433,
    user: config.user,
    password: config.password,
    database: config.database,
    requestTimeout: config.requestTimeout,
    options: {
      trustServerCertificate: config.trustServerCertificate ?? false,
      // Enable multiple active result sets for parallel operations.
      enableArithAbort: true,
    },
    pool: {
      // Configure connection pool for bulk operations.
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  };

  // Create and connect the pool.
  const pool = new sql.ConnectionPool(sqlConfig);
  await pool.connect();

  return pool;
}

/**
 * Close a connection pool safely.
 *
 * @param pool - The connection pool to close.
 */
export async function closeConnectionPool(pool: ConnectionPool): Promise<void> {
  try {
    await pool.close();
  } catch {
    // Silently ignore errors when closing - we're likely cleaning up anyway.
  }
}

/**
 * Test database connection.
 *
 * @param pool - The connection pool to test.
 * @returns Promise that resolves to true if connection is successful.
 */
export async function testConnection(pool: ConnectionPool): Promise<boolean> {
  try {
    const result = await pool.request().query("SELECT 1 AS test");
    return result.recordset.length === 1;
  } catch {
    return false;
  }
}

/**
 * Get database connection configuration from environment variables.
 * Falls back to provided defaults or throws if required variables are missing.
 *
 * @param overrides - Optional configuration overrides.
 * @returns Database configuration.
 */
// eslint-disable-next-line complexity -- Configuration parsing is inherently complex
export function getDatabaseConfigFromEnv(
  overrides?: Partial<DatabaseConfig>,
): DatabaseConfig {
  const host = overrides?.host ?? process.env.MSSQL_HOST;
  const user = overrides?.user ?? process.env.MSSQL_USER;
  const password = overrides?.password ?? process.env.MSSQL_PASSWORD;
  const database = overrides?.database ?? process.env.MSSQL_DATABASE;

  if (!host || !user || !password || !database) {
    throw new Error(
      "Missing required database configuration. " +
        "Provide via --host, --user, --password, --database flags " +
        "or MSSQL_HOST, MSSQL_USER, MSSQL_PASSWORD, MSSQL_DATABASE environment variables.",
    );
  }

  const port =
    overrides?.port ??
    (process.env.MSSQL_PORT ? parseInt(process.env.MSSQL_PORT, 10) : 1433);

  const trustServerCertificate =
    overrides?.trustServerCertificate ??
    process.env.MSSQL_TRUST_SERVER_CERTIFICATE === "true";

  const requestTimeout =
    overrides?.requestTimeout ??
    (process.env.MSSQL_REQUEST_TIMEOUT
      ? parseInt(process.env.MSSQL_REQUEST_TIMEOUT, 10)
      : undefined);

  return {
    host,
    port,
    user,
    password,
    database,
    trustServerCertificate,
    requestTimeout,
  };
}
