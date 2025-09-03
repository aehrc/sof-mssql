/**
 * Tests for FHIRPath transpiler.
 */

import { describe, it, expect } from "vitest";
import { FHIRPathTranspiler, TranspilerContext } from "../src";

describe("FHIRPathTranspiler", () => {
  const defaultContext: TranspilerContext = {
    resourceAlias: "r",
  };

  describe("basic expressions", () => {
    it("should transpile simple property access", () => {
      const result = FHIRPathTranspiler.transpile("id", defaultContext);
      expect(result).toBe("r.id");
    });

    it("should transpile string literals", () => {
      const result = FHIRPathTranspiler.transpile("'test'", defaultContext);
      expect(result).toBe("'test'");
    });

    it("should transpile number literals", () => {
      const result = FHIRPathTranspiler.transpile("123", defaultContext);
      expect(result).toBe("123");
    });

    it("should transpile boolean literals", () => {
      const result = FHIRPathTranspiler.transpile("true", defaultContext);
      expect(result).toBe("1");
    });
  });

  describe("property navigation", () => {
    it("should transpile nested property access", () => {
      const result = FHIRPathTranspiler.transpile(
        "name.family",
        defaultContext,
      );
      expect(result).toContain("JSON_VALUE");
      // name is a FHIR array field, so it gets [0] added
      expect(result).toContain("$.name[0].family");
    });
  });

  describe("functions", () => {
    it("should transpile exists() function", () => {
      const result = FHIRPathTranspiler.transpile(
        "id.exists()",
        defaultContext,
      );
      expect(result).toContain("IS NOT NULL");
    });

    it("should transpile getResourceKey() function", () => {
      const result = FHIRPathTranspiler.transpile(
        "getResourceKey()",
        defaultContext,
      );
      expect(result).toBe("r.id");
    });

    it("should transpile first() function", () => {
      const result = FHIRPathTranspiler.transpile(
        "name.first()",
        defaultContext,
      );
      expect(result).toContain("JSON_VALUE");
      expect(result).toContain("$.name[0]");
    });
  });

  describe("operators", () => {
    it("should transpile equality operators", () => {
      const result = FHIRPathTranspiler.transpile(
        "gender = 'male'",
        defaultContext,
      );
      expect(result).toContain("=");
      expect(result).toContain("'male'");
    });

    it("should transpile logical operators", () => {
      const result = FHIRPathTranspiler.transpile(
        "active and gender.exists()",
        defaultContext,
      );
      expect(result).toContain("AND");
      expect(result).toContain("IS NOT NULL");
    });
  });

  describe("error handling", () => {
    it("should throw error for unsupported functions", () => {
      expect(() =>
        FHIRPathTranspiler.transpile("unsupportedFunction()", defaultContext),
      ).toThrow("Unsupported FHIRPath function");
    });

    it("should throw error for invalid expressions", () => {
      expect(() =>
        FHIRPathTranspiler.transpile("invalid syntax...", defaultContext),
      ).toThrow("Failed to transpile FHIRPath expression");
    });
  });

  describe("inferSqlType", () => {
    it("should infer correct SQL types", () => {
      expect(FHIRPathTranspiler.inferSqlType("string")).toBe("NVARCHAR(MAX)");
      expect(FHIRPathTranspiler.inferSqlType("boolean")).toBe("BIT");
      expect(FHIRPathTranspiler.inferSqlType("integer")).toBe("INT");
      expect(FHIRPathTranspiler.inferSqlType("decimal")).toBe("DECIMAL(18,6)");
      expect(FHIRPathTranspiler.inferSqlType("date")).toBe("DATETIME2");
    });

    it("should default to NVARCHAR(MAX) for unknown types", () => {
      expect(FHIRPathTranspiler.inferSqlType("unknown")).toBe("NVARCHAR(MAX)");
      expect(FHIRPathTranspiler.inferSqlType()).toBe("NVARCHAR(MAX)");
    });
  });
});
