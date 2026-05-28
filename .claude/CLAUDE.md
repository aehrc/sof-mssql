# Project instructions

## Getting started

Before starting any work on this project, always read the CONTRIBUTING.md file to understand the project's contribution guidelines and requirements.

## Running tests

This project uses environment variables stored in a `.env` file for database connection configuration. When running tests, these variables must be properly sourced into the environment.

To run the test suite:

```bash
set -a && source .env && set +a && npm test
```

This command performs the following steps:

1. `set -a` — Enables the allexport option, which automatically exports all variables that are set or modified.
2. `source .env` — Sources the `.env` file, loading all environment variables.
3. `set +a` — Disables the allexport option.
4. `npm test` — Runs the test suite with the environment variables now available.

### Important notes

- Ensure a `.env` file exists in the project root before running tests.
- The `.env` file should contain all necessary database connection parameters.
- Never commit the `.env` file to version control as it may contain sensitive credentials.

## Environment variables

The project relies on environment variables for database configuration. Check the `.env.example` file (if present) or the project documentation for required variables.

## IntelliJ IDE integration

This project uses IntelliJ IDEA with MCP server integration for code analysis and problem detection.

### Checking for problems

When checking files for problems using the `mcp__intellij__get_file_problems` tool:

- **Always set `errorsOnly: false`** to include both errors and warnings
- Always specify the `projectPath` parameter to avoid ambiguity when multiple projects are open
- Include both SonarQube and IDE warnings to ensure comprehensive code quality checks

Example:
```typescript
mcp__intellij__get_file_problems({
  filePath: "src/parser.ts",
  projectPath: "/Users/gri306/Code/sof-mssql",
  errorsOnly: false  // IMPORTANT: Include warnings
})
```

Warnings often catch important issues such as:
- Using deprecated APIs (e.g., `isNaN` vs `Number.isNaN`)
- Type validation requiring specific error types (e.g., `TypeError` for type checks)
- Complex regex patterns that should be simplified
- Code quality issues flagged by SonarQube
