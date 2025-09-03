/**
 * Example script showing how to run tests programmatically with the TestRunner API.
 * 
 * This demonstrates various ways to configure and execute sql-on-fhir-v2 tests
 * against a SQL Server database.
 */

import { TestRunner, TestRunnerConfig } from '../src/test-runner.js';
import { readFileSync } from 'fs';

// Example 1: Configuration from environment variables (recommended)
const envConfig: TestRunnerConfig = {
  server: process.env.MSSQL_HOST || 'localhost',
  port: parseInt(process.env.MSSQL_PORT || '1433'),
  database: process.env.MSSQL_DATABASE || 'testdb',
  user: process.env.MSSQL_USER || 'sa',
  password: process.env.MSSQL_PASSWORD,
  options: {
    encrypt: process.env.MSSQL_ENCRYPT?.toLowerCase() === 'true',
    trustServerCertificate: process.env.MSSQL_TRUST_CERT?.toLowerCase() !== 'false'
  }
};

// Example 2: Connection string from environment
const connectionStringConfig: TestRunnerConfig = {
  connectionString: process.env.MSSQL_CONNECTION_STRING || 'Server=localhost,1433;Database=testdb;User Id=sa;Password=your_password_here;Encrypt=true;TrustServerCertificate=true;'
};

// Example 3: Custom table configuration from environment
const customTableConfig: TestRunnerConfig = {
  server: process.env.MSSQL_HOST || 'localhost',
  database: process.env.MSSQL_DATABASE || 'testdb', 
  user: process.env.MSSQL_USER || 'testuser',
  password: process.env.MSSQL_PASSWORD,
  tableName: process.env.MSSQL_TABLE || 'my_fhir_data',
  schemaName: process.env.MSSQL_SCHEMA || 'healthcare',
  resourceIdColumn: process.env.MSSQL_ID_COLUMN || 'resource_id',
  resourceJsonColumn: process.env.MSSQL_JSON_COLUMN || 'resource_data'
};

async function runSingleTestFile() {
  console.log('Running single test file...');
  
  try {
    const result = await TestRunner.runTestSuiteFromFile(
      './sqlonfhir/tests/basic.json',
      envConfig
    );
    
    TestRunner.printResults(result);
    
    // Generate test report
    const report = TestRunner.generateTestReport(result);
    await TestRunner.writeTestReport(report, 'single-test-report.json');
    
    console.log(`Test completed: ${result.passedCount}/${result.totalCount} passed`);
  } catch (error) {
    console.error('Test failed:', error);
  }
}

async function runAllTestsInDirectory() {
  console.log('Running all tests in directory...');
  
  try {
    const results = await TestRunner.runTestSuitesFromDirectory(
      './sqlonfhir/tests',
      envConfig
    );
    
    TestRunner.printDirectoryResults(results);
    
    // Generate combined test report
    const report = TestRunner.generateDirectoryTestReport(results);
    await TestRunner.writeTestReport(report, 'directory-test-report.json');
    
    const totalPassed = results.reduce((sum, result) => sum + result.passedCount, 0);
    const totalTests = results.reduce((sum, result) => sum + result.totalCount, 0);
    
    console.log(`All tests completed: ${totalPassed}/${totalTests} passed`);
    
    // Exit with non-zero code if any tests failed
    if (totalPassed !== totalTests) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Tests failed:', error);
    process.exit(1);
  }
}

async function runWithManualConnectionManagement() {
  console.log('Running tests with manual connection management...');
  
  const runner = new TestRunner(envConfig);
  
  try {
    // Connect and validate prerequisites
    await runner.connect();
    await runner.validatePrerequisites();
    
    // Load test suite
    const testSuiteJson = readFileSync('./sqlonfhir/tests/basic.json', 'utf8');
    const testSuite = JSON.parse(testSuiteJson);
    
    // Run tests
    const result = await runner.runTestSuite(testSuite);
    TestRunner.printResults(result);
    
  } catch (error) {
    console.error('Manual test execution failed:', error);
  } finally {
    // Always disconnect
    await runner.disconnect();
  }
}

async function runWithErrorHandling() {
  console.log('Running tests with comprehensive error handling...');
  
  try {
    const result = await TestRunner.runTestSuiteFromFile(
      './sqlonfhir/tests/basic.json',
      envConfig
    );
    
    console.log(`✅ Tests completed successfully: ${result.passedCount}/${result.totalCount} passed`);
    
    // Check for failures
    if (result.passedCount !== result.totalCount) {
      console.log('\n❌ Failed tests:');
      result.results
        .filter(r => !r.passed)
        .forEach(r => {
          console.log(`  - ${r.testCase.title}: ${r.error || 'Result mismatch'}`);
        });
    }
    
  } catch (error: any) {
    if (error.message.includes('Schema') || error.message.includes('permissions')) {
      console.error('❌ Database setup issue:', error.message);
      console.log('\n💡 Try these solutions:');
      console.log('  1. Verify the database and schema exist');
      console.log('  2. Check user permissions for table creation');
      console.log('  3. Ensure SQL Server allows the connection');
    } else if (error.message.includes('Connection')) {
      console.error('❌ Connection issue:', error.message);
      console.log('\n💡 Try these solutions:');
      console.log('  1. Verify server hostname and port');
      console.log('  2. Check username and password');
      console.log('  3. Use --trust-cert for self-signed certificates');
    } else {
      console.error('❌ Unexpected error:', error.message);
    }
  }
}

// Run examples based on command line argument
const command = process.argv[2];

switch (command) {
  case 'single':
    runSingleTestFile();
    break;
  case 'directory':
    runAllTestsInDirectory();
    break;
  case 'manual':
    runWithManualConnectionManagement();
    break;
  case 'errors':
    runWithErrorHandling();
    break;
  default:
    console.log('Usage: npx tsx examples/run-tests.ts <command>');
    console.log('Commands:');
    console.log('  single    - Run a single test file');
    console.log('  directory - Run all tests in a directory');
    console.log('  manual    - Manual connection management example');
    console.log('  errors    - Error handling example');
}