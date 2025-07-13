/**
 * Test runner for sql-on-fhir-v2 test definitions.
 * Connects to SQL Server, loads fixture data, runs tests, and compares results.
 */

import { config as MSSQLConfig, ConnectionPool, Request } from "mssql";
import { SqlOnFhir } from "./index.js";
import { ViewDefinitionParser } from "./parser.js";
import { TestCase, TestSuite } from "./types.js";

export interface TestRunnerConfig {
  connectionString?: string;
  server: string;
  port?: number;
  database: string;
  user?: string;
  password?: string;
  options?: {
    encrypt?: boolean;
    trustServerCertificate?: boolean;
  };
  tableName?: string;
  schemaName?: string;
  resourceIdColumn?: string;
  resourceJsonColumn?: string;
}

export interface TestResult {
  testCase: TestCase;
  passed: boolean;
  error?: string;
  actualResults?: any[];
  expectedResults: any[];
  sql?: string;
}

export interface TestSuiteResult {
  testSuite: TestSuite;
  results: TestResult[];
  passedCount: number;
  totalCount: number;
  duration: number;
}

export class TestRunner {
  private readonly config: TestRunnerConfig;
  private pool?: ConnectionPool;
  private readonly sqlOnFhir: SqlOnFhir;

  constructor(config: TestRunnerConfig) {
    this.config = {
      port: 1433,
      tableName: "fhir_resources",
      schemaName: "dbo",
      resourceIdColumn: "id",
      resourceJsonColumn: "json",
      options: {
        encrypt: true,
        trustServerCertificate: true,
      },
      ...config,
    };

    this.sqlOnFhir = new SqlOnFhir({
      tableName: this.config.tableName,
      schemaName: this.config.schemaName,
      resourceIdColumn: this.config.resourceIdColumn,
      resourceJsonColumn: this.config.resourceJsonColumn,
    });
  }

  /**
   * Connect to the SQL Server database.
   */
  async connect(): Promise<void> {
    const connectionConfig: MSSQLConfig = this.config.connectionString
      ? ({ connectionString: this.config.connectionString } as any)
      : {
          server: this.config.server,
          port: this.config.port,
          database: this.config.database,
          user: this.config.user,
          password: this.config.password,
          options: this.config.options,
        };

    this.pool = new ConnectionPool(connectionConfig);
    await this.pool.connect();
  }

