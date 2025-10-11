/**
 * Test context management for parallel test execution.
 *
 * Provides unique test IDs for database isolation during concurrent test runs.
 */

import { randomUUID } from "node:crypto";

/**
 * Generate a unique test ID for database isolation.
 *
 * Uses a cryptographically secure V4 UUID which guarantees global uniqueness
 * across processes, machines, and time.
 *
 * @returns Unique test identifier (V4 UUID)
 */
export function generateTestId(): string {
  return randomUUID();
}
