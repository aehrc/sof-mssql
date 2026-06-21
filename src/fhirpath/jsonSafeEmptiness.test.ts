/**
 * Regression tests for json-safe array-emptiness checks in the transpiler.
 *
 * The exists()/empty() FHIRPath functions detect an empty collection by
 * comparing the extracted value to the literal '[]'. Over an NVARCHAR(MAX)
 * column JSON_QUERY returns nvarchar, so the comparison works; over SQL Server
 * 2025's native json column JSON_QUERY returns a json-typed value, and
 * comparing json to a varchar literal raises "the data types json and varchar
 * are incompatible". The fix coerces the operand with CAST(... AS NVARCHAR(MAX))
 * before the comparison, which is a no-op on nvarchar sources and makes the SQL
 * valid on json columns (Constitution Principle II; FR-011/SC-002).
 *
 * These tests assert the generated SQL invariant without a database, so they
 * guard the behaviour on every SQL Server version.
 *
 * @author John Grimes
 */

import { describe, expect, it } from "vitest";
import { SqlOnFhir } from "../index";

/**
 * Transpile a single boolean column for the given FHIRPath expression.
 *
 * @param path - The FHIRPath expression to transpile.
 * @returns The generated T-SQL.
 */
function transpilePath(path: string): string {
  const sof = new SqlOnFhir();
  return sof.transpile({
    resource: "Patient",
    status: "active",
    select: [{ column: [{ name: "x", path, type: "boolean" }] }],
  }).sql;
}

/**
 * Report whether the SQL contains a comparison against the literal '[]' that is
 * not coerced to nvarchar first. Such a bare comparison fails on a native json
 * column.
 *
 * @param sql - The generated T-SQL.
 * @returns true if a bare (uncast) '[]' comparison is present.
 */
function hasBareArrayLiteralComparison(sql: string): boolean {
  const comparison = /(?:!=|=)\s*'\[\]'/g;
  let match: RegExpExecArray | null;
  while ((match = comparison.exec(sql)) !== null) {
    const preceding = sql.slice(0, match.index).trimEnd();
    if (!preceding.endsWith("AS NVARCHAR(MAX))")) {
      return true;
    }
  }
  return false;
}

describe("json-safe emptiness checks", () => {
  // Each of these expressions exercises a '[]' comparison in exists()/empty().
  const expressions = [
    "name.exists()",
    "name.given.exists()",
    "name.empty()",
    "name.given.empty()",
  ];

  for (const path of expressions) {
    it(`emits no bare '[]' comparison for ${path}`, () => {
      const sql = transpilePath(path);
      expect(hasBareArrayLiteralComparison(sql)).toBe(false);
    });
  }

  it("wraps the exists() array check in CAST(... AS NVARCHAR(MAX))", () => {
    const sql = transpilePath("name.exists()");
    expect(sql).toContain(
      "CAST(JSON_QUERY(r.json, '$.name') AS NVARCHAR(MAX)) != '[]'",
    );
  });

  it("still guards exists() against a null array with IS NOT NULL", () => {
    // The presence check on the raw value is valid on a json column and must
    // remain so the empty-vs-absent distinction is preserved.
    const sql = transpilePath("name.exists()");
    expect(sql).toContain("JSON_QUERY(r.json, '$.name') IS NOT NULL");
  });
});