  /**
   * Disconnect from the database.
   */
  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = undefined;
    }
  }

  /**
   * Run a complete test suite.
   */
  async runTestSuite(testSuite: TestSuite): Promise<TestSuiteResult> {
    if (!this.pool) {
      throw new Error("Not connected to database. Call connect() first.");
    }

    const startTime = Date.now();
    const results: TestResult[] = [];

    try {
      // Set up test data
      await this.setupTestData(testSuite.resources);

      // Run each test case
      for (const testCase of testSuite.tests) {
        const result = await this.runTestCase(testCase);
        results.push(result);
      }
    } finally {
      // Clean up test data
      await this.cleanupTestData();
    }

    const endTime = Date.now();
    const passedCount = results.filter((r) => r.passed).length;

    return {
      testSuite,
      results,
      passedCount,
      totalCount: results.length,
      duration: endTime - startTime,
    };
  }

  /**
   * Run a single test case.
   */
  async runTestCase(testCase: TestCase): Promise<TestResult> {
    if (!this.pool) {
      throw new Error("Not connected to database. Call connect() first.");
    }

    try {
      // Validate ViewDefinition first to catch constraint violations
      ViewDefinitionParser.parseViewDefinition(testCase.view);
      
      // Generate SQL query from ViewDefinition
      const transpilationResult = this.sqlOnFhir.transpile(testCase.view);
      const sql = transpilationResult.sql;
      
      // Debug: Log the generated SQL for manual testing
      console.log(`\n=== DEBUG SQL for "${testCase.title}" ===`);
      console.log(sql);
      console.log('=== END DEBUG SQL ===\n');

      // Execute the query
      const request = new Request(this.pool);
      const queryResult = await request.query(sql);
      const actualResults = this.parseJsonStringsInResults(queryResult.recordset);

      // If expectError is true, this test should have failed but didn't
      if (testCase.expectError) {
        return {
          testCase,
          passed: false,
          error: "Expected an error but the test passed",
          expectedResults: [],
          sql,
        };
      }

      // Compare results
      const passed = this.compareResults(
        actualResults,
        testCase.expect,
        testCase.expectColumns,
      );

      return {
        testCase,
        passed,
        actualResults,
        expectedResults: testCase.expect,
        sql,
      };
    } catch (error) {
      // If expectError is true, then an error means the test passed
      if (testCase.expectError) {
        return {
          testCase,
          passed: true,
          error: error instanceof Error ? error.message : String(error),
          expectedResults: [],
        };
      }

      // Otherwise, an error means the test failed
      return {
        testCase,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
        expectedResults: testCase.expect,
      };
    }
  }

  /**
   * Set up test data in the database.
   */
  private async setupTestData(resources: any[]): Promise<void> {
    if (!this.pool) {
      throw new Error("Not connected to database");
    }

    // Create test table if it doesn't exist
    const createTableSql = `
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = '${this.config.tableName}' AND schema_id = SCHEMA_ID('${this.config.schemaName}'))
      BEGIN
        CREATE TABLE [${this.config.schemaName}].[${this.config.tableName}] (
          [${this.config.resourceIdColumn}] NVARCHAR(64) NOT NULL PRIMARY KEY,
          [${this.config.resourceJsonColumn}] NVARCHAR(MAX) NOT NULL
        )
      END
    `;

    const request = new Request(this.pool);
    await request.query(createTableSql);

    // Insert test resources
    for (const resource of resources) {
      const insertSql = `
        INSERT INTO [${this.config.schemaName}].[${this.config.tableName}] 
        ([${this.config.resourceIdColumn}], [${this.config.resourceJsonColumn}])
        VALUES (@id, @json)
      `;

      const insertRequest = new Request(this.pool);
      insertRequest.input("id", resource.id);
      insertRequest.input("json", JSON.stringify(resource));

      await insertRequest.query(insertSql);
    }
  }

  /**
   * Clean up test data from the database.
   */
  private async cleanupTestData(): Promise<void> {
    if (!this.pool) {
      return;
    }

    const deleteSql = `DELETE FROM [${this.config.schemaName}].[${this.config.tableName}]`;
    const request = new Request(this.pool);
    await request.query(deleteSql);
  }

  /**
   * Parse JSON strings in query results into actual arrays/objects.
   */
  private parseJsonStringsInResults(results: any[]): any[] {
    return results.map(row => {
      const parsedRow: any = {};
      for (const [key, value] of Object.entries(row)) {
        if (typeof value === 'string' && this.looksLikeJson(value)) {
          try {
            parsedRow[key] = JSON.parse(value);
          } catch {
            // If parsing fails, keep the original string
            parsedRow[key] = value;
          }
        } else {
          parsedRow[key] = value;
        }
      }
      return parsedRow;
    });
  }

  /**
   * Check if a string looks like JSON (starts with [ or {).
   */
  private looksLikeJson(value: string): boolean {
    const trimmed = value.trim();
    return trimmed.startsWith('[') || trimmed.startsWith('{');
  }

  /**
   * Compare actual and expected results, ignoring row ordering.
   */
  private compareResults(
    actual: any[],
    expected: any[],
    expectedColumns?: string[],
  ): boolean {
    // Check if arrays have the same length
    if (actual.length !== expected.length) {
      return false;
    }

    // If no expected columns specified, compare all properties (as sets)
    if (!expectedColumns) {
      return this.compareResultSets(actual, expected);
    }

    // Compare only specified columns (as sets)
    return this.compareResultSetsWithColumns(actual, expected, expectedColumns);
  }

  /**
   * Compare two result sets ignoring order, using all columns.
   */
  private compareResultSets(actual: any[], expected: any[]): boolean {
    // Create copies to avoid modifying originals
    const actualCopy = [...actual];
    const expectedCopy = [...expected];

    // For each expected row, try to find a matching actual row
    for (const expectedRow of expectedCopy) {
      const matchIndex = actualCopy.findIndex((actualRow) =>
        this.deepEqual(actualRow, expectedRow),
      );
      if (matchIndex === -1) {
        return false; // No matching row found
      }
      // Remove the matched row to handle duplicates correctly
      actualCopy.splice(matchIndex, 1);
    }

    // If all expected rows were matched, actualCopy should be empty
    return actualCopy.length === 0;
  }

  /**
   * Compare two result sets ignoring order, using only specified columns.
   */
  private compareResultSetsWithColumns(
    actual: any[],
    expected: any[],
    columns: string[],
  ): boolean {
    // Create copies to avoid modifying originals
    const actualCopy = [...actual];
    const expectedCopy = [...expected];

    // For each expected row, try to find a matching actual row
    for (const expectedRow of expectedCopy) {
      const matchIndex = actualCopy.findIndex((actualRow) => {
        // Check if all specified columns match
        for (const column of columns) {
          if (!this.isEqual(actualRow[column], expectedRow[column])) {
            return false;
          }
        }
        return true;
      });

      if (matchIndex === -1) {
        return false; // No matching row found
      }
      // Remove the matched row to handle duplicates correctly
      actualCopy.splice(matchIndex, 1);
    }

    // If all expected rows were matched, actualCopy should be empty
    return actualCopy.length === 0;
  }

  /**
   * Deep equality comparison for complex objects.
   */
  private deepEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (a == null || b == null) return a === b;
    if (typeof a !== typeof b) return false;

    if (Array.isArray(a)) {
      if (!Array.isArray(b) || a.length !== b.length) return false;
      return a.every((item, index) => this.deepEqual(item, b[index]));
    }

    if (typeof a === "object") {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      return keysA.every((key) => this.deepEqual(a[key], b[key]));
    }

    return false;
  }

  /**
   * Equality comparison with null handling.
   */
  private isEqual(a: any, b: any): boolean {
    // Handle null/undefined comparison
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;

    // Handle boolean conversion
    if (typeof a === "boolean" && typeof b === "number") {
      return a === Boolean(b);
    }
    if (typeof b === "boolean" && typeof a === "number") {
      return b === Boolean(a);
    }

    return a === b;
  }

  /**
   * Run test suite from a file.
   */
  static async runTestSuiteFromFile(
    filePath: string,
    config: TestRunnerConfig,
  ): Promise<TestSuiteResult> {
    const fs = await import("fs");
    const testSuiteJson = fs.readFileSync(filePath, "utf8");
    const testSuite = ViewDefinitionParser.parseTestSuite(testSuiteJson);

    const runner = new TestRunner(config);
    try {
      await runner.connect();
      return await runner.runTestSuite(testSuite);
    } finally {
      await runner.disconnect();
    }
  }

  /**
   * Run all test suites from JSON files in a directory.
   */
  static async runTestSuitesFromDirectory(
    directoryPath: string,
    config: TestRunnerConfig,
  ): Promise<TestSuiteResult[]> {
    const fs = await import("fs");
    const path = await import("path");

    // Get all JSON files in the directory
    const files = fs
      .readdirSync(directoryPath)
      .filter((file) => file.endsWith(".json"))
      .map((file) => path.join(directoryPath, file));

    if (files.length === 0) {
      throw new Error(
        `No JSON test files found in directory: ${directoryPath}`,
      );
    }

    const results: TestSuiteResult[] = [];

    // Run each test file
    for (const filePath of files) {
      try {
        console.log(`\n--- Running test suite: ${path.basename(filePath)} ---`);
        const result = await this.runTestSuiteFromFile(filePath, config);
        results.push(result);
      } catch (error) {
        console.error(`Error running test file ${filePath}:`, error);
        // Create a failed result for this file
        results.push({
          testSuite: {
            title: path.basename(filePath),
            description: "Failed to load",
            tests: [],
            resources: [],
          },
          results: [],
          passedCount: 0,
          totalCount: 0,
          duration: 0,
        });
      }
    }

    return results;
  }

  /**
   * Print test results to console.
   */
  static printResults(result: TestSuiteResult): void {
    console.log(`\n=== Test Suite: ${result.testSuite.title} ===`);
    console.log(
      `Description: ${result.testSuite.description ?? "No description"}`,
    );
    console.log(`Duration: ${result.duration}ms`);
    console.log(`Results: ${result.passedCount}/${result.totalCount} passed`);

    for (const testResult of result.results) {
      const status = testResult.passed ? "✓" : "✗";
      console.log(`\n${status} ${testResult.testCase.title}`);

      if (!testResult.passed) {
        if (testResult.error) {
          console.log(`  Error: ${testResult.error}`);
        } else {
          console.log(
            `  Expected: ${JSON.stringify(testResult.expectedResults)}`,
          );
          console.log(
            `  Actual:   ${JSON.stringify(testResult.actualResults)}`,
          );
        }

        if (testResult.sql) {
          console.log(`  SQL: ${testResult.sql}`);
        }
      }
    }

    console.log(
      `\n${result.passedCount === result.totalCount ? "All tests passed!" : "Some tests failed."}`,
    );
  }

  /**
   * Print directory test results to console.
   */
  static printDirectoryResults(results: TestSuiteResult[]): void {
    console.log("\n=== Directory Test Results Summary ===");

    const totals = this.calculateTotals(results);
    this.printIndividualResults(results);
    this.printOverallSummary(results.length, totals);
  }

  /**
   * Calculate total passed, total tests, and total duration.
   */
  private static calculateTotals(results: TestSuiteResult[]): {
    totalPassed: number;
    totalTests: number;
    totalDuration: number;
  } {
    let totalPassed = 0;
    let totalTests = 0;
    let totalDuration = 0;

    for (const result of results) {
      totalPassed += result.passedCount;
      totalTests += result.totalCount;
      totalDuration += result.duration;
    }

    return { totalPassed, totalTests, totalDuration };
  }

  /**
   * Print individual test suite results.
   */
  private static printIndividualResults(results: TestSuiteResult[]): void {
    for (const result of results) {
      this.printTestSuiteResult(result);
      this.printFailedTests(result);
    }
  }

  /**
   * Print a single test suite result.
   */
  private static printTestSuiteResult(result: TestSuiteResult): void {
    const status = result.passedCount === result.totalCount ? "✓" : "✗";
    console.log(
      `${status} ${result.testSuite.title}: ${result.passedCount}/${result.totalCount} passed (${result.duration}ms)`,
    );
  }

  /**
   * Print failed tests for a test suite if any exist.
   */
  private static printFailedTests(result: TestSuiteResult): void {
    if (result.passedCount !== result.totalCount) {
      for (const testResult of result.results) {
        if (!testResult.passed) {
          console.log(`  ✗ ${testResult.testCase.title}`);
          if (testResult.error) {
            console.log(`    Error: ${testResult.error}`);
          }
        }
      }
    }
  }

  /**
   * Print overall summary of all test results.
   */
  private static printOverallSummary(
    suiteCount: number,
    totals: { totalPassed: number; totalTests: number; totalDuration: number },
  ): void {
    console.log(`\n=== Overall Summary ===`);
    console.log(`Test Suites: ${suiteCount}`);
    console.log(`Tests: ${totals.totalPassed}/${totals.totalTests} passed`);
    console.log(`Duration: ${totals.totalDuration}ms`);
    console.log(
      `Result: ${totals.totalPassed === totals.totalTests ? "All tests passed!" : "Some tests failed."}`,
    );
  }
}
