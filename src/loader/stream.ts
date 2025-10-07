/**
 * Streaming NDJSON loader.
 * Loads NDJSON files line-by-line with batched bulk inserts.
 *
 * @author John Grimes
 */

import { createReadStream } from "fs";
import { createInterface } from "readline";
import sql, { type ConnectionPool } from "mssql";
import type { DiscoveredFile, FileLoadResult } from "./types.js";

/**
 * Load a single NDJSON file into the database.
 *
 * @param pool - Database connection pool.
 * @param file - File to load.
 * @param schemaName - Schema name.
 * @param tableName - Name of the table to load into.
 * @param batchSize - Number of rows per batch.
 * @param onProgress - Optional callback for progress updates.
 * @returns Promise that resolves to the load result.
 */
// eslint-disable-next-line max-lines-per-function -- File loading requires streaming and batching logic
export async function loadFile(
  pool: ConnectionPool,
  file: DiscoveredFile,
  schemaName: string,
  tableName: string,
  batchSize: number = 1000,
  onProgress?: (rowsLoaded: number) => void,
): Promise<FileLoadResult> {
  const startTime = Date.now();
  let rowsLoaded = 0;
  const rowsFailed = 0;
  let batch: string[] = [];

  try {
    // Create a readline interface to read the file line by line.
    const fileStream = createReadStream(file.path, { encoding: "utf-8" });
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity, // Treat \r\n as a single line break.
    });

    // Process each line as a raw string.
    for await (const line of rl) {
      // Skip empty lines.
      if (!line.trim()) {
        continue;
      }

      // Add to batch.
      batch.push(line);

      // If batch is full, insert it.
      if (batch.length >= batchSize) {
        await insertBatch(
          pool,
          schemaName,
          tableName,
          file.resourceType,
          batch,
        );
        rowsLoaded += batch.length;
        batch = [];

        // Report progress.
        if (onProgress) {
          onProgress(rowsLoaded);
        }
      }
    }

    // Insert any remaining rows in the final batch.
    if (batch.length > 0) {
      await insertBatch(pool, schemaName, tableName, file.resourceType, batch);
      rowsLoaded += batch.length;

      if (onProgress) {
        onProgress(rowsLoaded);
      }
    }

    return {
      file,
      rowsLoaded,
      rowsFailed,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      file,
      rowsLoaded,
      rowsFailed,
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Insert a batch of rows using bulk insert.
 *
 * @param pool - Database connection pool.
 * @param schemaName - Schema name.
 * @param tableName - Name of the table to insert into.
 * @param resourceType - FHIR resource type.
 * @param lines - Array of JSON lines to insert.
 */
async function insertBatch(
  pool: ConnectionPool,
  schemaName: string,
  tableName: string,
  resourceType: string,
  lines: string[],
): Promise<void> {
  const table = new sql.Table(`[${schemaName}].[${tableName}]`);
  table.columns.add("resource_type", sql.NVarChar(64), { nullable: false });
  table.columns.add("json", sql.NVarChar(sql.MAX), { nullable: false });

  for (const line of lines) {
    table.rows.add(resourceType, line);
  }

  const request = pool.request();
  await request.bulk(table);
}
