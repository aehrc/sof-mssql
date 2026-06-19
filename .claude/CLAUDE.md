# Project instructions

## Constitution

### sof-mssql Constitution

#### Core Principles

##### I. Specification conformance (NON-NEGOTIABLE)

Every transpilation feature MUST conform to the [SQL on FHIR v2
specification](https://sql-on-fhir.org/ig/2.0.0/). Conformance is proven, not
asserted: the upstream `sqlonfhir` test submodule is the source of truth, and
the full test suite MUST pass before a change merges. This includes the `join()`
over an empty collection and the `lowBoundary()` / `highBoundary()` functions
(for `date`, `dateTime`, `time` and `decimal`), which are implemented and whose
upstream `#experimental` tests are therefore in scope and expected to pass. The
upstream `#experimental` tags are owned by the submodule and MUST NOT be edited.
If a future upstream revision adds tests for behaviour this implementation does
not yet support, those specific tests MAY be excluded from the gate with a
documented reason; anything else that diverges from the specification MUST not
ship. New behaviour MUST cite the relevant section of the specification.

_Rationale: the project's entire value is being a faithful SQL on FHIR runner.
Silent divergence from the spec produces wrong analytical results that
downstream users cannot detect._

##### II. Valid, executable T-SQL

All generated SQL MUST be valid, executable T-SQL for Microsoft SQL Server 2017
and later. Output MUST NOT rely on engine-specific extensions beyond that
baseline, MUST bracket-quote identifiers where required, and MUST handle empty
collections as SQL `NULL` per the specification's data-type mapping. Generated
SQL is an external contract: it MUST be verified against a real SQL Server
instance, not merely inspected as a string.

_Rationale: a query that parses in TypeScript but fails or silently
mis-executes on SQL Server is a defect the library exists to prevent._

##### III. Test-first (NON-NEGOTIABLE)

Tests MUST be written before implementation. For every feature or bug fix, a
failing test that defines the expected behaviour comes first; implementation
follows only to make it pass. The Red-Green-Refactor cycle is strictly
enforced. Bug fixes MUST include a regression test that fails without the fix.
No change merges without its behaviour expressed as an executable test.

##### IV. Trusted boundaries through validated input

External input - ViewDefinition JSON, CLI arguments, NDJSON resources - MUST be
accepted as `unknown` and narrowed through runtime type predicates
(`data is Type`) before use. Blind type assertions (`as SomeType`) on
unvalidated data are forbidden. Invalid input MUST be rejected with a meaningful
error that references the offending ViewDefinition element.

_Rationale: the library transpiles attacker- or user-controlled documents into
SQL; trusting unvalidated structure invites both crashes and malformed output._

##### V. Functional, composable design

Behaviour MUST be expressed through small, single-responsibility, pure
functions composed together, favouring immutable data. Classes are permitted
only where they provide clear encapsulation of genuine state (e.g. the public
`SqlOnFhir` facade); they MUST NOT be used as namespaces for otherwise-stateless
logic. Each module owns one concern - parsing, FHIRPath translation, T-SQL
generation, loading - and exposes only what callers need.

#### Quality gates

Before any change is considered complete it MUST pass, locally and in CI:

- A clean `npm run build`.
- The full test suite with coverage via `npm run test:coverage`, run with the
  database environment sourced (`set -a && source .env && set +a`).
- `npm run lint` with no errors or warnings.
- `npm run format:check` with no formatting differences.

These gates are not advisory. A change that cannot pass them is not done,
regardless of how complete the implementation appears.

#### Amendment and review

A pull request MAY be rejected by citing the specific principle it violates
(e.g. "violates Principle II - emits a SQL Server 2022-only function"). The
constitution governs reviews and is the tie-breaker when guidance conflicts.
Amendments are made by editing this section directly and explaining the change
in the commit message.

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
  errorsOnly: false, // IMPORTANT: Include warnings
});
```

Warnings often catch important issues such as:

- Using deprecated APIs (e.g., `isNaN` vs `Number.isNaN`)
- Type validation requiring specific error types (e.g., `TypeError` for type checks)
- Complex regex patterns that should be simplified
- Code quality issues flagged by SonarQube
