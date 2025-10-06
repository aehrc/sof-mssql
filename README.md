# SQL on FHIR view runner for T-SQL and Microsoft SQL Server

A TypeScript library and CLI tool for
transpiling [SQL on FHIR](https://build.fhir.org/ig/FHIR/sql-on-fhir-v2/) view
definitions into T-SQL queries optimised for Microsoft SQL Server.

## Quick start

The easiest way to use sof-mssql is via `npx`:

```bash
# Transpile a ViewDefinition from stdin to stdout
npx sof-mssql <viewdefinition.json >output.sql

# Or use file arguments
npx sof-mssql --input viewdefinition.json --output output.sql
```

## Installation

For programmatic use, install via npm:

```bash
npm install sof-mssql
```

## CLI usage

The CLI reads ViewDefinition JSON from stdin or a file, and outputs T-SQL to
stdout or a file.

### Basic usage

```bash
# Read from stdin, write to stdout
npx sof-mssql <viewdefinition.json

# Read from file, write to stdout
npx sof-mssql --input viewdefinition.json

# Read from stdin, write to file
npx sof-mssql <viewdefinition.json --output query.sql

# Read from file, write to file
npx sof-mssql --input viewdefinition.json --output query.sql

# Fetch from remote server and transpile
curl https://example.com/fhir/ViewDefinition/1 | npx sof-mssql
```

### CLI options

- `-i, --input <file>` - Input ViewDefinition JSON file (default: stdin)
- `-o, --output <file>` - Output SQL file (default: stdout)
- `-V, --version` - Output the version number
- `-h, --help` - Display help information

## Programmatic usage

```javascript
import {SqlOnFhir} from 'sof-mssql';

// Create an instance with optional configuration
const sqlOnFhir = new SqlOnFhir({
  tableName: 'fhir_resources',    // Default table name
  schemaName: 'dbo',              // Default schema name
  resourceIdColumn: 'id',         // Column containing resource ID
  resourceJsonColumn: 'json'      // Column containing resource JSON
});

// Transpile a ViewDefinition to T-SQL
const viewDefinition = {
  resourceType: 'ViewDefinition',
  resource: 'Patient',
  name: 'patient_demographics',
  select: [
    {
      column: [
        {
          name: 'id',
          path: 'id',
          type: 'id'
        },
        {
          name: 'family_name',
          path: 'name.family',
          type: 'string'
        },
        {
          name: 'birth_date',
          path: 'birthDate',
          type: 'date'
        }
      ]
    }
  ]
};

const result = sqlOnFhir.transpile(viewDefinition);

console.log(result.sql);
// Output:
// SELECT
//   r.id AS [id],
//   JSON_VALUE(r.json, '$.name[0].family') AS [family_name],
//   CAST(JSON_VALUE(r.json, '$.birthDate') AS DATETIME2) AS [birth_date]
// FROM [dbo].[fhir_resources] AS [r]
// WHERE [r].[resource_type] = 'Patient'

// Access column metadata
console.log(result.columns);
// Output:
// [
//   { name: 'id', type: 'NVARCHAR(64)', nullable: true },
//   { name: 'family_name', type: 'NVARCHAR(MAX)', nullable: true },
//   { name: 'birth_date', type: 'DATETIME2', nullable: true }
// ]
```

## Features

- **SQL on FHIR v2 compliance** - Implements the SQL on FHIR specification for
  transforming FHIR resources into tabular views
- **FHIRPath support** - Full support for FHIRPath expressions in column
  definitions and filters
- **T-SQL optimisation** - Generates efficient T-SQL queries using `JSON_VALUE`,
  `JSON_QUERY`, and `OPENJSON`
- **forEach support** - Handles array flattening with `CROSS APPLY` for nested
  FHIR resources
- **Union support** - Supports `unionAll` for polymorphic fields
- **Type casting** - Automatic SQL type inference and casting based on FHIR data
  types
- **WHERE clauses** - Supports view-level filtering with FHIRPath expressions

## SQL on FHIR specification

This library implements
the [SQL on FHIR v2 specification](https://build.fhir.org/ig/FHIR/sql-on-fhir-v2/),
which defines a standard way to create relational views of FHIR data.
ViewDefinitions describe how to extract and flatten FHIR resources into tabular
structures suitable for SQL queries and analytics.

## Database setup

sof-mssql expects FHIR resources to be stored in a table with the following
structure:

```sql
CREATE TABLE [dbo].[fhir_resources] (
    [id] NVARCHAR (64) NOT NULL PRIMARY KEY,
    [resource_type] NVARCHAR (64) NOT NULL,
    [json] NVARCHAR (MAX) NOT NULL,
);
```

The generated queries use:

- `resource_type` column for filtering by FHIR resource type
- `json` column containing the complete FHIR resource as JSON
- SQL Server's JSON functions (`JSON_VALUE`, `JSON_QUERY`, `OPENJSON`) for data
  extraction

## Advanced usage

### Custom table configuration

```javascript
const sqlOnFhir = new SqlOnFhir({
  tableName: 'my_fhir_data',
  schemaName: 'clinical',
  resourceIdColumn: 'resource_id',
  resourceJsonColumn: 'resource_data'
});
```

### Working with ViewDefinition strings

```javascript
import {SqlOnFhir} from 'sof-mssql';

const sqlOnFhir = new SqlOnFhir();

// From JSON string
const viewDefJson = JSON.stringify(viewDefinition);
const result = sqlOnFhir.transpile(viewDefJson);

// From FHIR resource (with resourceType)
const fhirResource = {
  resourceType: 'ViewDefinition',
  // ... rest of ViewDefinition
};
const result2 = sqlOnFhir.transpile(fhirResource);
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md)
for details on our code of conduct and the process for submitting pull requests.

## License

Copyright © 2025, Commonwealth Scientific and Industrial Research Organisation 
(CSIRO) ABN 41 687 119 230. Licensed under
the [Apache License, version 2.0](https://www.apache.org/licenses/LICENSE-2.0).
