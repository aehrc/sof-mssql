/**
 * Unit tests for resource JSON data type validation and normalisation.
 *
 * These cover the trusted-boundary handling of the `resourceJsonDataType`
 * configuration value: the strict two-value allowlist, case-insensitive and
 * whitespace-tolerant matching, normalisation to canonical form, and the
 * meaningful errors raised for empty or unknown values (FR-001, FR-003,
 * FR-004).
 *
 * @author John Grimes
 */

import { describe, expect, it } from "vitest";
import {
  normaliseResourceJsonDataType,
  validateResourceJsonDataType,
} from "../validation";

describe("validateResourceJsonDataType (type predicate)", () => {
  // The predicate recognises only the exact canonical forms; it does not
  // normalise. Normalisation is the normaliser's job.
  it("accepts the canonical NVARCHAR(MAX) value", () => {
    expect(validateResourceJsonDataType("NVARCHAR(MAX)")).toBe(true);
  });

  it("accepts the canonical JSON value", () => {
    expect(validateResourceJsonDataType("JSON")).toBe(true);
  });

  it("rejects a non-canonical (lower-case) value", () => {
    // The predicate is strict; lower case is only acceptable after
    // normalisation, not to the predicate itself.
    expect(validateResourceJsonDataType("json")).toBe(false);
  });

  it("rejects an unknown value", () => {
    expect(validateResourceJsonDataType("TEXT")).toBe(false);
  });

  it("rejects an empty value", () => {
    expect(validateResourceJsonDataType("")).toBe(false);
  });
});

describe("normaliseResourceJsonDataType", () => {
  // Accepts the two allowed values regardless of case.
  it("accepts NVARCHAR(MAX) and returns it unchanged", () => {
    expect(normaliseResourceJsonDataType("NVARCHAR(MAX)")).toBe(
      "NVARCHAR(MAX)",
    );
  });

  it("accepts JSON and returns it unchanged", () => {
    expect(normaliseResourceJsonDataType("JSON")).toBe("JSON");
  });

  it("normalises a lower-case nvarchar(max) to canonical form", () => {
    expect(normaliseResourceJsonDataType("nvarchar(max)")).toBe(
      "NVARCHAR(MAX)",
    );
  });

  it("normalises a lower-case json to canonical form", () => {
    expect(normaliseResourceJsonDataType("json")).toBe("JSON");
  });

  it("normalises a mixed-case value to canonical form", () => {
    expect(normaliseResourceJsonDataType("Json")).toBe("JSON");
  });

  // Tolerates surrounding whitespace.
  it("trims surrounding whitespace before matching", () => {
    expect(normaliseResourceJsonDataType("  JSON  ")).toBe("JSON");
  });

  it("trims and normalises whitespace plus case together", () => {
    expect(normaliseResourceJsonDataType(" nvarchar(max) ")).toBe(
      "NVARCHAR(MAX)",
    );
  });

  // Rejects empty and whitespace-only values with the documented message.
  it("rejects an empty string with the empty-value error", () => {
    expect(() => normaliseResourceJsonDataType("")).toThrow(
      "Resource JSON data type cannot be empty.",
    );
  });

  it("rejects a whitespace-only string with the empty-value error", () => {
    expect(() => normaliseResourceJsonDataType("   ")).toThrow(
      "Resource JSON data type cannot be empty.",
    );
  });

  // Rejects unknown values, naming the offending value and the allowed set.
  it("rejects an unknown value with an error naming the value", () => {
    expect(() => normaliseResourceJsonDataType("TEXT")).toThrow(/TEXT/);
  });

  it("rejects an unknown value with an error listing the allowed values", () => {
    expect(() => normaliseResourceJsonDataType("TEXT")).toThrow(
      /NVARCHAR\(MAX\).*JSON/,
    );
  });

  it("preserves the original offending value in the error message", () => {
    // The error should echo what the user actually supplied, not a normalised
    // form, so the message is recognisable.
    expect(() => normaliseResourceJsonDataType("varchar")).toThrow(/varchar/);
  });
});
