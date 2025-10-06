/**
 * Test runner for sql-on-fhir-v2 test definitions.
 *
 * This class provides functionality to execute SQL on FHIR ViewDefinition tests
 * against a Microsoft SQL Server database. It handles:
 * - Database connection and table setup
 * - Test data loading and cleanup
 * - ViewDefinition transpilation and execution
 * - Result comparison and reporting
 *
 * @example
 * ```typescript
 * const config = {
 *   server: 'localhost',
 *   database: 'testdb',
 *   user: 'sa',
 *   password: 'password'
 * };
 *
 * // Run a single test file
 * const result = await TestRunner.runTestSuiteFromFile('basic.json', config);
 * TestRunner.printResults(result);
 *
 * // Run all tests in a directory
 * const results = await TestRunner.runTestSuitesFromDirectory('./tests', config);
 * TestRunner.printDirectoryResults(results);
 * ```
 */

import { ConnectionPool, config as MSSQLConfig, Request } from "mssql";
import { SqlOnFhir } from "../../index.js";
import { ViewDefinitionParser } from "../../parser";
import { TestCase, TestSuite } from "../../types";

/**
 * Configuration for the TestRunner database connection and table setup.
 *
 * @interface TestRunnerConfig
 */
export interface TestRunnerConfig {
  /** Full connection string (alternative to individual connection properties) */
  connectionString?: string;
  /** SQL Server hostname or IP address */
  server: string;
  /** SQL Server port number (default: 1433) */
  port?: number;
  /** Target database name */
  database: string;
  /** Database username */
  user?: string;
  /** Database password */
  password?: string;
  /** Connection options for encryption and certificate trust */
  options?: {
    /** Enable TLS encryption (default: true) */
    encrypt?: boolean;
    /** Trust server certificate for self-signed certificates (default: true) */
    trustServerCertificate?: boolean;
  };
  /** Name of the FHIR resources table (default: 'fhir_resources') */
  tableName?: string;
  /** Database schema name (default: 'dbo') */
  schemaName?: string;
  /** Column name for resource IDs (default: 'id') */
  resourceIdColumn?: string;
  /** Column name for resource JSON data (default: 'json') */
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

export interface TestReportEntry {
  name: string;
  result: {
    passed: boolean;
  };
}

export interface TestReportSuite {
  tests: TestReportEntry[];
}

export interface TestReport {
  [suiteName: string]: TestReportSuite;
}

/**
 * TestRunner class for executing sql-on-fhir-v2 test suites against SQL Server.
 *
 * This class manages the complete test execution lifecycle:
 * 1. Database connection setup
 * 2. Test table creation and data loading
 * 3. ViewDefinition transpilation and execution
 * 4. Result comparison and reporting
 * 5. Test data cleanup
 *
 * The test runner automatically creates a table with the following structure:
 * ```sql
 * CREATE TABLE [schema].[table_name] (
 *   [id_column] NVARCHAR(64) NOT NULL,
 *   [resource_type] NVARCHAR(64) NOT NULL,
 *   [json_column] NVARCHAR(MAX) NOT NULL,
 *   PRIMARY KEY ([id_column], [resource_type])
 * )
 * ```
 *
 * @class TestRunner
 */
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
   * Validate database prerequisites before running tests.
   *
   * Checks that the target database exists, the schema is accessible, and the user
   * has sufficient permissions to create tables and manipulate data.
   *
   * @throws {Error} If prerequisites are not met with detailed error messages
   */
  async validatePrerequisites(): Promise<void> {
    if (!this.pool) {
      throw new Error("Not connected to database. Call connect() first.");
    }

    // Check if database exists and is accessible
    const request = new Request(this.pool);
    try {
      const dbResult = await request.query(
        "SELECT DB_NAME() as current_db, SUSER_SNAME() as current_user_login",
      );
      if (!dbResult.recordset[0]?.current_db) {
        throw new Error("Unable to access target database");
      }

      const currentDb = dbResult.recordset[0].current_db;
      const currentUser = dbResult.recordset[0].current_user_login;
      console.log(
        `Connected to database '${currentDb}' as user '${currentUser}'`,
      );
    } catch (error) {
      throw new Error(
        `Database access failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Check if schema exists
    const schemaRequest = new Request(this.pool);
    try {
      const schemaResult = await schemaRequest.query(
        `SELECT schema_id FROM sys.schemas WHERE name = '${this.config.schemaName}'`,
      );
      if (schemaResult.recordset.length === 0) {
        throw new Error(
          `Schema '${this.config.schemaName}' does not exist in database. Available schemas: ${await this.listAvailableSchemas()}`,
        );
      }
    } catch (error) {
      throw new Error(
        `Schema validation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Check permissions with multiple methods
    await this.validateTableCreationPermissions();
  }

  /**
   * List available schemas for troubleshooting.
   */
  private async listAvailableSchemas(): Promise<string> {
    if (!this.pool) {
      return "Unable to list schemas";
    }
    try {
      const request = new Request(this.pool);
      const result = await request.query(
        "SELECT name FROM sys.schemas ORDER BY name",
      );
      return result.recordset.map((row) => row.name).join(", ");
    } catch {
      return "Unable to list schemas";
    }
  }

  /**
   * Validate table creation permissions using multiple approaches.
   */
  private async validateTableCreationPermissions(): Promise<void> {
    if (!this.pool) {
      throw new Error("Not connected to database");
    }

    // First check if user is sysadmin (like SA user)
    const sysadminRequest = new Request(this.pool);
    try {
      const sysadminResult = await sysadminRequest.query(
        "SELECT IS_SRVROLEMEMBER('sysadmin') as is_sysadmin",
      );
      const isSysadmin = sysadminResult.recordset[0]?.is_sysadmin === 1;

      if (isSysadmin) {
        console.log(
          "User has sysadmin privileges - skipping detailed permission checks",
        );
        return; // Sysadmin can do everything
      }
    } catch {
      // Continue with other checks if sysadmin check fails
      console.log(
        "Could not verify sysadmin status, continuing with permission checks",
      );
    }

    // Check using HAS_PERMS_BY_NAME function
    const permRequest = new Request(this.pool);
    try {
      const permResult = await permRequest.query(
        `SELECT HAS_PERMS_BY_NAME('${this.config.schemaName}', 'SCHEMA', 'CREATE TABLE') as can_create_table`,
      );

      if (permResult.recordset[0]?.can_create_table === 1) {
        console.log("User has CREATE TABLE permission");
        return; // Permission check passed
      }
    } catch {
      console.log(
        "Permission function check failed, attempting practical test",
      );
    }

    // Fallback: Try to actually create and drop a test table
    await this.testTableCreationCapability();
  }

  /**
   * Test table creation capability by actually creating and dropping a test table.
   */
  private async testTableCreationCapability(): Promise<void> {
    if (!this.pool) {
      throw new Error("Not connected to database");
    }

    const testTableName = `test_permissions_${Date.now()}`;
    const request = new Request(this.pool);

    try {
      // Try to create a test table
      await request.query(`
        CREATE TABLE [${this.config.schemaName}].[${testTableName}] (
          [test_id] NVARCHAR(10) NOT NULL,
          [test_data] NVARCHAR(100)
        )
      `);

      // If successful, clean up the test table
      await request.query(
        `DROP TABLE [${this.config.schemaName}].[${testTableName}]`,
      );

      console.log("Table creation test successful");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Provide specific guidance based on error type
      if (
        errorMessage.includes("permission") ||
        errorMessage.includes("denied")
      ) {
        throw new Error(
          `Insufficient permissions to create tables in schema '${this.config.schemaName}'. ` +
            `Grant CREATE TABLE permission to the user or use a user with sysadmin privileges.`,
        );
      } else if (
        errorMessage.includes("schema") ||
        errorMessage.includes("Invalid object")
      ) {
        throw new Error(
          `Schema '${this.config.schemaName}' is not accessible. ` +
            `Verify the schema exists and the user has access to it.`,
        );
      } else {
        throw new Error(`Table creation test failed: ${errorMessage}`);
      }
    }
  }

  /**
   * Connect to the SQL Server database.
   *
   * Uses either the provided connection string or builds one from individual
   * connection parameters. Establishes a connection pool for efficient query execution.
   *
   * @throws {Error} If connection fails due to network, authentication, or configuration issues
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

    console.log(`\n--- Starting test suite: ${testSuite.title} ---`);
    console.log(`Description: ${testSuite.description ?? "No description"}`);
    console.log(`Tests to run: ${testSuite.tests.length}`);
    console.log(`Test resources: ${testSuite.resources.length}`);

    const startTime = Date.now();
    const results: TestResult[] = [];

    try {
      // Ensure the table exists
      await this.createTableIfNotExists();

      // Set up test data
      await this.setupTestData(testSuite.resources);

      // Step 4: Run each test case
      console.log(`\nRunning ${testSuite.tests.length} test cases...`);
      for (const testCase of testSuite.tests) {
        console.log(`  Running test: ${testCase.title}`);
        const result = await this.runTestCase(testCase);
        results.push(result);
        const status = result.passed ? "✓" : "✗";
        console.log(
          `  ${status} ${testCase.title}: ${result.passed ? "PASSED" : "FAILED"}`,
        );

        if (!result.passed && result.error) {
          console.log(`    Error: ${result.error}`);
        }
      }
    } finally {
      // Clean up test data
      console.log("\nCleaning up test data...");
      await this.cleanupTestData();
    }

    const endTime = Date.now();
    const passedCount = results.filter((r) => r.passed).length;

    console.log(
      `\n--- Test suite completed: ${passedCount}/${results.length} tests passed ---`,
    );

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

      // Execute the query
      const request = new Request(this.pool);
      const queryResult = await request.query(sql);
      const actualResults = this.parseJsonStringsInResults(
        queryResult.recordset,
      );

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
   * Create the FHIR resources table if it doesn't exist.
   *
   * @private
   */
  private async createTableIfNotExists(): Promise<void> {
    if (!this.pool) {
      throw new Error("Not connected to database");
    }

    const tableName = `[${this.config.schemaName}].[${this.config.tableName}]`;

    try {
      // Check if table exists
      const checkTableSql = `
        SELECT COUNT(*) as table_count 
        FROM sys.tables t 
        JOIN sys.schemas s ON t.schema_id = s.schema_id 
        WHERE t.name = '${this.config.tableName}' AND s.name = '${this.config.schemaName}'
      `;

      const checkRequest = new Request(this.pool);
      const checkResult = await checkRequest.query(checkTableSql);
      const tableExists = checkResult.recordset[0]?.table_count > 0;

      if (tableExists) {
        console.log(`Table ${tableName} already exists`);
        return;
      }

      // Create table
      console.log(`Creating table ${tableName}...`);
      const createTableSql = `
        CREATE TABLE ${tableName} (
          [${this.config.resourceIdColumn}] NVARCHAR(64) NOT NULL,
          [resource_type] NVARCHAR(64) NOT NULL,
          [${this.config.resourceJsonColumn}] NVARCHAR(MAX) NOT NULL,
          PRIMARY KEY ([${this.config.resourceIdColumn}], [resource_type])
        )
      `;

      const createRequest = new Request(this.pool);
      await createRequest.query(createTableSql);
      console.log(`✓ Successfully created table ${tableName}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Failed to create table ${tableName}:`, errorMessage);
      throw new Error(`Table creation failed: ${errorMessage}`);
    }
  }

  /**
   * Set up test data in the database.
   *
   * Inserts all test resources from the test suite. The table must already exist.
   *
   * @param resources - Array of FHIR resources to insert as test data
   * @throws {Error} If data insertion fails
   * @private
   */
  private async setupTestData(resources: any[]): Promise<void> {
    if (!this.pool) {
      throw new Error("Not connected to database");
    }

    console.log(`Inserting ${resources.length} test resources...`);

    // Insert test resources
    for (const resource of resources) {
      try {
        const insertSql = `
          INSERT INTO [${this.config.schemaName}].[${this.config.tableName}] 
          ([${this.config.resourceIdColumn}], [resource_type], [${this.config.resourceJsonColumn}])
          VALUES (@id, @resource_type, @json)
        `;

        const insertRequest = new Request(this.pool);
        insertRequest.input("id", resource.id);
        insertRequest.input("resource_type", resource.resourceType);
        insertRequest.input("json", JSON.stringify(resource));

        await insertRequest.query(insertSql);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `Failed to insert resource ${resource.id}:`,
          errorMessage,
        );
        throw new Error(`Resource insertion failed: ${errorMessage}`);
      }
    }

    console.log(`✓ Successfully inserted ${resources.length} test resources`);
  }

  /**
   * Clean up test data from the database.
   *
   * Only cleans data if the table exists. Silently succeeds if table doesn't exist.
   *
   * @private
   */
  private async cleanupTestData(): Promise<void> {
    if (!this.pool) {
      return;
    }

    const tableName = `[${this.config.schemaName}].[${this.config.tableName}]`;

    try {
      // Check if table exists first
      const checkTableSql = `
        SELECT COUNT(*) as table_count 
        FROM sys.tables t 
        JOIN sys.schemas s ON t.schema_id = s.schema_id 
        WHERE t.name = '${this.config.tableName}' AND s.name = '${this.config.schemaName}'
      `;

      const checkRequest = new Request(this.pool);
      const checkResult = await checkRequest.query(checkTableSql);
      const tableExists = checkResult.recordset[0]?.table_count > 0;

      if (!tableExists) {
        console.log(`Table ${tableName} does not exist, skipping cleanup`);
        return;
      }

      // Use TRUNCATE for faster cleanup and to reset any identity columns
      // If TRUNCATE fails due to foreign keys, fall back to DELETE
      try {
        const truncateRequest = new Request(this.pool);
        const truncateSql = `TRUNCATE TABLE ${tableName}`;
        await truncateRequest.query(truncateSql);
        console.log(`✓ Cleaned up data from ${tableName} using TRUNCATE`);
      } catch {
        // Fall back to DELETE if TRUNCATE fails
        console.log(`TRUNCATE failed, falling back to DELETE`);
        const deleteRequest = new Request(this.pool);
        const deleteSql = `DELETE FROM ${tableName}`;
        await deleteRequest.query(deleteSql);
        console.log(`✓ Cleaned up data from ${tableName} using DELETE`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `Warning: Failed to clean up test data from ${tableName}:`,
        errorMessage,
      );
      // Don't throw error for cleanup failures - just log the warning
    }
  }

  /**
   * Parse JSON strings in query results into actual arrays/objects.
   */
  private parseJsonStringsInResults(results: any[]): any[] {
    return results.map((row) => {
      const parsedRow: any = {};
      for (const [key, value] of Object.entries(row)) {
        if (typeof value === "string" && this.looksLikeJson(value)) {
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
    return trimmed.startsWith("[") || trimmed.startsWith("{");
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
    if (this.isNullOrUndefined(a) || this.isNullOrUndefined(b)) return a === b;
    if (typeof a !== typeof b) return false;

    if (Array.isArray(a)) {
      return this.compareArraysDeep(a, b);
    }

    if (typeof a === "object") {
      return this.compareObjectsDeep(a, b);
    }

    return false;
  }

  /**
   * Check if value is null or undefined.
   */
  private isNullOrUndefined(value: any): boolean {
    return value === null || value === undefined;
  }

  /**
   * Compare two arrays element by element.
   */
  private compareArraysDeep(a: any[], b: any): boolean {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => this.deepEqual(item, b[index]));
  }

  /**
   * Compare two objects key by key.
   */
  private compareObjectsDeep(a: any, b: any): boolean {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) => this.deepEqual(a[key], b[key]));
  }

  /**
   * Equality comparison with null handling.
   */
  private isEqual(a: any, b: any): boolean {
    if (this.bothNullOrUndefined(a, b)) return true;
    if (this.isNullOrUndefined(a) || this.isNullOrUndefined(b)) return false;

    if (this.isBooleanNumberPair(a, b)) {
      return this.compareBooleanNumber(a, b);
    }

    return a === b;
  }

  /**
   * Check if both values are null or undefined.
   */
  private bothNullOrUndefined(a: any, b: any): boolean {
    return this.isNullOrUndefined(a) && this.isNullOrUndefined(b);
  }

  /**
   * Check if values are a boolean-number pair.
   */
  private isBooleanNumberPair(a: any, b: any): boolean {
    return (
      (typeof a === "boolean" && typeof b === "number") ||
      (typeof b === "boolean" && typeof a === "number")
    );
  }

  /**
   * Compare boolean and number values.
   */
  private compareBooleanNumber(a: any, b: any): boolean {
    if (typeof a === "boolean" && typeof b === "number") {
      return a === Boolean(b);
    }
    if (typeof b === "boolean" && typeof a === "number") {
      return b === Boolean(a);
    }
    return false;
  }

  /**
   * Run test suite from a file.
   *
   * Loads a test suite JSON file, connects to the database, validates prerequisites,
   * and executes all tests. Automatically handles connection management and cleanup.
   *
   * @param filePath - Path to the JSON test suite file
   * @param config - Database connection and table configuration
   * @param skipPrerequisiteValidation - Skip prerequisite validation (used when already validated)
   * @returns Promise resolving to test suite results
   * @throws {Error} If file loading, database connection, prerequisites, or test execution fails
   *
   * @example
   * ```typescript
   * const config = {
   *   server: 'localhost',
   *   database: 'testdb',
   *   user: 'sa',
   *   password: 'password'
   * };
   *
   * const result = await TestRunner.runTestSuiteFromFile('basic.json', config);
   * console.log(`${result.passedCount}/${result.totalCount} tests passed`);
   * ```
   */
  static async runTestSuiteFromFile(
    filePath: string,
    config: TestRunnerConfig,
    skipPrerequisiteValidation: boolean = false,
  ): Promise<TestSuiteResult> {
    const fs = await import("fs");
    const testSuiteJson = fs.readFileSync(filePath, "utf8");
    const testSuite = ViewDefinitionParser.parseTestSuite(testSuiteJson);

    const runner = new TestRunner(config);
    try {
      await runner.connect();
      if (!skipPrerequisiteValidation) {
        await runner.validatePrerequisites();
      }
      return await runner.runTestSuite(testSuite);
    } finally {
      await runner.disconnect();
    }
  }

  /**
   * Run all test suites from JSON files in a directory.
   *
   * Validates prerequisites once before running any tests. If prerequisites fail,
   * the entire test run is aborted immediately. Uses a single database connection
   * for all test files and ensures proper cleanup between files to avoid duplicate
   * key conflicts.
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

    // Create a single runner instance for all test files
    const runner = new TestRunner(config);
    const results: TestSuiteResult[] = [];

    try {
      // Connect and validate prerequisites once
      console.log("Validating database prerequisites...");
      await runner.connect();
      await runner.validatePrerequisites();
      console.log("✓ Prerequisites validation passed\n");

      // Create table once upfront
      await runner.createTableIfNotExists();

      // Run each test file using the same connection
      for (const filePath of files) {
        try {
          // Load test suite from file
          const testSuiteJson = fs.readFileSync(filePath, "utf8");
          const testSuite = ViewDefinitionParser.parseTestSuite(testSuiteJson);

          // Run the test suite with the shared connection
          const result = await runner.runTestSuite(testSuite);
          results.push(result);
        } catch (error) {
          console.error(`Error running test file ${filePath}:`, error);
          // Create a failed result for this file (not prerequisite failure)
          results.push({
            testSuite: {
              title: path.basename(filePath),
              description: "Test execution failed",
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
    } catch (error) {
      // Prerequisites failed - abort immediately
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `Prerequisites validation failed: ${errorMessage}\n\n` +
          `Please fix the following issues before running tests:\n` +
          `1. Ensure the database exists and is accessible\n` +
          `2. Verify the schema exists (default: 'dbo')\n` +
          `3. Confirm the user has CREATE TABLE permissions\n` +
          `4. Check database connection settings\n\n` +
          `For troubleshooting help, see: README.md#troubleshooting`,
      );
    } finally {
      // Always disconnect
      await runner.disconnect();
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
   * Generate a test report for a single test suite result.
   */
  static generateTestReport(result: TestSuiteResult): TestReport {
    const suiteName = result.testSuite.title;
    const tests: TestReportEntry[] = result.results.map((testResult) => ({
      name: testResult.testCase.title,
      result: {
        passed: testResult.passed,
      },
    }));

    return {
      [suiteName]: {
        tests,
      },
    };
  }

  /**
   * Generate a test report for multiple test suite results.
   */
  static generateDirectoryTestReport(results: TestSuiteResult[]): TestReport {
    const report: TestReport = {};

    for (const result of results) {
      const suiteName = result.testSuite.title;
      const tests: TestReportEntry[] = result.results.map((testResult) => ({
        name: testResult.testCase.title,
        result: {
          passed: testResult.passed,
        },
      }));

      report[suiteName] = {
        tests,
      };
    }

    return report;
  }

  /**
   * Write a test report to a file.
   */
  static async writeTestReport(
    report: TestReport,
    filePath: string,
  ): Promise<void> {
    const fs = await import("fs");
    const reportJson = JSON.stringify(report, null, 2);
    fs.writeFileSync(filePath, reportJson, "utf8");
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
