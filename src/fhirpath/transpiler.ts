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
   * Get the SQL data type for a FHIRPath expression result.
   */
  static inferSqlType(fhirType?: string): string {
    const typeMap: Record<string, string> = {
      id: "NVARCHAR(MAX)",
      string: "NVARCHAR(MAX)",
      markdown: "NVARCHAR(MAX)",
      code: "NVARCHAR(MAX)",
      uri: "NVARCHAR(MAX)",
      url: "NVARCHAR(MAX)",
      canonical: "NVARCHAR(MAX)",
      uuid: "NVARCHAR(MAX)",
      oid: "NVARCHAR(MAX)",
      boolean: "BIT",
      integer: "INT",
      positiveint: "INT",
      unsignedint: "INT",
      integer64: "BIGINT",
      decimal: "DECIMAL(18,6)",
      date: "DATETIME2",
      datetime: "DATETIME2",
      instant: "DATETIME2",
      time: "TIME",
      base64binary: "VARBINARY(MAX)",
    };

    if (!fhirType) {
      return "NVARCHAR(MAX)";
    }

    return typeMap[fhirType.toLowerCase()] ?? "NVARCHAR(MAX)";
  }
}
