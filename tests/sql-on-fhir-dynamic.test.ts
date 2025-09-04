/**
 * Dynamic SQL-on-FHIR tests generated from JSON test definitions.
 * 
 * This file serves as the entry point for running SQL-on-FHIR tests using Vitest.
 * It dynamically loads test definitions from JSON files and creates Vitest test suites
 * at runtime, without generating physical test files.
 * 
 * The test path is provided via the SQLONFHIR_TEST_PATH environment variable.
 */

import { createDynamicTests } from "../src/vitest-generator.js";

// Get test path from environment variable
const testPath = process.env.SQLONFHIR_TEST_PATH;

if (!testPath) {
  throw new Error(
    "SQLONFHIR_TEST_PATH environment variable is required. " +
    "Set it to a SQL-on-FHIR JSON test file or directory containing test files."
  );
}

// Create dynamic tests
await createDynamicTests(testPath);