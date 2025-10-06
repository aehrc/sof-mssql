/**
 * Dynamic Vitest test generator for SQL-on-FHIR test definitions.
 *
 * Creates Vitest test suites dynamically at runtime without generating physical files.
 * Each SQL-on-FHIR JSON test file becomes a describe block with individual it blocks
 * for each test case. Results are collected for report generation.
 */

import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
import { generateTestId } from "./testContext.js";

// Global storage for test results
// Note: Must use 'var' in ambient global declarations
declare global {
  // Used to store test results across test suite executions
  var testResults: TestReport | undefined;
}

/**
 * Dynamic test generator that creates Vitest tests at runtime.
 */
export class DynamicVitestGenerator {
  /**
   * Load and generate tests for a single SQL-on-FHIR test file.
   */
  generateTestsFromFile(filePath: string): void {
    const testSuiteJson = readFileSync(filePath, "utf8");
    const testSuite = ViewDefinitionParser.parseTestSuite(testSuiteJson);
    const suiteName = testSuite.title;

    this.generateTestSuite(testSuite, suiteName);
  }

  /**
   * Load and generate tests for all JSON files in a directory.
   */
  generateTestsFromDirectory(directoryPath: string): void {
    const files = readdirSync(directoryPath)
      .filter((file) => file.endsWith(".json"))
      .map((file) => join(directoryPath, file));

    for (const filePath of files) {
      this.generateTestsFromFile(filePath);
    }
  }

  /**
   * Generate a Vitest test suite for a SQL-on-FHIR test definition.
   */
  private generateTestSuite(testSuite: TestSuite, suiteName: string): void {
    const suiteResults: TestReportEntry[] = [];

    describe(suiteName, () => {
      beforeAll(async () => {
        await setupDatabase();
      });

      afterAll(async () => {
        await cleanupDatabase();

        // Store results for report generation
        if (typeof global !== "undefined") {
          global.testResults = global.testResults ?? {};
          global.testResults[suiteName] = { tests: suiteResults };
        }
      });

      // Note: beforeEach/afterEach are handled per-test for parallel execution

      // Generate individual test cases
      for (const testCase of testSuite.tests) {
        this.generateTestCase(testCase, suiteResults, suiteName, testSuite);
      }
    });
  }

  /**
   * Generate a single test case within the current describe block.
   */
  private generateTestCase(
    testCase: TestCase,
    suiteResults: TestReportEntry[],
    suiteName: string,
    testSuite: TestSuite,
  ): void {
    const testName = this.buildTestName(suiteName, testCase);

    if (testCase.expectError) {
      this.generateErrorTest(testName, testCase, suiteResults, testSuite);
    } else {
      this.generateSuccessTest(testName, testCase, suiteResults, testSuite);
    }
  }

  /**
   * Build hierarchical test name with suite prefix and optional tags.
   */
  private buildTestName(suiteName: string, testCase: TestCase): string {
    const formatTag = (tag: string): string => `#${tag}`;
    const tags = testCase.tags
      ? ` ${testCase.tags.map(formatTag).join(" ")}`
      : "";
    return `(${suiteName}) ${testCase.title}${tags}`;
  }

  /**
   * Generate a test that expects an error.
   */
  private generateErrorTest(
    testName: string,
    testCase: TestCase,
    suiteResults: TestReportEntry[],
    testSuite: TestSuite,
  ): void {
    it.concurrent(testName, async () => {
      const testId = generateTestId();
      try {
        await setupTestData(testSuite.resources, testId);
        await executeViewDefinition(testCase.view, testId);

        // If we get here, the test should have failed but didn't
        suiteResults.push({ name: testName, result: { passed: false } });
        expect.fail("Expected an error but the test passed");
      } catch {
        // Test passed - we expected an error
        suiteResults.push({ name: testName, result: { passed: true } });
      } finally {
        await cleanupTestData(testId);
      }
    });
  }

  /**
   * Generate a test that expects successful execution.
   */
  private generateSuccessTest(
    testName: string,
    testCase: TestCase,
    suiteResults: TestReportEntry[],
    testSuite: TestSuite,
  ): void {
    it.concurrent(testName, async () => {
      const testId = generateTestId();
      try {
        await setupTestData(testSuite.resources, testId);
        const result = await executeViewDefinition(testCase.view, testId);
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
      } finally {
        await cleanupTestData(testId);
      }
    });
  }

  /**
   * Clear test results.
   */
  clearTestResults(): void {
    if (typeof global !== "undefined") {
      global.testResults = {};
    }
  }
}

/**
 * Create and run dynamic tests for SQL-on-FHIR test definitions.
 * This function should be called from a Vitest test file.
 */
export function createDynamicTests(testPath: string): DynamicVitestGenerator {
  const generator = new DynamicVitestGenerator();

  // Clear any previous results
  generator.clearTestResults();

  // Determine if testPath is a file or directory
  const stat = statSync(testPath);

  if (stat.isDirectory()) {
    generator.generateTestsFromDirectory(testPath);
  } else if (stat.isFile() && testPath.endsWith(".json")) {
    generator.generateTestsFromFile(testPath);
  } else {
    throw new Error(
      `Invalid test path: ${testPath}. Must be a JSON file or directory containing JSON files.`,
    );
  }

  return generator;
}
