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
  .description("Run tests from sql-on-fhir-v2 test suite")
  .argument(
    "<test-path>",
    "Test suite file (JSON) or directory containing test files",
  )
  .option("-c, --connection <string>", "SQL Server connection string")
  .option("--host <host>", "SQL Server host", "localhost")
  .option("--port <port>", "SQL Server port", "1433")
  .option("--database <db>", "Database name", "test")
  .option("--user <user>", "Username")
  .option("--password <password>", "Password")
  .option("-t, --table <name>", "FHIR resources table name", "fhir_resources")
  .option("-s, --schema <name>", "Database schema name", "dbo")
  .option("--encrypt", "Enable encryption", true)
  .option("--trust-cert", "Trust server certificate", true)
  .action(async (testPath, options) => {
    try {
      const { TestRunner } = await import("./test-runner.js");
      const { statSync } = await import("fs");

      const config = {
        connectionString: options.connection,
        server: options.host,
        port: parseInt(options.port),
        database: options.database,
        user: options.user,
        password: options.password,
        tableName: options.table,
        schemaName: options.schema,
        options: {
          encrypt: options.encrypt,
          trustServerCertificate: options.trustCert,
        },
      };

      // Check if testPath is a file or directory
      const stats = statSync(testPath);

      if (stats.isDirectory()) {
        // Run all JSON test files in the directory
        console.log(`Running all test suites in directory: ${testPath}`);
        const results = await TestRunner.runTestSuitesFromDirectory(
          testPath,
          config,
        );
        TestRunner.printDirectoryResults(results);

        const totalPassed = results.reduce(
          (sum: number, result) => sum + result.passedCount,
          0,
        );
        const totalTests = results.reduce(
          (sum: number, result) => sum + result.totalCount,
          0,
        );

        if (totalPassed !== totalTests) {
          process.exit(1);
        }
      } else {
        // Run single test file
        console.log(`Running test suite: ${testPath}`);
        const result = await TestRunner.runTestSuiteFromFile(testPath, config);
        TestRunner.printResults(result);

        if (result.passedCount !== result.totalCount) {
          process.exit(1);
        }
      }
    } catch (error) {
      console.error("Error running tests:", error);
      process.exit(1);
    }
  });

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
