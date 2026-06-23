# 🔥 MSSQL on FHIR 🔥

A TypeScript library and CLI tool for loading FHIR into Microsoft SQL Server,
and transpiling [SQL on FHIR](https://sql-on-fhir.org/) view definitions into
T-SQL queries.

## Features

- **SQL on FHIR compliance** - Implements
  [SQL on FHIR](https://sql-on-fhir.org/) for
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
- **Bulk NDJSON loader** - Built-in loader for importing FHIR resources from
  NDJSON files
- Tested against **SQL Server 2017, 2019, 2022 and 2025**.

## Quick start

The easiest way to use sof-mssql is via `npx`:

```bash
# Load FHIR resources from NDJSON files
npx sof-mssql load ./data --host localhost --user sa --password pass --database fhir

# Transpile a ViewDefinition from stdin to stdout
npx sof-mssql transpile <some.ViewDefinition.json >output.sql

# Or use file arguments
npx sof-mssql transpile --input some.ViewDefinition.json --output output.sql
```

## Installation

For programmatic use, install via npm:

```bash
npm install sof-mssql
```

## CLI usage

The CLI provides two main commands: `load` for bulk loading NDJSON files into
SQL Server, and `transpile` for converting ViewDefinitions to T-SQL.

### Loading NDJSON files

Bulk load FHIR resources from NDJSON files into SQL Server:

```bash
# Load all NDJSON files from a directory
npx sof-mssql load ./data \
  --host localhost \
  --user sa \
  --password yourpassword \
  --database fhir

# Load with environment variables
export MSSQL_HOST=localhost MSSQL_USER=sa MSSQL_PASSWORD=pass MSSQL_DATABASE=fhir
npx sof-mssql load ./data

# Load with custom table and batch settings
npx sof-mssql load ./data \
  --table-name my_resources \
  --batch-size 5000 \
  --parallel 2

# Preview what would be loaded
npx sof-mssql load ./data --dry-run

# Load into a native JSON column (SQL Server 2025+)
npx sof-mssql load ./data --resource-json-data-type JSON
```

**File naming:** Files must follow the pattern `{ResourceType}.ndjson` (e.g.,
`Patient.ndjson`, `Observation.ndjson`). The resource type is extracted from the
filename and stored in the `resource_type` column.

**Database options:**

- `--host <host>` - Database server hostname
- `--port <port>` - Database server port (default: 1433)
- `--user <user>` - Database username
- `--password <password>` - Database password
- `--database <database>` - Database name
- `--trust-server-certificate` - Trust server certificate

**Loading options:**

- `--table-name <name>` - Table name (default: `fhir_resources`)
- `--schema-name <name>` - Schema name (default: `dbo`)
- `--resource-type <type>` - Load only specific resource type
- `--resource-json-data-type <type>` - Storage type for the `json` column:
  `NVARCHAR(MAX)` (default) or `JSON`. The `JSON` value uses SQL Server 2025's
  native JSON type and requires SQL Server 2025 or later; the value is
  case-insensitive. Omit the option for the default `NVARCHAR(MAX)` behaviour.
- `--truncate` - Truncate table before loading
- `--no-create-table` - Don't create table if it doesn't exist

**Performance options:**

- `--batch-size <size>` - Rows per batch (default: 1000)
- `--parallel <count>` - Parallel file processing (default: 4, use 1-2 for best
  reliability)

**Output options:**

- `--dry-run` - Preview without loading
- `--verbose` - Show detailed progress
- `--progress` - Show progress bar
- `--quiet` - Minimal output
- `--continue-on-error` - Continue if a file fails

### Transpiling ViewDefinitions

Convert SQL on FHIR ViewDefinitions to T-SQL:

```bash
# Read from stdin, write to stdout
npx sof-mssql transpile <some.ViewDefinition.json

# Read from file, write to stdout
npx sof-mssql transpile --input some.ViewDefinition.json

# Read from stdin, write to file
npx sof-mssql transpile <some.ViewDefinition.json --output query.sql

# Read from file, write to file
npx sof-mssql transpile --input some.ViewDefinition.json --output query.sql

# Fetch from remote server and transpile
curl https://example.com/fhir/ViewDefinition/1 | npx sof-mssql transpile
```

**Options:**

- `-i, --input <file>` - Input ViewDefinition JSON file (default: stdin)
- `-o, --output <file>` - Output SQL file (default: stdout)

**Global options:**

- `-V, --version` - Output the version number
- `-h, --help` - Display help information

### Using transpiled SQL

Once you've transpiled a ViewDefinition to T-SQL, you can use it to create
database views or tables.

#### Creating a view

Views provide a virtual table based on the query, recomputed each time the view
is queried:

```bash
# Transpile ViewDefinition to SQL file
npx sof-mssql transpile --input patient_demographics.json --output patient_demographics.sql

# Connect to SQL Server and create the view
sqlcmd -S localhost -U sa -P yourpassword -d fhir -Q "
CREATE VIEW [dbo].[patient_demographics] AS
$(cat patient_demographics.sql)
"
```

Or directly in SQL Server Management Studio:

```sql
CREATE VIEW [dbo].[patient_demographics] AS
SELECT r.id AS [id],
  JSON_VALUE(r.json, '$.name[0].family') AS [family_name],
  CAST(JSON_VALUE(r.json, '$.birthDate') AS DATETIME2) AS [birth_date]
FROM [dbo].[fhir_resources] AS [r]
WHERE [r].[resource_type] = 'Patient'
```

#### Creating a materialised table

For better query performance, you can materialise the view results into a
physical table:

```sql
-- Create and populate the table in one statement
SELECT *
INTO [dbo].[patient_demographics]
FROM (
    SELECT
    r.id AS [id], JSON_VALUE(r.json, '$.name[0].family') AS [family_name], CAST (JSON_VALUE(r.json, '$.birthDate') AS DATETIME2) AS [birth_date]
    FROM [dbo].[fhir_resources] AS [r]
    WHERE [r].[resource_type] = 'Patient'
) AS view_results
```

To refresh a materialised table after data changes:

```sql
-- Truncate and reload
TRUNCATE TABLE [dbo].[patient_demographics];

INSERT INTO [dbo].[patient_demographics]
SELECT r.id AS [id],
  JSON_VALUE(r.json, '$.name[0].family') AS [family_name],
  CAST(JSON_VALUE(r.json, '$.birthDate') AS DATETIME2) AS [birth_date]
FROM [dbo].[fhir_resources] AS [r]
WHERE [r].[resource_type] = 'Patient'
```

## Programmatic usage

### Basic usage

```typescript
import {SqlOnFhir} from 'sof-mssql';

const sqlOnFhir = new SqlOnFhir();
```

Create a ViewDefinition to transpile:

```json
{
  "resourceType": "ViewDefinition",
  "resource": "Patient",
  "name": "patient_demographics",
  "select": [
    {
      "column": [
        {
          "name": "id",
          "path": "id",
          "type": "id"
        },
        {
          "name": "family_name",
          "path": "name.family",
          "type": "string"
        },
        {
          "name": "birth_date",
          "path": "birthDate",
          "type": "date"
        }
      ]
    }
  ]
}
```

Transpile the ViewDefinition to T-SQL:

```typescript
const result = sqlOnFhir.transpile(viewDefinition);

console.log(result.sql);
```

Generated SQL output:

```sql
SELECT
  r.id AS [id],
  JSON_VALUE(r.json, '$.name[0].family') AS [family_name],
  CAST(JSON_VALUE(r.json, '$.birthDate') AS DATETIME2) AS [birth_date]
FROM [dbo].[fhir_resources] AS [r]
WHERE [r].[resource_type] = 'Patient'
```

Access column metadata:

```typescript
console.log(result.columns);
```

Column metadata output:

```json
[
  { "name": "id", "type": "VARCHAR(64)", "nullable": true },
  { "name": "family_name", "type": "NVARCHAR(MAX)", "nullable": true },
  { "name": "birth_date", "type": "VARCHAR(10)", "nullable": true }
]
```

### Custom table configuration

```javascript
const sqlOnFhir = new SqlOnFhir({
  tableName: 'my_fhir_data',
  schemaName: 'clinical',
  resourceIdColumn: 'resource_id',
  resourceJsonColumn: 'resource_data'
});
```

> **Note:** `SqlOnFhir` configures the transpiler only. The storage type of the
> `json` column - `NVARCHAR(MAX)` (default) or the native `JSON` type - is a
> loader concern, set with the `--resource-json-data-type` CLI flag or the
> `resourceJsonDataType` option of `loadNdjsonFiles`, not via
> `new SqlOnFhir({ ... })`. The transpiler is storage-type agnostic: the same
> transpiled query works over either column type, so your ViewDefinitions and
> transpiler configuration are unchanged for a native `JSON` column.

### Loading into a native JSON column

The loader can store each resource in SQL Server 2025's native `JSON` type
instead of `NVARCHAR(MAX)`:

```javascript
import { loadNdjsonFiles } from 'sof-mssql';

await loadNdjsonFiles({
  directory: './data',
  database: {
    host: 'localhost',
    user: 'sa',
    password: process.env.MSSQL_PASSWORD,
    database: 'fhir',
  },
  // "NVARCHAR(MAX)" (default) or "JSON" (SQL Server 2025+); case-insensitive.
  resourceJsonDataType: 'JSON',
});
```

An invalid value is rejected with a clear error before any database connection
is opened. If the target table already exists with a `json` column that is the
other supported type (`NVARCHAR(MAX)` when `JSON` was requested, or vice versa),
the loader prints a warning naming both types and loads into the existing table
without altering it. If the existing `json` column is neither `NVARCHAR(MAX)` nor
native `JSON` - for example a bounded `VARCHAR(100)` or `TEXT` that cannot hold a
serialised FHIR resource - the loader fails fast with an error naming the
offending type, before any rows are loaded, rather than writing into a column
that would truncate or corrupt the data.

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
````

### Type mappings and type hints

#### Default type mappings

By default, FHIR primitive types are mapped to the following T-SQL types:

| FHIR Type                               | Default T-SQL Type | Rationale                                 |
|-----------------------------------------|--------------------|-------------------------------------------|
| `id`                                    | `VARCHAR(64)`      | ASCII-only, fixed max length              |
| `boolean`                               | `BIT`              | Native boolean                            |
| `integer`, `positiveint`, `unsignedint` | `INT`              | 32-bit integer                            |
| `integer64`                             | `BIGINT`           | 64-bit integer                            |
| `decimal`                               | `VARCHAR(MAX)`     | Preserves arbitrary precision             |
| `date`                                  | `VARCHAR(10)`      | Preserves partial dates (e.g., "2024-01") |
| `datetime`                              | `VARCHAR(50)`      | Preserves partial datetimes and timezones |
| `instant`                               | `VARCHAR(50)`      | Preserves full ISO 8601 format            |
| `time`                                  | `VARCHAR(20)`      | Preserves partial times                   |
| `string`, `markdown`, `code`            | `NVARCHAR(MAX)`    | Unicode-capable text                      |
| `uri`, `url`, `canonical`               | `NVARCHAR(MAX)`    | Can contain Unicode (IRIs)                |
| `uuid`                                  | `VARCHAR(100)`     | ASCII UUID format                         |
| `oid`                                   | `VARCHAR(255)`     | ASCII OID format                          |
| `base64binary`                          | `VARBINARY(MAX)`   | Binary data                               |

**Design principle:** Default mappings use `VARCHAR` for temporal and numeric types to preserve FHIR semantics (partial dates, arbitrary precision decimals) rather than forcing conversion to SQL native types.

#### Using type hints

You can override default type mappings using the `tag` array on column definitions. Two tag types are supported:

**`tsql/type` - Direct T-SQL type specification:**

```json
{
  "name": "birth_date",
  "path": "birthDate",
  "type": "date",
  "tag": [
    { "name": "tsql/type", "value": "DATE" }
  ]
}
```

This generates a CAST expression: `CAST(JSON_VALUE(r.json, '$.birthDate') AS DATE) AS [birth_date]`

**`ansi/type` - ANSI/ISO SQL standard types (automatically converted to T-SQL):**

```json
{
  "name": "age",
  "path": "age",
  "type": "integer",
  "tag": [
    { "name": "ansi/type", "value": "INTEGER" }
  ]
}
```

The ANSI type `INTEGER` is automatically converted to T-SQL `INT`.

```json
{
  "name": "active",
  "path": "active",
  "type": "boolean",
  "tag": [
    { "name": "ansi/type", "value": "BOOLEAN" }
  ]
}
```

The ANSI type `BOOLEAN` is automatically converted to T-SQL `BIT`.

**Type precedence:** `tsql/type` > `ansi/type` > FHIR type defaults

**Supported ANSI types:**
- Character: `CHARACTER`, `CHARACTER VARYING`, `NATIONAL CHARACTER VARYING`
- Numeric: `INTEGER`, `SMALLINT`, `BIGINT`, `DECIMAL`, `NUMERIC`, `FLOAT`, `REAL`, `DOUBLE PRECISION`
- Temporal: `DATE`, `TIME`, `TIMESTAMP` (converted to `DATETIME2`)
- Boolean: `BOOLEAN` (converted to `BIT`)

**Example with multiple columns:**

This example demonstrates how different type hints affect the resulting SQL types:

```json
{
  "resourceType": "ViewDefinition",
  "resource": "Patient",
  "select": [
    {
      "column": [
        {
          "name": "id",
          "path": "id",
          "type": "id"
        },
        {
          "name": "birth_date",
          "path": "birthDate",
          "type": "date",
          "tag": [
            { "name": "tsql/type", "value": "DATE" }
          ]
        },
        {
          "name": "deceased",
          "path": "deceasedBoolean",
          "type": "boolean",
          "tag": [
            { "name": "ansi/type", "value": "BOOLEAN" }
          ]
        }
      ]
    }
  ]
}
```

Type behaviour for each column:
- `id` - Uses default FHIR type mapping: `VARCHAR(64)`
- `birth_date` - Overrides default `VARCHAR(10)` with T-SQL `DATE` type
- `deceased` - Uses ANSI `BOOLEAN` type, automatically converted to T-SQL `BIT`

## Database setup

### Table structure

sof-mssql expects FHIR resources to be stored in a table with the following
structure:

```sql
CREATE TABLE [dbo].[fhir_resources] (
    [id] INT IDENTITY (1, 1) NOT NULL PRIMARY KEY,
    [resource_type] NVARCHAR (64) NOT NULL,
    [json] NVARCHAR (MAX) NOT NULL
);

-- Create an index on resource_type for efficient filtering by resource type
CREATE INDEX [IX_fhir_resources_resource_type]
    ON [dbo].[fhir_resources] ([resource_type]);
```

On SQL Server 2025 or later the `json` column may instead use the native `JSON`
type for more efficient storage, with the rest of the table unchanged:

```sql
[json] JSON NOT NULL
```

`NVARCHAR(MAX)` is the default and works on SQL Server 2017+. The native `JSON`
type is opt-in (`--resource-json-data-type JSON` or `resourceJsonDataType:
"JSON"`) and requires SQL Server 2025 or later. The same transpiled query SQL
runs over either storage type.

The generated queries use:

- `resource_type` column for filtering by FHIR resource type (indexed for
  performance)
- `json` column containing the complete FHIR resource as JSON
- SQL Server's JSON functions (`JSON_VALUE`, `JSON_QUERY`, `OPENJSON`) for data
  extraction

**Performance recommendation:** The index on `resource_type` is strongly
recommended as every ViewDefinition query filters by resource type. Without this
index, queries will perform full table scans.

### Loading data

The easiest way to populate your database is using the built-in NDJSON loader (
see [Loading NDJSON files](#loading-ndjson-files) above), which automatically
creates the table with the correct structure. All FHIR resources are stored in a
single table (default: `fhir_resources`), with the resource type extracted from
the filename.

### Comparing NVARCHAR(MAX) and native JSON storage

The native `JSON` type stores documents in a pre-parsed binary form, which
Microsoft documents as roughly an 18% storage reduction; actual figures depend
on the dataset. Because timings and storage are environment-dependent, this is a
manual procedure rather than an automated test. To compare the two storage types
for your own data on a single SQL Server 2025 instance:

1. Prepare a representative NDJSON dataset (for example, a few hundred megabytes
   of FHIR resources).
2. Load the same data into two separate tables, one per storage type:

   ```bash
   npx sof-mssql load ./data --table-name fhir_nvarchar
   npx sof-mssql load ./data --table-name fhir_json --resource-json-data-type JSON
   ```

3. Compare storage with `sp_spaceused`, recording `data` and `reserved` for
   each:

   ```sql
   EXEC sp_spaceused 'dbo.fhir_nvarchar';
   EXEC sp_spaceused 'dbo.fhir_json';
   ```

4. Compare read performance by running an identical transpiled ViewDefinition
   query against each table several times with `SET STATISTICS TIME ON;`,
   discarding the first (cold-cache) run and recording the elapsed times.
5. Record the dataset description, row counts, storage figures and timings.

## Contributing

Contributions are welcome! Please read our [CONTRIBUTING](CONTRIBUTING.md)
and [CODE_OF_CONDUCT](CODE_OF_CONDUCT.md) documents for guidelines on how to
get involved.

## License

Copyright © 2025, Commonwealth Scientific and Industrial Research Organisation
(CSIRO) ABN 41 687 119 230. Licensed under
the [Apache License, version 2.0](https://www.apache.org/licenses/LICENSE-2.0).
