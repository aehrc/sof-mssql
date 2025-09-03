# Test Configuration Examples

This directory contains example scripts and configurations for running sql-on-fhir-v2 tests with the TestRunner using environment variables.

## Environment Variable Configuration

The test runner uses environment variables for configuration, making it ideal for CI/CD pipelines:

```bash
# Required environment variables
export MSSQL_HOST=localhost
export MSSQL_DATABASE=testdb
export MSSQL_USER=sa
export MSSQL_PASSWORD=your_password_here

# Optional environment variables with defaults
export MSSQL_PORT=1433
export MSSQL_TABLE=fhir_resources
export MSSQL_SCHEMA=dbo
export MSSQL_ENCRYPT=true
export MSSQL_TRUST_CERT=true

# Alternative: Use connection string
export MSSQL_CONNECTION_STRING="Server=localhost,1433;Database=testdb;User Id=sa;Password=your_password_here;Encrypt=true;TrustServerCertificate=true;"
```

## Database Setup

### `setup-database.sql`
SQL script to set up a test database with proper permissions. Run this as a SQL Server administrator:

```bash
sqlcmd -S localhost -U sa -P your_admin_password -i setup-database.sql
```

This script will:
1. Create a `testdb` database
2. Verify the `dbo` schema exists
3. Create a test user with appropriate permissions
4. Test table creation permissions

## Example Scripts

### `run-tests.ts`
Comprehensive example showing various ways to use the TestRunner API:

```bash
# Run a single test file
npx tsx examples/run-tests.ts single

# Run all tests in a directory
npx tsx examples/run-tests.ts directory

# Manual connection management
npx tsx examples/run-tests.ts manual

# Error handling examples
npx tsx examples/run-tests.ts errors
```

## CLI Usage Examples

### Environment Variables (Recommended)

```bash
# Set environment variables once
export MSSQL_HOST=localhost
export MSSQL_DATABASE=testdb
export MSSQL_USER=sa
export MSSQL_PASSWORD=your_password

# Run tests - configuration comes from environment
npx tsx src/cli.ts test sqlonfhir/tests/basic.json
npx tsx src/cli.ts test sqlonfhir/tests

# Override environment with CLI options if needed
npx tsx src/cli.ts test basic.json --host remote-server --port 14333
```

### CLI Options Only

```bash
# Single test file with CLI options
npx tsx src/cli.ts test sqlonfhir/tests/basic.json \
  --host localhost \
  --database testdb \
  --user sa \
  --password your_password

# Custom table settings
npx tsx src/cli.ts test basic.json \
  --host localhost \
  --database testdb \
  --user sa \
  --password your_password \
  --table my_fhir_data \
  --schema healthcare

# Using connection string
npx tsx src/cli.ts test basic.json \
  --connection "Server=localhost;Database=testdb;User Id=sa;Password=your_password;TrustServerCertificate=true;"
```

### Configuration Precedence

Configuration follows this order:
1. **CLI options** (highest priority)
2. **Environment variables**
3. **Default values** (lowest priority)

```bash
# Environment provides defaults
export MSSQL_HOST=localhost
export MSSQL_DATABASE=testdb
export MSSQL_USER=sa

# CLI option overrides environment for this run
npx tsx src/cli.ts test basic.json --host remote-server
# Uses: host=remote-server, database=testdb, user=sa (from environment)
```

## Troubleshooting

### Connection Issues

1. **SSL/TLS Errors**:
   ```bash
   # Trust server certificate for self-signed certificates
   --trust-cert
   ```

2. **Authentication Errors**:
   - Verify SQL Server is configured for mixed authentication
   - Check username and password are correct
   - Ensure user has login permissions

3. **Network Issues**:
   - Verify SQL Server is listening on the specified port
   - Check firewall settings
   - Test connectivity with `telnet host port`

### Database Issues

1. **Schema Not Found**:
   ```sql
   -- Create schema if missing
   CREATE SCHEMA dbo;
   ```

2. **Permission Denied**:
   ```sql
   -- Grant necessary permissions
   GRANT CREATE TABLE TO [username];
   GRANT INSERT, SELECT, DELETE ON SCHEMA::dbo TO [username];
   ```

3. **Database Not Found**:
   ```sql
   -- Create test database
   CREATE DATABASE testdb;
   ```

### Test Failures

1. **Table Creation Issues**:
   - Verify schema exists and user has CREATE TABLE permission
   - Check that table name doesn't conflict with existing objects

2. **Data Loading Issues**:
   - Ensure JSON data is valid
   - Check for resource ID conflicts between test suites

3. **Query Execution Issues**:
   - Review generated SQL in test output
   - Verify FHIRPath expressions are supported
   - Check for SQL syntax errors in transpiled queries

## Getting Help

- Review the main [README.md](../README.md) for general documentation
- Check test output for generated SQL queries
- Enable detailed error logging for troubleshooting
- Consult SQL Server error logs for database-level issues