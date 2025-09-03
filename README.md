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
  [id] NVARCHAR(64) NOT NULL,
  [resource_type] NVARCHAR(64) NOT NULL,
  [json] NVARCHAR(MAX) NOT NULL,
  PRIMARY KEY ([id], [resource_type])
);
```

Where:
- `id` contains the FHIR resource ID
- `resource_type` contains the FHIR resource type (e.g., 'Patient', 'Observation')
- `json` contains the complete FHIR resource as JSON
- The primary key combines both `id` and `resource_type`, allowing resources with the same ID but different types

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

The library includes a comprehensive test runner that can execute test suites from the [sql-on-fhir-v2](https://github.com/FHIR/sql-on-fhir-v2) repository.

### Prerequisites

Before running tests, you need:

1. **SQL Server Instance**: A running SQL Server instance (2019 or later recommended)
2. **Database**: A database where the test runner can create tables and insert test data
3. **Permissions**: The database user must have permissions to:
   - Create and drop tables in the target database
   - Insert, update, and delete data
   - Execute queries

### Database Setup

1. **Create a test database**:
   ```sql
   CREATE DATABASE testdb;
   ```

2. **Verify schema exists** (usually `dbo` exists by default):
   ```sql
   USE testdb;
   SELECT * FROM sys.schemas WHERE name = 'dbo';
   ```

3. **Test connection with sqlcmd**:
   ```bash
   sqlcmd -S localhost -d testdb -U sa -P password -Q "SELECT DB_NAME()"
   ```

### Running Tests

The test runner automatically:
- Creates the required FHIR resources table: `[dbo].[fhir_resources]`
- Inserts test data from the test suite
- Executes ViewDefinition queries and compares results
- Cleans up test data after each test suite

#### Using Environment Variables (Recommended for CI/CD)
```bash
# Set environment variables
export MSSQL_HOST=localhost
export MSSQL_DATABASE=testdb
export MSSQL_USER=sa
export MSSQL_PASSWORD=password

# Run tests - configuration comes from environment
sof-mssql test basic.json
sof-mssql test ./tests
```

#### Using CLI Options
```bash
# Single test file
sof-mssql test basic.json \\
  --host localhost \\
  --database testdb \\
  --user sa \\
  --password password

# Directory of test files
sof-mssql test ./tests \\
  --host 152.83.96.174 \\
  --port 1433 \\
  --database testdb \\
  --user sa \\
  --password password
```

#### Using Connection String
```bash
# Via environment variable
export MSSQL_CONNECTION_STRING="Server=localhost;Database=testdb;User Id=sa;Password=password;TrustServerCertificate=true;"
sof-mssql test basic.json

# Via CLI option
sof-mssql test basic.json \\
  --connection "Server=localhost;Database=testdb;User Id=sa;Password=password;TrustServerCertificate=true;"
```

### Configuration Options

Configuration follows this precedence order:
1. **CLI options** (highest priority)
2. **Environment variables** 
3. **Default values** (lowest priority)

| CLI Option | Environment Variable | Description | Default |
|------------|---------------------|-------------|---------|
| `--connection` | `MSSQL_CONNECTION_STRING` | Full connection string | - |
| `--host` | `MSSQL_HOST` | SQL Server hostname | `localhost` |
| `--port` | `MSSQL_PORT` | SQL Server port | `1433` |
| `--database` | `MSSQL_DATABASE` | Target database name | `test` |
| `--user` | `MSSQL_USER` | Database username | - |
| `--password` | `MSSQL_PASSWORD` | Database password | - |
| `--table` | `MSSQL_TABLE` | FHIR resources table name | `fhir_resources` |
| `--schema` | `MSSQL_SCHEMA` | Database schema | `dbo` |
| `--encrypt` | `MSSQL_ENCRYPT` | Enable encryption | `true` |
| `--trust-cert` | `MSSQL_TRUST_CERT` | Trust server certificate | `true` |

### Test Results

Test results show:
- ✅ **Passed tests**: Tests that produced expected results
- ❌ **Failed tests**: Tests with mismatched results, showing:
  - Expected vs actual results
  - Generated SQL queries for debugging
  - Error messages if query execution failed

### Test Report Generation

The test runner can generate machine-readable test reports:

```typescript
import { TestRunner } from 'sql-on-fhir-mssql';

