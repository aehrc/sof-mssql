using Microsoft.Data.SqlClient;
using System.Data;
using System.Text.Json;

namespace SqlOnFhir.ViewRunner.SqlGeneration;

/// <summary>
/// Provides database connectivity and operations for SQL Server.
/// </summary>
/// <author>John Grimes</author>
public sealed class DatabaseService : IDisposable
{
    private readonly SqlConnection _connection;
    private bool _disposed;

    public DatabaseService(string connectionString)
    {
        _connection = new SqlConnection(connectionString);
    }

    /// <summary>
    /// Opens the database connection.
    /// </summary>
    public async Task OpenAsync(CancellationToken cancellationToken = default)
    {
        await _connection.OpenAsync(cancellationToken);
    }

    /// <summary>
    /// Creates the FHIR resources table if it doesn't exist.
    /// </summary>
    public async Task CreateFhirResourcesTableAsync(string tableName = "fhir_resources", CancellationToken cancellationToken = default)
    {
        var createTableSql = $"""
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='{tableName}' AND xtype='U')
            CREATE TABLE {tableName} (
                id NVARCHAR(64) NOT NULL PRIMARY KEY,
                json NVARCHAR(MAX) NOT NULL
            )
            """;

        using var command = new SqlCommand(createTableSql, _connection);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    /// <summary>
    /// Clears all data from the FHIR resources table.
    /// </summary>
    public async Task ClearFhirResourcesAsync(string tableName = "fhir_resources", CancellationToken cancellationToken = default)
    {
        var clearSql = $"DELETE FROM {tableName}";
        using var command = new SqlCommand(clearSql, _connection);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    /// <summary>
    /// Loads FHIR resources into the database.
    /// </summary>
    public async Task LoadFhirResourcesAsync(IEnumerable<JsonElement> resources, string tableName = "fhir_resources", CancellationToken cancellationToken = default)
    {
        foreach (var resource in resources)
        {
            var id = resource.GetProperty("id").GetString();
            var json = resource.GetRawText();

            var insertSql = $"INSERT INTO {tableName} (id, json) VALUES (@id, @json)";
            using var command = new SqlCommand(insertSql, _connection);
            command.Parameters.AddWithValue("@id", id);
            command.Parameters.AddWithValue("@json", json);

            await command.ExecuteNonQueryAsync(cancellationToken);
        }
    }

    /// <summary>
    /// Executes a SQL query and returns the results as a list of dictionaries.
    /// </summary>
    public async Task<List<Dictionary<string, object?>>> ExecuteQueryAsync(string sql, CancellationToken cancellationToken = default)
    {
        var results = new List<Dictionary<string, object?>>();

        using var command = new SqlCommand(sql, _connection);
        using var reader = await command.ExecuteReaderAsync(cancellationToken);

        while (await reader.ReadAsync(cancellationToken))
        {
            var row = new Dictionary<string, object?>();
            for (int i = 0; i < reader.FieldCount; i++)
            {
                var columnName = reader.GetName(i);
                var value = reader.IsDBNull(i) ? null : reader.GetValue(i);
                row[columnName] = value;
            }
            results.Add(row);
        }

        return results;
    }

    /// <summary>
    /// Executes a non-query SQL command.
    /// </summary>
    public async Task<int> ExecuteNonQueryAsync(string sql, CancellationToken cancellationToken = default)
    {
        using var command = new SqlCommand(sql, _connection);
        return await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public void Dispose()
    {
        if (!_disposed)
        {
            _connection?.Dispose();
            _disposed = true;
        }
    }
}