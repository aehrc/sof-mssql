#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Loads NDJSON files from a directory into SQL Server tables.

.DESCRIPTION
    Creates one table per FHIR resource type with id (VARCHAR(255)) and json (NVARCHAR(MAX)) columns.
    Processes each .ndjson file and inserts the data into corresponding tables.

.PARAMETER DirectoryPath
    Path to directory containing NDJSON files

.PARAMETER ConnectionString
    SQL Server connection string

.PARAMETER DatabaseName
    Target database name (default: FHIRData)

.EXAMPLE
    ./load-ndjson.ps1 -DirectoryPath "/Users/gri306/Data/synthea/paper-sm/fhir" -ConnectionString "Server=localhost;Integrated Security=true;"
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$DirectoryPath,
    
    [Parameter(Mandatory=$true)]
    [string]$ConnectionString,
    
    [Parameter(Mandatory=$false)]
    [string]$DatabaseName = "FHIRData"
)

# Import required modules
Import-Module SqlServer -ErrorAction SilentlyContinue

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$timestamp] [$Level] $Message"
}

function Create-Database {
    param([string]$ConnectionString, [string]$DatabaseName)
    
    try {
        Write-Log "Creating database '$DatabaseName' if it doesn't exist..."
        $createDbQuery = @"
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'$DatabaseName')
BEGIN
    CREATE DATABASE [$DatabaseName]
END
"@
        Invoke-Sqlcmd -ConnectionString $ConnectionString -Query $createDbQuery
        Write-Log "Database '$DatabaseName' is ready"
    }
    catch {
        Write-Log "Error creating database: $($_.Exception.Message)" "ERROR"
        throw
    }
}

function Create-Table {
    param([string]$ConnectionString, [string]$DatabaseName, [string]$TableName)
    
    try {
        Write-Log "Creating table '$TableName'..."
        $createTableQuery = @"
USE [$DatabaseName]
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='$TableName' AND xtype='U')
BEGIN
    CREATE TABLE [$TableName] (
        id VARCHAR(255) PRIMARY KEY,
        json NVARCHAR(MAX) CHECK (ISJSON(json) > 0)
    )
END
"@
        Invoke-Sqlcmd -ConnectionString $ConnectionString -Query $createTableQuery
        Write-Log "Table '$TableName' created successfully"
    }
    catch {
        Write-Log "Error creating table '$TableName': $($_.Exception.Message)" "ERROR"
        throw
    }
}

function Clear-Table {
    param([string]$ConnectionString, [string]$DatabaseName, [string]$TableName)
    
    try {
        Write-Log "Clearing existing data from table '$TableName'..."
        $clearQuery = @"
USE [$DatabaseName]
DELETE FROM [$TableName]
"@
        Invoke-Sqlcmd -ConnectionString $ConnectionString -Query $clearQuery
        Write-Log "Table '$TableName' cleared successfully"
    }
    catch {
        Write-Log "Error clearing table '$TableName': $($_.Exception.Message)" "ERROR"
        throw
    }
}

function Process-NdjsonFile {
    param([string]$FilePath, [string]$ConnectionString, [string]$DatabaseName, [string]$TableName)
    
    try {
        Write-Log "Processing file: $FilePath"
        $lineCount = 0
        $batchSize = 1000
        $batch = @()
        
        Get-Content $FilePath | ForEach-Object {
            $lineCount++
            $jsonLine = $_.Trim()
            
            if ($jsonLine -and $jsonLine -ne "") {
                try {
                    # Parse JSON to extract ID and validate format
                    $resource = $jsonLine | ConvertFrom-Json
                    $resourceId = $resource.id
                    
                    if (-not $resourceId) {
                        Write-Log "Warning: Resource at line $lineCount has no ID, skipping" "WARN"
                        return
                    }
                    
                    # Escape single quotes in JSON
                    $escapedJson = $jsonLine.Replace("'", "''")
                    
                    $batch += @{
                        Id = $resourceId
                        Json = $escapedJson
                    }
                    
                    # Process batch when it reaches the batch size
                    if ($batch.Count -ge $batchSize) {
                        Insert-Batch -ConnectionString $ConnectionString -DatabaseName $DatabaseName -TableName $TableName -Batch $batch
                        $batch = @()
                    }
                }
                catch {
                    Write-Log "Error parsing JSON at line $lineCount: $($_.Exception.Message)" "WARN"
                }
            }
        }
        
        # Process remaining items in batch
        if ($batch.Count -gt 0) {
            Insert-Batch -ConnectionString $ConnectionString -DatabaseName $DatabaseName -TableName $TableName -Batch $batch
        }
        
        Write-Log "Processed $lineCount lines from $FilePath"
    }
    catch {
        Write-Log "Error processing file '$FilePath': $($_.Exception.Message)" "ERROR"
        throw
    }
}

function Insert-Batch {
    param([string]$ConnectionString, [string]$DatabaseName, [string]$TableName, [array]$Batch)
    
    try {
        $values = $Batch | ForEach-Object {
            "('$($_.Id.Replace("'", "''"))', '$($_.Json)')"
        }
        $valuesString = $values -join ","
        
        $insertQuery = @"
USE [$DatabaseName]
INSERT INTO [$TableName] (id, json) VALUES $valuesString
"@
        
        Invoke-Sqlcmd -ConnectionString $ConnectionString -Query $insertQuery
        Write-Log "Inserted batch of $($Batch.Count) records into '$TableName'"
    }
    catch {
        Write-Log "Error inserting batch into '$TableName': $($_.Exception.Message)" "ERROR"
        throw
    }
}

# Main execution
try {
    Write-Log "Starting NDJSON load process..."
    Write-Log "Directory: $DirectoryPath"
    Write-Log "Database: $DatabaseName"
    
    # Validate directory exists
    if (-not (Test-Path $DirectoryPath)) {
        throw "Directory '$DirectoryPath' does not exist"
    }
    
    # Create database
    Create-Database -ConnectionString $ConnectionString -DatabaseName $DatabaseName
    
    # Get all NDJSON files
    $ndjsonFiles = Get-ChildItem -Path $DirectoryPath -Filter "*.ndjson"
    
    if ($ndjsonFiles.Count -eq 0) {
        Write-Log "No .ndjson files found in directory '$DirectoryPath'" "WARN"
        return
    }
    
    Write-Log "Found $($ndjsonFiles.Count) NDJSON files to process"
    
    # Process each file
    foreach ($file in $ndjsonFiles) {
        $tableName = [System.IO.Path]::GetFileNameWithoutExtension($file.Name)
        
        # Create table
        Create-Table -ConnectionString $ConnectionString -DatabaseName $DatabaseName -TableName $tableName
        
        # Clear existing data
        Clear-Table -ConnectionString $ConnectionString -DatabaseName $DatabaseName -TableName $tableName
        
        # Process file
        Process-NdjsonFile -FilePath $file.FullName -ConnectionString $ConnectionString -DatabaseName $DatabaseName -TableName $tableName
    }
    
    Write-Log "NDJSON load process completed successfully!"
}
catch {
    Write-Log "Script failed: $($_.Exception.Message)" "ERROR"
    exit 1
}