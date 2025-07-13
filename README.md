# SQL on FHIR MS SQL Server

A TypeScript library and CLI tool for transpiling [SQL on FHIR ViewDefinitions](https://sql-on-fhir.org/ig/latest/) into T-SQL queries that can be executed on Microsoft SQL Server.

## Features

- 📊 **ViewDefinition Transpilation**: Convert SQL on FHIR ViewDefinitions to T-SQL queries
- 🏥 **FHIR Resource Support**: Works with any FHIR resource type stored as JSON
- 🔧 **CLI Tool**: Command-line interface for easy integration
- 📚 **Library API**: Programmatic access for custom applications  
- ✅ **Test Runner**: Execute sql-on-fhir-v2 test suites against MS SQL Server
- 🎯 **Type Safety**: Full TypeScript support with comprehensive type definitions

## Installation

```bash
npm install sql-on-fhir-mssql
```

Or install globally for CLI usage:

```bash
npm install -g sql-on-fhir-mssql
```

## Quick Start

### CLI Usage

```bash
# Transpile a ViewDefinition to SQL
sof-mssql transpile patient-demographics.json

# Create a database view
sof-mssql create-view patient-demographics.json patient_demographics

# Validate a ViewDefinition
sof-mssql validate patient-demographics.json

# Run tests
sof-mssql test basic.json --host localhost --database test --user sa --password password
```

### Library Usage

```typescript
import { SqlOnFhir, transpile, createView } from 'sql-on-fhir-mssql';

// Create an instance
const sqlOnFhir = new SqlOnFhir({
  tableName: 'fhir_resources',
  schemaName: 'dbo'
});

// Transpile a ViewDefinition
const viewDefinition = {
  resourceType: 'ViewDefinition',
  resource: 'Patient',
  status: 'active',
  select: [
    {
      column: [
        { name: 'patient_id', path: 'id', type: 'id' },
        { name: 'gender', path: 'gender', type: 'code' }
      ]
    }
  ]
};

const result = sqlOnFhir.transpile(viewDefinition);
console.log(result.sql);

// Or use convenience functions
const sql = transpile(viewDefinition).sql;
const createViewSql = createView(viewDefinition, 'patient_demographics');
```

## Database Setup

This library assumes FHIR data is stored in a table with the following structure:

```sql
CREATE TABLE [dbo].[fhir_resources] (
  [id] NVARCHAR(64) NOT NULL PRIMARY KEY,
  [json] NVARCHAR(MAX) NOT NULL
);
```

Where:
- `id` contains the FHIR resource ID
- `json` contains the complete FHIR resource as JSON

You can customise the table and column names using the configuration options.

## Configuration Options

```typescript
interface QueryGeneratorOptions {
  tableName?: string;        // Default: 'fhir_resources'
  schemaName?: string;       // Default: 'dbo'  
  resourceIdColumn?: string; // Default: 'id'
  resourceJsonColumn?: string; // Default: 'json'
}
```

## ViewDefinition Examples

### Patient Demographics

```json
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
```

### Condition Diagnoses

```json
{
  "resourceType": "ViewDefinition",
  "resource": "Condition",
  "status": "active", 
  "name": "condition_diagnoses",
  "select": [
    {
      "column": [
        {"name": "condition_id", "path": "id", "type": "id"},
        {"name": "patient_id", "path": "subject.reference.substring(8)", "type": "string"},
        {"name": "onset_date", "path": "onsetDateTime", "type": "dateTime"},
        {"name": "snomed_code", "path": "code.coding.where(system = 'http://snomed.info/sct').code.first()", "type": "code"}
      ]
    }
  ],
  "where": [
    {"path": "clinicalStatus.coding.code != 'entered-in-error'"}
  ]
}
```

## CLI Commands

### `transpile`
Convert a ViewDefinition to a T-SQL query:

```bash
sof-mssql transpile <input-file> [options]
```

Options:
- `-o, --output <file>`: Output file for SQL
- `-t, --table <name>`: FHIR resources table name
- `-s, --schema <name>`: Database schema name
- `--id-column <name>`: Resource ID column name
- `--json-column <name>`: Resource JSON column name

### `create-view`
Generate a CREATE VIEW statement:

```bash
sof-mssql create-view <input-file> [view-name] [options]
```

### `create-table`
Generate a CREATE TABLE statement for materialised views:

```bash
sof-mssql create-table <input-file> [table-name] [options]
```

### `validate`
Validate a ViewDefinition file:

```bash
sof-mssql validate <input-file>
```

### `test`
Run sql-on-fhir-v2 test suites:

```bash
sof-mssql test <test-file> [options]
```

Options:
- `--host <host>`: SQL Server host
- `--port <port>`: SQL Server port
- `--database <db>`: Database name
- `--user <user>`: Username
- `--password <password>`: Password
- `-c, --connection <string>`: Connection string

## FHIRPath Support

The transpiler supports a subset of FHIRPath expressions commonly used in ViewDefinitions:

### Supported Functions
- `exists()`: Check if a value exists
- `empty()`: Check if a value is empty
- `first()`: Get the first item from a collection
- `last()`: Get the last item from a collection
- `count()`: Count items in a collection
- `join(separator)`: Join string values
- `where(condition)`: Filter collections
- `getResourceKey()`: Get the resource ID

### Supported Operators
- Comparison: `=`, `!=`, `<`, `<=`, `>`, `>=`
- Logical: `and`, `or`, `not`
- Arithmetic: `+`, `-`, `*`, `/`, `mod`

### Supported Types
- String literals: `'text'`
- Number literals: `123`, `45.67`
- Boolean literals: `true`, `false`
- Property access: `patient.name.family`

## Testing

The library includes a comprehensive test runner that can execute test suites from the [sql-on-fhir-v2](https://github.com/FHIR/sql-on-fhir-v2) repository:

```bash
# Run tests against a SQL Server instance
sof-mssql test basic.json \\
  --host localhost \\
  --database testdb \\
  --user sa \\
  --password password
```

Test results will show:
- ✅ Passed tests
- ❌ Failed tests with expected vs actual results
- Generated SQL queries for debugging

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Run in development mode
npm run dev
```

## Limitations

This is an initial implementation with some limitations:

1. **FHIRPath Coverage**: Not all FHIRPath functions are implemented
2. **Complex Iterations**: Some forEach patterns may not translate perfectly
3. **Performance**: Generated queries may not be optimised for large datasets
4. **Extensions**: FHIR extensions are not yet fully supported

## Contributing

Contributions are welcome! Please see the [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Related Projects

- [SQL on FHIR Specification](https://sql-on-fhir.org/ig/latest/)
- [sql-on-fhir-v2 Test Suite](https://github.com/FHIR/sql-on-fhir-v2)
- [FHIRPath Specification](https://build.fhir.org/ig/HL7/FHIRPath/)
- [FHIR R5 Specification](http://hl7.org/fhir/R5/)