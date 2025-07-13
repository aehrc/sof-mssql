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
      
      // Navigate to the actual expression node
      const expressionNode = this.extractExpressionNode(parsed);
      return this.transpileNode(expressionNode, context);
    } catch (error) {
      throw new Error(`Failed to transpile FHIRPath expression '${expression}': ${error}`);
    }
  }

  /**
   * Extract the actual expression node from the FHIRPath parser AST.
   */
  private static extractExpressionNode(parsed: any): any {
    // The FHIRPath parser returns a nested structure like:
    // { children: [{ type: "EntireExpression", children: [{ type: "TermExpression", ... }] }] }
    // We need to navigate to the actual expression
    
    if (!parsed?.children || parsed.children.length === 0) {
      return null;
    }

    let current = parsed.children[0]; // EntireExpression
    
    // Navigate down to find the actual expression content
    while (current?.children && current.children.length > 0) {
      if (current.type === 'EntireExpression') {
        current = current.children[0]; // Could be AndExpression, OrExpression, TermExpression, etc.
      } else if (current.type === 'TermExpression') {
        current = current.children[0]; // InvocationTerm, LiteralTerm, etc.
      } else if (current.type === 'InvocationTerm') {
        current = current.children[0]; // MemberInvocation or other types
      } else if (current.type === 'MemberInvocation') {
        current = current.children[0]; // Identifier or other types
      } else if (current.type === 'LiteralTerm') {
        current = current.children[0]; // StringLiteral, NumberLiteral, etc.
      } else {
        break; // We've reached an expression node we can handle
      }
    }
    
    return current;
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
      
      case 'AndExpression':
        return this.transpileAndExpression(node, context);
      
      case 'OrExpression':
        return this.transpileOrExpression(node, context);
      
      case 'EqualityExpression':
        return this.transpileEqualityExpression(node, context);
      
      case 'InequalityExpression':
        return this.transpileInequalityExpression(node, context);
      
      case 'TermExpression':
        return this.transpileTermExpression(node, context);
      
      case 'InvocationTerm':
        return this.transpileInvocationTerm(node, context);
      
      case 'LiteralTerm':
        return this.transpileLiteralTerm(node, context);
      
      case 'MemberInvocation':
        return this.transpileMemberInvocation(node, context);
      
      default:
        throw new Error(`Unsupported FHIRPath node type: ${node.type}`);
    }
  }

  /**
   * Transpile function invocations.
   */
  private static transpileFunction(node: any, context: TranspilerContext): string {
    // Extract function name from the node structure
    let functionName: string;
    if (node.name) {
      functionName = node.name;
    } else if (node.children && node.children.length > 0) {
      // Look for the function name in the structure
      const funcNode = node.children[0];
      if (funcNode.type === 'Functn') {
        // Navigate to the Identifier within the Functn node
        if (funcNode.children && funcNode.children.length > 0) {
          const identifierNode = funcNode.children[0];
          functionName = this.extractIdentifierName(identifierNode);
        } else {
          throw new Error(`Could not find function identifier in Functn node: ${JSON.stringify(funcNode)}`);
        }
      } else {
        functionName = this.extractIdentifierName(funcNode);
      }
    } else {
      throw new Error(`Could not extract function name from node: ${JSON.stringify(node)}`);
    }
    
    const args = node.params ?? [];

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
          // Apply first() to the current context
          if (context.iterationContext) {
            // If the context contains JSON_VALUE with a path like '$.name.family', 
            // convert it to get the first element: '$.name[0].family'
            if (context.iterationContext.includes('JSON_VALUE')) {
              const pathMatch = RegExp(/JSON_VALUE\(([^,]+),\s*'([^']+)'\)/).exec(context.iterationContext);
              if (pathMatch) {
                const source = pathMatch[1];
                const path = pathMatch[2];
                
                // Only modify if [0] is not already present
                if (!path.includes('[0]')) {
                  // Split the path and find where to insert [0]
                  const pathParts = path.split('.');
                  if (pathParts.length >= 2) {
                    // Insert [0] after the first array element (e.g., $.name.family -> $.name[0].family)
                    const newPath = `${pathParts[0]}.${pathParts[1]}[0]${pathParts.length > 2 ? '.' + pathParts.slice(2).join('.') : ''}`;
                    return `JSON_VALUE(${source}, '${newPath}')`;
                  }
                } else {
                  // [0] already present, just return as is
                  return `JSON_VALUE(${source}, '${path}')`;
                }
              }
            }
            return `JSON_VALUE(${context.iterationContext}, '$[0]')`;
          } else {
            return `${context.resourceAlias}.json`;
          }
        } else {
          const pathExpr = this.transpileNode(args[0], context);
          return `JSON_VALUE(${pathExpr}, '$[0]')`;
        }

      case 'last': {
        const pathExpr = args.length > 0 ?
            this.transpileNode(args[0], context) :
            (context.iterationContext ?? `${context.resourceAlias}.json`);
        return `JSON_VALUE(${pathExpr}, '$[last]')`;
      }

      case 'count': {
        const countPath = args.length > 0 ?
            this.transpileNode(args[0], context) :
            (context.iterationContext ?? `${context.resourceAlias}.json`);
        return `JSON_ARRAY_LENGTH(${countPath})`;
      }

      case 'join': {
        if (args.length !== 1) {
          throw new Error('join() function requires exactly one argument');
        }
        const separator = this.transpileNode(args[0], context);
        return `STRING_AGG(JSON_VALUE(value, '$'), ${separator})`;
      }

      case 'where': {
        if (args.length !== 1) {
          throw new Error('where() function requires exactly one argument');
        }
        // This is complex and would typically require CROSS APPLY with JSON array
        const whereCondition = this.transpileNode(args[0], context);
        return `CROSS APPLY OPENJSON(${context.resourceAlias}.json) WHERE ${whereCondition}`;
      }

      case 'select': {
        if (args.length !== 1) {
          throw new Error('select() function requires exactly one argument');
        }
        return this.transpileNode(args[0], context);
      }

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
    // Extract identifier name from the node structure
    let identifier: string;
    if (node.text) {
      identifier = node.text;
    } else if (node.name) {
      identifier = node.name;
    } else if (node.terminalNodeText && node.terminalNodeText.length > 0) {
      identifier = node.terminalNodeText[0];
    } else {
      throw new Error(`Could not extract identifier from node: ${JSON.stringify(node)}`);
    }
    
    // Check if it's a constant
    if (context.constants?.[identifier]) {
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
    // Extract the string value from the node structure
    let value: string;
    if (node.value !== undefined) {
      value = node.value;
    } else if (node.text) {
      // Remove surrounding quotes if present
      value = node.text.replace(/^'(.*)'$/, '$1');
    } else if (node.terminalNodeText && node.terminalNodeText.length > 0) {
      // Remove surrounding quotes if present
      value = node.terminalNodeText[0].replace(/^'(.*)'$/, '$1');
    } else {
      throw new Error(`Could not extract string value from node: ${JSON.stringify(node)}`);
    }
    
    return `'${value.replace(/'/g, "''")}'`;
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
    // Extract the boolean value from the node structure
    let value: boolean;
    if (node.value !== undefined) {
      value = node.value;
    } else if (node.text) {
      value = node.text.toLowerCase() === 'true';
    } else if (node.terminalNodeText && node.terminalNodeText.length > 0) {
      value = node.terminalNodeText[0].toLowerCase() === 'true';
    } else {
      throw new Error(`Could not extract boolean value from node: ${JSON.stringify(node)}`);
    }
    
    return value ? '1' : '0';
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
      const pathMatch = RegExp(/JSON_VALUE\([^,]+,\s*'([^']+)'\)/).exec(base);
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
    if (!node.children || node.children.length < 2) {
      throw new Error('InvocationExpression requires at least two children');
    }
    
    // The first child is the base expression
    const base = this.transpileNode(node.children[0], context);
    
    // The second child is the member being accessed
    const member = node.children[1];
    
    // Handle different types of invocations
    if (member.type === 'MemberInvocation') {
      // This is a property access like 'name.family'
      const memberName = this.extractMemberName(member);
      
      // Create JSON path access
      if (base.includes('JSON_VALUE')) {
        // Extend existing JSON path
        const pathMatch = RegExp(/JSON_VALUE\(([^,]+),\s*'([^']+)'\)/).exec(base);
        if (pathMatch) {
          const source = pathMatch[1];
          const existingPath = pathMatch[2];
          
          // Special handling for FHIR array fields + property access
          const knownArrayFields = ['name', 'telecom', 'address', 'identifier', 'extension', 'contact'];
          const pathParts = existingPath.split('.');
          if (pathParts.length >= 2 && knownArrayFields.includes(pathParts[1]) && !existingPath.includes('[')) {
            // Convert $.name.family to $.name[0].family
            const newPath = `${pathParts[0]}.${pathParts[1]}[0].${memberName}`;
            return `JSON_VALUE(${source}, '${newPath}')`;
          } else {
            const newPath = `${existingPath}.${memberName}`;
            return `JSON_VALUE(${source}, '${newPath}')`;
          }
        }
      }
      
      return `JSON_VALUE(${base}, '$.${memberName}')`;
    } else if (member.type === 'FunctionInvocation') {
      // This is a function call like 'family.first()'
      const newContext: TranspilerContext = {
        ...context,
        iterationContext: base
      };
      
      return this.transpileFunction(member, newContext);
    }
    
    throw new Error(`Unsupported invocation member type: ${member.type}`);
  }

  /**
   * Extract member name from MemberInvocation node.
   */
  private static extractMemberName(memberNode: any): string {
    if (memberNode.children && memberNode.children.length > 0) {
      const identifier = memberNode.children[0];
      return this.extractIdentifierName(identifier);
    }
    
    if (memberNode.text) {
      return memberNode.text;
    }
    
    throw new Error(`Could not extract member name from node: ${JSON.stringify(memberNode)}`);
  }

  /**
   * Extract identifier name from various node structures.
   */
  private static extractIdentifierName(node: any): string {
    if (node.text) {
      return node.text;
    } else if (node.name) {
      return node.name;
    } else if (node.terminalNodeText && node.terminalNodeText.length > 0) {
      return node.terminalNodeText[0];
    } else {
      throw new Error(`Could not extract identifier from node: ${JSON.stringify(node)}`);
    }
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
   * Transpile AND expressions.
   */
  private static transpileAndExpression(node: any, context: TranspilerContext): string {
    if (!node.children || node.children.length < 2) {
      throw new Error('AndExpression requires at least two operands');
    }
    
    const left = this.transpileNode(node.children[0], context);
    const right = this.transpileNode(node.children[1], context);
    
    return `(${left} AND ${right})`;
  }

  /**
   * Transpile OR expressions.
   */
  private static transpileOrExpression(node: any, context: TranspilerContext): string {
    if (!node.children || node.children.length < 2) {
      throw new Error('OrExpression requires at least two operands');
    }
    
    const left = this.transpileNode(node.children[0], context);
    const right = this.transpileNode(node.children[1], context);
    
    return `(${left} OR ${right})`;
  }

  /**
   * Transpile equality expressions.
   */
  private static transpileEqualityExpression(node: any, context: TranspilerContext): string {
    if (!node.children || node.children.length < 2) {
      throw new Error('EqualityExpression requires at least two operands');
    }
    
    const left = this.transpileNode(node.children[0], context);
    const right = this.transpileNode(node.children[1], context);
    
    // Handle boolean comparisons specially
    if (right === '1' || right === '0') {
      // Right side is a boolean literal, ensure left side is compared as boolean
      return `(CAST(${left} AS BIT) = ${right})`;
    } else if (left === '1' || left === '0') {
      // Left side is a boolean literal, ensure right side is compared as boolean  
      return `(${left} = CAST(${right} AS BIT))`;
    }
    
    return `(${left} = ${right})`;
  }

  /**
   * Transpile inequality expressions.
   */
  private static transpileInequalityExpression(node: any, context: TranspilerContext): string {
    if (!node.children || node.children.length < 2) {
      throw new Error('InequalityExpression requires at least two operands');
    }
    
    const left = this.transpileNode(node.children[0], context);
    const right = this.transpileNode(node.children[1], context);
    
    return `(${left} != ${right})`;
  }

  /**
   * Transpile term expressions.
   */
  private static transpileTermExpression(node: any, context: TranspilerContext): string {
    if (!node.children || node.children.length === 0) {
      throw new Error('TermExpression requires at least one child');
    }
    
    // TermExpression typically wraps another expression
    return this.transpileNode(node.children[0], context);
  }

  /**
   * Transpile invocation terms.
   */
  private static transpileInvocationTerm(node: any, context: TranspilerContext): string {
    if (!node.children || node.children.length === 0) {
      throw new Error('InvocationTerm requires at least one child');
    }
    
    // InvocationTerm typically wraps another expression
    return this.transpileNode(node.children[0], context);
  }

  /**
   * Transpile literal terms.
   */
  private static transpileLiteralTerm(node: any, context: TranspilerContext): string {
    if (!node.children || node.children.length === 0) {
      throw new Error('LiteralTerm requires at least one child');
    }
    
    // LiteralTerm typically wraps another expression
    return this.transpileNode(node.children[0], context);
  }

  /**
   * Transpile member invocations (property access).
   */
  private static transpileMemberInvocation(node: any, context: TranspilerContext): string {
    const memberName = this.extractMemberName(node);
    
    // Handle special identifiers
    if (memberName === 'id') {
      return `${context.resourceAlias}.id`;
    }

    // Regular JSON property access
    if (context.iterationContext) {
      return `JSON_VALUE(${context.iterationContext}, '$.${memberName}')`;
    } else {
      return `JSON_VALUE(${context.resourceAlias}.json, '$.${memberName}')`;
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
