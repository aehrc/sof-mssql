/**
 * Dynamic Vitest test generator for SQL-on-FHIR test definitions.
 *
 * Creates Vitest test suites dynamically at runtime without generating physical files.
 * Each SQL-on-FHIR JSON test file becomes a describe block with individual it blocks
 * for each test case. Results are collected for report generation.
 */

import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { ViewDefinitionParser } from "../../parser";
import { TestCase, TestSuite } from "../../types";
import {
  cleanupDatabase,
  cleanupTestData,
  setupDatabase,
  setupTestData,
} from "./database.js";
import type { TestReport, TestReportEntry } from "./runner";
import { compareResults, executeViewDefinition } from "./sqlOnFhir";

// Global storage for test results
declare global {
  var __TEST_RESULTS__: TestReport | undefined;
}

/**
 * Dynamic test generator that creates Vitest tests at runtime.
 */
export class DynamicVitestGenerator {
  private testResults: TestReport = {};

  /**
   * Load and generate tests for a single SQL-on-FHIR test file.
   */
  async generateTestsFromFile(filePath: string): Promise<void> {
    const testSuiteJson = readFileSync(filePath, "utf8");
    const testSuite = ViewDefinitionParser.parseTestSuite(testSuiteJson);
    const suiteName = testSuite.title;

    await this.generateTestSuite(testSuite, suiteName);
  }

  /**
   * Load and generate tests for all JSON files in a directory.
   */
  async generateTestsFromDirectory(directoryPath: string): Promise<void> {
    const files = readdirSync(directoryPath)
      .filter((file) => file.endsWith(".json"))
      .map((file) => join(directoryPath, file));

    for (const filePath of files) {
      await this.generateTestsFromFile(filePath);
    }
  }

  /**
   * Generate a Vitest test suite for a SQL-on-FHIR test definition.
   */
  private async generateTestSuite(
    testSuite: TestSuite,
    suiteName: string,
  ): Promise<void> {
    const suiteResults: TestReportEntry[] = [];

    describe(suiteName, () => {
      beforeAll(async () => {
        await setupDatabase();
      });

      afterAll(async () => {
        await cleanupDatabase();

        // Store results for report generation
        if (typeof global !== "undefined") {
          global.__TEST_RESULTS__ = global.__TEST_RESULTS__ || {};
          global.__TEST_RESULTS__[suiteName] = { tests: suiteResults };
        }
      });

      beforeEach(async () => {
        await setupTestData(testSuite.resources);
      });

      afterEach(async () => {
        await cleanupTestData();
      });

      // Generate individual test cases
      for (const testCase of testSuite.tests) {
        this.generateTestCase(testCase, suiteResults);
      }
    });
  }

  /**
   * Generate a single test case within the current describe block.
   */
  private generateTestCase(
    testCase: TestCase,
    suiteResults: TestReportEntry[],
  ): void {
    const testName = testCase.title;

    if (testCase.expectError) {
      it(testName, async () => {
        try {
          await executeViewDefinition(testCase.view);

          // If we get here, the test should have failed but didn't
          suiteResults.push({ name: testName, result: { passed: false } });
          expect.fail("Expected an error but the test passed");
        } catch (error) {
          // Test passed - we expected an error
          suiteResults.push({ name: testName, result: { passed: true } });
        }
      });
    } else {
      it(testName, async () => {
        try {
          const result = await executeViewDefinition(testCase.view);
          const passed = compareResults(
            result.results,
            testCase.expect || [],
            testCase.expectColumns,
            result.columns,
          );

          suiteResults.push({ name: testName, result: { passed } });

          if (!passed) {
            expect.fail(
              `Results don't match. Expected: ${JSON.stringify(testCase.expect)}, Actual: ${JSON.stringify(result.results)}`,
            );
          }

          expect(passed).toBe(true);
        } catch (error) {
          suiteResults.push({ name: testName, result: { passed: false } });
          throw error;
        }
      });
    }
  }

  /**
   * Get the collected test results for report generation.
   */
  getTestResults(): TestReport {
    return global.__TEST_RESULTS__ || {};
  }

  /**
   * Clear test results.
   */
  clearTestResults(): void {
    if (typeof global !== "undefined") {
      global.__TEST_RESULTS__ = {};
    }
  }
}

/**
 * Create and run dynamic tests for SQL-on-FHIR test definitions.
 * This function should be called from a Vitest test file.
 */
export async function createDynamicTests(
  testPath: string,
): Promise<DynamicVitestGenerator> {
  const generator = new DynamicVitestGenerator();

  // Clear any previous results
  generator.clearTestResults();

  // Determine if testPath is a file or directory
  const stat = statSync(testPath);

  if (stat.isDirectory()) {
    await generator.generateTestsFromDirectory(testPath);
  } else if (stat.isFile() && testPath.endsWith(".json")) {
    await generator.generateTestsFromFile(testPath);
  } else {
    throw new Error(
      `Invalid test path: ${testPath}. Must be a JSON file or directory containing JSON files.`,
    );
  }

  return generator;
}
