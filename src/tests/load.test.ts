/**
 * Unit tests for the `load` command option mapping.
 *
 * Verifies that the `--resource-json-data-type` CLI flag is mapped onto
 * `LoaderOptions.resourceJsonDataType` and passed through untouched, leaving
 * validation and normalisation to the loader (FR-007, cli-load contract).
 *
 * @author John Grimes
 */

import { describe, expect, it } from "vitest";
import { buildLoaderOptions } from "../load";

describe("buildLoaderOptions", () => {
  it("maps --resource-json-data-type onto resourceJsonDataType", () => {
    // Dry-run avoids any need for database environment variables.
    const options = buildLoaderOptions("./data", {
      dryRun: true,
      resourceJsonDataType: "JSON",
    });
    expect(options.resourceJsonDataType).toBe("JSON");
  });

  it("leaves resourceJsonDataType undefined when the flag is absent", () => {
    const options = buildLoaderOptions("./data", { dryRun: true });
    expect(options.resourceJsonDataType).toBeUndefined();
  });

  it("passes the raw value through without normalising", () => {
    // Normalisation is the loader's responsibility; the CLI layer must not
    // pre-empt it, so a lower-case value is forwarded verbatim.
    const options = buildLoaderOptions("./data", {
      dryRun: true,
      resourceJsonDataType: "json",
    });
    expect(options.resourceJsonDataType).toBe("json");
  });
});
