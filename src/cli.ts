#!/usr/bin/env node

/**
 * Command-line interface for SQL on FHIR MS SQL transpiler.
 */

import { Command } from "commander";
import { readFileSync, writeFileSync } from "fs";
import { createTable, createView, SqlOnFhir, transpile } from "./index.js";

const program = new Command();

program
  .name("sof-mssql")
  .description(
    "SQL on FHIR MS SQL transpiler - converts ViewDefinitions to T-SQL queries",
  )
  .version("1.0.0");

program
  .command("transpile")
  .description("Transpile a ViewDefinition to T-SQL query")
  .argument("<input>", "Input ViewDefinition file (JSON)")
  .option("-o, --output <file>", "Output file for generated SQL")
  .option("-t, --table <name>", "FHIR resources table name", "fhir_resources")
  .option("-s, --schema <name>", "Database schema name", "dbo")
  .option("--id-column <name>", "Resource ID column name", "id")
  .option("--json-column <name>", "Resource JSON column name", "json")
  .action((input, options) => {
    try {
      const viewDefJson = readFileSync(input, "utf8");

      const result = transpile(viewDefJson, {
        tableName: options.table,
        schemaName: options.schema,
        resourceIdColumn: options.idColumn,
        resourceJsonColumn: options.jsonColumn,
      });

      if (options.output) {
        writeFileSync(options.output, result.sql);
        console.log(`SQL query written to ${options.output}`);
      } else {
        console.log(result.sql);
      }

      // Print column information
      console.error("\n-- Column Information:");
      for (const col of result.columns) {
        console.error(
          `-- ${col.name}: ${col.type}${col.description ? " - " + col.description : ""}`,
        );
      }
    } catch (error) {
      console.error("Error:", error);
      process.exit(1);
    }
  });

program
  .command("create-view")
  .description("Generate CREATE VIEW statement")
  .argument("<input>", "Input ViewDefinition file (JSON)")
  .argument("[view-name]", "Name for the created view")
  .option("-o, --output <file>", "Output file for generated SQL")
  .option("-t, --table <name>", "FHIR resources table name", "fhir_resources")
  .option("-s, --schema <name>", "Database schema name", "dbo")
  .option("--id-column <name>", "Resource ID column name", "id")
  .option("--json-column <name>", "Resource JSON column name", "json")
  .action((input, viewName, options) => {
    try {
      const viewDefJson = readFileSync(input, "utf8");

      const sql = createView(viewDefJson, viewName, {
        tableName: options.table,
        schemaName: options.schema,
        resourceIdColumn: options.idColumn,
        resourceJsonColumn: options.jsonColumn,
      });

      if (options.output) {
        writeFileSync(options.output, sql);
        console.log(`CREATE VIEW statement written to ${options.output}`);
      } else {
        console.log(sql);
      }
    } catch (error) {
      console.error("Error:", error);
      process.exit(1);
    }
  });

program
  .command("create-table")
  .description("Generate CREATE TABLE statement for materialised view")
  .argument("<input>", "Input ViewDefinition file (JSON)")
  .argument("[table-name]", "Name for the created table")
  .option("-o, --output <file>", "Output file for generated SQL")
  .option("-t, --table <name>", "FHIR resources table name", "fhir_resources")
  .option("-s, --schema <name>", "Database schema name", "dbo")
  .option("--id-column <name>", "Resource ID column name", "id")
  .option("--json-column <name>", "Resource JSON column name", "json")
  .action((input, tableName, options) => {
    try {
      const viewDefJson = readFileSync(input, "utf8");

      const sql = createTable(viewDefJson, tableName, {
        tableName: options.table,
        schemaName: options.schema,
        resourceIdColumn: options.idColumn,
        resourceJsonColumn: options.jsonColumn,
      });

      if (options.output) {
        writeFileSync(options.output, sql);
        console.log(`CREATE TABLE statement written to ${options.output}`);
      } else {
        console.log(sql);
      }
    } catch (error) {
      console.error("Error:", error);
      process.exit(1);
    }
  });

program
  .command("validate")
  .description("Validate a ViewDefinition file")
  .argument("<input>", "Input ViewDefinition file (JSON)")
  .action((input) => {
    try {
      const viewDefJson = readFileSync(input, "utf8");
      const viewDef = SqlOnFhir.parseViewDefinition(viewDefJson);
      console.log(`✓ ViewDefinition is valid`);
      console.log(`  Resource: ${viewDef.resource}`);
      console.log(`  Name: ${viewDef.name ?? "unnamed"}`);
      console.log(`  Status: ${viewDef.status}`);

      const columns = SqlOnFhir.getColumnNames(viewDef);
      console.log(`  Columns: ${columns.join(", ")}`);
    } catch (error) {
      console.error("✗ ViewDefinition is invalid:", error);
      process.exit(1);
    }
  });

