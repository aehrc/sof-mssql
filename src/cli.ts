#!/usr/bin/env node

/**
 * CLI for transpiling ViewDefinitions to T-SQL.
 * Reads ViewDefinition JSON from stdin or file and outputs SQL to stdout or file.
 */

import { Command } from "commander";
import { readFileSync, writeFileSync } from "fs";
import { SqlOnFhir } from "./index.js";

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
 * Main CLI entry point.
 */
async function main(): Promise<void> {
  const program = new Command();

  program
    .name("sof-mssql")
    .description("Transpile SQL on FHIR ViewDefinitions to T-SQL queries")
    .version("1.0.0")
    .option(
      "-i, --input <file>",
      "Input ViewDefinition JSON file (default: stdin)",
    )
    .option("-o, --output <file>", "Output SQL file (default: stdout)")
    .parse(process.argv);

  const options = program.opts<{ input?: string; output?: string }>();

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
  } catch (error) {
    console.error(
      `Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}

void main();
