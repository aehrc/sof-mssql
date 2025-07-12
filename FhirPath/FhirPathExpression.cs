using System.Text.Json;

namespace SqlOnFhir.ViewRunner.FhirPath;

/// <summary>
/// Represents a FHIRPath expression that can be evaluated and converted to SQL.
/// </summary>
/// <author>John Grimes</author>
public sealed record FhirPathExpression(string Expression)
{
    /// <summary>
    /// Converts this FHIRPath expression to a T-SQL expression.
    /// </summary>
    /// <param name="jsonColumnName">The name of the JSON column containing FHIR data.</param>
    /// <returns>A T-SQL expression string.</returns>
    public string ToSql(string jsonColumnName = "json")
    {
        return ConvertToSql(Expression, jsonColumnName);
    }

    private static string ConvertToSql(string expression, string jsonColumnName)
    {
        // Handle literal strings.
        if (expression.StartsWith("'") && expression.EndsWith("'"))
        {
            return expression;
        }

        // Handle special functions.
        if (expression == "getResourceKey()")
        {
            return $"JSON_VALUE({jsonColumnName}, '$.id')";
        }

        // Handle basic property access.
        if (IsSimpleProperty(expression))
        {
            return $"JSON_VALUE({jsonColumnName}, '$.{expression}')";
        }

        // Handle array access with .first().
        if (expression.EndsWith(".first()"))
        {
            var path = expression[..^8]; // Remove ".first()"
            return $"JSON_VALUE({jsonColumnName}, '$.{path}[0]')";
        }

        // Handle .join() function.
        if (expression.Contains(".join("))
        {
            var parts = expression.Split(new[] { ".join(" }, StringSplitOptions.None);
            if (parts.Length == 2)
            {
                var path = parts[0];
                var joinChar = parts[1].TrimEnd(')');
                return $"(SELECT STRING_AGG(JSON_VALUE(value, '$'), {joinChar}) FROM OPENJSON({jsonColumnName}, '$.{path}'))";
            }
        }

        // Handle .exists() function.
        if (expression.EndsWith(".exists()"))
        {
            var path = expression[..^9]; // Remove ".exists()"
            return $"CASE WHEN JSON_VALUE({jsonColumnName}, '$.{path}') IS NOT NULL THEN 1 ELSE 0 END";
        }

        // Handle boolean comparisons.
        if (expression.Contains(" = "))
        {
            var parts = expression.Split(" = ");
            if (parts.Length == 2)
            {
                var leftSql = ConvertToSql(parts[0].Trim(), jsonColumnName);
                var rightSql = ConvertToSql(parts[1].Trim(), jsonColumnName);
                return $"{leftSql} = {rightSql}";
            }
        }

        // Handle 'and' expressions.
        if (expression.Contains(" and "))
        {
            var parts = expression.Split(" and ");
            var sqlParts = parts.Select(part => ConvertToSql(part.Trim(), jsonColumnName));
            return $"({string.Join(" AND ", sqlParts)})";
        }

        // Handle 'or' expressions.
        if (expression.Contains(" or "))
        {
            var parts = expression.Split(" or ");
            var sqlParts = parts.Select(part => ConvertToSql(part.Trim(), jsonColumnName));
            return $"({string.Join(" OR ", sqlParts)})";
        }

        // Handle where clauses with filtering.
        if (expression.Contains(".where("))
        {
            var whereMatch = System.Text.RegularExpressions.Regex.Match(expression, @"(.+)\.where\((.+)\)(.*)");
            if (whereMatch.Success)
            {
                var basePath = whereMatch.Groups[1].Value;
                var whereCondition = whereMatch.Groups[2].Value;
                var suffix = whereMatch.Groups[3].Value;
                
                // For arrays with where conditions, we need to use OPENJSON.
                var sqlCondition = ConvertToSql(whereCondition, "JSON_QUERY(value, '$')");
                if (!string.IsNullOrEmpty(suffix))
                {
                    return $"(SELECT TOP 1 JSON_VALUE(value, '${suffix}') FROM OPENJSON({jsonColumnName}, '$.{basePath}') WHERE {sqlCondition})";
                }
                else
                {
                    return $"(SELECT TOP 1 value FROM OPENJSON({jsonColumnName}, '$.{basePath}') WHERE {sqlCondition})";
                }
            }
        }

        // Handle nested property access (e.g., "name.family").
        if (expression.Contains(".") && !expression.Contains("("))
        {
            var path = expression.Replace(".", ".");
            return $"JSON_VALUE({jsonColumnName}, '$.{path}')";
        }

        // Default fallback.
        return $"JSON_VALUE({jsonColumnName}, '$.{expression}')";
    }

    private static bool IsSimpleProperty(string expression)
    {
        return !expression.Contains(".") && 
               !expression.Contains("(") && 
               !expression.Contains("'") &&
               !expression.Contains(" ");
    }
}