/**
 * FHIRPath expression transpiler to T-SQL.
 * Converts FHIRPath expressions to equivalent T-SQL expressions for MS SQL Server.
 */

import * as fhirpath from 'fhirpath';

export interface TranspilerContext {
  resourceAlias: string;
  constants?: { [key: string]: any };
  iterationContext?: string;
}

export class FHIRPathTranspiler {
  /**
   * Transpile a FHIRPath expression to T-SQL.
   */
  static transpile(expression: string, context: TranspilerContext): string {
    try {
      // Parse the FHIRPath expression to understand its structure
      const parsed = fhirpath.parse(expression);
      return this.transpileNode(parsed, context);
    } catch (error) {
      throw new Error(`Failed to transpile FHIRPath expression '${expression}': ${error}`);
    }
  }

  /**
   * Transpile a parsed FHIRPath node to T-SQL.
   */
  private static transpileNode(node: any, context: TranspilerContext): string {
    if (!node) {
      return 'NULL';
    }

    switch (node.type) {
      case 'FunctionInvocation':
        return this.transpileFunction(node, context);
      
      case 'Identifier':
        return this.transpileIdentifier(node, context);
      
      case 'StringLiteral':
        return this.transpileStringLiteral(node);
      
      case 'NumberLiteral':
        return this.transpileNumberLiteral(node);
      
      case 'BooleanLiteral':
        return this.transpileBooleanLiteral(node);
      
      case 'AxisExpression':
        return this.transpileAxisExpression(node, context);
      
      case 'FilterExpression':
        return this.transpileFilterExpression(node, context);
      
      case 'InvocationExpression':
        return this.transpileInvocationExpression(node, context);
      
      case 'BinaryExpression':
        return this.transpileBinaryExpression(node, context);
      
      case 'UnaryExpression':
        return this.transpileUnaryExpression(node, context);
      
      case 'ParenthesizedExpression':
        return `(${this.transpileNode(node.expression, context)})`;
      
      default:
        throw new Error(`Unsupported FHIRPath node type: ${node.type}`);
    }
  }

  /**
   * Transpile function invocations.
   */
  private static transpileFunction(node: any, context: TranspilerContext): string {
    const functionName = node.name;
    const args = node.params || [];

    switch (functionName) {
      case 'exists':
        if (args.length === 0) {
          // exists() on current context
          return `(${context.resourceAlias}.json IS NOT NULL)`;
        } else {
          // exists(path)
          const pathExpr = this.transpileNode(args[0], context);
          return `(${pathExpr} IS NOT NULL)`;
        }

      case 'empty':
        if (args.length === 0) {
          return `(${context.resourceAlias}.json IS NULL)`;
        } else {
          const pathExpr = this.transpileNode(args[0], context);
          return `(${pathExpr} IS NULL)`;
        }

      case 'first':
        if (args.length === 0) {
          // Return the current context as is (assumes single value)
          return context.iterationContext || `${context.resourceAlias}.json`;
        } else {
          const pathExpr = this.transpileNode(args[0], context);
          return `JSON_VALUE(${pathExpr}, '$[0]')`;
        }

      case 'last':
        const pathExpr = args.length > 0 ? 
          this.transpileNode(args[0], context) : 
          (context.iterationContext || `${context.resourceAlias}.json`);
        return `JSON_VALUE(${pathExpr}, '$[last]')`;

      case 'count':
        const countPath = args.length > 0 ? 
          this.transpileNode(args[0], context) : 
          (context.iterationContext || `${context.resourceAlias}.json`);
        return `JSON_ARRAY_LENGTH(${countPath})`;

      case 'join':
        if (args.length !== 1) {
          throw new Error('join() function requires exactly one argument');
        }
        const separator = this.transpileNode(args[0], context);
        const arrayPath = context.iterationContext || `${context.resourceAlias}.json`;
        return `STRING_AGG(JSON_VALUE(value, '$'), ${separator})`;

      case 'where':
        if (args.length !== 1) {
          throw new Error('where() function requires exactly one argument');
        }
        // This is complex and would typically require CROSS APPLY with JSON array
        const whereCondition = this.transpileNode(args[0], context);
        return `CROSS APPLY OPENJSON(${context.resourceAlias}.json) WHERE ${whereCondition}`;

      case 'select':
        if (args.length !== 1) {
          throw new Error('select() function requires exactly one argument');
        }
        const selectExpr = this.transpileNode(args[0], context);
        return selectExpr;

      case 'getResourceKey':
        return `${context.resourceAlias}.id`;

      default:
        throw new Error(`Unsupported FHIRPath function: ${functionName}`);
    }
  }

  /**
   * Transpile identifiers (property access).
   */
  private static transpileIdentifier(node: any, context: TranspilerContext): string {
    const identifier = node.name;
    
    // Check if it's a constant
    if (context.constants && context.constants[identifier]) {
      return this.formatConstantValue(context.constants[identifier]);
    }

    // Handle special identifiers
    if (identifier === 'id') {
      return `${context.resourceAlias}.id`;
    }

    // Regular JSON property access
    if (context.iterationContext) {
      return `JSON_VALUE(${context.iterationContext}, '$.${identifier}')`;
    } else {
      return `JSON_VALUE(${context.resourceAlias}.json, '$.${identifier}')`;
    }
  }

