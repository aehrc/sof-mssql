/**
 * Custom Vitest reporter for SQL-on-FHIR test result collection.
 * 
 * Collects test results during Vitest execution and formats them according
 * to the FHIR sql-on-fhir-v2 test report schema. Results are stored globally
 * and can be accessed after test completion for report generation.
 */

import type { Reporter, Task, File } from "vitest";
import { writeFileSync } from "fs";
import type { TestReport, TestReportSuite, TestReportEntry } from "./test-runner.js";

export interface SqlOnFhirReporterOptions {
  /** Path to write the test report JSON file */
  outputPath?: string;
  /** Whether to write the report file automatically after tests complete */
  autoWriteReport?: boolean;
}

/**
 * Custom Vitest reporter that collects SQL-on-FHIR test results.
 */
export class SqlOnFhirReporter implements Reporter {
  private readonly options: SqlOnFhirReporterOptions;
  private testReport: TestReport = {};

  constructor(options: SqlOnFhirReporterOptions = {}) {
    this.options = {
      outputPath: "test-report.json",
      autoWriteReport: true,
      ...options,
    };
  }

  /**
   * Called when all tests have finished running.
   */
  onFinished(files?: File[]): void {
    if (!files) return;

    // Collect results from global storage set by dynamic tests
    if (typeof global !== 'undefined' && (global as any).__TEST_RESULTS__) {
      this.testReport = (global as any).__TEST_RESULTS__;
    }

    // Also collect from Vitest task results as fallback
    this.collectFromVitestTasks(files);

    // Write report file if enabled
    if (this.options.autoWriteReport && this.options.outputPath) {
      this.writeReport(this.options.outputPath);
    }
  }

  /**
   * Get the collected test results.
   */
  getTestReport(): TestReport {
    return this.testReport;
  }

  /**
   * Write the test report to a JSON file.
   */
  writeReport(outputPath: string): void {
    try {
      const reportJson = JSON.stringify(this.testReport, null, 2);
      writeFileSync(outputPath, reportJson, "utf8");
    } catch (error) {
      console.error(`Failed to write test report to ${outputPath}:`, error);
    }
  }

  /**
   * Collect test results from Vitest task results as fallback.
   */
  private collectFromVitestTasks(files: File[]): void {
    for (const file of files) {
      if (!file.tasks) continue;

      for (const task of file.tasks) {
        if (task.type === "suite") {
          const suiteName = task.name;
          const suiteTests = this.collectTestsFromSuite(task);
          
          if (suiteTests.length > 0) {
            this.testReport[suiteName] = {
              tests: suiteTests,
            };
          }
        }
      }
    }
  }

  /**
   * Recursively collect test results from a test suite.
   */
  private collectTestsFromSuite(suite: Task): TestReportEntry[] {
    const tests: TestReportEntry[] = [];

    if (suite.tasks) {
      for (const task of suite.tasks) {
        if (task.type === "test") {
          tests.push({
            name: task.name,
            result: {
              passed: task.result?.state === "pass",
            },
          });
        } else if (task.type === "suite") {
          // Recursively collect from nested suites
          tests.push(...this.collectTestsFromSuite(task));
        }
      }
    }

    return tests;
  }

  /**
   * Clear the collected test results.
   */
  clearResults(): void {
    this.testReport = {};
    if (typeof global !== 'undefined') {
      (global as any).__TEST_RESULTS__ = {};
    }
  }

  // Optional Vitest reporter methods (can be implemented as needed)
  onTaskUpdate?(task: Task): void {
    // Could be used for real-time result collection
  }

  onInit?(ctx: any): void {
    // Clear results when reporter initializes
    this.clearResults();
  }

  onUserConsoleLog?(log: any): void {
    // Pass through console logs
  }

  onWatcherStart?(): void {
    // Called when in watch mode
  }

  onWatcherRerun?(files: string[], trigger?: string): void {
    // Called on file changes in watch mode
    this.clearResults();
  }
}