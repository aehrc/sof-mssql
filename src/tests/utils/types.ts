/**
 * Type definitions for test reporting.
 *
 * Matches the SQL on FHIR test report schema:
 * https://raw.githubusercontent.com/FHIR/sql-on-fhir-v2/refs/heads/master/test_report/test-report.schema.json
 */

export interface TestReportEntry {
  /** The name/description of the test case. */
  name: string;
  /** The test execution result. */
  result: {
    /** Whether the test passed (true) or failed (false). */
    passed: boolean;
    /** Optional error message if the test failed. */
    error?: string;
    /** Optional additional details about the test result. */
    details?: Record<string, unknown>;
  };
}

export interface TestReportSuite {
  /** Array of test cases within this test suite. */
  tests: TestReportEntry[];
}

export interface TestReport {
  /**
   * Each property represents a test suite file (e.g., 'basic.json', 'common.json').
   * The report should be a flat object where each key represents a test suite file.
   */
  [suiteName: string]: TestReportSuite;
}
