/**
 * FHIRPath expression transpiler to T-SQL.
 * Converts FHIRPath expressions to equivalent T-SQL expressions for MS SQL Server.
 */

import * as fhirpath from "fhirpath";

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
      throw new Error(
        `Failed to transpile FHIRPath expression '${expression}': ${error}`,
      );
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
      if (current.type === "EntireExpression") {
        current = current.children[0]; // Could be AndExpression, OrExpression, TermExpression, etc.
      } else if (current.type === "TermExpression") {
        current = current.children[0]; // InvocationTerm, LiteralTerm, etc.
      } else if (current.type === "InvocationTerm") {
        current = current.children[0]; // MemberInvocation or other types
      } else if (current.type === "MemberInvocation") {
        current = current.children[0]; // Identifier or other types
      } else if (current.type === "LiteralTerm") {
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
      return "NULL";
    }

    switch (node.type) {
      case "FunctionInvocation":
        return this.transpileFunction(node, context);

      case "Identifier":
        return this.transpileIdentifier(node, context);

      case "StringLiteral":
        return this.transpileStringLiteral(node);

      case "NumberLiteral":
        return this.transpileNumberLiteral(node);

      case "BooleanLiteral":
        return this.transpileBooleanLiteral(node);

      case "AxisExpression":
        return this.transpileAxisExpression(node, context);

      case "FilterExpression":
        return this.transpileFilterExpression(node, context);

      case "InvocationExpression":
        return this.transpileInvocationExpression(node, context);

      case "BinaryExpression":
        return this.transpileBinaryExpression(node, context);

      case "UnaryExpression":
        return this.transpileUnaryExpression(node, context);

      case "ParenthesizedExpression":
        return `(${this.transpileNode(node.expression, context)})`;

      case "AndExpression":
        return this.transpileAndExpression(node, context);

      case "OrExpression":
        return this.transpileOrExpression(node, context);

      case "EqualityExpression":
        return this.transpileEqualityExpression(node, context);

      case "InequalityExpression":
        return this.transpileInequalityExpression(node, context);

      case "TermExpression":
        return this.transpileTermExpression(node, context);

      case "InvocationTerm":
        return this.transpileInvocationTerm(node, context);

      case "LiteralTerm":
        return this.transpileLiteralTerm(node, context);

      case "MemberInvocation":
        return this.transpileMemberInvocation(node, context);

      case "ExternalConstantTerm":
        return this.transpileExternalConstant(node, context);
        
      case "ThisInvocation":
        return this.transpileThisInvocation(node, context);
        
      case "IndexerExpression":
        return this.transpileIndexerExpression(node, context);
        
      case "ParenthesizedTerm":
        return this.transpileParenthesizedTerm(node, context);
        
      case "AdditiveExpression":
        return this.transpileAdditiveExpression(node, context);
        
      case "MultiplicativeExpression":
        return this.transpileMultiplicativeExpression(node, context);

      default:
        throw new Error(`Unsupported FHIRPath node type: ${node.type}`);
    }
  }

  /**
   * Transpile function invocations.
   */
  private static transpileFunction(
    node: any,
    context: TranspilerContext,
  ): string {
    const functionName = this.extractFunctionName(node);
    const args = this.extractFunctionArgs(node);

    return this.executeFunctionHandler(functionName, args, context);
  }
  
  /**
   * Extract function arguments from the node structure.
   */
  private static extractFunctionArgs(node: any): any[] {
    // Check if node already has params
    if (node.params) {
      return node.params;
    }
    
    // Look for Functn node with ParamList
    if (node.children && node.children.length > 0) {
      const funcNode = node.children[0];
      if (funcNode.type === "Functn") {
        // Find the ParamList child
        for (const child of funcNode.children) {
          if (child.type === "ParamList") {
            // Return the children of ParamList as args
            return child.children || [];
          }
        }
      }
    }
    
    return [];
  }

  /**
   * Extract function name from the node structure.
   */
  private static extractFunctionName(node: any): string {
    if (node.name) {
      return node.name;
    }

    if (node.children && node.children.length > 0) {
      const funcNode = node.children[0];
      if (funcNode.type === "Functn") {
        if (funcNode.children && funcNode.children.length > 0) {
          const identifierNode = funcNode.children[0];
          return this.extractIdentifierName(identifierNode);
        } else {
          throw new Error(
            `Could not find function identifier in Functn node: ${JSON.stringify(funcNode)}`,
          );
        }
      } else {
        return this.extractIdentifierName(funcNode);
      }
    }

    throw new Error(
      `Could not extract function name from node: ${JSON.stringify(node)}`,
    );
  }

  /**
   * Execute the appropriate function handler based on function name.
   */
  private static executeFunctionHandler(
    functionName: string,
    args: any[],
    context: TranspilerContext,
  ): string {
    switch (functionName) {
      case "exists":
        return this.handleExistsFunction(args, context);
      case "empty":
        return this.handleEmptyFunction(args, context);
      case "first":
        return this.handleFirstFunction(args, context);
      case "last":
        return this.handleLastFunction(args, context);
      case "count":
        return this.handleCountFunction(args, context);
      case "join":
        return this.handleJoinFunction(args, context);
      case "where":
        return this.handleWhereFunction(args, context);
      case "select":
        return this.handleSelectFunction(args, context);
      case "getResourceKey":
        return this.handleGetResourceKeyFunction(context);
      case "ofType":
        return this.handleOfTypeFunction(args, context);
      case "getReferenceKey":
        return this.handleGetReferenceKeyFunction(args, context);
      case "not":
        return this.handleNotFunction(args, context);
      case "extension":
        return this.handleExtensionFunction(args, context);
      case "lowBoundary":
      case "highBoundary":
        return this.handleBoundaryFunction(functionName, args, context);
      default:
        throw new Error(`Unsupported FHIRPath function: ${functionName}`);
    }
  }

  /**
   * Handle exists() function.
   */
  private static handleExistsFunction(
    args: any[],
    context: TranspilerContext,
  ): string {
    if (args.length === 0) {
      return `(${context.resourceAlias}.json IS NOT NULL)`;
    } else {
      const pathExpr = this.transpileNode(args[0], context);
      return `(${pathExpr} IS NOT NULL)`;
    }
  }

  /**
   * Handle empty() function.
   * Returns true if the collection is empty or null.
   */
  private static handleEmptyFunction(
    args: any[],
    context: TranspilerContext,
  ): string {
    // empty() should work on the current context, not take arguments
    if (context.iterationContext) {
      // Check if the current path is null or an empty array
      // Use ISNULL to handle NULL values and check for empty arrays
      return `CASE WHEN ${context.iterationContext} IS NULL OR ${context.iterationContext} = 'null' OR ${context.iterationContext} = '[]' THEN 1 ELSE 0 END`;
    } else {
      // Apply to the root resource
      return `CASE WHEN ${context.resourceAlias}.json IS NULL THEN 1 ELSE 0 END`;
    }
  }

  /**
   * Handle first() function.
   * Returns the first element of a collection.
   */
  private static handleFirstFunction(
    args: any[],
    context: TranspilerContext,
  ): string {
    // first() does not take arguments - it operates on the current context
    if (context.iterationContext) {
      // If we're already in a specific context, get the first element
      if (context.iterationContext.includes('[0]')) {
        // Already accessing first element
        return context.iterationContext;
      }
      // Add [0] to get the first element
      return `JSON_VALUE(${context.iterationContext}, '$[0]')`;
    } else {
      // Default context
      return `JSON_VALUE(${context.resourceAlias}.json, '$[0]')`;
    }
  }


  /**
   * Handle last() function.
   */
  private static handleLastFunction(
    args: any[],
    context: TranspilerContext,
  ): string {
    const pathExpr =
      args.length > 0
        ? this.transpileNode(args[0], context)
        : (context.iterationContext ?? `${context.resourceAlias}.json`);
    return `JSON_VALUE(${pathExpr}, '$[last]')`;
  }

  /**
   * Handle count() function.
   */
  private static handleCountFunction(
    args: any[],
    context: TranspilerContext,
  ): string {
    const countPath =
      args.length > 0
        ? this.transpileNode(args[0], context)
        : (context.iterationContext ?? `${context.resourceAlias}.json`);
    return `JSON_ARRAY_LENGTH(${countPath})`;
  }

  /**
   * Handle join() function.
   * Concatenates string values with an optional separator.
   */
  private static handleJoinFunction(
    args: any[],
    context: TranspilerContext,
  ): string {
    // join() takes an optional separator argument (default is empty string)
    let separator = "''";
    if (args.length > 0) {
      // Get the separator from the argument
      const sepNode = args[0];
      if (sepNode.type === 'StringLiteral') {
        separator = `'${sepNode.text.replace(/'/g, "''")}'`;
      } else {
        separator = this.transpileNode(sepNode, context);
      }
    }
    
    // Use OPENJSON to expand the array and STRING_AGG to join
    if (context.iterationContext) {
      return `(SELECT STRING_AGG(value, ${separator}) FROM OPENJSON(${context.iterationContext}))`;
    } else {
      return `(SELECT STRING_AGG(value, ${separator}) FROM OPENJSON(${context.resourceAlias}.json))`;
    }
  }

  /**
   * Handle where() function.
   * In FHIRPath, where() filters a collection based on a condition.
   * For example: name.where(use = 'official') filters the name array.
   */
  private static handleWhereFunction(
    args: any[],
    context: TranspilerContext,
  ): string {
    if (args.length !== 1) {
      throw new Error("where() function requires exactly one argument");
    }
    
    // For where() on collections, we need to use EXISTS with OPENJSON
    if (context.iterationContext) {
      // Extract the JSON path from the iteration context
      let jsonPath = '$.name'; // Default
      let source = context.resourceAlias + '.json';
      
      // Try to parse the iteration context to get the path
      if (context.iterationContext.includes('JSON_VALUE')) {
        const match = /JSON_VALUE\(([^,]+),\s*'([^']+)'\)/.exec(context.iterationContext);
        if (match) {
          source = match[1];
          jsonPath = match[2];
        }
      } else if (context.iterationContext.includes('JSON_QUERY')) {
        const match = /JSON_QUERY\(([^,]+),\s*'([^']+)'\)/.exec(context.iterationContext);
        if (match) {
          source = match[1];
          jsonPath = match[2];
        }
      }
      
      // Build the condition with proper context for array items
      const tableAlias = 'item';
      const condition = this.transpileNode(args[0], {
        ...context,
        iterationContext: `${tableAlias}.value`,
        resourceAlias: context.resourceAlias
      });
      
      // Return an EXISTS subquery that filters the array
      return `EXISTS (SELECT 1 FROM OPENJSON(${source}, '${jsonPath}') AS ${tableAlias} WHERE ${condition})`;
    } else {
      // where() on root - evaluate condition directly
      const condition = this.transpileNode(args[0], context);
      return condition;
    }
  }

  /**
   * Handle select() function.
   */
  private static handleSelectFunction(
    args: any[],
    context: TranspilerContext,
  ): string {
    if (args.length !== 1) {
      throw new Error("select() function requires exactly one argument");
    }
    return this.transpileNode(args[0], context);
  }

  /**
   * Handle getResourceKey() function.
   */
  private static handleGetResourceKeyFunction(
    context: TranspilerContext,
  ): string {
    return `${context.resourceAlias}.id`;
  }
  
  /**
   * Handle ofType() function.
   * Filters elements by FHIR type or primitive type.
   */
  private static handleOfTypeFunction(
    args: any[],
    context: TranspilerContext,
  ): string {
    if (args.length !== 1) {
      throw new Error("ofType() function requires exactly one argument");
    }
    
    // Get the type name from the argument
    let typeName: string;
    const typeArg = args[0];
    
    // Extract the type name from the argument node
    if (typeArg.type === "Identifier") {
      typeName = typeArg.terminalNodeText?.[0] || typeArg.text || typeArg.name;
    } else if (typeArg.type === "MemberInvocation" && typeArg.children?.[0]) {
      const identifier = typeArg.children[0];
      typeName = identifier.terminalNodeText?.[0] || identifier.text || identifier.name;
    } else {
      // Try to extract from text directly
      typeName = typeArg.text || typeArg.name || "";
    }
    
    // For primitive types, we just return the path as is
    // since filtering by primitive type in SQL is complex
    // In a full implementation, this would check the JSON schema
    const primitiveTypes = ['string', 'boolean', 'integer', 'decimal', 'date', 'dateTime', 'instant', 'time', 'uri', 'url', 'id', 'code'];
    
    if (primitiveTypes.includes(typeName.toLowerCase())) {
      // Return the current context - this is a simplification
      // Full implementation would validate the type
      return context.iterationContext || `${context.resourceAlias}.json`;
    }
    
    // For complex types (like Quantity), filter by resourceType property
    // This is a simplified implementation
    return context.iterationContext || `${context.resourceAlias}.json`;
  }
  
  /**
   * Handle getReferenceKey() function.
   * Gets the key from a reference.
   */
  private static handleGetReferenceKeyFunction(
    args: any[],
    context: TranspilerContext,
  ): string {
    // getReferenceKey extracts the ID from a reference
    // For example, from "Patient/123" it returns "123"
    // This is a simplified implementation
    if (context.iterationContext) {
      return `SUBSTRING(${context.iterationContext}, CHARINDEX('/', ${context.iterationContext}) + 1, LEN(${context.iterationContext}))`;
    }
    
    return `${context.resourceAlias}.id`;
  }
  
  /**
   * Handle not() function.
   * Logical negation.
   */
  private static handleNotFunction(
    args: any[],
    context: TranspilerContext,
  ): string {
    if (args.length > 0) {
      const expr = this.transpileNode(args[0], context);
      return `NOT (${expr})`;
    }
    
    // If no args, negate the current context
    if (context.iterationContext) {
      return `NOT (${context.iterationContext})`;
    }
    
    return "NOT (1=1)";
  }

  /**
   * Transpile identifiers (property access).
   */
  private static transpileIdentifier(
    node: any,
    context: TranspilerContext,
  ): string {
    // Extract identifier name from the node structure
    let identifier: string;
    if (node.text) {
      identifier = node.text;
    } else if (node.name) {
      identifier = node.name;
    } else if (node.terminalNodeText && node.terminalNodeText.length > 0) {
      identifier = node.terminalNodeText[0];
    } else {
      throw new Error(
        `Could not extract identifier from node: ${JSON.stringify(node)}`,
      );
    }

    // Check if it's a constant
    if (context.constants?.[identifier]) {
      return this.formatConstantValue(context.constants[identifier]);
    }

    // Handle special identifiers
    if (identifier === "id") {
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
      value = node.text.replace(/^'(.*)'$/, "$1");
    } else if (node.terminalNodeText && node.terminalNodeText.length > 0) {
      // Remove surrounding quotes if present
      value = node.terminalNodeText[0].replace(/^'(.*)'$/, "$1");
    } else {
      throw new Error(
        `Could not extract string value from node: ${JSON.stringify(node)}`,
      );
    }

    return `'${value.replace(/'/g, "''")}'`;
  }

  /**
   * Transpile number literals.
   */
  private static transpileNumberLiteral(node: any): string {
    // Extract the number value from the node structure
    let value: number;
    if (node.value !== undefined) {
      value = node.value;
    } else if (node.text) {
      value = parseFloat(node.text);
    } else if (node.terminalNodeText && node.terminalNodeText.length > 0) {
      value = parseFloat(node.terminalNodeText[0]);
    } else {
      throw new Error(
        `Could not extract number value from node: ${JSON.stringify(node)}`,
      );
    }
    
    return value.toString();
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
      value = node.text.toLowerCase() === "true";
    } else if (node.terminalNodeText && node.terminalNodeText.length > 0) {
      value = node.terminalNodeText[0].toLowerCase() === "true";
    } else {
      throw new Error(
        `Could not extract boolean value from node: ${JSON.stringify(node)}`,
      );
    }

    return value ? "1" : "0";
  }

  /**
   * Transpile axis expressions (property navigation).
   */
  private static transpileAxisExpression(
    node: any,
    context: TranspilerContext,
  ): string {
    const base = this.transpileNode(node.base, context);
    const property = node.axis;

    if (property === "id") {
      return `${context.resourceAlias}.id`;
    }

    // Create nested JSON path
    if (base.includes("JSON_VALUE")) {
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
  private static transpileFilterExpression(
    node: any,
    context: TranspilerContext,
  ): string {
    const base = this.transpileNode(node.base, context);
    const filterExpr = this.transpileNode(node.filter, context);

    // This requires CROSS APPLY OPENJSON for complex filtering
    return `(SELECT TOP 1 value FROM OPENJSON(${base}) WHERE ${filterExpr})`;
  }

  /**
   * Transpile invocation expressions (function calls on objects).
   */
  private static transpileInvocationExpression(
    node: any,
    context: TranspilerContext,
  ): string {
    if (!node.children || node.children.length < 2) {
      throw new Error("InvocationExpression requires at least two children");
    }

    // The first child is the base expression
    const base = this.transpileNode(node.children[0], context);

    // The second child is the member being accessed
    const member = node.children[1];

    // Handle different types of invocations
    if (member.type === "MemberInvocation") {
      // This is a property access like 'name.family'
      const memberName = this.extractMemberName(member);

      // Create JSON path access
      if (base.includes("JSON_VALUE")) {
        // Extend existing JSON path
        const pathMatch = RegExp(/JSON_VALUE\(([^,]+),\s*'([^']+)'\)/).exec(
          base,
        );
        if (pathMatch) {
          const source = pathMatch[1];
          const existingPath = pathMatch[2];

          // Special handling for FHIR array fields + property access
          const knownArrayFields = [
            "name",
            "telecom",
            "address",
            "identifier",
            "extension",
            "contact",
          ];
          const pathParts = existingPath.split(".");
          if (
            pathParts.length >= 2 &&
            knownArrayFields.includes(pathParts[1]) &&
            !existingPath.includes("[")
          ) {
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
    } else if (member.type === "FunctionInvocation") {
      // This is a function call like 'family.first()'
      const newContext: TranspilerContext = {
        ...context,
        iterationContext: base,
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

    throw new Error(
      `Could not extract member name from node: ${JSON.stringify(memberNode)}`,
    );
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
      throw new Error(
        `Could not extract identifier from node: ${JSON.stringify(node)}`,
      );
    }
  }

  /**
   * Transpile binary expressions (operators).
   */
  private static transpileBinaryExpression(
    node: any,
    context: TranspilerContext,
  ): string {
    const left = this.transpileNode(node.left, context);
    const right = this.transpileNode(node.right, context);

    switch (node.operator) {
      case "=":
        return `(${left} = ${right})`;
      case "!=":
        return `(${left} != ${right})`;
      case "<":
        return `(${left} < ${right})`;
      case "<=":
        return `(${left} <= ${right})`;
      case ">":
        return `(${left} > ${right})`;
      case ">=":
        return `(${left} >= ${right})`;
      case "and":
        return `(${left} AND ${right})`;
      case "or":
        return `(${left} OR ${right})`;
      case "+":
        return `(${left} + ${right})`;
      case "-":
        return `(${left} - ${right})`;
      case "*":
        return `(${left} * ${right})`;
      case "/":
        return `(${left} / ${right})`;
      case "div":
        return `(${left} / ${right})`;
      case "mod":
        return `(${left} % ${right})`;
      default:
        throw new Error(`Unsupported binary operator: ${node.operator}`);
    }
  }

  /**
   * Transpile unary expressions.
   */
  private static transpileUnaryExpression(
    node: any,
    context: TranspilerContext,
  ): string {
    const operand = this.transpileNode(node.operand, context);

    switch (node.operator) {
      case "not":
        return `(NOT ${operand})`;
      case "-":
        return `(-${operand})`;
      case "+":
        return `(+${operand})`;
      default:
        throw new Error(`Unsupported unary operator: ${node.operator}`);
    }
  }

  /**
   * Format a constant value for SQL.
   */
  private static formatConstantValue(value: any): string {
    if (typeof value === "string") {
      return `'${value.replace(/'/g, "''")}'`;
    } else if (typeof value === "number") {
      return value.toString();
    } else if (typeof value === "boolean") {
      return value ? "1" : "0";
    } else if (value === null || value === undefined) {
      return "NULL";
    } else {
      return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
    }
  }

  /**
   * Transpile AND expressions.
   */
  private static transpileAndExpression(
    node: any,
    context: TranspilerContext,
  ): string {
    if (!node.children || node.children.length < 2) {
      throw new Error("AndExpression requires at least two operands");
    }

    const left = this.transpileNode(node.children[0], context);
    const right = this.transpileNode(node.children[1], context);

    return `(${left} AND ${right})`;
  }

  /**
   * Transpile OR expressions.
   */
  private static transpileOrExpression(
    node: any,
    context: TranspilerContext,
  ): string {
    if (!node.children || node.children.length < 2) {
      throw new Error("OrExpression requires at least two operands");
    }

    const left = this.transpileNode(node.children[0], context);
    const right = this.transpileNode(node.children[1], context);

    return `(${left} OR ${right})`;
  }

  /**
   * Transpile equality expressions.
   */
  private static transpileEqualityExpression(
    node: any,
    context: TranspilerContext,
  ): string {
    if (!node.children || node.children.length < 2) {
      throw new Error("EqualityExpression requires at least two operands");
    }

    const left = this.transpileNode(node.children[0], context);
    const right = this.transpileNode(node.children[1], context);

    // Handle boolean comparisons specially
    if (right === "1" || right === "0") {
      // Right side is a boolean literal, ensure left side is compared as boolean
      return `(CAST(${left} AS BIT) = ${right})`;
    } else if (left === "1" || left === "0") {
      // Left side is a boolean literal, ensure right side is compared as boolean
      return `(${left} = CAST(${right} AS BIT))`;
    }

    return `(${left} = ${right})`;
  }

  /**
   * Transpile inequality expressions.
   */
  private static transpileInequalityExpression(
    node: any,
    context: TranspilerContext,
  ): string {
    if (!node.children || node.children.length < 2) {
      throw new Error("InequalityExpression requires at least two operands");
    }

    const left = this.transpileNode(node.children[0], context);
    const right = this.transpileNode(node.children[1], context);

    return `(${left} != ${right})`;
  }

  /**
   * Transpile term expressions.
   */
  private static transpileTermExpression(
    node: any,
    context: TranspilerContext,
  ): string {
    if (!node.children || node.children.length === 0) {
      throw new Error("TermExpression requires at least one child");
    }

    // TermExpression typically wraps another expression
    return this.transpileNode(node.children[0], context);
  }

  /**
   * Transpile invocation terms.
   */
  private static transpileInvocationTerm(
    node: any,
    context: TranspilerContext,
  ): string {
    if (!node.children || node.children.length === 0) {
      throw new Error("InvocationTerm requires at least one child");
    }

    // InvocationTerm typically wraps another expression
    return this.transpileNode(node.children[0], context);
  }

  /**
   * Transpile literal terms.
   */
  private static transpileLiteralTerm(
    node: any,
    context: TranspilerContext,
  ): string {
    if (!node.children || node.children.length === 0) {
      throw new Error("LiteralTerm requires at least one child");
    }

    // LiteralTerm typically wraps another expression
    return this.transpileNode(node.children[0], context);
  }

  /**
   * Transpile member invocations (property access).
   */
  private static transpileMemberInvocation(
    node: any,
    context: TranspilerContext,
  ): string {
    const memberName = this.extractMemberName(node);

    // Handle special identifiers
    if (memberName === "id") {
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
   * Handle extension() function.
   * Retrieves FHIR extensions by URL.
   */
  private static handleExtensionFunction(
    args: any[],
    context: TranspilerContext,
  ): string {
    if (args.length !== 1) {
      throw new Error("extension() function requires exactly one argument");
    }
    
    // Get the extension URL from the argument
    const urlExpr = this.transpileNode(args[0], context);
    
    // In SQL, we need to find the extension with matching URL
    // This is a simplified implementation
    const base = context.iterationContext || `${context.resourceAlias}.json`;
    
    // Return a JSON path to the extension
    // In reality, this would need to use OPENJSON to filter by URL
    return `JSON_QUERY(${base}, '$.extension')`;
  }
  
  /**
   * Handle boundary functions (lowBoundary, highBoundary).
   * These functions handle precision in dates/times.
   */
  private static handleBoundaryFunction(
    functionName: string,
    args: any[],
    context: TranspilerContext,
  ): string {
    // For simplicity, just return the value itself
    // Full implementation would handle date/time precision
    const base = context.iterationContext || `${context.resourceAlias}.json`;
    return base;
  }
  
  /**
   * Transpile additive expressions (+ and -).
   */
  private static transpileAdditiveExpression(
    node: any,
    context: TranspilerContext,
  ): string {
    if (!node.children || node.children.length < 2) {
      throw new Error("AdditiveExpression requires at least two operands");
    }
    
    const left = this.transpileNode(node.children[0], context);
    const right = this.transpileNode(node.children[1], context);
    
    // Check for operator in terminalNodeText
    const operator = node.terminalNodeText?.[0] || '+';
    
    if (operator === '+') {
      return `(${left} + ${right})`;
    } else if (operator === '-') {
      return `(${left} - ${right})`;
    }
    
    return `(${left} + ${right})`;
  }
  
  /**
   * Transpile multiplicative expressions (*, /, mod).
   */
  private static transpileMultiplicativeExpression(
    node: any,
    context: TranspilerContext,
  ): string {
    if (!node.children || node.children.length < 2) {
      throw new Error("MultiplicativeExpression requires at least two operands");
    }
    
    const left = this.transpileNode(node.children[0], context);
    const right = this.transpileNode(node.children[1], context);
    
    // Check for operator in terminalNodeText
    const operator = node.terminalNodeText?.[0] || '*';
    
    if (operator === '*') {
      return `(${left} * ${right})`;
    } else if (operator === '/' || operator === 'div') {
      return `(${left} / ${right})`;
    } else if (operator === 'mod') {
      return `(${left} % ${right})`;
    }
    
    return `(${left} * ${right})`;
  }

  /**
   * Transpile external constant references (e.g., %name_use).
   */
  private static transpileExternalConstant(
    node: any,
    context: TranspilerContext,
  ): string {
    // Extract constant name - it starts with %
    let constantName: string;
    if (node.text) {
      constantName = node.text.replace(/^%/, '');
    } else if (node.terminalNodeText && node.terminalNodeText.length > 0) {
      constantName = node.terminalNodeText[0].replace(/^%/, '');
    } else {
      throw new Error(`Could not extract constant name from node: ${JSON.stringify(node)}`);
    }
    
    // Check if the constant is defined in the context
    if (context.constants && context.constants[constantName] !== undefined) {
      return this.formatConstantValue(context.constants[constantName]);
    }
    
    // If constant is not defined, return NULL
    return 'NULL';
  }
  
  /**
   * Transpile $this references.
   */
  private static transpileThisInvocation(
    node: any,
    context: TranspilerContext,
  ): string {
    // $this refers to the current item in an iteration context
    if (context.iterationContext) {
      return context.iterationContext;
    }
    
    // If no iteration context, return the resource itself
    return `${context.resourceAlias}.json`;
  }
  
  /**
   * Transpile indexer expressions (e.g., name[0]).
   */
  private static transpileIndexerExpression(
    node: any,
    context: TranspilerContext,
  ): string {
    if (!node.children || node.children.length < 2) {
      throw new Error("IndexerExpression requires base and index");
    }
    
    // First child is the base expression (e.g., "name")
    const base = this.transpileNode(node.children[0], context);
    
    // Second child is the index
    const indexNode = node.children[1];
    let index: string;
    
    if (indexNode.type === "NumberLiteral") {
      index = this.transpileNumberLiteral(indexNode);
    } else if (indexNode.type === "ExternalConstantTerm") {
      index = this.transpileExternalConstant(indexNode, context);
    } else {
      index = this.transpileNode(indexNode, context);
    }
    
    // Generate JSON path with array index
    if (base.includes('JSON_VALUE')) {
      // Extract and modify the existing path
      const pathMatch = RegExp(/JSON_VALUE\(([^,]+),\s*'([^']+)'\)/).exec(base);
      if (pathMatch) {
        const source = pathMatch[1];
        const path = pathMatch[2];
        return `JSON_VALUE(${source}, '${path}[${index}]')`;
      }
    }
    
    // Default case
    return `JSON_VALUE(${base}, '$[${index}]')`;
  }
  
  /**
   * Transpile parenthesized terms.
   */
  private static transpileParenthesizedTerm(
    node: any,
    context: TranspilerContext,
  ): string {
    // ParenthesizedTerm wraps another expression
    if (node.children && node.children.length > 0) {
      const innerExpr = this.transpileNode(node.children[0], context);
      return `(${innerExpr})`;
    }
    
    return "NULL";
  }

  /**
   * Get the SQL data type for a FHIRPath expression result.
   */
  static inferSqlType(fhirType?: string): string {
    switch (fhirType?.toLowerCase()) {
      case "id":
      case "string":
      case "markdown":
      case "code":
      case "uri":
      case "url":
      case "canonical":
      case "uuid":
      case "oid":
        return "NVARCHAR(MAX)";

      case "boolean":
        return "BIT";

      case "integer":
      case "positiveint":
      case "unsignedint":
        return "INT";

      case "integer64":
        return "BIGINT";

      case "decimal":
        return "DECIMAL(18,6)";

      case "date":
      case "datetime":
      case "instant":
        return "DATETIME2";

      case "time":
        return "TIME";

      case "base64binary":
        return "VARBINARY(MAX)";

      default:
        return "NVARCHAR(MAX)";
    }
  }
}
