/**
 * T-SQL query generator for ViewDefinition structures.
 * Generates SQL queries that can be executed against MS SQL Server.
 */

import { ViewDefinition, ViewDefinitionSelect, ViewDefinitionColumn, ViewDefinitionWhere, TranspilationResult, ColumnInfo } from './types.js';
import { FHIRPathTranspiler, TranspilerContext } from './fhirpath-transpiler.js';

interface SelectCombination {
  selects: ViewDefinitionSelect[];
  unionChoices: number[]; // -1 means no union choice, >= 0 means index in unionAll array
}

export interface QueryGeneratorOptions {
  tableName?: string;
  schemaName?: string;
  resourceIdColumn?: string;
  resourceJsonColumn?: string;
}

export class QueryGenerator {
  private options: Required<QueryGeneratorOptions>;

  constructor(options: QueryGeneratorOptions = {}) {
    this.options = {
      tableName: 'fhir_resources',
      schemaName: 'dbo',
      resourceIdColumn: 'id',
      resourceJsonColumn: 'json',
      ...options
    };
  }

  /**
   * Generate a T-SQL query from a ViewDefinition.
   */
  generateQuery(viewDef: ViewDefinition): TranspilationResult {
    try {
      const context = this.createBaseContext(viewDef);
      const columns = this.collectAllColumns(viewDef.select);
      
      // Check if we need to generate multiple SELECT statements for UNION ALL
      const selectStatements = this.generateAllSelectStatements(viewDef, context);
      
      const sql = selectStatements.length > 1 
        ? selectStatements.join('\nUNION ALL\n')
        : selectStatements[0];

      return {
        sql,
        columns,
        parameters: {}
      };
    } catch (error) {
      throw new Error(`Failed to generate query for ViewDefinition: ${error}`);
    }
  }

  /**
   * Generate all complete SELECT statements, handling unionAll properly.
   */
  private generateAllSelectStatements(viewDef: ViewDefinition, context: TranspilerContext): string[] {
    // Find all unionAll combinations
    const unionCombinations = this.expandUnionCombinations(viewDef.select);
    
    const statements: string[] = [];
    
    // Check for forEach filtering
    const forEachPath = this.hasForEachFiltering(viewDef.select);
    
    for (const combination of unionCombinations) {
      const selectClause = this.generateSelectClauseForCombination(combination, context);
      const fromClause = this.generateFromClause(viewDef, context);
      const whereClause = this.generateWhereClause(viewDef.where, context);
      
      // Combine FROM clause with additional WHERE conditions
      let finalStatement = `${selectClause}\n${fromClause}`;
      
      // Add forEach filtering to the existing WHERE clause in fromClause
      if (forEachPath) {
        const forEachFilter = this.generateForEachFilter(forEachPath, context);
        finalStatement += `\n  AND ${forEachFilter}`;
      }
      
      // Add view-level WHERE conditions
      if (whereClause) {
        finalStatement += `\n${whereClause}`;
      }
      
      const statement = finalStatement;
      
      statements.push(statement);
    }
    
    return statements;
  }

  /**
   * Generate a filter condition for forEach.
   */
  private generateForEachFilter(forEachPath: string, context: TranspilerContext): string {
    // For forEach: "name", we want to filter to only rows where the name array exists and has elements
    // Use JSON_QUERY to check if the array exists and has at least one element
    return `(JSON_QUERY(${context.resourceAlias}.json, '$.${forEachPath}[0]') IS NOT NULL)`;
  }

  /**
   * Create the base transpiler context.
   */
  private createBaseContext(viewDef: ViewDefinition): TranspilerContext {
    const constants: { [key: string]: any } = {};
    
    if (viewDef.constant) {
      for (const constant of viewDef.constant) {
        constants[constant.name] = this.getConstantValue(constant);
      }
    }

    return {
      resourceAlias: 'r',
      constants
    };
  }

  /**
   * Generate the SELECT clause (legacy method for non-unionAll cases).
   */
  private generateSelectClause(selects: ViewDefinitionSelect[], context: TranspilerContext): string {
    const columnParts: string[] = [];
    
    for (const select of selects) {
      const columns = this.generateSelectElementColumns(select, context);
      columnParts.push(...columns);
    }

    return `SELECT\n  ${columnParts.join(',\n  ')}`;
  }

  /**
   * Generate SQL for a single select element (legacy method, kept for compatibility).
   */
  private generateSelectElement(select: ViewDefinitionSelect, context: TranspilerContext): string {
    const parts: string[] = [];

    // Handle columns
    if (select.column) {
      for (const column of select.column) {
        const columnSql = this.generateColumnExpression(column, context);
        parts.push(`${columnSql} AS [${column.name}]`);
      }
    }

    // Handle nested selects (these would be subqueries or CTEs)
    if (select.select) {
      for (const nestedSelect of select.select) {
        const nestedSql = this.generateSelectElement(nestedSelect, context);
        parts.push(nestedSql);
      }
    }

    // Note: unionAll is now handled at the top level in generateAllSelectStatements

    return parts.join(',\n  ');
  }

