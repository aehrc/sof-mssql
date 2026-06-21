/**
 * Database-backed integration tests for the configurable `json` column type.
 *
 * Exercises the loader end to end against a real SQL Server: the default
 * `NVARCHAR(MAX)` column (US1, every supported version) and the native `JSON`
 * column (US1/US2, SQL Server 2025+ only). The native-JSON cases skip
 * automatically on servers that do not support the type, so the same file is
 * safe to run across the whole CI matrix.
 *
 * @author John Grimes
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createLoaderIntegrationHarness,
  SAMPLE_PATIENTS,
} from "../tests/utils/loaderIntegration";

const harness = createLoaderIntegrationHarness();

beforeAll(() => harness.connect());
afterAll(() => harness.cleanup());

describe("loadNdjsonFiles json column type (US1)", () => {
  it("creates an NVARCHAR(MAX) column and loads every row when the type is omitted", async () => {
    // The default path must be unchanged from earlier releases (SC-001).
    const tableName = harness.makeTableName();
    const rowsLoaded = await harness.loadSample(tableName);

    expect(rowsLoaded).toBe(SAMPLE_PATIENTS.length);

    const columnType = await harness.getJsonColumnType(tableName);
    expect(columnType.dataType).toBe("nvarchar");
    expect(columnType.maxLength).toBe(-1);

    expect(await harness.getRowCount(tableName)).toBe(SAMPLE_PATIENTS.length);
  });

  it("creates a native JSON column and loads every row when JSON is requested", async (ctx) => {
    if (!harness.isNativeJsonSupported()) {
      ctx.skip();
    }
    const tableName = harness.makeTableName();
    const rowsLoaded = await harness.loadSample(tableName, "JSON");

    expect(rowsLoaded).toBe(SAMPLE_PATIENTS.length);

    const columnType = await harness.getJsonColumnType(tableName);
    expect(columnType.dataType).toBe("json");

    expect(await harness.getRowCount(tableName)).toBe(SAMPLE_PATIENTS.length);
  });

  it("accepts a lower-case json value and still creates the native type", async (ctx) => {
    if (!harness.isNativeJsonSupported()) {
      ctx.skip();
    }
    const tableName = harness.makeTableName();
    await harness.loadSample(tableName, "json");

    const columnType = await harness.getJsonColumnType(tableName);
    expect(columnType.dataType).toBe("json");
  });
});

describe("loadNdjsonFiles json column type (US2 - programmatic, no CLI)", () => {
  // loadSample calls loadNdjsonFiles with LoaderOptions directly, demonstrating
  // that the capability is fully available through the programmatic API with no
  // CLI or commander layer involved.
  it("honours LoaderOptions.resourceJsonDataType = JSON via the programmatic API", async (ctx) => {
    if (!harness.isNativeJsonSupported()) {
      ctx.skip();
    }
    const tableName = harness.makeTableName();
    const rowsLoaded = await harness.loadSample(tableName, "JSON");

    expect(rowsLoaded).toBe(SAMPLE_PATIENTS.length);
    const columnType = await harness.getJsonColumnType(tableName);
    expect(columnType.dataType).toBe("json");
  });

  it("defaults to NVARCHAR(MAX) programmatically when the option is omitted", async () => {
    const tableName = harness.makeTableName();
    const rowsLoaded = await harness.loadSample(tableName);

    expect(rowsLoaded).toBe(SAMPLE_PATIENTS.length);
    const columnType = await harness.getJsonColumnType(tableName);
    expect(columnType.dataType).toBe("nvarchar");
    expect(columnType.maxLength).toBe(-1);
  });
});
