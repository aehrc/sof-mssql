# CI/CD Integration Examples

This directory contains examples for integrating sql-on-fhir-mssql tests into various CI/CD platforms using environment variables.

## GitHub Actions

The `.github/workflows/test.yml` file shows how to:
- Set up SQL Server as a service container
- Use environment variables for configuration
- Run tests in parallel across multiple SQL Server versions
- Store test results as artifacts

### Key Environment Variables
```yaml
env:
  MSSQL_HOST: localhost
  MSSQL_DATABASE: testdb
  MSSQL_USER: sa
  MSSQL_PASSWORD: ${{ secrets.SA_PASSWORD }}
  MSSQL_ENCRYPT: true
  MSSQL_TRUST_CERT: true
```

### Required Secrets
- `SA_PASSWORD`: SQL Server SA password (or use default `TestPassword123!`)

## Azure DevOps

The `.azure/azure-pipelines.yml` file demonstrates:
- Multi-stage pipeline with test matrix
- Service containers for SQL Server
- Variable groups for configuration
- Test result publishing

### Pipeline Variables
Set these in your Azure DevOps pipeline or variable group:
- `SA_PASSWORD`: SQL Server SA password

## Docker Compose

Use `docker-compose.test.yml` for local testing:

```bash
# Run tests with default configuration
docker-compose -f docker-compose.test.yml up --build

# Run with custom SQL password
SA_PASSWORD=MySecurePassword docker-compose -f docker-compose.test.yml up --build

# Run with custom table configuration
export SA_PASSWORD=MyPassword
export MSSQL_TABLE=custom_fhir_table
export MSSQL_SCHEMA=healthcare
docker-compose -f docker-compose.test.yml up --build
```

## GitLab CI

Example `.gitlab-ci.yml`:

```yaml
stages:
  - test

test:
  stage: test
  image: node:18
  services:
    - name: mcr.microsoft.com/mssql/server:2019-latest
      alias: sqlserver
      variables:
        SA_PASSWORD: TestPassword123!
        ACCEPT_EULA: "Y"
  
  variables:
    MSSQL_HOST: sqlserver
    MSSQL_DATABASE: testdb
    MSSQL_USER: sa
    MSSQL_PASSWORD: TestPassword123!
    MSSQL_ENCRYPT: "true"
    MSSQL_TRUST_CERT: "true"
  
  before_script:
    - apt-get update && apt-get install -y curl gnupg
    - curl https://packages.microsoft.com/keys/microsoft.asc | apt-key add -
    - curl https://packages.microsoft.com/config/ubuntu/20.04/prod.list > /etc/apt/sources.list.d/msprod.list
    - apt-get update && ACCEPT_EULA=Y apt-get install -y mssql-tools unixodbc-dev
    - export PATH="$PATH:/opt/mssql-tools/bin"
    - npm ci
    - npm run build
    - sleep 30
    - sqlcmd -S sqlserver -U sa -P TestPassword123! -Q "CREATE DATABASE testdb"
  
  script:
    - npx tsx src/cli.ts test ./sqlonfhir/tests
  
  artifacts:
    reports:
      junit: test-results.xml
    paths:
      - test-report.json
    expire_in: 30 days
```

## Jenkins Pipeline

Example `Jenkinsfile`:

```groovy
pipeline {
    agent any
    
    environment {
        MSSQL_HOST = 'localhost'
        MSSQL_DATABASE = 'testdb'
        MSSQL_USER = 'sa'
        MSSQL_PASSWORD = credentials('sql-server-password')
        MSSQL_ENCRYPT = 'true'
        MSSQL_TRUST_CERT = 'true'
    }
    
    stages {
        stage('Setup') {
            steps {
                sh '''
                    docker run -d --name sqlserver \
                      -e SA_PASSWORD=${MSSQL_PASSWORD} \
                      -e ACCEPT_EULA=Y \
                      -p 1433:1433 \
                      mcr.microsoft.com/mssql/server:2019-latest
                '''
                sleep(30)
            }
        }
        
        stage('Build') {
            steps {
                sh 'npm ci'
                sh 'npm run build'
            }
        }
        
        stage('Database Setup') {
            steps {
                sh '''
                    sqlcmd -S localhost -U sa -P ${MSSQL_PASSWORD} \
                      -Q "CREATE DATABASE testdb"
                '''
            }
        }
        
        stage('Test') {
            steps {
                sh 'npx tsx src/cli.ts test ./sqlonfhir/tests'
            }
            post {
                always {
                    archiveArtifacts artifacts: 'test-report.json', allowEmptyArchive: true
                }
            }
        }
    }
    
    post {
        always {
            sh 'docker rm -f sqlserver || true'
        }
    }
}
```

## Environment Variable Reference

### Required Variables
- `MSSQL_HOST`: SQL Server hostname
- `MSSQL_DATABASE`: Target database name
- `MSSQL_USER`: Database username
- `MSSQL_PASSWORD`: Database password

### Optional Variables
- `MSSQL_PORT`: SQL Server port (default: 1433)
- `MSSQL_CONNECTION_STRING`: Full connection string (alternative to individual parameters)
- `MSSQL_TABLE`: FHIR resources table name (default: fhir_resources)
- `MSSQL_SCHEMA`: Database schema (default: dbo)
- `MSSQL_ENCRYPT`: Enable encryption (default: true)
- `MSSQL_TRUST_CERT`: Trust server certificate (default: true)

## Security Best Practices

1. **Never commit passwords** to version control
2. **Use secrets management** provided by your CI/CD platform:
   - GitHub: Repository secrets
   - Azure DevOps: Variable groups with secret variables
   - GitLab: Protected variables
   - Jenkins: Credentials plugin
3. **Use least-privilege accounts** for database access
4. **Rotate passwords** regularly
5. **Use encrypted connections** (MSSQL_ENCRYPT=true)

## Troubleshooting CI/CD Issues

### SQL Server Container Not Ready
```bash
# Add health checks and wait time
sleep 30
for i in {1..30}; do
  if sqlcmd -S localhost -U sa -P "${SA_PASSWORD}" -Q "SELECT 1"; then
    break
  fi
  sleep 2
done
```

### Connection Issues
- Verify SQL Server container is healthy
- Check network connectivity between containers
- Ensure correct hostname (service name in Docker Compose)
- Verify password matches between container and environment

### Permission Issues
```sql
-- Grant additional permissions if needed
USE testdb;
GRANT CREATE TABLE TO [testuser];
GRANT ALTER ON SCHEMA::dbo TO [testuser];
```

### Test Failures
- Check test output for specific error messages
- Review generated SQL queries in debug output
- Verify test data and expected results
- Ensure SQL Server version compatibility