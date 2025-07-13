/**
 * T-SQL query generator for ViewDefinition structures.
 * Generates SQL queries that can be executed against MS SQL Server.
 */

import { ViewDefinition, ViewDefinitionSelect, ViewDefinitionColumn, ViewDefinitionWhere, TranspilationResult, ColumnInfo } from './types.js';
import { FHIRPathTranspiler, TranspilerContext } from './fhirpath-transpiler.js';

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
      
      // Generate the main SELECT query
      const selectClause = this.generateSelectClause(viewDef.select, context);
      const fromClause = this.generateFromClause(viewDef, context);
      const whereClause = this.generateWhereClause(viewDef.where, context);
      
      const sql = [
        selectClause,
        fromClause,
        whereClause
      ].filter(Boolean).join('\n');

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
   * Generate the SELECT clause.
   */
  private generateSelectClause(selects: ViewDefinitionSelect[], context: TranspilerContext): string {
    const selectParts: string[] = [];
    
    for (const select of selects) {
      const selectSql = this.generateSelectElement(select, context);
      selectParts.push(selectSql);
    }

    return `SELECT\n  ${selectParts.join(',\n  ')}`;
  }

  /**
   * Generate SQL for a single select element.
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

    // Handle unionAll (these would be UNION ALL operations)
    if (select.unionAll) {
      const unionParts: string[] = [];
      for (const unionSelect of select.unionAll) {
        const unionSql = this.generateSelectElement(unionSelect, context);
        unionParts.push(unionSql);
      }
      if (unionParts.length > 0) {
        parts.push(unionParts.join('\nUNION ALL\n'));
      }
    }

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