  /**
   * Transpile string literals.
   */
  private static transpileStringLiteral(node: any): string {
    return `'${node.value.replace(/'/g, "''")}'`;
  }

  /**
   * Transpile number literals.
   */
  private static transpileNumberLiteral(node: any): string {
    return node.value.toString();
  }

  /**
   * Transpile boolean literals.
   */
  private static transpileBooleanLiteral(node: any): string {
    return node.value ? '1' : '0';
  }

  /**
   * Transpile axis expressions (property navigation).
   */
  private static transpileAxisExpression(node: any, context: TranspilerContext): string {
    const base = this.transpileNode(node.base, context);
    const property = node.axis;

    if (property === 'id') {
      return `${context.resourceAlias}.id`;
    }

    // Create nested JSON path
    if (base.includes('JSON_VALUE')) {
      // Extract the existing path and extend it
      const pathMatch = base.match(/JSON_VALUE\([^,]+,\s*'([^']+)'\)/);
      if (pathMatch) {
        const existingPath = pathMatch[1];
        const newPath = `${existingPath}.${property}`;
        return base.replace(pathMatch[1], newPath);
      }
    }

    return `JSON_VALUE(${base}, '$.${property}')`;
  }

  /**
   * Transpile filter expressions.
   */
  private static transpileFilterExpression(node: any, context: TranspilerContext): string {
    const base = this.transpileNode(node.base, context);
    const filterExpr = this.transpileNode(node.filter, context);
    
    // This requires CROSS APPLY OPENJSON for complex filtering
    return `(SELECT TOP 1 value FROM OPENJSON(${base}) WHERE ${filterExpr})`;
  }

  /**
   * Transpile invocation expressions (function calls on objects).
   */
  private static transpileInvocationExpression(node: any, context: TranspilerContext): string {
    const base = this.transpileNode(node.base, context);
    
    // Create new context for the invocation
    const newContext: TranspilerContext = {
      ...context,
      iterationContext: base
    };
    
    return this.transpileFunction(node.invocation, newContext);
  }

  /**
   * Transpile binary expressions (operators).
   */
  private static transpileBinaryExpression(node: any, context: TranspilerContext): string {
    const left = this.transpileNode(node.left, context);
    const right = this.transpileNode(node.right, context);
    
    switch (node.operator) {
      case '=':
        return `(${left} = ${right})`;
      case '!=':
        return `(${left} != ${right})`;
      case '<':
        return `(${left} < ${right})`;
      case '<=':
        return `(${left} <= ${right})`;
      case '>':
        return `(${left} > ${right})`;
      case '>=':
        return `(${left} >= ${right})`;
      case 'and':
        return `(${left} AND ${right})`;
      case 'or':
        return `(${left} OR ${right})`;
      case '+':
        return `(${left} + ${right})`;
      case '-':
        return `(${left} - ${right})`;
      case '*':
        return `(${left} * ${right})`;
      case '/':
        return `(${left} / ${right})`;
      case 'div':
        return `(${left} / ${right})`;
      case 'mod':
        return `(${left} % ${right})`;
      default:
        throw new Error(`Unsupported binary operator: ${node.operator}`);
    }
  }

  /**
   * Transpile unary expressions.
   */
  private static transpileUnaryExpression(node: any, context: TranspilerContext): string {
    const operand = this.transpileNode(node.operand, context);
    
    switch (node.operator) {
      case 'not':
        return `(NOT ${operand})`;
      case '-':
        return `(-${operand})`;
      case '+':
        return `(+${operand})`;
      default:
        throw new Error(`Unsupported unary operator: ${node.operator}`);
    }
  }

  /**
   * Format a constant value for SQL.
   */
  private static formatConstantValue(value: any): string {
    if (typeof value === 'string') {
      return `'${value.replace(/'/g, "''")}'`;
    } else if (typeof value === 'number') {
      return value.toString();
    } else if (typeof value === 'boolean') {
      return value ? '1' : '0';
    } else if (value === null || value === undefined) {
      return 'NULL';
    } else {
      return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
    }
  }

  /**
   * Get the SQL data type for a FHIRPath expression result.
   */
  static inferSqlType(fhirType?: string): string {
    switch (fhirType?.toLowerCase()) {
      case 'id':
      case 'string':
      case 'markdown':
      case 'code':
      case 'uri':
      case 'url':
      case 'canonical':
      case 'uuid':
      case 'oid':
        return 'NVARCHAR(MAX)';
      
      case 'boolean':
        return 'BIT';
      
      case 'integer':
      case 'positiveint':
      case 'unsignedint':
        return 'INT';
      
      case 'integer64':
        return 'BIGINT';
      
      case 'decimal':
        return 'DECIMAL(18,6)';
      
      case 'date':
      case 'datetime':
      case 'instant':
        return 'DATETIME2';
      
      case 'time':
        return 'TIME';
      
      case 'base64binary':
        return 'VARBINARY(MAX)';
      
      default:
        return 'NVARCHAR(MAX)';
    }
  }
}