using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using SqlOnFhir.ViewRunner.Models;
using SqlOnFhir.ViewRunner.SqlGeneration;
using SqlOnFhir.ViewRunner.Testing;
using System.Text.Json;

namespace SqlOnFhir.ViewRunner;

/// <summary>
/// SQL on FHIR View Runner - transpiles FHIR view definitions to T-SQL and runs test suites.
/// </summary>
/// <author>John Grimes</author>
public static class Program
{
    public static async Task<int> Main(string[] args)
    {
        var configuration = new ConfigurationBuilder()
            .AddCommandLine(args)
            .AddJsonFile("appsettings.json", optional: true)
            .AddEnvironmentVariables()
            .Build();

        var command = configuration["command"] ?? "help";
        
        return command.ToLower() switch
        {
            "generate" => await GenerateCommand(configuration),
            "test" => await TestCommand(configuration),
            "help" => ShowHelp(),
            _ => ShowHelp()
        };
    }

    private static async Task<int> GenerateCommand(IConfiguration configuration)
    {
        var viewFilePath = configuration["view"];
        var outputPath = configuration["output"];

        if (string.IsNullOrEmpty(viewFilePath))
        {
            Console.WriteLine("Error: --view parameter is required for generate command.");
            return 1;
        }

        try
        {
            var viewJson = await File.ReadAllTextAsync(viewFilePath);
            var viewDefinition = JsonSerializer.Deserialize<ViewDefinition>(viewJson, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (viewDefinition is null)
            {
                Console.WriteLine("Error: Failed to parse view definition.");
                return 1;
            }

            var generator = new TSqlGenerator();
            var sql = generator.GenerateQuery(viewDefinition);

            if (string.IsNullOrEmpty(outputPath))
            {
                Console.WriteLine(sql);
            }
            else
            {
                await File.WriteAllTextAsync(outputPath, sql);
                Console.WriteLine($"SQL query written to {outputPath}");
            }

            return 0;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error: {ex.Message}");
            return 1;
        }
    }

    private static async Task<int> TestCommand(IConfiguration configuration)
    {
        var testDirectory = configuration["tests"];
        var outputPath = configuration["output"] ?? "test_report.json";

        if (string.IsNullOrEmpty(testDirectory))
        {
            Console.WriteLine("Error: --tests parameter is required for test command.");
            return 1;
        }

        var connectionString = configuration.GetConnectionString("DefaultConnection");
        
        if (string.IsNullOrEmpty(connectionString))
        {
            Console.WriteLine("Error: No connection string provided for test command. Use --ConnectionStrings:DefaultConnection or set environment variable.");
            return 1;
        }

        try
        {
            using var databaseService = new DatabaseService(connectionString);
            await databaseService.OpenAsync();
            await databaseService.CreateFhirResourcesTableAsync();

            var testRunner = new TestRunner(databaseService);
            var testReports = await testRunner.RunTestsAsync(testDirectory);

            var reportJson = JsonSerializer.Serialize(testReports, new JsonSerializerOptions
            {
                WriteIndented = true
            });

            await File.WriteAllTextAsync(outputPath, reportJson);
            Console.WriteLine($"Test report written to {outputPath}");

            // Print summary.
            var totalTests = testReports.Values.SelectMany(r => r.Tests).Count();
            var passedTests = testReports.Values.SelectMany(r => r.Tests).Count(t => t.Result.Passed);
            
            Console.WriteLine($"Test Summary: {passedTests}/{totalTests} tests passed");

            return passedTests == totalTests ? 0 : 1;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error: {ex.Message}");
            return 1;
        }
    }

    private static int ShowHelp()
    {
        Console.WriteLine("SQL on FHIR View Runner");
        Console.WriteLine();
        Console.WriteLine("Usage:");
        Console.WriteLine("  SqlOnFhir.ViewRunner --command=generate --view=<path> [--output=<path>]");
        Console.WriteLine("  SqlOnFhir.ViewRunner --command=test --tests=<directory> [--output=<path>]");
        Console.WriteLine();
        Console.WriteLine("Commands:");
        Console.WriteLine("  generate    Generate T-SQL from a view definition");
        Console.WriteLine("  test        Run test suite against SQL Server");
        Console.WriteLine("  help        Show this help message");
        Console.WriteLine();
        Console.WriteLine("Parameters:");
        Console.WriteLine("  --ConnectionStrings:DefaultConnection  SQL Server connection string");
        Console.WriteLine("  --view                                 Path to view definition JSON file");
        Console.WriteLine("  --tests                                Directory containing test JSON files");
        Console.WriteLine("  --output                               Output file path");
        Console.WriteLine();
        Console.WriteLine("Examples:");
        Console.WriteLine("  SqlOnFhir.ViewRunner --command=generate --view=patient_view.json");
        Console.WriteLine("  SqlOnFhir.ViewRunner --command=test --tests=./tests --ConnectionStrings:DefaultConnection=\"Server=.;Database=TestDB;Trusted_Connection=true\"");
        
        return 0;
    }
}
