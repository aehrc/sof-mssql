# Contributing

Thank you for your interest in contributing to the SQL on FHIR view runner for
MS SQL Server. This project implements
the [SQL on FHIR ViewDefinition specification](https://sql-on-fhir.org/ig/StructureDefinition-ViewDefinition.html)
to transform FHIR resources into tabular views for analytical queries,
generating T-SQL compatible with Microsoft SQL Server.

## Getting started

Before contributing, please ensure you have:

- Understanding of
  the [SQL on FHIR ViewDefinition specification](https://sql-on-fhir.org/ig/StructureDefinition-ViewDefinition.html)
- Knowledge
  of [T-SQL syntax and features](https://learn.microsoft.com/en-us/sql/t-sql/language-reference?view=sql-server-ver17)

Review the specification carefully, as all contributions should align with its
requirements for view definitions, column selection, and FHIRPath expression
evaluation. Generated SQL must be valid T-SQL that executes correctly on MS SQL
Server.

## Code style guidelines

### TypeScript

Write clear, maintainable TypeScript code by following these principles:

**Type safety**

- Use explicit types rather than relying on inference where it improves clarity
- Avoid using `any` type unless absolutely necessary
- Define interfaces for ViewDefinition elements and FHIR resources
- Use union types and type guards for handling multiple possible types

**Functions and methods**

- Keep functions focused on a single responsibility
- Limit function length to approximately 50 lines where possible
- Use descriptive parameter names that indicate purpose
- Return early to reduce nesting and improve readability

**Naming conventions**

- Use camelCase for variables and functions
- Use PascalCase for interfaces and types
- Use UPPER_SNAKE_CASE for constants
- Choose names that clearly describe purpose without being excessively verbose
- Align naming with ViewDefinition terminology where applicable (e.g., `select`,
  `where`, `forEach`)

**Code organization**

- Prefer a simple functional style over object-oriented patterns
- Favor pure functions that take inputs and return outputs without side effects
- Use classes sparingly, only when they provide clear benefits for encapsulation
  or state management
- Compose complex behavior from smaller, focused functions
- Group related functionality into modules (e.g., ViewDefinition parsing,
  FHIRPath evaluation, T-SQL generation)
- Place interfaces and types at the top of files
- Order imports logically: external libraries first, then internal modules
- Export only what needs to be public

**Error handling**

- Handle errors explicitly rather than silently failing
- Provide meaningful error messages that reference ViewDefinition elements when
  possible
- Log errors appropriately for debugging

**Asynchronous code**

- Prefer async/await over raw promises for better readability
- Handle promise rejections explicitly
- Avoid blocking operations where possible

### T-SQL generation

When generating T-SQL code:

- Generate valid T-SQL compatible with SQL Server 2017 and later
- Use appropriate T-SQL functions for data type conversions and JSON operations
- Follow T-SQL naming conventions for database objects (e.g., bracket
  identifiers when necessary)
- Generate efficient queries that avoid unnecessary complexity

### Comments

Use a generous amount of comments in a narrative style to make the code
approachable and understandable:

**Narrative style**

- Write comments that tell the story of what the code is doing and why
- Use a conversational tone that guides readers through the logic
- Break down complex operations into explained steps
- Help future maintainers understand the thought process behind implementation
  decisions

**When to comment**

- Explain why decisions were made, not just what the code does
- Document complex algorithms or business logic with step-by-step explanations
- Note any workarounds for known issues, ViewDefinition specification
  limitations, or T-SQL constraints
- Highlight potential performance considerations
- Explain non-obvious FHIR resource transformations or FHIRPath evaluations
- Reference specific sections of the ViewDefinition specification when
  implementing features
- Document T-SQL-specific implementation choices (e.g., why a particular JSON
  function was used)
- Add context about edge cases and how they are handled
- Describe the purpose of code blocks, even when the code itself is clear

**When not to comment**

- Do not leave commented-out code in commits
- Remove TODO comments before merging unless tracking with an issue

**JSDoc documentation**

- Use JSDoc comments for all exported functions
- Include parameter descriptions and types
- Document return values and their meaning
- Note any exceptions that may be thrown
- Provide usage examples for complex functions

**Style**

- Write comments in complete sentences with proper punctuation
- Update comments when modifying related code
- Be generous with inline comments that explain the narrative flow

## Commit messages

Well-structured commit messages create a useful project history and make reviews
easier.

**Format**

```
Brief summary of the change

Optional detailed explanation of what changed and why.
Include context that helps reviewers and future maintainers
understand the reasoning behind the change.

Fixes #123
```

**Guidelines**

- Write the summary in imperative mood (e.g., “add” not “added”)
- Keep the summary under 72 characters
- Capitalize the first letter of the summary
- Do not end the summary with a period
- Leave a blank line between the summary and detailed explanation
- Explain what changed and why in the detailed explanation when helpful
- Reference issue numbers at the end when applicable

**Examples**

```
Add support for nested forEach in select columns

Implements nested forEach processing as defined in the ViewDefinition
specification section 3.2.4. Generates T-SQL using nested CROSS APPLY
statements to flatten nested FHIR arrays such as Observation.component
values.

Fixes #123
```

```
Handle null values in FHIRPath expression evaluation

Previously the view runner would fail when FHIRPath expressions
returned empty collections. Now correctly handles these as SQL NULL
per the specification's data type mapping guidance and generates
appropriate T-SQL COALESCE expressions.
```

```
Implement where clause filtering for ViewDefinitions

Adds support for the where element in ViewDefinitions, allowing
filtering of resources before view materialization. Translates
FHIRPath expressions to T-SQL WHERE conditions using JSON_VALUE
for element extraction.
```

```
Optimize OPENJSON usage for large resource collections

Refactored SQL generation to use explicit column definitions in
OPENJSON WITH clauses, improving query performance by 40% on
large FHIR resource tables.
```

## Testing

The project uses [Vitest](https://vitest.dev/) for testing. Tests are defined in
JSON files under `sqlonfhir/tests/` following
the [SQL on FHIR test specification](https://github.com/FHIR/sql-on-fhir-v2/blob/master/tests/README.md).

**Note**: The `sqlonfhir/` directory is a git submodule pointing to
the [SQL on FHIR v2 repository](https://github.com/FHIR/sql-on-fhir-v2). Test
definitions and ViewDefinition examples are maintained in that upstream
repository.

**Environment setup**

Tests require the following environment variables to connect to a MS SQL Server
database:

- `MSSQL_HOST` - Database server hostname or IP address
- `MSSQL_PORT` - Database server port (default: 1433)
- `MSSQL_USER` - Database username
- `MSSQL_PASSWORD` - Database password
- `MSSQL_DATABASE` - Database name
- `SQLONFHIR_TEST_PATH` - Path to test file or directory (e.g.,
  `sqlonfhir/tests` or `sqlonfhir/tests/basic.json`)

These can be set in a `.env` file in the project root (not checked into source
control) or provided via the command line.

**Running tests**

```bash
# Run all tests
SQLONFHIR_TEST_PATH=sqlonfhir/tests npm run test

# Run a specific test suite
SQLONFHIR_TEST_PATH=sqlonfhir/tests/basic.json npm run test

# Run tests in watch mode
SQLONFHIR_TEST_PATH=sqlonfhir/tests npm run test:watch
```

**Filtering tests**

Test names follow the pattern `(suite) test name #tag1 #tag2`, allowing precise
filtering:

```bash
# Run all tests from the "basic" suite
SQLONFHIR_TEST_PATH=sqlonfhir/tests npm run test -- -t "(basic)"

# Run all tests from the "foreach" suite
SQLONFHIR_TEST_PATH=sqlonfhir/tests npm run test -- -t "(foreach)"

# Run specific test by name
SQLONFHIR_TEST_PATH=sqlonfhir/tests npm run test -- -t "(basic) boolean attribute"

# Run all tests with a specific tag
SQLONFHIR_TEST_PATH=sqlonfhir/tests npm run test -- -t "#shareable"

# Run all tests containing "attribute"
SQLONFHIR_TEST_PATH=sqlonfhir/tests npm run test -- -t "attribute"
```

## Pull requests

- Run `npm run format` to format all code before committing
- Run `npm run lint` and fix any errors or warnings before committing code
- Ensure all tests pass by running
  `SQLONFHIR_TEST_PATH=sqlonfhir/tests npm run test`
- Create focused pull requests that address a single concern
- Provide a clear description of changes and their purpose
- Link to relevant issues and specification sections
- Ensure all tests pass and code follows style guidelines
- All pull requests must pass CI tests before merging.
