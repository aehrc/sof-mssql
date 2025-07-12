using System.Text.Json;
using System.Text.Json.Serialization;

namespace SqlOnFhir.ViewRunner.Models;

/// <summary>
/// Represents a test case definition from the SQL on FHIR test suite.
/// </summary>
/// <author>John Grimes</author>
public sealed record TestCaseDefinition
{
    [JsonPropertyName("title")]
    public required string Title { get; init; }

    [JsonPropertyName("description")]
    public required string Description { get; init; }

    [JsonPropertyName("fhirVersion")]
    public required List<string> FhirVersion { get; init; }

    [JsonPropertyName("resources")]
    public required List<JsonElement> Resources { get; init; }

    [JsonPropertyName("tests")]
    public required List<TestDefinition> Tests { get; init; }
}

/// <summary>
/// Represents an individual test within a test case.
/// </summary>
public sealed record TestDefinition
{
    [JsonPropertyName("title")]
    public required string Title { get; init; }

    [JsonPropertyName("tags")]
    public List<string>? Tags { get; init; }

    [JsonPropertyName("view")]
    public required ViewDefinition View { get; init; }

    [JsonPropertyName("expect")]
    public required List<JsonElement> Expect { get; init; }

    [JsonPropertyName("expectColumns")]
    public List<string>? ExpectColumns { get; init; }
}

/// <summary>
/// Represents the result of running a test.
/// </summary>
public sealed record TestResult
{
    public required string Name { get; init; }
    public required TestResultDetails Result { get; init; }
}

/// <summary>
/// Details of a test result.
/// </summary>
public sealed record TestResultDetails
{
    public required bool Passed { get; init; }
    public string? Reason { get; init; }
}

/// <summary>
/// Represents a test report for a specific test file.
/// </summary>
public sealed record TestReport
{
    public required List<TestResult> Tests { get; init; }
}