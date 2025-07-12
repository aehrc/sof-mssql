# SQL on FHIR View Runner

A .NET CLI application that transpiles SQL on FHIR view definitions into T-SQL queries that can be executed on Microsoft SQL Server.

## Features

- **View Transpilation**: Converts SQL on FHIR ViewDefinition JSON into T-SQL queries
- **Test Suite Runner**: Executes the official SQL on FHIR v2 test suite against SQL Server
- **Minimal Dependencies**: Uses only essential .NET packages for database connectivity and JSON serialisation
- **FHIR Data Storage**: Assumes FHIR data is stored in a table with `id` (resource ID) and `json` (JSON representation) columns

## Requirements

- .NET 9.0 or later
- Microsoft SQL Server (any recent version that supports JSON functions)
- Access to the [FHIR/sql-on-fhir-v2](https://github.com/FHIR/sql-on-fhir-v2) test repository

## Installation

```bash
git clone <this-repository>
cd sof-mssql
dotnet build
```

## Usage

### Generate T-SQL from View Definition

```bash
dotnet run -- --command=generate --view=patient_view.json
```

### Run Test Suite

```bash
dotnet run -- --command=test --tests=./tests --ConnectionStrings:DefaultConnection="Server=.;Database=TestDB;Trusted_Connection=true"
```

### Command Line Parameters

- `--command`: Command to execute (`generate`, `test`, or `help`)
- `--ConnectionStrings:DefaultConnection`: SQL Server connection string
- `--view`: Path to view definition JSON file (for generate command)
- `--tests`: Directory containing test JSON files (for test command)
- `--output`: Output file path (optional)

## Database Schema

The application expects FHIR resources to be stored in a table with the following schema:

```sql
CREATE TABLE fhir_resources (
    id NVARCHAR(64) NOT NULL PRIMARY KEY,
    json NVARCHAR(MAX) NOT NULL
);
```

The `id` column contains the FHIR resource ID, and the `json` column contains the complete JSON representation of the FHIR resource.

## Example View Definition

```json
{
  "resourceType": "ViewDefinition",
  "resource": "Patient",
  "name": "patient_demographics",
  "select": [
    {
      "column": [
        {"name": "patient_id", "path": "getResourceKey()"},
        {"name": "gender", "path": "gender"},
        {"name": "dob", "path": "birthDate"}
      ]
    },
    {
      "forEach": "name.where(use = 'official').first()",
      "column": [
        {"path": "given.join(' ')", "name": "given_name"},
        {"path": "family", "name": "family_name"}
      ]
    }
  ]
}
```

## FHIRPath Support

The application implements a subset of FHIRPath expressions commonly used in SQL on FHIR view definitions:

- Basic property access: `id`, `gender`, `birthDate`
- Nested property access: `name.family`
- Array access: `name[0]`, `name.first()`
- Functions: `getResourceKey()`, `exists()`, `join()`
- Filtering: `where()` clauses
- Boolean operators: `and`, `or`
- Comparisons: `=`, `!=`

## Test Suite

The application can run the official SQL on FHIR v2 test suite from the [FHIR/sql-on-fhir-v2](https://github.com/FHIR/sql-on-fhir-v2) repository. Test results are output in the standard test report format as specified in the SQL on FHIR specification.

To run tests:

1. Clone the sql-on-fhir-v2 repository
2. Point the `--tests` parameter to the `tests` directory
3. Provide a valid SQL Server connection string

Example:
```bash
git clone https://github.com/FHIR/sql-on-fhir-v2.git
dotnet run -- --command=test --tests=./sql-on-fhir-v2/tests --ConnectionStrings:DefaultConnection="Server=localhost;Database=SqlOnFhirTest;Trusted_Connection=true"
```

## Limitations

This is an initial implementation with the following limitations:

- **FHIRPath Coverage**: Implements a subset of FHIRPath expressions
- **Complex Queries**: Advanced view definitions with complex forEach and unionAll may not be fully supported
- **Performance**: Not optimised for large datasets
- **Data Types**: Limited support for complex FHIR data types

## Contributing

This implementation follows the SQL on FHIR v2.0 specification. For issues or improvements, please refer to the specification documentation and test suite.

## License

This project is open source. Please refer to the LICENSE file for details.