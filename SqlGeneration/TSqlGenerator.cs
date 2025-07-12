using SqlOnFhir.ViewRunner.FhirPath;
using SqlOnFhir.ViewRunner.Models;
using System.Text;

namespace SqlOnFhir.ViewRunner.SqlGeneration;

/// <summary>
/// Generates T-SQL queries from SQL on FHIR view definitions.
/// </summary>
/// <author>John Grimes</author>
public sealed class TSqlGenerator
{
    private const string DefaultTableName = "fhir_resources";
    private const string DefaultJsonColumn = "json";
    private const string DefaultIdColumn = "id";

    /// <summary>
    /// Generates a T-SQL query from a view definition.
    /// </summary>
    /// <param name="viewDefinition">The view definition to convert.</param>
    /// <param name="tableName">The name of the table containing FHIR resources.</param>
    /// <returns>A T-SQL query string.</returns>
    public string GenerateQuery(ViewDefinition viewDefinition, string tableName = DefaultTableName)
    {
        var query = new StringBuilder();
        
        // Build the main SELECT statement.
        var columns = CollectColumns(viewDefinition.Select);
        query.AppendLine($"SELECT {string.Join(", ", columns.Select(FormatColumn))}");
        query.AppendLine($"FROM {tableName}");
        
        // Add resource type filter.
        query.AppendLine($"WHERE JSON_VALUE({DefaultJsonColumn}, '$.resourceType') = '{viewDefinition.Resource}'");
        
        // Add where clauses from the view definition.
        if (viewDefinition.Where is not null)
        {
            foreach (var whereClause in viewDefinition.Where)
            {
                var condition = new FhirPathExpression(whereClause.Path).ToSql(DefaultJsonColumn);
                query.AppendLine($"  AND ({condition})");
            }
        }
        
        return query.ToString();
    }

    /// <summary>
    /// Collects all columns from the select clauses.
    /// </summary>
    private static List<ColumnInfo> CollectColumns(List<SelectClause> selectClauses)
    {
        var columns = new List<ColumnInfo>();
        
        foreach (var selectClause in selectClauses)
        {
            ProcessSelectClause(selectClause, columns, DefaultJsonColumn);
        }
        
        return columns;
    }

    /// <summary>
    /// Processes a select clause and adds columns to the collection.
    /// </summary>
    private static void ProcessSelectClause(SelectClause selectClause, List<ColumnInfo> columns, string contextColumn)
    {
        // Add direct columns.
        if (selectClause.Column is not null)
        {
            foreach (var column in selectClause.Column)
            {
                var expression = new FhirPathExpression(column.Path);
                columns.Add(new ColumnInfo(column.Name, expression.ToSql(contextColumn), column.Type));
            }
        }

        // Process nested select clauses.
        if (selectClause.Select is not null)
        {
            foreach (var nestedSelect in selectClause.Select)
            {
                ProcessSelectClause(nestedSelect, columns, contextColumn);
            }
        }

        // Process forEach - simplified implementation for basic cases.
        if (!string.IsNullOrEmpty(selectClause.ForEach) && selectClause.Column is not null)
        {
            foreach (var column in selectClause.Column)
            {
                var expression = new FhirPathExpression(column.Path);
                // For forEach, we use the base JSON column but could be enhanced for complex scenarios.
                columns.Add(new ColumnInfo(column.Name, expression.ToSql(contextColumn), column.Type));
            }
        }

        // Process unionAll clauses.
        if (selectClause.UnionAll is not null)
        {
            foreach (var unionClause in selectClause.UnionAll)
            {
                ProcessSelectClause(unionClause, columns, contextColumn);
            }
        }
    }

    /// <summary>
    /// Formats a column for the SELECT clause.
    /// </summary>
    private static string FormatColumn(ColumnInfo column)
    {
        return $"{column.SqlExpression} AS [{column.Name}]";
    }

    /// <summary>
    /// Represents information about a column in the query.
    /// </summary>
    private sealed record ColumnInfo(string Name, string SqlExpression, string? Type);
}