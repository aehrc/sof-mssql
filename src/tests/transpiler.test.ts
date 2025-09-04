/**
 * Tests for FHIRPath transpiler.
 */

import { describe, expect, it } from "vitest";
import {
  Transpiler,
  TranspilerContext,
} from "../fhirpath/transpiler.js";

describe("Transpiler", () => {
  const defaultContext: TranspilerContext = {
    resourceAlias: "r",
  };

  describe("basic expressions", () => {
    it("should transpile simple property access", () => {
      const result = Transpiler.transpile("id", defaultContext);
      expect(result).toBe("r.id");
    });

    it("should transpile string literals", () => {
      const result = Transpiler.transpile("'test'", defaultContext);
      expect(result).toBe("'test'");
    });

    it("should transpile number literals", () => {
      const result = Transpiler.transpile("123", defaultContext);
      expect(result).toBe("123");
    });

    it("should transpile boolean literals", () => {
      const result = Transpiler.transpile("true", defaultContext);
      expect(result).toBe("1");
    });
  });

  describe("property navigation", () => {
    it("should transpile nested property access", () => {
      const result = Transpiler.transpile(
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
      const result = Transpiler.transpile(
        "id.exists()",
        defaultContext,
      );
      expect(result).toContain("IS NOT NULL");
    });

    it("should transpile getResourceKey() function", () => {
      const result = Transpiler.transpile(
        "getResourceKey()",
        defaultContext,
      );
      expect(result).toBe("r.id");
    });

    it("should transpile first() function", () => {
      const result = Transpiler.transpile(
        "name.first()",
        defaultContext,
      );
      expect(result).toContain("JSON_VALUE");
      expect(result).toContain("$.name[0]");
    });
  });

  describe("operators", () => {
    it("should transpile equality operators", () => {
      const result = Transpiler.transpile(
        "gender = 'male'",
        defaultContext,
      );
      expect(result).toContain("=");
      expect(result).toContain("'male'");
    });

    it("should transpile logical operators", () => {
      const result = Transpiler.transpile(
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
        Transpiler.transpile("unsupportedFunction()", defaultContext),
      ).toThrow("Unsupported FHIRPath function");
    });

    it("should throw error for invalid expressions", () => {
      expect(() =>
        Transpiler.transpile("invalid syntax...", defaultContext),
      ).toThrow("Syntax error in FHIRPath expression");
    });
  });

  describe("inferSqlType", () => {
    it("should infer correct SQL types", () => {
      expect(Transpiler.inferSqlType("string")).toBe("NVARCHAR(MAX)");
      expect(Transpiler.inferSqlType("boolean")).toBe("BIT");
      expect(Transpiler.inferSqlType("integer")).toBe("INT");
      expect(Transpiler.inferSqlType("decimal")).toBe("DECIMAL(18,6)");
      expect(Transpiler.inferSqlType("date")).toBe("DATETIME2");
    });

    it("should default to NVARCHAR(MAX) for unknown types", () => {
      expect(Transpiler.inferSqlType("unknown")).toBe("NVARCHAR(MAX)");
      expect(Transpiler.inferSqlType()).toBe("NVARCHAR(MAX)");
    });
  });
});