// Configuration from environment variables
const config = {
  server: process.env.MSSQL_HOST || 'localhost',
  database: process.env.MSSQL_DATABASE || 'test',
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
};

// Run tests and generate report
const results = await TestRunner.runTestSuitesFromDirectory('./tests', config);
const report = TestRunner.generateDirectoryTestReport(results);
await TestRunner.writeTestReport(report, 'test-report.json');
```

### CI/CD Integration

#### GitHub Actions
```yaml
name: SQL on FHIR Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      sqlserver:
        image: mcr.microsoft.com/mssql/server:2019-latest
        env:
          SA_PASSWORD: ${{ secrets.SA_PASSWORD }}
          ACCEPT_EULA: Y
        options: >-
          --health-cmd "/opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P $SA_PASSWORD -Q 'SELECT 1'"
          --health-interval 10s
          --health-timeout 3s
          --health-retries 10

    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
      with:
        node-version: '18'
    - run: npm install
    - name: Setup database
      run: |
        sqlcmd -S localhost -U sa -P ${{ secrets.SA_PASSWORD }} -Q "CREATE DATABASE testdb"
      env:
        MSSQL_HOST: localhost
        MSSQL_DATABASE: testdb
        MSSQL_USER: sa
        MSSQL_PASSWORD: ${{ secrets.SA_PASSWORD }}
    - name: Run tests
      run: npx tsx src/cli.ts test ./sqlonfhir/tests
      env:
        MSSQL_HOST: localhost
        MSSQL_DATABASE: testdb
        MSSQL_USER: sa
        MSSQL_PASSWORD: ${{ secrets.SA_PASSWORD }}
```

#### Azure DevOps
```yaml
trigger:
- main

pool:
  vmImage: 'ubuntu-latest'

variables:
  MSSQL_HOST: localhost
  MSSQL_DATABASE: testdb
  MSSQL_USER: sa

steps:
- task: NodeTool@0
  inputs:
    versionSpec: '18.x'
- script: npm install
- script: |
    docker run -e "ACCEPT_EULA=Y" -e "SA_PASSWORD=$(SA_PASSWORD)" -p 1433:1433 -d mcr.microsoft.com/mssql/server:2019-latest
    sleep 30
    sqlcmd -S localhost -U sa -P "$(SA_PASSWORD)" -Q "CREATE DATABASE testdb"
  displayName: 'Start SQL Server and create database'
- script: npx tsx src/cli.ts test ./sqlonfhir/tests
  env:
    MSSQL_PASSWORD: $(SA_PASSWORD)
  displayName: 'Run tests'
```

### Troubleshooting

#### Connection Issues
- **SSL errors**: Use `--trust-cert` flag or disable encryption
- **Authentication**: Verify username/password and SQL Server authentication mode
- **Network**: Check firewall settings and SQL Server TCP/IP configuration

#### Permission Issues
```sql
-- Grant necessary permissions to test user
USE testdb;
GRANT CREATE TABLE TO [testuser];
GRANT INSERT, SELECT, DELETE ON SCHEMA::dbo TO [testuser];
```

#### Table Creation Issues
The test runner creates tables with this structure:
```sql
CREATE TABLE [dbo].[fhir_resources] (
  [id] NVARCHAR(64) NOT NULL,
  [resource_type] NVARCHAR(64) NOT NULL,
  [json] NVARCHAR(MAX) NOT NULL,
  PRIMARY KEY ([id], [resource_type])
);
```

If table creation fails:
- Verify the schema exists: `SELECT * FROM sys.schemas WHERE name = 'dbo'`
- Check user permissions: `SELECT HAS_PERMS_BY_NAME('dbo', 'SCHEMA', 'CREATE TABLE')`
- Review SQL Server error logs for detailed error messages

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