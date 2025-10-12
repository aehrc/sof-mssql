/**
 * FHIRPath expression transpiler to T-SQL.
 * Converts FHIRPath expressions to equivalent T-SQL expressions for MS SQL Server.
 */

import { CharStreams, CommonTokenStream } from "antlr4ts";
import { fhirpathLexer } from "../generated/grammar/fhirpathLexer";
import {
  EntireExpressionContext,
  fhirpathParser,
} from "../generated/grammar/fhirpathParser";
import type { ViewDefinitionColumnTag } from "../types.js";
import { validateAnsiSqlType, validateMsSqlType } from "../validation.js";
import { FHIRPathToTSqlVisitor, TranspilerContext } from "./visitor";

// Re-export TranspilerContext from visitor
export { TranspilerContext } from "./visitor";

export class Transpiler {
  /**
   * Transpile a FHIRPath expression to T-SQL.
   */
  static transpile(expression: string, context: TranspilerContext): string {
    // Check for syntax errors first, before any try-catch
    const parseResult = this.parseExpression(expression);
    if (!parseResult.success || !parseResult.tree) {
      throw new Error(`Syntax error in FHIRPath expression '${expression}'`);
    }

    try {
      // Create visitor and visit the parse tree
      const visitor = new FHIRPathToTSqlVisitor(context);
      return visitor.visit(parseResult.tree);
    } catch (error) {
      throw new Error(
        `Failed to transpile FHIRPath expression '${expression}': ${error}`,
      );
    }
  }

  private static parseExpression(expression: string): {
    success: boolean;
    tree: EntireExpressionContext | null;
  } {
    // Create ANTLR input stream
    const inputStream = CharStreams.fromString(expression);

    // Create lexer
    const lexer = new fhirpathLexer(inputStream);
    const tokenStream = new CommonTokenStream(lexer);

    // Create parser
    const parser = new fhirpathParser(tokenStream);

    // Remove default error listeners to avoid console output
    parser.removeErrorListeners();

    // Parse the entire expression
    const tree = parser.entireExpression();

    // Check for parse errors
    if (parser.numberOfSyntaxErrors > 0) {
      return { success: false, tree: null };
    }

    return { success: true, tree };
  }

  /**
   * Get the SQL data type for a FHIR type, with optional tag-based override.
   *
   * Default mappings are conservative to accommodate ALL valid FHIR data,
   * using MAX sizes where needed and NVARCHAR for any fields that could
   * potentially contain Unicode characters.
   *
   * Design principles:
   * - Use NVARCHAR for fields that may contain Unicode (string, code, uri/url/canonical)
   * - Use VARCHAR for ASCII-only fields (id, uuid, oid, decimal, dates/times)
   * - Use MAX or generous fixed sizes to prevent truncation
   * - Preserve FHIR semantics (partial dates, arbitrary precision decimals)
   *
   * Users can optimise storage using type tags:
   * - 'mssql/type' - Direct SQL Server type (e.g., 'DATE', 'VARCHAR(50)')
   * - 'ansi/type' - ANSI/ISO SQL standard type (e.g., 'INTEGER', 'CHARACTER(50)', 'BOOLEAN')
   *
   * Type precedence: mssql/type > ansi/type > FHIR type defaults
   *
   * Example tag usage:
   * - { "name": "mssql/type", "value": "DATE" } - Use SQL Server DATE type
   * - { "name": "ansi/type", "value": "INTEGER" } - Use ANSI INTEGER (converted to SQL Server INT)
   * - { "name": "ansi/type", "value": "BOOLEAN" } - Use ANSI BOOLEAN (converted to SQL Server BIT)
   *
   * @param fhirType - FHIR primitive type name (e.g., 'string', 'integer')
   * @param tags - Optional array of column tags for type hints
   * @returns MS SQL Server type specification
   */
  static inferSqlType(
    fhirType?: string,
    tags?: ViewDefinitionColumnTag[],
  ): string {
    // Check for mssql/type tag override.
    const tagOverride = this.getTagTypeOverride(tags);
    if (tagOverride) {
      return tagOverride;
    }

    // Use default FHIR type mapping.
    return this.getDefaultFhirTypeMapping(fhirType);
  }

  /**
   * Get type override from mssql/type or ansi/type tag if present.
   *
   * Precedence order:
   * 1. mssql/type - Direct SQL Server type specification
   * 2. ansi/type - ANSI/ISO SQL standard type (converted to SQL Server equivalent)
   */
  private static getTagTypeOverride(
    tags?: ViewDefinitionColumnTag[],
  ): string | null {
    if (!tags) {
      return null;
    }

    // Check for mssql/type tag first (highest precedence)
    const mssqlTypeTag = tags.find((tag) => tag.name === "mssql/type");
    if (mssqlTypeTag) {
      validateMsSqlType(mssqlTypeTag.value);
      return mssqlTypeTag.value;
    }

    // Check for ansi/type tag (lower precedence)
    const ansiTypeTag = tags.find((tag) => tag.name === "ansi/type");
    if (ansiTypeTag) {
      return validateAnsiSqlType(ansiTypeTag.value);
    }

    return null;
  }

  /**
   * Get default MS SQL Server type mapping for a FHIR primitive type.
   */
  private static getDefaultFhirTypeMapping(fhirType?: string): string {
    // Conservative default type mappings based on FHIR R4 constraints.
    // Sized to accommodate ALL valid FHIR data.
    // Uses NVARCHAR for potential Unicode, VARCHAR for ASCII-only.
    const typeMap: Record<string, string> = {
      // ASCII-only types with fixed constraints
      id: "VARCHAR(64)",
      boolean: "BIT",
      integer: "INT",
      positiveint: "INT",
      unsignedint: "INT",
      integer64: "BIGINT",

      // ASCII-only structured formats
      uuid: "VARCHAR(100)",
      oid: "VARCHAR(255)",
      decimal: "VARCHAR(MAX)",
      date: "VARCHAR(10)",
      datetime: "VARCHAR(50)",
      instant: "VARCHAR(50)",
      time: "VARCHAR(20)",

      // Unicode-capable text types
      string: "NVARCHAR(MAX)",
      markdown: "NVARCHAR(MAX)",
      code: "NVARCHAR(MAX)",

      // URIs (can be IRIs with Unicode)
      uri: "NVARCHAR(MAX)",
      url: "NVARCHAR(MAX)",
      canonical: "NVARCHAR(MAX)",

      // Binary data
      base64binary: "VARBINARY(MAX)",
    };

    if (!fhirType) {
      return "NVARCHAR(MAX)";
    }

    return typeMap[fhirType.toLowerCase()] ?? "NVARCHAR(MAX)";
  }
}
