/**
 * Test runner for sql-on-fhir-v2 test definitions.
 * Connects to SQL Server, loads fixture data, runs tests, and compares results.
 */

import { ConnectionPool, config as MSSQLConfig, Request } from 'mssql';
import { TestSuite, TestCase, ViewDefinition } from './types.js';
import { ViewDefinitionParser } from './parser.js';
import { SqlOnFhir } from './index.js';

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
  private config: TestRunnerConfig;
  private pool?: ConnectionPool;
  private sqlOnFhir: SqlOnFhir;

  constructor(config: TestRunnerConfig) {
    this.config = {
      port: 1433,
      tableName: 'fhir_resources',
      schemaName: 'dbo',
      resourceIdColumn: 'id',
      resourceJsonColumn: 'json',
      options: {
        encrypt: true,
        trustServerCertificate: true
      },
      ...config
    };

    this.sqlOnFhir = new SqlOnFhir({
      tableName: this.config.tableName,
      schemaName: this.config.schemaName,
      resourceIdColumn: this.config.resourceIdColumn,
      resourceJsonColumn: this.config.resourceJsonColumn
    });
  }

  /**
   * Connect to the SQL Server database.
   */
  async connect(): Promise<void> {
    const connectionConfig: MSSQLConfig = this.config.connectionString ? 
      { connectionString: this.config.connectionString } as any :
      {
        server: this.config.server,
        port: this.config.port,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
        options: this.config.options
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
      throw new Error('Not connected to database. Call connect() first.');
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
    const passedCount = results.filter(r => r.passed).length;

    return {
      testSuite,
      results,
      passedCount,
      totalCount: results.length,
      duration: endTime - startTime
    };
  }

  /**
   * Run a single test case.
   */
  async runTestCase(testCase: TestCase): Promise<TestResult> {
    if (!this.pool) {
      throw new Error('Not connected to database. Call connect() first.');
    }

    try {
      // Generate SQL query from ViewDefinition
      const transpilationResult = this.sqlOnFhir.transpile(testCase.view);
      const sql = transpilationResult.sql;

      // Execute the query
      const request = new Request(this.pool);
      const queryResult = await request.query(sql);
      const actualResults = queryResult.recordset;

      // Compare results
      const passed = this.compareResults(actualResults, testCase.expect, testCase.expectColumns);

      return {
        testCase,
        passed,
        actualResults,
        expectedResults: testCase.expect,
        sql
      };
    } catch (error) {
      return {
        testCase,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
        expectedResults: testCase.expect
      };
    }
  }

  /**
   * Set up test data in the database.
   */
  private async setupTestData(resources: any[]): Promise<void> {
    if (!this.pool) {
      throw new Error('Not connected to database');
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
      insertRequest.input('id', resource.id);
      insertRequest.input('json', JSON.stringify(resource));
      
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
   * Compare actual and expected results.
   */
  private compareResults(actual: any[], expected: any[], expectedColumns?: string[]): boolean {
    // Check if arrays have the same length
    if (actual.length !== expected.length) {
      return false;
    }

    // If no expected columns specified, compare all properties
    if (!expectedColumns) {
      return this.deepEqual(actual, expected);
    }

    // Compare only specified columns
    for (let i = 0; i < actual.length; i++) {
      const actualRow = actual[i];
      const expectedRow = expected[i];

      for (const column of expectedColumns) {
        if (!this.isEqual(actualRow[column], expectedRow[column])) {
          return false;
        }
      }
    }

    return true;
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

    if (typeof a === 'object') {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      return keysA.every(key => this.deepEqual(a[key], b[key]));
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
    if (typeof a === 'boolean' && typeof b === 'number') {
      return a === Boolean(b);
    }
    if (typeof b === 'boolean' && typeof a === 'number') {
      return b === Boolean(a);
    }

    return a === b;
  }

  /**
   * Run test suite from a file.
   */
  static async runTestSuiteFromFile(filePath: string, config: TestRunnerConfig): Promise<TestSuiteResult> {
    const fs = await import('fs');
    const testSuiteJson = fs.readFileSync(filePath, 'utf8');
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
   * Print test results to console.
   */
  static printResults(result: TestSuiteResult): void {
    console.log(`\n=== Test Suite: ${result.testSuite.title} ===`);
    console.log(`Description: ${result.testSuite.description || 'No description'}`);
    console.log(`Duration: ${result.duration}ms`);
    console.log(`Results: ${result.passedCount}/${result.totalCount} passed`);

    for (const testResult of result.results) {
      const status = testResult.passed ? '✓' : '✗';
      console.log(`\n${status} ${testResult.testCase.title}`);
      
      if (!testResult.passed) {
        if (testResult.error) {
          console.log(`  Error: ${testResult.error}`);
        } else {
          console.log(`  Expected: ${JSON.stringify(testResult.expectedResults)}`);
          console.log(`  Actual:   ${JSON.stringify(testResult.actualResults)}`);
        }
        
        if (testResult.sql) {
          console.log(`  SQL: ${testResult.sql}`);
        }
      }
    }

    console.log(`\n${result.passedCount === result.totalCount ? 'All tests passed!' : 'Some tests failed.'}`);
  }
}