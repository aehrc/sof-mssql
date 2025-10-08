/**
 * Custom Vitest reporter for SQL-on-FHIR test result collection.
 *
 * Collects test results during Vitest execution and formats them according
 * to the FHIR sql-on-fhir-v2 test report schema. Results are stored globally
 * and can be accessed after test completion for report generation.
 */

import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import type { RunnerTask, RunnerTestFile } from "vitest";
import type { Reporter } from "vitest/reporters";
import type { TestReport, TestReportEntry } from "./types";

export interface SqlOnFhirReporterOptions {
  /** Path to write the test report JSON file */
  outputPath?: string;
  /** Whether to write the report file automatically after tests complete */
  autoWriteReport?: boolean;
  /** Whether to print a summary of test results to console */
  printSummary?: boolean;
}

/**
 * Custom Vitest reporter that collects SQL-on-FHIR test results.
 */
class SqlOnFhirReporter implements Reporter {
  private readonly options: SqlOnFhirReporterOptions;
  private testReport: TestReport = {};

  constructor(options: SqlOnFhirReporterOptions = {}) {
    this.options = {
      outputPath: "out/test-report.json",
      autoWriteReport: true,
      printSummary: true,
      ...options,
    };
  }

  /**
   * Called when all tests have finished running.
   * @deprecated use onTestRunEnd instead
   */
  onFinished(
    files?: RunnerTestFile[],
    _errors?: unknown[],
    _coverage?: unknown,
  ): void {
    if (!files) return;

    // Collect results from global storage set by dynamic tests
    if (typeof global !== "undefined" && (global as any).testResults) {
      this.testReport = (global as any).testResults;
    }

    // Also collect from Vitest task results as fallback
    this.collectFromVitestTasks(files);

    // Print summary if enabled
    if (this.options.printSummary) {
      this.printTestSummary(files);
    }

    // Write report file if enabled
    if (this.options.autoWriteReport && this.options.outputPath) {
      this.writeReport(this.options.outputPath);
    }
  }

  /**
   * Print a summary of test results to the console.
   */
  private printTestSummary(files: RunnerTestFile[]): void {
    const stats = this.calculateTestStatistics(files);

    if (stats.skipped > 0) {
      console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("SQL on FHIR Test Summary");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log(`Passed:  ${stats.passed}`);
      console.log(`Failed:  ${stats.failed}`);
      console.log(`Skipped: ${stats.skipped}`);
      console.log(`Total:   ${stats.total}`);

      // Check for test name pattern filtering (used in CI)
      if (process.argv.some((arg) => arg.includes("testNamePattern"))) {
        console.log(
          "\nNote: Tests tagged with #experimental were excluded from this run.",
        );
        console.log(
          "These tests cover features outside the scope of this implementation.",
        );
      }
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    }
  }

  /**
   * Calculate test statistics from Vitest task results.
   */
  private calculateTestStatistics(files: RunnerTestFile[]): {
    passed: number;
    failed: number;
    skipped: number;
    total: number;
  } {
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    for (const file of files) {
      if (!file.tasks) continue;

      for (const task of file.tasks) {
        const stats = this.countTestsInTask(task);
        passed += stats.passed;
        failed += stats.failed;
        skipped += stats.skipped;
      }
    }

    return {
      passed,
      failed,
      skipped,
      total: passed + failed + skipped,
    };
  }

  /**
   * Recursively count test results in a task.
   */
  private countTestsInTask(task: RunnerTask): {
    passed: number;
    failed: number;
    skipped: number;
  } {
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    if (task.type === "test") {
      if (task.mode === "skip" || task.result?.state === "skip") {
        skipped++;
      } else if (task.result?.state === "pass") {
        passed++;
      } else if (task.result?.state === "fail") {
        failed++;
      }
    } else if ("tasks" in task && task.tasks) {
      for (const subtask of task.tasks) {
        const stats = this.countTestsInTask(subtask);
        passed += stats.passed;
        failed += stats.failed;
        skipped += stats.skipped;
      }
    }

    return { passed, failed, skipped };
  }

