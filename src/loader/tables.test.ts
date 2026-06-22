/**
 * Unit tests for pure table DDL generation and existing-column-type resolution.
 *
 * These exercise the string-building and comparison logic without a database,
 * so the byte-for-byte DDL contract (SC-001), the native JSON column type
 * (FR-005) and the type-mismatch decision (FR-008) can be verified in
 * isolation.
 *
 * @author John Grimes
 */

import { describe, expect, it } from "vitest";
import {
  buildCreateTableStatements,
  buildJsonTypeMismatchWarning,
  resolveColumnJsonDataType,
} from "./tables";

describe("buildCreateTableStatements", () => {
  describe("default NVARCHAR(MAX) json column", () => {
    const statements = buildCreateTableStatements(
      "dbo",
      "fhir_resources",
      "NVARCHAR(MAX)",
    );

    it("types the json column as NVARCHAR(MAX) NOT NULL", () => {
      expect(statements.createTable).toContain("[json] NVARCHAR(MAX) NOT NULL");
    });

    it("keeps the id column unchanged", () => {
      expect(statements.createTable).toContain(
        "[id] INT IDENTITY(1,1) NOT NULL PRIMARY KEY",
      );
    });

    it("keeps the resource_type column unchanged", () => {
      expect(statements.createTable).toContain(
        "[resource_type] NVARCHAR(64) NOT NULL",
      );
    });

    it("brackets the schema and table identifiers", () => {
      expect(statements.createTable).toContain("[dbo].[fhir_resources]");
    });

    it("builds the resource_type index", () => {
      expect(statements.createIndex).toContain(
        "[IX_fhir_resources_resource_type]",
      );
      expect(statements.createIndex).toContain(
        "[dbo].[fhir_resources] ([resource_type])",
      );
    });
  });

  describe("native JSON json column", () => {
    const statements = buildCreateTableStatements(
      "dbo",
      "fhir_resources",
      "JSON",
    );

    it("types the json column as JSON NOT NULL", () => {
      expect(statements.createTable).toContain("[json] JSON NOT NULL");
    });

    it("does not emit NVARCHAR(MAX) for the json column", () => {
      expect(statements.createTable).not.toContain("[json] NVARCHAR(MAX)");
    });

    it("keeps the resource_type column unchanged", () => {
      expect(statements.createTable).toContain(
        "[resource_type] NVARCHAR(64) NOT NULL",
      );
    });

    it("leaves the index statement identical to the default", () => {
      const defaultStatements = buildCreateTableStatements(
        "dbo",
        "fhir_resources",
        "NVARCHAR(MAX)",
      );
      expect(statements.createIndex).toBe(defaultStatements.createIndex);
    });
  });

  describe("identifier bracketing", () => {
    it("brackets custom schema and table names", () => {
      const statements = buildCreateTableStatements(
        "analytics",
        "resources",
        "JSON",
      );
      expect(statements.createTable).toContain("[analytics].[resources]");
      expect(statements.createIndex).toContain("[IX_resources_resource_type]");
      expect(statements.createIndex).toContain(
        "[analytics].[resources] ([resource_type])",
      );
    });
  });
});

describe("resolveColumnJsonDataType", () => {
  it("resolves nvarchar with MAX length to NVARCHAR(MAX)", () => {
    // NVARCHAR(MAX) appears in INFORMATION_SCHEMA as data_type 'nvarchar' with a
    // character_maximum_length of -1.
    expect(resolveColumnJsonDataType("nvarchar", -1)).toBe("NVARCHAR(MAX)");
  });

  it("resolves json to JSON", () => {
    // The native type appears as data_type 'json' with a null maximum length.
    expect(resolveColumnJsonDataType("json", null)).toBe("JSON");
  });

  it("is case-insensitive on the data type name", () => {
    expect(resolveColumnJsonDataType("JSON", null)).toBe("JSON");
    expect(resolveColumnJsonDataType("NVARCHAR", -1)).toBe("NVARCHAR(MAX)");
  });

  it("tolerates surrounding whitespace on the data type name", () => {
    expect(resolveColumnJsonDataType("  json  ", null)).toBe("JSON");
    expect(resolveColumnJsonDataType(" nvarchar ", -1)).toBe("NVARCHAR(MAX)");
  });

  // An existing column that is neither native JSON nor NVARCHAR(MAX) cannot
  // faithfully hold a serialised FHIR resource. Such a column must be rejected
  // at the boundary, naming the offending type, rather than silently coerced to
  // NVARCHAR(MAX) - coercion would let the loader write into it and lose data
  // through truncation or, under non-Unicode VARCHAR, character corruption
  // (Constitution Principle IV).
  describe("rejects column types that cannot hold a FHIR resource", () => {
    it("throws for a bounded nvarchar, naming the offending type", () => {
      expect(() => resolveColumnJsonDataType("nvarchar", 64)).toThrow(
        /NVARCHAR\(64\)/,
      );
    });

    it("throws for varchar, naming the offending type", () => {
      expect(() => resolveColumnJsonDataType("varchar", 100)).toThrow(
        /VARCHAR\(100\)/,
      );
    });

    it("throws for a max-length varchar, which is still not Unicode-safe", () => {
      // VARCHAR(MAX) reports a length of -1 but is non-Unicode, so it can
      // silently corrupt multi-byte characters and must still be rejected.
      expect(() => resolveColumnJsonDataType("varchar", -1)).toThrow(
        /VARCHAR\(MAX\)/,
      );
    });

    it("throws for text, naming the offending type", () => {
      expect(() => resolveColumnJsonDataType("text", 2147483647)).toThrow(
        /TEXT/,
      );
    });

    it("names both acceptable types in the error message", () => {
      let message = "";
      try {
        resolveColumnJsonDataType("varchar", 100);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain("NVARCHAR(MAX)");
      expect(message).toContain("JSON");
    });
  });
});

describe("buildJsonTypeMismatchWarning", () => {
  it("returns null when the existing and requested types are equal", () => {
    expect(
      buildJsonTypeMismatchWarning(
        "dbo",
        "t",
        "NVARCHAR(MAX)",
        "NVARCHAR(MAX)",
      ),
    ).toBeNull();
    expect(buildJsonTypeMismatchWarning("dbo", "t", "JSON", "JSON")).toBeNull();
  });

  it("returns a warning naming both types and the table when they differ", () => {
    const warning = buildJsonTypeMismatchWarning(
      "dbo",
      "fhir_resources",
      "NVARCHAR(MAX)",
      "JSON",
    );
    expect(warning).not.toBeNull();
    expect(warning).toContain("NVARCHAR(MAX)");
    expect(warning).toContain("JSON");
    expect(warning).toContain("fhir_resources");
  });

  it("names both the existing and the requested type in either direction", () => {
    const warning = buildJsonTypeMismatchWarning(
      "dbo",
      "t",
      "JSON",
      "NVARCHAR(MAX)",
    );
    expect(warning).toMatch(/JSON/);
    expect(warning).toMatch(/NVARCHAR\(MAX\)/);
  });
});