  /**
   * Generate SQL expression for a column.
   */
  private generateColumnExpression(column: ViewDefinitionColumn, context: TranspilerContext): string {
    try {
      const expression = FHIRPathTranspiler.transpile(column.path, context);
      
      // Handle type casting if specified
      if (column.type) {
        const sqlType = FHIRPathTranspiler.inferSqlType(column.type);
        if (sqlType !== 'NVARCHAR(MAX)') {
          return `CAST(${expression} AS ${sqlType})`;
        }
      }
      
      return expression;
    } catch (error) {
      throw new Error(`Failed to transpile column '${column.name}' with path '${column.path}': ${error}`);
    }
  }

  /**
   * Generate the FROM clause.
   */
  private generateFromClause(viewDef: ViewDefinition, context: TranspilerContext): string {
    const tableName = `[${this.options.schemaName}].[${this.options.tableName}]`;
    let fromClause = `FROM ${tableName} AS [${context.resourceAlias}]`;
    
    // Add resource type filter
    const resourceTypeCondition = `JSON_VALUE([${context.resourceAlias}].[${this.options.resourceJsonColumn}], '$.resourceType') = '${viewDef.resource}'`;
    fromClause += `\nWHERE ${resourceTypeCondition}`;
    
    return fromClause;
  }

  /**
   * Generate the WHERE clause for view-level filters.
   */
  private generateWhereClause(whereConditions: ViewDefinitionWhere[] | undefined, context: TranspilerContext): string | null {
    if (!whereConditions || whereConditions.length === 0) {
      return null;
    }

    const conditions: string[] = [];
    
    for (const where of whereConditions) {
      try {
        const condition = FHIRPathTranspiler.transpile(where.path, context);
        
        // Check if this looks like a simple boolean field reference that needs to be cast
        // Only apply this to simple field references, not complex expressions
        const booleanFields = ['active', 'deceased', 'multipleBirth'];
        const simpleBooleanFieldPattern = new RegExp(`^JSON_VALUE\\([^,]+,\\s*'\\$\\.(${booleanFields.join('|')})'\\)$`);
        
        if (simpleBooleanFieldPattern.test(condition.trim())) {
          // Convert JSON_VALUE result to boolean: CAST(JSON_VALUE(...) as BIT) = 1
          conditions.push(`(CAST(${condition} AS BIT) = 1)`);
        } else {
          conditions.push(condition);
        }
      } catch (error) {
        throw new Error(`Failed to transpile where condition '${where.path}': ${error}`);
      }
    }

    return `  AND (${conditions.join(') AND (')})`;
  }

  /**
   * Expand all possible unionAll combinations from select elements.
   */
  private expandUnionCombinations(selects: ViewDefinitionSelect[]): SelectCombination[] {
    let combinations: SelectCombination[] = [{ selects: [], unionChoices: [] }];
    
    for (const select of selects) {
      combinations = this.expandSelectCombinations(select, combinations);
    }
    
    return combinations;
  }

  /**
   * Expand combinations for a single select element.
   */
  private expandSelectCombinations(select: ViewDefinitionSelect, currentCombinations: SelectCombination[]): SelectCombination[] {
    const newCombinations: SelectCombination[] = [];
    
    for (const combination of currentCombinations) {
      if (select.unionAll && select.unionAll.length > 0) {
        // Create one combination for each unionAll choice
        for (let i = 0; i < select.unionAll.length; i++) {
          const newCombination: SelectCombination = {
            selects: [...combination.selects, select],
            unionChoices: [...combination.unionChoices, i]
          };
          newCombinations.push(newCombination);
        }
      } else {
        // No unionAll, just add the select to existing combinations
        const newCombination: SelectCombination = {
          selects: [...combination.selects, select],
          unionChoices: [...combination.unionChoices, -1] // -1 means no union choice
        };
        newCombinations.push(newCombination);
      }
    }
    
    return newCombinations;
  }

  /**
   * Generate SELECT clause for a specific combination.
   */
  private generateSelectClauseForCombination(combination: SelectCombination, context: TranspilerContext): string {
    const columnParts: string[] = [];
    
    for (let i = 0; i < combination.selects.length; i++) {
      const select = combination.selects[i];
      const unionChoice = combination.unionChoices[i];
      
      // Add regular columns
      if (select.column) {
        for (const column of select.column) {
          const columnSql = this.generateColumnExpression(column, context);
          columnParts.push(`${columnSql} AS [${column.name}]`);
        }
      }
      
      // Add nested select columns
      if (select.select) {
        for (const nestedSelect of select.select) {
          const nestedColumns = this.generateSelectElementColumns(nestedSelect, context);
          columnParts.push(...nestedColumns);
        }
      }
      
      // Add unionAll columns for the chosen combination
      if (select.unionAll && unionChoice >= 0 && unionChoice < select.unionAll.length) {
        const chosenUnion = select.unionAll[unionChoice];
        if (chosenUnion.column) {
          for (const column of chosenUnion.column) {
            const columnSql = this.generateColumnExpression(column, context);
            columnParts.push(`${columnSql} AS [${column.name}]`);
          }
        }
      }
    }
    
    return `SELECT\n  ${columnParts.join(',\n  ')}`;
  }

