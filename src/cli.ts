#!/usr/bin/env node

/**
 * CLI for SQL on FHIR tooling.
 * Supports transpiling ViewDefinitions and loading NDJSON data.
 */

import { Command } from "commander";
import { readFileSync, writeFileSync } from "fs";
import { SqlOnFhir } from "./index.js";
import { createLoadCommand } from "./load.js";

/**
 * Read input from stdin or file.
 */
async function readInput(inputFile?: string): Promise<string> {
  if (inputFile) {
    return readFileSync(inputFile, "utf-8");
  }

  // Read from stdin.
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

/**
 * Write output to stdout or file.
 */
function writeOutput(sql: string, outputFile?: string): void {
  if (outputFile) {
    writeFileSync(outputFile, sql, "utf-8");
  } else {
    process.stdout.write(sql);
  }
}

/**
 * Create the transpile command (default behaviour).
 */
function createTranspileCommand(): Command {
  const command = new Command("transpile");

  command
    .description("Transpile SQL on FHIR ViewDefinitions to T-SQL queries")
    .option(
      "-i, --input <file>",
      "Input ViewDefinition JSON file (default: stdin)",
    )
    .option("-o, --output <file>", "Output SQL file (default: stdout)")
    .action(async (options: { input?: string; output?: string }) => {
      try {
        // Read ViewDefinition from stdin or file.
        const input = await readInput(options.input);

        // Parse and validate JSON.
        const viewDefinition: object = JSON.parse(input);

        // Transpile to SQL.
        const sqlOnFhir = new SqlOnFhir();
        const result = sqlOnFhir.transpile(viewDefinition);

        // Write SQL to stdout or file.
        writeOutput(result.sql, options.output);
      } catch (err) {
        console.error(
          `Error: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
      }
    });

  return command;
}
/**
 * Main CLI entry point.
 */
async function main(): Promise<void> {
  const program = new Command();

  program
    .name("sof-mssql")
    .description("SQL on FHIR tooling for MS SQL Server")
    .version("1.0.0");

  // Add subcommands.
  program.addCommand(createTranspileCommand());
  program.addCommand(createLoadCommand());

  // Parse arguments.
  await program.parseAsync(process.argv);

  // If no command specified, show help.
  if (process.argv.length <= 2) {
    program.help();
  }
}

void main();
