-- Example SQL script for setting up a test database for sql-on-fhir-mssql
-- Run this script as a SQL Server administrator (sa or equivalent)

-- 1. Create test database
USE master;
GO

IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'testdb')
BEGIN
    CREATE DATABASE testdb;
    PRINT 'Created database: testdb';
END
ELSE
BEGIN
    PRINT 'Database testdb already exists';
END
GO

-- 2. Switch to test database
USE testdb;
GO

-- 3. Verify default schema exists (dbo should exist by default)
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'dbo')
BEGIN
    EXEC('CREATE SCHEMA dbo');
    PRINT 'Created schema: dbo';
END
ELSE
BEGIN
    PRINT 'Schema dbo already exists';
END
GO

-- 4. Create a test user (optional - you can use sa for testing)
IF NOT EXISTS (SELECT * FROM sys.server_principals WHERE name = 'testuser')
BEGIN
    CREATE LOGIN testuser WITH PASSWORD = 'TestPassword123!';
    PRINT 'Created login: testuser';
END
ELSE
BEGIN
    PRINT 'Login testuser already exists';
END
GO

IF NOT EXISTS (SELECT * FROM sys.database_principals WHERE name = 'testuser')
BEGIN
    CREATE USER testuser FOR LOGIN testuser;
    PRINT 'Created user: testuser';
END
ELSE
BEGIN
    PRINT 'User testuser already exists';
END
GO

-- 5. Grant necessary permissions to test user
GRANT CREATE TABLE TO testuser;
GRANT INSERT, SELECT, UPDATE, DELETE ON SCHEMA::dbo TO testuser;
GRANT ALTER ON SCHEMA::dbo TO testuser;
PRINT 'Granted permissions to testuser';
GO

-- 6. Test table creation (this will be done automatically by the test runner)
-- This is just to verify permissions work
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'test_permissions' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE [dbo].[test_permissions] (
        [id] NVARCHAR(64) NOT NULL PRIMARY KEY,
        [test_data] NVARCHAR(MAX) NOT NULL
    );
    
    INSERT INTO [dbo].[test_permissions] VALUES ('test1', '{"test": true}');
    
    SELECT COUNT(*) as test_row_count FROM [dbo].[test_permissions];
    
    DROP TABLE [dbo].[test_permissions];
    
    PRINT 'Permission test completed successfully';
END
GO

-- 7. Display current database info
SELECT 
    DB_NAME() as current_database,
    SCHEMA_NAME() as default_schema,
    USER_NAME() as current_user;
GO

-- 8. Show schemas available
SELECT 
    name as schema_name,
    schema_id
FROM sys.schemas
ORDER BY name;
GO

PRINT 'Database setup completed!';
PRINT 'You can now run tests with:';
PRINT '  - Server: localhost (or your server name)';
PRINT '  - Database: testdb';
PRINT '  - User: sa (or testuser with password TestPassword123!)';
GO