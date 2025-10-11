/**
 * SQL Server identifier validation utilities.
 */

/**
 * SQL Server reserved words that cannot be used as identifiers without quoting.
 * This is a subset of commonly used reserved words.
 */
const SQL_SERVER_RESERVED_WORDS = new Set([
  "SELECT",
  "FROM",
  "WHERE",
  "INSERT",
  "UPDATE",
  "DELETE",
  "DROP",
  "CREATE",
  "ALTER",
  "TABLE",
  "INDEX",
  "VIEW",
  "PROCEDURE",
  "FUNCTION",
  "TRIGGER",
  "DATABASE",
  "SCHEMA",
  "USER",
  "ROLE",
  "GRANT",
  "REVOKE",
  "JOIN",
  "UNION",
  "ORDER",
  "GROUP",
  "HAVING",
  "AS",
  "ON",
  "IN",
  "EXISTS",
  "BETWEEN",
  "LIKE",
  "AND",
  "OR",
  "NOT",
  "NULL",
  "IS",
]);

/**
 * Validate a SQL Server identifier (table name, schema name, etc.).
 *
 * SQL Server identifier rules:
 * - Can start with: letter (A-Z, a-z), underscore (_), @, or #
 * - Followed by: letters, digits (0-9), underscore, @, #, or $
 * - Maximum length: 128 characters
 * - Must not be a reserved word
 *
 * @param identifier - The identifier to validate
 * @param type - The type of identifier (for error messages)
 * @throws Error if the identifier is invalid
 */
export function validateSqlServerIdentifier(
  identifier: string,
  type: string,
): void {
  // Check for empty identifier
  if (!identifier || identifier.trim().length === 0) {
    throw new Error(`${type} cannot be empty.`);
  }

  // Check length
  if (identifier.length > 128) {
    throw new Error(
      `${type} '${identifier}' exceeds maximum length of 128 characters.`,
    );
  }

  // Check pattern: must start with letter, underscore, @, or #
  // Followed by letters, digits, underscore, @, #, or $
  if (!/^[a-zA-Z_@#][a-zA-Z0-9_@#$]*$/.test(identifier)) {
    throw new Error(
      `${type} '${identifier}' contains invalid characters. Must start with a letter, underscore, @, or #, followed by letters, digits, underscore, @, #, or $.`,
    );
  }

  // Check for reserved words (case-insensitive)
  if (SQL_SERVER_RESERVED_WORDS.has(identifier.toUpperCase())) {
    throw new Error(
      `${type} '${identifier}' is a SQL Server reserved word and cannot be used as an identifier.`,
    );
  }
}