  /**
   * Generate column expressions for a select element (used for nested selects).
   */
  private generateSelectElementColumns(select: ViewDefinitionSelect, context: TranspilerContext): string[] {
    const columnParts: string[] = [];
    
    if (select.column) {
      for (const column of select.column) {
        const columnSql = this.generateColumnExpression(column, context);
        columnParts.push(`${columnSql} AS [${column.name}]`);
      }
    }
    
    if (select.select) {
      for (const nestedSelect of select.select) {
        const nestedColumns = this.generateSelectElementColumns(nestedSelect, context);
        columnParts.push(...nestedColumns);
      }
    }
    
    return columnParts;
  }

  /**
   * Check if any select element has a forEach that would affect row filtering.
   */
  private hasForEachFiltering(selects: ViewDefinitionSelect[]): string | null {
    for (const select of selects) {
      if (select.forEach) {
        return select.forEach;
      }
      if (select.select) {
        const nestedForEach = this.hasForEachFiltering(select.select);
        if (nestedForEach) {
          return nestedForEach;
        }
      }
    }
    return null;
  }

  /**
   * Generate SQL for forEach iterations.
   */
  private generateForEachClause(forEach: string, context: TranspilerContext): string {
    // This would typically involve CROSS APPLY OPENJSON
    const iterationExpression = FHIRPathTranspiler.transpile(forEach, context);
    return `CROSS APPLY OPENJSON(${iterationExpression}) AS iteration_table(value)`;
  }

  /**
   * Collect all column definitions from select elements.
   */
  private collectAllColumns(selects: ViewDefinitionSelect[]): ColumnInfo[] {
    const columns: ColumnInfo[] = [];
    
    for (const select of selects) {
      if (select.column) {
        for (const column of select.column) {
          columns.push({
            name: column.name,
            type: FHIRPathTranspiler.inferSqlType(column.type),
            nullable: true, // FHIR data is generally nullable
            description: column.description
          });
        }
      }
      
      if (select.select) {
        columns.push(...this.collectAllColumns(select.select));
      }
      
      if (select.unionAll) {
        columns.push(...this.collectAllColumns(select.unionAll));
      }
    }
    
    return columns;
  }

  /**
   * Extract the value from a ViewDefinitionConstant.
   */
  private getConstantValue(constant: any): any {
    // Check all possible value types
    const valueProperties = [
      'valueString', 'valueInteger', 'valueDecimal', 'valueBoolean', 
      'valueDate', 'valueDateTime', 'valueTime', 'valueInstant',
      'valueCode', 'valueId', 'valueUri', 'valueUrl', 'valueCanonical',
      'valueUuid', 'valueOid', 'valueMarkdown', 'valueBase64Binary',
      'valuePositiveInt', 'valueUnsignedInt', 'valueInteger64'
    ];
    
    for (const prop of valueProperties) {
      if (constant[prop] !== undefined) {
        return constant[prop];
      }
    }
    
    // Check for complex types
    if (constant.valueCodeableConcept || constant.valueCoding || 
        constant.valueQuantity || constant.valueReference) {
      return constant.valueCodeableConcept || constant.valueCoding || 
             constant.valueQuantity || constant.valueReference;
    }
    
    return null;
  }

  /**
   * Generate a CREATE VIEW statement.
   */
  generateCreateView(viewDef: ViewDefinition, viewName?: string): string {
    const result = this.generateQuery(viewDef);
    const actualViewName = viewName || viewDef.name || 'generated_view';
    
    return `CREATE VIEW [${this.options.schemaName}].[${actualViewName}] AS\n${result.sql}`;
  }

  /**
   * Generate table creation SQL for materialized views.
   */
  generateCreateTable(viewDef: ViewDefinition, tableName?: string): string {
    const columns = this.collectAllColumns(viewDef.select);
    const actualTableName = tableName || `${viewDef.name}_table` || 'generated_table';
    
    const columnDefinitions = columns.map(col => 
      `  [${col.name}] ${col.type}${col.nullable ? ' NULL' : ' NOT NULL'}`
    );
    
    return `CREATE TABLE [${this.options.schemaName}].[${actualTableName}] (\n${columnDefinitions.join(',\n')}\n)`;
  }

  /**
   * Generate INSERT statement to populate a materialized view table.
   */
  generateInsertFromView(viewDef: ViewDefinition, tableName?: string): string {
    const result = this.generateQuery(viewDef);
    const actualTableName = tableName || `${viewDef.name}_table` || 'generated_table';
    
    return `INSERT INTO [${this.options.schemaName}].[${actualTableName}]\n${result.sql}`;
  }
}