/**
 * Vitest setup file for SQL-on-FHIR tests.
 * 
 * This file is run before all tests and sets up any global configuration
 * needed for the SQL-on-FHIR test execution.
 */

// Extend test timeout for database operations if not already set
if (!process.env.VITEST_TIMEOUT) {
  process.env.VITEST_TIMEOUT = "30000";
}

// Ensure we have default database configuration for tests
if (!process.env.MSSQL_HOST) {
  process.env.MSSQL_HOST = "localhost";
}

if (!process.env.MSSQL_PORT) {
  process.env.MSSQL_PORT = "1433";
}

if (!process.env.MSSQL_DATABASE) {
  process.env.MSSQL_DATABASE = "testdb";
}

if (!process.env.MSSQL_USER) {
  process.env.MSSQL_USER = "sa";
}

if (!process.env.MSSQL_TABLE) {
  process.env.MSSQL_TABLE = "fhir_resources";
}

if (!process.env.MSSQL_SCHEMA) {
  process.env.MSSQL_SCHEMA = "dbo";
}

// Set encryption defaults
if (!process.env.MSSQL_ENCRYPT) {
  process.env.MSSQL_ENCRYPT = "true";
}

if (!process.env.MSSQL_TRUST_CERT) {
  process.env.MSSQL_TRUST_CERT = "true";
}

// Clear any existing test results
if (typeof global !== 'undefined') {
  (global as any).__TEST_RESULTS__ = {};
}