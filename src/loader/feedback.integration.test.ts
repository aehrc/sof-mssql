/**
 * Integration tests for misconfiguration feedback (US4).
 *
 * Covers: invalid values rejected before any connection is opened (FR-003,
 * runs without a database); an existing-table type mismatch emitting a warning
 * and leaving the table unaltered (FR-008, runs on any server); and the SQL
 * Server "unsupported type" error being surfaced rather than swallowed when
 * JSON is requested on a server that does not support it (FR-009, runs only on
 * pre-2025 servers).
 *
 * @author John Grimes
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadNdjsonFiles } from "./index";
import { createLoaderIntegrationHarness } from "../tests/utils/loaderIntegration";

const harness = createLoaderIntegrationHarness();

beforeAll(() => harness.connect());
afterAll(() => harness.cleanup());

describe("invalid resourceJsonDataType (US4, no database required)", () => {
  it("throws before opening a connection", async () => {
    // The database host is unroutable. If validation did not run first, the
    // call would fail with a connection error; instead it must fail with the
    // validation error, proving no connection was attempted (FR-003).
    await expect(
      loadNdjsonFiles({
        directory: "/nonexistent-directory",
        database: {
          host: "203.0.113.1",
          user: "unused",
          password: "unused",
          database: "unused",
        },
        resourceJsonDataType: "TEXT",
      }),
    ).rejects.toThrow(/Invalid resource JSON data type.*TEXT/s);
  });
});

describe("existing-table type mismatch (US4)", () => {
  it("warns naming both types and does not alter the existing table", async () => {
    // First load creates the table as the default NVARCHAR(MAX).
    const tableName = harness.makeTableName();
    await harness.loadSample(tableName);

    // Second load requests JSON against the now-existing NVARCHAR(MAX) table.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    let warnings: string[] = [];
    try {
      await harness.loadSample(tableName, "JSON");
      warnings = warnSpy.mock.calls.map((call) => call.join(" "));
    } finally {
      warnSpy.mockRestore();
    }

    // A warning naming both the existing and requested types must be emitted.
    const mismatchWarning = warnings.find(
      (w) =>
        w.includes("NVARCHAR(MAX)") &&
        w.includes("JSON") &&
        w.includes(tableName),
    );
    expect(mismatchWarning).toBeDefined();

    // The table must be left unaltered (still NVARCHAR(MAX)).
    const columnType = await harness.getJsonColumnType(tableName);
    expect(columnType.dataType).toBe("nvarchar");
    expect(columnType.maxLength).toBe(-1);
  });
});

describe("JSON requested on an unsupporting server (US4)", () => {
  it("surfaces the SQL Server error rather than swallowing it", async (ctx) => {
    // Only meaningful on servers without the native JSON type; on SQL Server
    // 2025+ the request succeeds, so this is skipped there. CI exercises it on
    // the 2017/2019/2022 matrix dimensions (FR-009).
    if (harness.isNativeJsonSupported()) {
      ctx.skip();
    }
    const tableName = harness.makeTableName();
    await expect(harness.loadSample(tableName, "JSON")).rejects.toThrow();
  });
});