  /**
   * Write the test report to a JSON file.
   */
  writeReport(outputPath: string): void {
    try {
      // Ensure the output directory exists
      const outputDir = dirname(outputPath);
      mkdirSync(outputDir, { recursive: true });

      const reportJson = JSON.stringify(this.testReport, null, 2);
      writeFileSync(outputPath, reportJson, "utf8");
    } catch (error) {
      console.error(`Failed to write test report to ${outputPath}:`, error);
    }
  }

  /**
   * Collect test results from Vitest task results as fallback.
   * Groups tests by their source file (e.g., "basic.json", "collection.json").
   */
  private collectFromVitestTasks(files: RunnerTestFile[]): void {
    for (const file of files) {
      if (!file.tasks) continue;

      for (const task of file.tasks) {
        if (
          task.type === "suite" &&
          task.name === "SQL on FHIR compliance tests"
        ) {
          this.collectTestsFromParentSuite(task);
        }
      }
    }
  }

  /**
   * Collect tests from the parent "SQL on FHIR compliance tests" suite.
   * Processes child suites and groups tests by filename.
   */
  private collectTestsFromParentSuite(parentSuite: RunnerTask): void {
    if (!("tasks" in parentSuite) || !parentSuite.tasks) return;

    // The parent suite contains child suites for each test file
    // (e.g., "basic", "collection", "foreach")
    for (const childSuite of parentSuite.tasks) {
      if (childSuite.type !== "suite") continue;

      // Derive filename from suite name (e.g., "basic" → "basic.json")
      const fileName = `${childSuite.name}.json`;
      const suiteTests = this.collectTestsFromSuite(childSuite, false);

      if (suiteTests.length > 0) {
        this.testReport[fileName] = {
          tests: suiteTests,
        };
      }
    }
  }

  /**
   * Collect test results from a test suite.
   *
   * Note: This is a fallback mechanism. The primary test result collection
   * happens in the DynamicVitestGenerator which stores results in global.testResults.
   * This method extracts the plain test title from the formatted test name.
   *
   * @param suite The test suite to collect from
   * @param recursive Whether to recursively collect from nested suites
   */
  private collectTestsFromSuite(
    suite: RunnerTask,
    recursive = true,
  ): TestReportEntry[] {
    const tests: TestReportEntry[] = [];

    if ("tasks" in suite && suite.tasks) {
      for (const task of suite.tasks) {
        if (task.type === "test") {
          // Extract plain title from formatted name: "(suite) title #tag" -> "title"
          const plainTitle = this.extractPlainTitle(task.name);
          tests.push({
            name: plainTitle,
            result: {
              passed: task.result?.state === "pass",
            },
          });
        } else if (task.type === "suite" && recursive) {
          // Recursively collect from nested suites only if recursive is true
          tests.push(...this.collectTestsFromSuite(task, recursive));
        }
      }
    }

    return tests;
  }

  /**
   * Extract the plain test title from a formatted test name.
   * Formatted: "(suite) title #tag1 #tag2"
   * Plain: "title"
   */
  private extractPlainTitle(formattedName: string): string {
    // Remove suite prefix: "(suite) " -> ""
    let title = formattedName.replace(/^\([^)]+\)\s+/, "");
    // Remove tags: " #tag1 #tag2" -> ""
    title = title.replace(/\s+#\S+/g, "");
    return title.trim();
  }

  /**
   * Clear the collected test results.
   */
  clearResults(): void {
    this.testReport = {};
    if (typeof global !== "undefined") {
      (global as any).testResults = {};
    }
  }

  // Optional Vitest reporter methods (can be implemented as needed)
  onInit?(_ctx: any): void {
    // Clear results when reporter initializes
    this.clearResults();
  }

  onUserConsoleLog?(_log: any): void {
    // Pass through console logs
  }

  onWatcherStart?(): void {
    // Called when in watch mode
  }

  onWatcherRerun?(_files: string[], _trigger?: string): void {
    // Called on file changes in watch mode
    this.clearResults();
  }
}

// Used in vitest.config.ts as a custom reporter
export default SqlOnFhirReporter;
