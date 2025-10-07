/**
 * Main orchestration for NDJSON loader.
 * Coordinates file discovery, table management, and loading operations.
 *
 * @author John Grimes
 */

import type { DiscoveredFile, LoaderOptions, LoaderSummary } from "./types.js";
import {
  closeConnectionPool,
  createConnectionPool,
  testConnection,
} from "./connection.js";
import { discoverFiles, groupFilesByResourceType } from "./discovery.js";
import { ensureTable } from "./tables.js";
import { loadFile } from "./stream.js";
import {
  completeFileProgress,
  createProgressTracker,
  createSummary,
  initializeFileProgress,
  printSimpleProgress,
  printSummary,
  printVerboseProgress,
  updateFileProgress,
} from "./progress.js";

/**
 * Discover and log files to be loaded.
 *
 * @param options - Loader options.
 * @returns Discovered files.
 */
function discoverAndLogFiles(options: LoaderOptions): DiscoveredFile[] {
  if (options.verbose) {
    console.log(`Discovering NDJSON files in ${options.directory}...`);
  }

  const files = discoverFiles(options);

  if (files.length === 0) {
    if (!options.quiet) {
      console.log("No NDJSON files found matching the criteria");
    }
    return [];
  }

  if (!options.quiet) {
    const filesByResourceType = groupFilesByResourceType(files);
    console.log(
      `Found ${files.length} file(s) for ${filesByResourceType.size} resource type(s):\n`,
    );
    for (const [resourceType, resourceFiles] of filesByResourceType) {
      console.log(`  ${resourceType}: ${resourceFiles.length} file(s)`);
    }
    console.log();
  }

  return files;
}

/**
 * Split files into chunks for parallel processing.
 *
 * @param files - Files to chunk.
 * @param chunkSize - Size of each chunk.
 * @returns Array of file chunks.
 */
function chunkFiles(
  files: DiscoveredFile[],
  chunkSize: number,
): DiscoveredFile[][] {
  const chunks: DiscoveredFile[][] = [];
  for (let i = 0; i < files.length; i += chunkSize) {
    chunks.push(files.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Load NDJSON files from a directory into SQL Server.
 *
 * @param options - Loader options.
 * @returns Promise that resolves to the loader summary.
 */
// eslint-disable-next-line max-lines-per-function -- Main orchestration function
export async function loadNdjsonFiles(
  options: LoaderOptions,
): Promise<LoaderSummary> {
  const startTime = Date.now();

  const files = discoverAndLogFiles(options);

  if (files.length === 0) {
    return createSummary(createProgressTracker([]), Date.now() - startTime);
  }

  if (options.dryRun) {
    if (!options.quiet) {
      console.log("Dry run - no data will be loaded\n");
    }
    return createSummary(createProgressTracker(files), Date.now() - startTime);
  }

  if (!options.quiet) {
    console.log(
      `Connecting to SQL Server at ${options.database.host}:${options.database.port ?? 1433}...`,
    );
  }

  const pool = await createConnectionPool(options.database);

  try {
    const connected = await testConnection(pool);
    if (!connected) {
      throw new Error("Failed to connect to database");
    }

    if (!options.quiet) {
      console.log("Connected successfully\n");
    }

    const progress = createProgressTracker(files);
    const schemaName = options.schemaName ?? "dbo";
    const tableName = options.tableName ?? "fhir_resources";

    if (options.createTable !== false) {
      if (options.verbose) {
        console.log(
          `Ensuring table [${schemaName}].[${tableName}] exists${options.truncate ? " (will truncate)" : ""}...`,
        );
      }
      await ensureTable(pool, schemaName, tableName, options.truncate ?? false);
    }

    if (!options.quiet) {
      console.log("Loading files...\n");
    }

    const parallel = options.parallel ?? 4;
    const continueOnError = options.continueOnError ?? false;
    const fileChunks = chunkFiles(files, parallel);

    for (const chunk of fileChunks) {
      const loadPromises = chunk.map(async (file) => {
        initializeFileProgress(progress, file);

        const result = await loadFile(
          pool,
          file,
          schemaName,
          tableName,
          options.batchSize ?? 1000,
          (rowsLoaded) => {
            updateFileProgress(progress, file.path, rowsLoaded);
            if (options.progress && !options.verbose) {
              printSimpleProgress(progress);
            }
          },
        );

        completeFileProgress(progress, result);

        if (options.verbose) {
          printVerboseProgress(progress);
        }

        if (result.error && !continueOnError) {
          throw new Error(`Failed to load ${file.path}: ${result.error}`);
        }

        return result;
      });

      await Promise.all(loadPromises);
    }

    if (options.progress && !options.verbose && !options.quiet) {
      process.stdout.write("\r" + " ".repeat(80) + "\r");
    }

    const summary = createSummary(progress, Date.now() - startTime);

    if (!options.quiet) {
      printSummary(summary);
    }

    return summary;
  } finally {
    await closeConnectionPool(pool);
  }
}

/**
 * Export all loader functionality.
 */
export * from "./types.js";
export * from "./connection.js";
export * from "./discovery.js";
export * from "./tables.js";
export * from "./stream.js";
export * from "./progress.js";
