/**
 * Test context management for parallel test execution.
 *
 * Provides unique test IDs for database isolation during concurrent test runs.
 */

import { randomUUID } from "crypto";

let testIdCounter = 0;

/**
 * Generate a unique test ID for database isolation.
 *
 * The test ID is composed of:
 * - Process ID (to handle multi-process execution)
 * - Timestamp (for temporal uniqueness)
 * - Counter (for uniqueness within same millisecond)
 * - UUID (for guaranteed uniqueness)
 *
 * @returns Unique test identifier
 */
export function generateTestId(): string {
  return `test_${process.pid}_${Date.now()}_${testIdCounter++}_${randomUUID()}`;
}
