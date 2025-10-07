#!/usr/bin/env node

/**
 * CLI command for loading NDJSON files into SQL Server.
 *
 * @author John Grimes
 */

import { Command } from "commander";
import { getDatabaseConfigFromEnv, loadNdjsonFiles } from "./loader/index.js";
import type { LoaderOptions } from "./loader/types.js";

/**
 * Create the load command.
 *
 * @returns Commander command for loading NDJSON files.
 */
// eslint-disable-next-line max-lines-per-function -- CLI command setup requires many options
export function createLoadCommand(): Command {
  const command = new Command("load");

  command
    .description("Load NDJSON files into SQL Server")
    .argument("<directory>", "Directory containing NDJSON files")
    .option("--host <host>", "Database server hostname")
    .option("--port <port>", "Database server port", parseInt)
    .option("--user <user>", "Database username")
    .option("--password <password>", "Database password")
    .option("--database <database>", "Database name")
    .option("--trust-server-certificate", "Trust server certificate", false)
    .option(
      "--pattern <pattern>",
      "File naming pattern (default: {ResourceType}.ndjson)",
    )
    .option("--resource-type <type>", "Only load specific resource type")
    .option("--table-name <name>", "Table name (default: fhir_resources)")
    .option("--schema-name <name>", "Schema name (default: dbo)")
    .option("--no-create-table", "Do not create table if it doesn't exist")
    .option("--truncate", "Truncate table before loading", false)
    .option("--batch-size <size>", "Number of rows per batch", parseInt, 1000)
    .option(
      "--parallel <count>",
      "Number of files to process in parallel",
      parseInt,
      4,
    )
    .option(
      "--continue-on-error",
      "Continue loading other files if one fails",
      false,
    )
    .option("--dry-run", "Show what would be loaded without loading", false)
    .option("--verbose", "Enable verbose logging", false)
    .option("--quiet", "Minimal output", false)
    .option("--progress", "Show progress bar", false)
    // eslint-disable-next-line max-lines-per-function -- Action handler needs to process all options
    .action(
      async (directory: string, commandOptions: Record<string, unknown>) => {
        try {
          // For dry-run mode, we don't need a real database connection.
          // Use dummy values if none provided.
          const database = commandOptions.dryRun
            ? {
                host:
                  (commandOptions.host as string | undefined) ?? "localhost",
                port: (commandOptions.port as number | undefined) ?? 1433,
                user: (commandOptions.user as string | undefined) ?? "sa",
                password:
                  (commandOptions.password as string | undefined) ?? "dummy",
                database:
                  (commandOptions.database as string | undefined) ?? "dummy",
                trustServerCertificate:
                  commandOptions.trustServerCertificate as boolean | undefined,
              }
            : getDatabaseConfigFromEnv({
                host: commandOptions.host as string | undefined,
                port: commandOptions.port as number | undefined,
                user: commandOptions.user as string | undefined,
                password: commandOptions.password as string | undefined,
                database: commandOptions.database as string | undefined,
                trustServerCertificate:
                  commandOptions.trustServerCertificate as boolean | undefined,
              });

          // Build loader options.
          const options: LoaderOptions = {
            directory,
            database,
            pattern: commandOptions.pattern as string | undefined,
            resourceType: commandOptions.resourceType as string | undefined,
            tableName: commandOptions.tableName as string | undefined,
            schemaName: commandOptions.schemaName as string | undefined,
            createTable: commandOptions.createTable as boolean | undefined,
            truncate: commandOptions.truncate as boolean | undefined,
            batchSize: commandOptions.batchSize as number | undefined,
            parallel: commandOptions.parallel as number | undefined,
            continueOnError: commandOptions.continueOnError as
              | boolean
              | undefined,
            dryRun: commandOptions.dryRun as boolean | undefined,
            verbose: commandOptions.verbose as boolean | undefined,
            quiet: commandOptions.quiet as boolean | undefined,
            progress: commandOptions.progress as boolean | undefined,
          };

          // Load the files.
          const summary = await loadNdjsonFiles(options);

          // Exit with error code if any files failed.
          if (summary.filesFailed > 0) {
            process.exit(1);
          }
        } catch (err) {
          console.error(
            `Error: ${err instanceof Error ? err.message : String(err)}`,
          );
          process.exit(1);
        }
      },
    );

  return command;
}
