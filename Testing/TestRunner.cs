using SqlOnFhir.ViewRunner.Models;
using SqlOnFhir.ViewRunner.SqlGeneration;
using System.Text.Json;

namespace SqlOnFhir.ViewRunner.Testing;

/// <summary>
/// Runs SQL on FHIR test cases against a SQL Server database.
/// </summary>
/// <author>John Grimes</author>
public sealed class TestRunner
{
    private readonly DatabaseService _databaseService;
    private readonly TSqlGenerator _sqlGenerator;

    public TestRunner(DatabaseService databaseService)
    {
        _databaseService = databaseService;
        _sqlGenerator = new TSqlGenerator();
    }

    /// <summary>
    /// Runs all test files in the specified directory.
    /// </summary>
    public async Task<Dictionary<string, TestReport>> RunTestsAsync(string testDirectory, CancellationToken cancellationToken = default)
    {
        var testReports = new Dictionary<string, TestReport>();
        var testFiles = Directory.GetFiles(testDirectory, "*.json");

        foreach (var testFile in testFiles)
        {
            var fileName = Path.GetFileName(testFile);
            try
            {
                var testReport = await RunTestFileAsync(testFile, cancellationToken);
                testReports[fileName] = testReport;
            }
            catch (Exception ex)
            {
                // Create a failure report for the entire file.
                testReports[fileName] = new TestReport
                {
                    Tests = new List<TestResult>
                    {
                        new TestResult
                        {
                            Name = $"File: {fileName}",
                            Result = new TestResultDetails
                            {
                                Passed = false,
                                Reason = $"Failed to load test file: {ex.Message}"
                            }
                        }
                    }
                };
            }
        }

        return testReports;
    }

    /// <summary>
    /// Runs a single test file.
    /// </summary>
    public async Task<TestReport> RunTestFileAsync(string testFilePath, CancellationToken cancellationToken = default)
    {
        var testJson = await File.ReadAllTextAsync(testFilePath, cancellationToken);
        var testCase = JsonSerializer.Deserialize<TestCaseDefinition>(testJson, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        }) ?? throw new InvalidOperationException($"Failed to deserialise test case from {testFilePath}");

        var testResults = new List<TestResult>();

        // Clear existing data and load fixtures.
        await _databaseService.ClearFhirResourcesAsync(cancellationToken: cancellationToken);
        await _databaseService.LoadFhirResourcesAsync(testCase.Resources, cancellationToken: cancellationToken);

        foreach (var test in testCase.Tests)
        {
            try
            {
                var result = await RunSingleTestAsync(test, cancellationToken);
                testResults.Add(result);
            }
            catch (Exception ex)
            {
                testResults.Add(new TestResult
                {
                    Name = test.Title,
                    Result = new TestResultDetails
                    {
                        Passed = false,
                        Reason = $"Test execution failed: {ex.Message}"
                    }
                });
            }
        }

        return new TestReport { Tests = testResults };
    }

    /// <summary>
    /// Runs a single test.
    /// </summary>
    private async Task<TestResult> RunSingleTestAsync(TestDefinition test, CancellationToken cancellationToken)
    {
        // Generate SQL query from view definition.
        var sql = _sqlGenerator.GenerateQuery(test.View);
        
        // Execute the query.
        var actualResults = await _databaseService.ExecuteQueryAsync(sql, cancellationToken);
        
        // Compare with expected results.
        var passed = CompareResults(actualResults, test.Expect);
        
        return new TestResult
        {
            Name = test.Title,
            Result = new TestResultDetails
            {
                Passed = passed,
                Reason = passed ? null : "Results did not match expected output"
            }
        };
    }

    /// <summary>
    /// Compares actual query results with expected results.
    /// </summary>
    private static bool CompareResults(List<Dictionary<string, object?>> actualResults, List<JsonElement> expectedResults)
    {
        if (actualResults.Count != expectedResults.Count)
        {
            return false;
        }

        for (int i = 0; i < actualResults.Count; i++)
        {
            var actualRow = actualResults[i];
            var expectedRow = expectedResults[i];

            if (!CompareRow(actualRow, expectedRow))
            {
                return false;
            }
        }

        return true;
    }

    /// <summary>
    /// Compares a single row of results.
    /// </summary>
    private static bool CompareRow(Dictionary<string, object?> actualRow, JsonElement expectedRow)
    {
        if (expectedRow.ValueKind != JsonValueKind.Object)
        {
            return false;
        }

        foreach (var expectedProperty in expectedRow.EnumerateObject())
        {
            var expectedKey = expectedProperty.Name;
            var expectedValue = expectedProperty.Value;

            if (!actualRow.TryGetValue(expectedKey, out var actualValue))
            {
                return false;
            }

            if (!CompareValue(actualValue, expectedValue))
            {
                return false;
            }
        }

        return true;
    }

    /// <summary>
    /// Compares individual values.
    /// </summary>
    private static bool CompareValue(object? actualValue, JsonElement expectedValue)
    {
        switch (expectedValue.ValueKind)
        {
            case JsonValueKind.Null:
                return actualValue is null;
            case JsonValueKind.String:
                return actualValue?.ToString() == expectedValue.GetString();
            case JsonValueKind.Number:
                if (actualValue is int intValue)
                    return intValue == expectedValue.GetInt32();
                if (actualValue is long longValue)
                    return longValue == expectedValue.GetInt64();
                if (actualValue is decimal decimalValue)
                    return decimalValue == expectedValue.GetDecimal();
                if (actualValue is double doubleValue)
                    return Math.Abs(doubleValue - expectedValue.GetDouble()) < 0.0001;
                return false;
            case JsonValueKind.True:
                return actualValue is true or 1 or "true" or "True";
            case JsonValueKind.False:
                return actualValue is false or 0 or "false" or "False";
            default:
                return false;
        }
    }
}