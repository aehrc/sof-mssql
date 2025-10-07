/**
 * Type definitions for the NDJSON loader.
 *
 * @author John Grimes
 */

/**
 * Database connection configuration.
 */
export interface DatabaseConfig {
  /** Database server hostname or IP address. */
  host: string;
  /** Database server port. */
  port?: number;
  /** Database username. */
  user: string;
  /** Database password. */
  password: string;
  /** Database name. */
  database: string;
  /** Whether to trust the server certificate. */
  trustServerCertificate?: boolean;
}

/**
 * Discovered NDJSON file with metadata.
 */
export interface DiscoveredFile {
  /** Full path to the file. */
  path: string;
  /** FHIR resource type extracted from filename. */
  resourceType: string;
  /** File size in bytes. */
  size: number;
}

/**
 * Options for the NDJSON loader.
 */
export interface LoaderOptions {
  /** Directory containing NDJSON files. */
  directory: string;
  /** Database connection configuration. */
  database: DatabaseConfig;
  /** File naming pattern (default: {ResourceType}.ndjson). */
  pattern?: string;
  /** Filter to specific resource type. */
  resourceType?: string;
  /** Table name for storing resources (default: fhir_resources). */
  tableName?: string;
  /** Schema name (default: dbo). */
  schemaName?: string;
  /** Create table if it doesn't exist. */
  createTable?: boolean;
  /** Truncate table before loading. */
  truncate?: boolean;
  /** Number of rows per batch for bulk insert. */
  batchSize?: number;
  /** Number of files to process in parallel. */
  parallel?: number;
  /** Continue loading other files if one fails. */
  continueOnError?: boolean;
  /** Show what would be loaded without loading. */
  dryRun?: boolean;
  /** Enable verbose logging. */
  verbose?: boolean;
  /** Minimal output. */
  quiet?: boolean;
  /** Show progress bar. */
  progress?: boolean;
}

/**
 * Progress information for a file being loaded.
 */
export interface FileProgress {
  /** File being processed. */
  file: DiscoveredFile;
  /** Number of rows loaded. */
  rowsLoaded: number;
  /** Number of rows that failed to load. */
  rowsFailed: number;
  /** Whether the file has completed loading. */
  completed: boolean;
  /** Error message if the file failed to load. */
  error?: string;
}

/**
 * Overall progress for the loading operation.
 */
export interface LoaderProgress {
  /** Total number of files to process. */
  totalFiles: number;
  /** Number of files completed. */
  filesCompleted: number;
  /** Total rows loaded across all files. */
  totalRowsLoaded: number;
  /** Total rows failed across all files. */
  totalRowsFailed: number;
  /** Progress for each file. */
  fileProgress: Map<string, FileProgress>;
}

/**
 * Summary of the loading operation.
 */
export interface LoaderSummary {
  /** Number of files successfully loaded. */
  filesLoaded: number;
  /** Number of files that failed to load. */
  filesFailed: number;
  /** Total rows loaded. */
  rowsLoaded: number;
  /** Total rows that failed to load. */
  rowsFailed: number;
  /** Duration in milliseconds. */
  durationMs: number;
  /** Errors encountered during loading. */
  errors: Array<{ file: string; error: string }>;
}

/**
 * Result of loading a single file.
 */
export interface FileLoadResult {
  /** File that was loaded. */
  file: DiscoveredFile;
  /** Number of rows successfully loaded. */
  rowsLoaded: number;
  /** Number of rows that failed to load. */
  rowsFailed: number;
  /** Duration in milliseconds. */
  durationMs: number;
  /** Error message if the file failed to load. */
  error?: string;
}
