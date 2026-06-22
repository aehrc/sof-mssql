/**
 * Server capability probes for integration tests.
 *
 * The native JSON column type is only available on SQL Server 2025 and later.
 * Integration tests that exercise it must skip gracefully on older servers
 * (the CI matrix still runs the suite against 2017/2019/2022), so they probe
 * the live server rather than assuming a version.
 *
 * @author John Grimes
 */

import type { ConnectionPool } from "mssql";

/**
 * Determine whether the connected server supports the native `JSON` column type.
 *
 * The probe creates and drops a temporary table with a `JSON` column in a single
 * batch (so it runs on one pooled connection) and reports success. On a server
 * that does not know the type, the statement fails and the probe returns false.
 *
 * @param pool - An open connection pool.
 * @returns `true` if a `JSON`-typed column can be created, `false` otherwise.
 */
export async function supportsNativeJsonType(
  pool: ConnectionPool,
): Promise<boolean> {
  try {
    await pool
      .request()
      .query(
        "CREATE TABLE #native_json_probe (j JSON NOT NULL); DROP TABLE #native_json_probe;",
      );
    return true;
  } catch {
    return false;
  }
}
