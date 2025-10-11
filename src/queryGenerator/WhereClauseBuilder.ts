/**
 * Builds WHERE clauses for SQL queries.
 */

import { Transpiler, TranspilerContext } from "../fhirpath/transpiler.js";
import { ViewDefinitionWhere } from "../types.js";
import { validateResourceType, validateTestId } from "../validation.js";

/**
 * Handles generation of WHERE clauses.
 */
export class WhereClauseBuilder {
  /**
   * Build complete WHERE clause combining resource type filter and view-level filters.
   * For test execution, testId is used to filter test data in the test table.
   * Validates inputs to prevent SQL injection.
   */
  buildWhereClause(
    resourceType: string,
    resourceAlias: string,
    testId: string | undefined,
    whereConditions: ViewDefinitionWhere[] | undefined,
    context: TranspilerContext,
  ): string | null {
    const conditions: string[] = [];

    // Validate and add resource type filter.
    validateResourceType(resourceType);
    conditions.push(`[${resourceAlias}].[resource_type] = '${resourceType}'`);

    // Validate and add test_id filter for test isolation (only used in test table which has test_id column).
    if (testId) {
      validateTestId(testId);
      conditions.push(`[${resourceAlias}].[test_id] = '${testId}'`);
    }

    // Add view-level WHERE conditions.
    const viewWhereClause = this.generateViewWhereClause(
      whereConditions,
      context,
    );
    if (viewWhereClause) {
      conditions.push(viewWhereClause);
    }

    if (conditions.length === 0) {
      return null;
    }

    return `WHERE ${conditions.join(" AND ")}`;
  }

  /**
   * Generate the WHERE clause for view-level filters.
   */
  private generateViewWhereClause(
    whereConditions: ViewDefinitionWhere[] | undefined,
    context: TranspilerContext,
  ): string | null {
    if (!whereConditions || whereConditions.length === 0) {
      return null;
    }

    const conditions: string[] = [];
    const booleanFields = ["active", "deceased", "multipleBirth"];

    for (const where of whereConditions) {
      try {
        const condition = Transpiler.transpile(where.path, context);

        // Check if this looks like a simple boolean field reference that needs to be cast.
        const simpleBooleanFieldPattern = new RegExp(
          `^JSON_VALUE\\([^,]+,\\s*'\\$\\.(${booleanFields.join("|")})'\\)$`,
        );

        if (simpleBooleanFieldPattern.test(condition.trim())) {
          conditions.push(
            `(CASE WHEN ${condition} = 'true' THEN 1 ELSE 0 END = 1)`,
          );
        } else {
          conditions.push(condition);
        }
      } catch (error) {
        throw new Error(
          `Failed to transpile where condition '${where.path}': ${error}`,
        );
      }
    }

    return `(${conditions.join(") AND (")})`;
  }
}
