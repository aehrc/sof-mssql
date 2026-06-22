/**
 * Shared harness for database-backed loader integration tests.
 *
 * Encapsulates the connection pool lifecycle, native-JSON capability probe,
 * sample NDJSON generation, and per-test table/temp-directory cleanup so the
 * individual integration test files stay focused on assertions. The native
 * JSON type is only available on SQL Server 2025+, so callers gate JSON-specific
 * cases on isNativeJsonSupported().
 *
 * @author John Grimes
 */

import { randomBytes } from "crypto";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { ConnectionPool } from "mssql";
import {
  closeConnectionPool,
  createConnectionPool,
  getDatabaseConfigFromEnv,
} from "../../loader/connection";
import { loadNdjsonFiles } from "../../loader/index";
import type { DatabaseConfig } from "../../loader/types";
import { supportsNativeJsonType } from "./serverCapabilities";

/** A small, representative set of FHIR resources used by the integration tests. */
export const SAMPLE_PATIENTS = [
  { resourceType: "Patient", id: "p1", active: true },
  { resourceType: "Patient", id: "p2", active: false },
  { resourceType: "Patient", id: "p3", gender: "female" },
];

/** The effective type of a json column read from INFORMATION_SCHEMA. */
export interface JsonColumnType {
  /** The INFORMATION_SCHEMA DATA_TYPE (e.g. `nvarchar` or `json`). */
  dataType: string;
  /** The CHARACTER_MAXIMUM_LENGTH (-1 for MAX, null for the native type). */
  maxLength: number | null;
}

/** Helpers bound to a single connection pool for one integration test file. */
export interface LoaderIntegrationHarness {
  /** Open the pool and probe native-JSON support. Call from beforeAll. */
  connect(): Promise<void>;
  /** Drop created tables, remove temp dirs and close the pool. Call from afterAll. */
  cleanup(): Promise<void>;
  /** Whether the connected server supports the native JSON column type. */
  isNativeJsonSupported(): boolean;
  /** Generate and register a unique, valid table name. */
  makeTableName(): string;
  /**
   * Create a loader-shaped table whose `json` column uses the given SQL type,
   * for exercising the existing-column mismatch safeguard.
   */
  createTableWithJsonColumnType(
    tableName: string,
    jsonColumnType: string,
  ): Promise<void>;
  /** Load the sample NDJSON into a table, returning the rows loaded. */
  loadSample(tableName: string, resourceJsonDataType?: string): Promise<number>;
  /** Read the effective type of a table's json column. */
  getJsonColumnType(tableName: string): Promise<JsonColumnType>;
  /** Count the rows in a table. */
  getRowCount(tableName: string): Promise<number>;
}

/**
 * Create a loader integration harness.
 *
 * @returns A harness whose lifecycle is driven by connect()/cleanup().
 */
export function createLoaderIntegrationHarness(): LoaderIntegrationHarness {
  let pool: ConnectionPool | null = null;
  let databaseConfig: DatabaseConfig | null = null;
  let nativeJsonSupported = false;
  const createdTables: string[] = [];
  const createdDirs: string[] = [];

  function requirePool(): ConnectionPool {
    if (!pool) {
      throw new Error("Harness not connected; call connect() first.");
    }
    return pool;
  }

  function requireConfig(): DatabaseConfig {
    if (!databaseConfig) {
      throw new Error("Harness not connected; call connect() first.");
    }
    return databaseConfig;
  }

  function writeSampleNdjson(): string {
    const dir = mkdtempSync(join(tmpdir(), "sof-loader-it-"));
    createdDirs.push(dir);
    const lines = SAMPLE_PATIENTS.map((r) => JSON.stringify(r)).join("\n");
    writeFileSync(join(dir, "Patient.ndjson"), lines + "\n", "utf-8");
    return dir;
  }

  async function connect(): Promise<void> {
    databaseConfig = getDatabaseConfigFromEnv();
    pool = await createConnectionPool(databaseConfig);
    nativeJsonSupported = await supportsNativeJsonType(pool);
  }

  async function cleanup(): Promise<void> {
    for (const dir of createdDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    if (pool) {
      for (const tableName of createdTables) {
        try {
          await pool
            .request()
            .query(`DROP TABLE IF EXISTS [dbo].[${tableName}]`);
        } catch {
          // Best-effort cleanup; ignore failures.
        }
      }
      await closeConnectionPool(pool);
      pool = null;
    }
  }

  function makeTableName(): string {
    const tableName = `jsontest_${randomBytes(4).toString("hex")}`;
    createdTables.push(tableName);
    return tableName;
  }

  async function createTableWithJsonColumnType(
    tableName: string,
    jsonColumnType: string,
  ): Promise<void> {
    // Mirrors the loader's table shape but with a deliberately chosen json
    // column type so the existing-column mismatch safeguard can be exercised.
    // The type is a test-controlled literal, not external input.
    await requirePool()
      .request()
      .query(
        `CREATE TABLE [dbo].[${tableName}] (
         [id] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
         [resource_type] NVARCHAR(64) NOT NULL,
         [json] ${jsonColumnType} NOT NULL
       )`,
      );
  }

  async function loadSample(
    tableName: string,
    resourceJsonDataType?: string,
  ): Promise<number> {
    const summary = await loadNdjsonFiles({
      directory: writeSampleNdjson(),
      database: requireConfig(),
      tableName,
      resourceJsonDataType,
      quiet: true,
    });
    return summary.rowsLoaded;
  }

  async function getJsonColumnType(tableName: string): Promise<JsonColumnType> {
    const result = await requirePool()
      .request()
      .input("tableName", tableName)
      .query(
        `SELECT DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_NAME = @tableName AND COLUMN_NAME = 'json'`,
      );
    const row = result.recordset[0];
    return { dataType: row.DATA_TYPE, maxLength: row.CHARACTER_MAXIMUM_LENGTH };
  }

  async function getRowCount(tableName: string): Promise<number> {
    const result = await requirePool()
      .request()
      .query(`SELECT COUNT(*) AS n FROM [dbo].[${tableName}]`);
    return result.recordset[0].n;
  }

  return {
    connect,
    cleanup,
    isNativeJsonSupported: () => nativeJsonSupported,
    makeTableName,
    createTableWithJsonColumnType,
    loadSample,
    getJsonColumnType,
    getRowCount,
  };
}
