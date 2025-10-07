/**
 * Progress tracking for NDJSON loader.
 * Provides real-time progress updates and statistics.
 *
 * @author John Grimes
 */

import type {
  DiscoveredFile,
  FileLoadResult,
  FileProgress,
  LoaderProgress,
  LoaderSummary,
} from "./types.js";

/**
 * Create a new progress tracker.
 *
 * @param files - Array of files to track.
 * @returns New progress tracker.
 */
export function createProgressTracker(files: DiscoveredFile[]): LoaderProgress {
  return {
    totalFiles: files.length,
    filesCompleted: 0,
    totalRowsLoaded: 0,
    totalRowsFailed: 0,
    fileProgress: new Map<string, FileProgress>(),
  };
}

/**
 * Initialize progress for a file.
 *
 * @param progress - Progress tracker.
 * @param file - File to initialize.
 */
export function initializeFileProgress(
  progress: LoaderProgress,
  file: DiscoveredFile,
): void {
  progress.fileProgress.set(file.path, {
    file,
    rowsLoaded: 0,
    rowsFailed: 0,
    completed: false,
  });
}

/**
 * Update progress for a file.
 *
 * @param progress - Progress tracker.
 * @param filePath - Path to the file.
 * @param rowsLoaded - Number of rows loaded.
 */
export function updateFileProgress(
  progress: LoaderProgress,
  filePath: string,
  rowsLoaded: number,
): void {
  const fileProgress = progress.fileProgress.get(filePath);
  if (fileProgress) {
    fileProgress.rowsLoaded = rowsLoaded;
  }
}

/**
 * Mark a file as completed.
 *
 * @param progress - Progress tracker.
 * @param result - File load result.
 */
export function completeFileProgress(
  progress: LoaderProgress,
  result: FileLoadResult,
): void {
  const fileProgress = progress.fileProgress.get(result.file.path);
  if (fileProgress) {
    fileProgress.rowsLoaded = result.rowsLoaded;
    fileProgress.rowsFailed = result.rowsFailed;
    fileProgress.completed = true;
    fileProgress.error = result.error;

    progress.filesCompleted++;
    progress.totalRowsLoaded += result.rowsLoaded;
    progress.totalRowsFailed += result.rowsFailed;
  }
}

/**
 * Format progress as a status string.
 *
 * @param progress - Progress tracker.
 * @returns Formatted status string.
 */
export function formatProgressStatus(progress: LoaderProgress): string {
  const percentage = (
    (progress.filesCompleted / progress.totalFiles) *
    100
  ).toFixed(0);
  return `[${progress.filesCompleted}/${progress.totalFiles} files (${percentage}%)] ${progress.totalRowsLoaded} rows loaded`;
}

/**
 * Print verbose progress to console.
 *
 * @param progress - Progress tracker.
 */
export function printVerboseProgress(progress: LoaderProgress): void {
  console.log(formatProgressStatus(progress));
  for (const [, fileProgress] of progress.fileProgress) {
    if (fileProgress.completed) {
      const status = fileProgress.error ? "✗ FAILED" : "✓ COMPLETE";
      const rows = `${fileProgress.rowsLoaded} rows`;
      const failed =
        fileProgress.rowsFailed > 0
          ? ` (${fileProgress.rowsFailed} failed)`
          : "";
      console.log(
        `  ${status} ${fileProgress.file.resourceType}: ${rows}${failed}`,
      );
      if (fileProgress.error) {
        console.log(`    Error: ${fileProgress.error}`);
      }
    }
  }
}

/**
 * Print simple progress line to console (can be overwritten).
 *
 * @param progress - Progress tracker.
 */
export function printSimpleProgress(progress: LoaderProgress): void {
  process.stdout.write(`\r${formatProgressStatus(progress)}`);
}

/**
 * Create a summary of the loading operation.
 *
 * @param progress - Progress tracker.
 * @param durationMs - Duration in milliseconds.
 * @returns Loader summary.
 */
export function createSummary(
  progress: LoaderProgress,
  durationMs: number,
): LoaderSummary {
  const errors: Array<{ file: string; error: string }> = [];
  let filesLoaded = 0;
  let filesFailed = 0;

  for (const [, fileProgress] of progress.fileProgress) {
    if (fileProgress.error) {
      filesFailed++;
      errors.push({ file: fileProgress.file.path, error: fileProgress.error });
    } else if (fileProgress.completed) {
      filesLoaded++;
    }
  }

  return {
    filesLoaded,
    filesFailed,
    rowsLoaded: progress.totalRowsLoaded,
    rowsFailed: progress.totalRowsFailed,
    durationMs,
    errors,
  };
}

/**
 * Print a summary of the loading operation.
 *
 * @param summary - Loader summary.
 */
export function printSummary(summary: LoaderSummary): void {
  console.log("\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("NDJSON Loader Summary");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Files loaded:   ${summary.filesLoaded}`);
  console.log(`Files failed:   ${summary.filesFailed}`);
  console.log(`Rows loaded:    ${summary.rowsLoaded}`);
  console.log(`Rows failed:    ${summary.rowsFailed}`);
  console.log(`Duration:       ${formatDuration(summary.durationMs)}`);
  console.log(
    `Throughput:     ${formatThroughput(summary.rowsLoaded, summary.durationMs)} rows/sec`,
  );

  if (summary.errors.length > 0) {
    console.log("\nErrors:");
    for (const error of summary.errors) {
      console.log(`  ${error.file}: ${error.error}`);
    }
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

/**
 * Format duration in human-readable format.
 *
 * @param ms - Duration in milliseconds.
 * @returns Formatted duration string.
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else if (seconds > 0) {
    return `${seconds}s`;
  } else {
    return `${ms}ms`;
  }
}

/**
 * Format throughput in rows per second.
 *
 * @param rows - Number of rows.
 * @param ms - Duration in milliseconds.
 * @returns Formatted throughput string.
 */
function formatThroughput(rows: number, ms: number): string {
  if (ms === 0) return "0";
  const rowsPerSec = (rows / ms) * 1000;
  return rowsPerSec.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
