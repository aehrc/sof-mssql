/**
 * Type definitions for test reporting.
 */

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
