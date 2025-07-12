using System.Text.Json.Serialization;

namespace SqlOnFhir.ViewRunner.Models;

/// <summary>
/// Represents a SQL on FHIR View Definition.
/// </summary>
/// <author>John Grimes</author>
public sealed record ViewDefinition
{
    [JsonPropertyName("resourceType")]
    public string? ResourceType { get; init; } = "ViewDefinition";

    [JsonPropertyName("resource")]
    public required string Resource { get; init; }

    [JsonPropertyName("name")]
    public string? Name { get; init; }

    [JsonPropertyName("status")]
    public string? Status { get; init; }

    [JsonPropertyName("select")]
    public required List<SelectClause> Select { get; init; }

    [JsonPropertyName("where")]
    public List<WhereClause>? Where { get; init; }
}

/// <summary>
/// Represents a select clause in a view definition.
/// </summary>
public sealed record SelectClause
{
    [JsonPropertyName("column")]
    public List<ColumnDefinition>? Column { get; init; }

    [JsonPropertyName("select")]
    public List<SelectClause>? Select { get; init; }

    [JsonPropertyName("forEach")]
    public string? ForEach { get; init; }

    [JsonPropertyName("unionAll")]
    public List<SelectClause>? UnionAll { get; init; }

    [JsonPropertyName("where")]
    public List<WhereClause>? Where { get; init; }
}

/// <summary>
/// Represents a column definition in a view.
/// </summary>
public sealed record ColumnDefinition
{
    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("path")]
    public required string Path { get; init; }

    [JsonPropertyName("type")]
    public string? Type { get; init; }

    [JsonPropertyName("description")]
    public string? Description { get; init; }
}

/// <summary>
/// Represents a where clause in a view definition.
/// </summary>
public sealed record WhereClause
{
    [JsonPropertyName("path")]
    public required string Path { get; init; }
}