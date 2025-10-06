/**
 * Generates SQL expressions for ViewDefinition columns.
 */

import { Transpiler, TranspilerContext } from "../fhirpath/transpiler.js";
import { ViewDefinitionColumn } from "../types.js";

/**
 * Handles generation of column expressions with type casting.
 */
export class ColumnExpressionGenerator {
  /**
   * Generate SQL expression for a column.
   */
  generateExpression(
    column: ViewDefinitionColumn,
    context: TranspilerContext,
  ): string {
    try {
      let expression: string;

      // Handle collection property.
      if (column.collection === true) {
        expression = this.generateCollectionExpression(column.path, context);
      } else if (column.collection === false) {
        expression = this.generateSingleValueExpression(column.path, context);
      } else {
        expression = Transpiler.transpile(column.path, context);
      }

      // Handle type casting if specified.
      if (column.type && column.collection !== true) {
        expression = this.applyTypeCasting(expression, column.type);
      }

      return expression;
    } catch (error) {
      throw new Error(
        `Failed to transpile column '${column.name}' with path '${column.path}': ${error}`,
      );
    }
  }

  /**
   * Apply type casting to an expression.
   */
  private applyTypeCasting(expression: string, type: string): string {
    const sqlType = Transpiler.inferSqlType(type);
    if (sqlType === "NVARCHAR(MAX)") {
      return expression;
    }

    // Special handling for boolean type.
    if (sqlType === "BIT") {
      return this.generateBooleanCaseExpression(expression);
    }

    return `CAST(${expression} AS ${sqlType})`;
  }

  /**
   * Generate a CASE expression for boolean conversion.
   * Handles both simple JSON_VALUE fields and boolean expressions.
   */
  private generateBooleanCaseExpression(expression: string): string {
    const hasComparisonOperator =
      expression.includes("=") ||
      expression.includes("<") ||
      expression.includes(">") ||
      expression.includes("NOT") ||
      expression.includes(" OR ") ||
      expression.includes(" AND ");

    if (expression.includes("JSON_VALUE") && !hasComparisonOperator) {
      // Simple JSON_VALUE - compare to 'true'/'false' strings.
      return `CASE WHEN ${expression} = 'true' THEN 1 WHEN ${expression} = 'false' THEN 0 ELSE NULL END`;
    }

    // Boolean expression - use as-is in CASE.
    return `CASE WHEN ${expression} THEN 1 WHEN NOT ${expression} THEN 0 ELSE NULL END`;
  }

  /**
   * Generate collection expression that returns an array.
   */
  private generateCollectionExpression(
    path: string,
    context: TranspilerContext,
  ): string {
    if (context.iterationContext) {
      return `JSON_QUERY(${context.iterationContext}, '$.${path}')`;
    }

    return this.buildCollectionJsonPath(path, context);
  }

  /**
   * Build a JSON path expression for collection=true.
   */
  private buildCollectionJsonPath(
    path: string,
    context: TranspilerContext,
  ): string {
    const pathParts = path.split(".");

    if (this.isNameFamilyPath(pathParts)) {
      return this.buildNameFamilyCollectionQuery(context);
    }

    if (this.isNameGivenPath(pathParts)) {
      return this.buildNameGivenCollectionQuery(context);
    }

    // For other paths, try to use JSON_QUERY to get the array directly.
    return `JSON_QUERY(${context.resourceAlias}.json, '$.${path}')`;
  }

  /**
   * Check if path is name.family.
   */
  private isNameFamilyPath(pathParts: string[]): boolean {
    return (
      pathParts.length === 2 &&
      pathParts[0] === "name" &&
      pathParts[1] === "family"
    );
  }

  /**
   * Check if path is name.given.
   */
  private isNameGivenPath(pathParts: string[]): boolean {
    return (
      pathParts.length === 2 &&
      pathParts[0] === "name" &&
      pathParts[1] === "given"
    );
  }

  /**
   * Build collection query for name.family path.
   */
  private buildNameFamilyCollectionQuery(context: TranspilerContext): string {
    return `(
        SELECT CASE
          WHEN COUNT(JSON_VALUE(names.value, '$.family')) = 0 THEN JSON_QUERY('[]')
          ELSE JSON_QUERY('[' + STRING_AGG(CONCAT('"', JSON_VALUE(names.value, '$.family'), '"'), ',') + ']')
        END
        FROM OPENJSON(${context.resourceAlias}.json, '$.name') AS names
        WHERE JSON_VALUE(names.value, '$.family') IS NOT NULL
      )`;
  }

  /**
   * Build collection query for name.given path.
   */
  private buildNameGivenCollectionQuery(context: TranspilerContext): string {
    return `(
        SELECT CASE
          WHEN COUNT(n.value) = 0 THEN JSON_QUERY('[]')
          ELSE JSON_QUERY('[' + STRING_AGG(CONCAT('"', n.value, '"'), ',') + ']')
        END
        FROM OPENJSON(${context.resourceAlias}.json, '$.name') AS names
        CROSS APPLY OPENJSON(names.value, '$.given') AS n
        WHERE n.value IS NOT NULL
      )`;
  }

  /**
   * Generate single value expression for collection=false.
   */
  private generateSingleValueExpression(
    path: string,
    context: TranspilerContext,
  ): string {
    return Transpiler.transpile(path, context);
  }
}
