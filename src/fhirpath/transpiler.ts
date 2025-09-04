/**
 * FHIRPath expression transpiler to T-SQL.
 * Converts FHIRPath expressions to equivalent T-SQL expressions for MS SQL Server.
 */

import { CharStreams, CommonTokenStream } from "antlr4ts";
import { fhirpathLexer } from "../generated/grammar/fhirpathLexer";
import { fhirpathParser } from "../generated/grammar/fhirpathParser";
import { FHIRPathToTSqlVisitor, TranspilerContext } from "./visitor";

// Re-export TranspilerContext from visitor
export { TranspilerContext } from "./visitor";

export class Transpiler {
  /**
   * Transpile a FHIRPath expression to T-SQL.
   */
  static transpile(expression: string, context: TranspilerContext): string {
    try {
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

      // Check for parse errors by examining if we have error nodes or syntax errors
      if (parser.numberOfSyntaxErrors > 0) {
        throw new Error(
          `Failed to transpile FHIRPath expression '${expression}': Syntax error`,
        );
      }

      // Create visitor and visit the parse tree
      const visitor = new FHIRPathToTSqlVisitor(context);
      return visitor.visit(tree);
    } catch (error) {
      throw new Error(
        `Failed to transpile FHIRPath expression '${expression}': ${error}`,
      );
    }
  }

  /**
   * Get the SQL data type for a FHIRPath expression result.
   */
  static inferSqlType(fhirType?: string): string {
    switch (fhirType?.toLowerCase()) {
      case "id":
      case "string":
      case "markdown":
      case "code":
      case "uri":
      case "url":
      case "canonical":
      case "uuid":
      case "oid":
        return "NVARCHAR(MAX)";

      case "boolean":
        return "BIT";

      case "integer":
      case "positiveint":
      case "unsignedint":
        return "INT";

      case "integer64":
        return "BIGINT";

      case "decimal":
        return "DECIMAL(18,6)";

      case "date":
      case "datetime":
      case "instant":
        return "DATETIME2";

      case "time":
        return "TIME";

      case "base64binary":
        return "VARBINARY(MAX)";

      default:
        return "NVARCHAR(MAX)";
    }
  }
}