program
  .command("test")
  .description("Run tests from sql-on-fhir-v2 test suite using Vitest")
  .argument(
    "<test-path>",
    "Test suite file (JSON) or directory containing test files",
  )
  .option("-c, --connection <string>", "SQL Server connection string")
  .option("--host <host>", "SQL Server host")
  .option("--port <port>", "SQL Server port")
  .option("--database <db>", "Database name")
  .option("--user <user>", "Username")
  .option("--password <password>", "Password")
  .option("-t, --table <name>", "FHIR resources table name")
  .option("-s, --schema <name>", "Database schema name")
  .option("--encrypt", "Enable encryption")
  .option("--trust-cert", "Trust server certificate")
  .option("--report <path>", "Path to write test report JSON file", "test-report.json")
  .option("--use-legacy", "Use legacy test runner instead of Vitest")
  .action(async (testPath, options) => {
    try {
      // Helper function to get value with precedence: CLI option > Environment variable > Default
      const getValue = (cliValue: any, envVar: string, defaultValue: any) => {
        if (cliValue !== undefined) return cliValue;
        const envValue = process.env[envVar];
        if (envValue !== undefined) return envValue;
        return defaultValue;
      };

      // Helper for boolean values
      const getBooleanValue = (cliValue: any, envVar: string, defaultValue: boolean) => {
        if (cliValue !== undefined) return cliValue;
        const envValue = process.env[envVar];
        if (envValue !== undefined) return envValue.toLowerCase() === 'true';
        return defaultValue;
      };

      // Set up environment variables for Vitest and database connection
      process.env.SQLONFHIR_TEST_PATH = testPath;
      process.env.MSSQL_CONNECTION_STRING = getValue(options.connection, 'MSSQL_CONNECTION_STRING', '');
      process.env.MSSQL_HOST = getValue(options.host, 'MSSQL_HOST', 'localhost');
      process.env.MSSQL_PORT = getValue(options.port, 'MSSQL_PORT', '1433');
      process.env.MSSQL_DATABASE = getValue(options.database, 'MSSQL_DATABASE', 'test');
      process.env.MSSQL_USER = getValue(options.user, 'MSSQL_USER', '');
      process.env.MSSQL_PASSWORD = getValue(options.password, 'MSSQL_PASSWORD', '');
      process.env.MSSQL_TABLE = getValue(options.table, 'MSSQL_TABLE', 'fhir_resources');
      process.env.MSSQL_SCHEMA = getValue(options.schema, 'MSSQL_SCHEMA', 'dbo');
      process.env.MSSQL_ENCRYPT = getBooleanValue(options.encrypt, 'MSSQL_ENCRYPT', true) ? 'true' : 'false';
      process.env.MSSQL_TRUST_CERT = getBooleanValue(options.trustCert, 'MSSQL_TRUST_CERT', true) ? 'true' : 'false';

      // Use legacy runner if requested
      if (options.useLegacy) {
        return await runLegacyTests(testPath, options);
      }

      // Use Vitest to run the tests
      const { spawn } = await import("child_process");
      const { resolve } = await import("path");
      const { existsSync } = await import("fs");

      console.log(`🧪 Running SQL-on-FHIR tests using Vitest: ${testPath}`);

      // Create custom reporter instance for report generation
      const reporterPath = resolve(__dirname, "./vitest-reporter.js");
      const { SqlOnFhirReporter } = await import("./vitest-reporter.js");
      const reporter = new SqlOnFhirReporter({
        outputPath: options.report,
        autoWriteReport: true,
      });

      // Run Vitest with the dynamic test file
      const vitestArgs = [
        "run",
        "tests/sql-on-fhir-dynamic.test.ts",
        "--reporter=default",
        `--reporter=${reporterPath}`,
      ];

      const vitestProcess = spawn("npx", ["vitest", ...vitestArgs], {
        stdio: "inherit",
        env: { ...process.env },
      });

      vitestProcess.on("close", (code) => {
        if (code === 0) {
          console.log(`✅ All tests passed! Report written to: ${options.report}`);
        } else {
          console.error(`❌ Tests failed with exit code: ${code}`);
          process.exit(code || 1);
        }
      });

      vitestProcess.on("error", (error) => {
        console.error(`❌ Failed to run Vitest: ${error.message}`);
        console.error("\n💡 Make sure Vitest is installed: npm install");
        process.exit(1);
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("❌ Error running tests:", errorMessage);
      process.exit(1);
    }
  });

/**
 * Run tests using the legacy TestRunner (fallback option).
 */
async function runLegacyTests(testPath: string, options: any) {
  const { TestRunner } = await import("./test-runner.js");
  const { statSync } = await import("fs");

  // Helper functions (same as before)
  const getValue = (cliValue: any, envVar: string, defaultValue: any) => {
    if (cliValue !== undefined) return cliValue;
    const envValue = process.env[envVar];
    if (envValue !== undefined) return envValue;
    return defaultValue;
  };

  const getBooleanValue = (cliValue: any, envVar: string, defaultValue: boolean) => {
    if (cliValue !== undefined) return cliValue;
    const envValue = process.env[envVar];
    if (envValue !== undefined) return envValue.toLowerCase() === 'true';
    return defaultValue;
  };

  const config = {
    connectionString: getValue(options.connection, 'MSSQL_CONNECTION_STRING', undefined),
    server: getValue(options.host, 'MSSQL_HOST', 'localhost'),
    port: parseInt(getValue(options.port, 'MSSQL_PORT', '1433')),
    database: getValue(options.database, 'MSSQL_DATABASE', 'test'),
    user: getValue(options.user, 'MSSQL_USER', undefined),
    password: getValue(options.password, 'MSSQL_PASSWORD', undefined),
    tableName: getValue(options.table, 'MSSQL_TABLE', 'fhir_resources'),
    schemaName: getValue(options.schema, 'MSSQL_SCHEMA', 'dbo'),
    options: {
      encrypt: getBooleanValue(options.encrypt, 'MSSQL_ENCRYPT', true),
      trustServerCertificate: getBooleanValue(options.trustCert, 'MSSQL_TRUST_CERT', true),
    },
  };

  // Check if testPath is a file or directory
  const stats = statSync(testPath);

  if (stats.isDirectory()) {
    console.log(`Running all test suites in directory: ${testPath}`);
    const results = await TestRunner.runTestSuitesFromDirectory(testPath, config);
    TestRunner.printDirectoryResults(results);

    // Generate and write test report
    const report = TestRunner.generateDirectoryTestReport(results);
    await TestRunner.writeTestReport(report, options.report);
    console.log(`📝 Test report written to: ${options.report}`);

    const totalPassed = results.reduce((sum: number, result) => sum + result.passedCount, 0);
    const totalTests = results.reduce((sum: number, result) => sum + result.totalCount, 0);

    if (totalPassed !== totalTests) {
      process.exit(1);
    }
  } else {
    console.log(`Running test suite: ${testPath}`);
    const result = await TestRunner.runTestSuiteFromFile(testPath, config);
    TestRunner.printResults(result);

    // Generate and write test report
    const report = TestRunner.generateTestReport(result);
    await TestRunner.writeTestReport(report, options.report);
    console.log(`📝 Test report written to: ${options.report}`);

    if (result.passedCount !== result.totalCount) {
      process.exit(1);
    }
  }
}

program
  .command("examples")
  .description("Show usage examples")
  .action(() => {
    console.log(`
SQL on FHIR MS SQL Transpiler Examples:

1. Transpile a ViewDefinition to SQL:
   sof-mssql transpile patient-view.json

2. Create a database view:
   sof-mssql create-view patient-view.json patient_demographics

3. Create a materialised table:
   sof-mssql create-table patient-view.json patient_demographics_table

4. Validate a ViewDefinition:
   sof-mssql validate patient-view.json

5. Save output to file:
   sof-mssql transpile patient-view.json -o patient-query.sql

6. Use custom table settings:
   sof-mssql transpile patient-view.json \\
     --table my_fhir_data \\
     --schema healthcare \\
     --id-column resource_id \\
     --json-column resource_data

Example ViewDefinition (patient-view.json):
{
  "resourceType": "ViewDefinition",
  "resource": "Patient",
  "status": "active",
  "name": "patient_demographics",
  "select": [
    {
      "column": [
        {"name": "patient_id", "path": "id", "type": "id"},
        {"name": "gender", "path": "gender", "type": "code"},
        {"name": "birth_date", "path": "birthDate", "type": "date"}
      ]
    },
    {
      "forEach": "name.where(use = 'official').first()",
      "column": [
        {"name": "given_name", "path": "given.join(' ')", "type": "string"},
        {"name": "family_name", "path": "family", "type": "string"}
      ]
    }
  ]
}
`);
  });

// Handle unknown commands
program.on("command:*", function (operands) {
  console.error(`Unknown command: ${operands[0]}`);
  console.error("Use --help to see available commands");
  process.exit(1);
});

// Parse command line arguments
if (process.argv.length <= 2) {
  program.help();
}

program.parse();
