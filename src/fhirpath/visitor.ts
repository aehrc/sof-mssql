/**
 * FHIRPath to T-SQL visitor implementation using ANTLR.
 */

import { AbstractParseTreeVisitor } from "antlr4ts/tree/AbstractParseTreeVisitor";
import {
  AdditiveExpressionContext,
  AndExpressionContext,
  BooleanLiteralContext,
  DateLiteralContext,
  DateTimeLiteralContext,
  EntireExpressionContext,
  EqualityExpressionContext,
  ExternalConstantContext,
  ExternalConstantTermContext,
  FunctionContext,
  FunctionInvocationContext,
  IdentifierContext,
  ImpliesExpressionContext,
  IndexerExpressionContext,
  IndexInvocationContext,
  InequalityExpressionContext,
  InvocationExpressionContext,
  InvocationTermContext,
  LiteralTermContext,
  LongNumberLiteralContext,
  MemberInvocationContext,
  MembershipExpressionContext,
  MultiplicativeExpressionContext,
  NullLiteralContext,
  NumberLiteralContext,
  OrExpressionContext,
  ParamListContext,
  ParenthesizedTermContext,
  PolarityExpressionContext,
  QualifiedIdentifierContext,
  QuantityContext,
  QuantityLiteralContext,
  StringLiteralContext,
  TermExpressionContext,
  ThisInvocationContext,
  TimeLiteralContext,
  TotalInvocationContext,
  TypeExpressionContext,
  UnionExpressionContext,
} from "../generated/grammar/fhirpathParser";
import { fhirpathVisitor } from "../generated/grammar/fhirpathVisitor";

export interface TranspilerContext {
  resourceAlias: string;
  constants?: { [key: string]: any };
  iterationContext?: string;
}

export class FHIRPathToTSqlVisitor
  extends AbstractParseTreeVisitor<string>
  implements fhirpathVisitor<string>
{
  constructor(private context: TranspilerContext) {
    super();
  }

  protected defaultResult(): string {
    return "NULL";
  }

  visitEntireExpression(ctx: EntireExpressionContext): string {
    return this.visit(ctx.expression());
  }

  visitTermExpression(ctx: TermExpressionContext): string {
    return this.visit(ctx.term());
  }

  visitInvocationExpression(ctx: InvocationExpressionContext): string {
    const base = this.visit(ctx.expression());
    const invocation = ctx.invocation();

    if (invocation instanceof MemberInvocationContext) {
      return this.handleMemberInvocation(base, invocation);
    } else if (invocation instanceof FunctionInvocationContext) {
      return this.handleFunctionInvocation(base, invocation);
    }

    return this.defaultResult();
  }

  visitIndexerExpression(ctx: IndexerExpressionContext): string {
    const base = this.visit(ctx.expression(0));
    const index = this.visit(ctx.expression(1));

    // Generate JSON path with array index
    if (base.includes("JSON_VALUE")) {
      const pathMatch = /JSON_VALUE\(([^,]+),\s*'([^']+)'\)/.exec(base);
      if (pathMatch) {
        const source = pathMatch[1];
        const path = pathMatch[2];
        return `JSON_VALUE(${source}, '${path}[${index}]')`;
      }
    }

    return `JSON_VALUE(${base}, '$[${index}]')`;
  }

  visitPolarityExpression(ctx: PolarityExpressionContext): string {
    const operand = this.visit(ctx.expression());
    const operator = ctx.text.charAt(0); // '+' or '-'

    if (operator === "-") {
      return `(-${operand})`;
    } else {
      return `(+${operand})`;
    }
  }

  visitMultiplicativeExpression(ctx: MultiplicativeExpressionContext): string {
    const left = this.visit(ctx.expression(0));
    const right = this.visit(ctx.expression(1));
    const operator = this.getOperatorFromContext(ctx.text, left, right);

    switch (operator) {
      case "*":
        return `(${left} * ${right})`;
      case "/":
      case "div":
        return `(${left} / ${right})`;
      case "mod":
        return `(${left} % ${right})`;
      default:
        return `(${left} * ${right})`;
    }
  }

  visitAdditiveExpression(ctx: AdditiveExpressionContext): string {
    const left = this.visit(ctx.expression(0));
    const right = this.visit(ctx.expression(1));
    const operator = this.getOperatorFromContext(ctx.text, left, right);

    switch (operator) {
      case "+":
        return `(${left} + ${right})`;
      case "-":
        return `(${left} - ${right})`;
      case "&":
        // String concatenation in FHIRPath, use CONCAT in SQL Server
        return `CONCAT(${left}, ${right})`;
      default:
        return `(${left} + ${right})`;
    }
  }

  visitTypeExpression(ctx: TypeExpressionContext): string {
    const expression = this.visit(ctx.expression());
    const typeSpec = this.visit(ctx.typeSpecifier());
    const operator = this.getOperatorFromContext(ctx.text, expression, typeSpec);

    if (operator === "is") {
      // Type checking - simplified implementation
      return `(${expression} IS NOT NULL)`;
    } else if (operator === "as") {
      // Type casting - return the expression as-is for simplification
      return expression;
    }

    return expression;
  }

  visitUnionExpression(ctx: UnionExpressionContext): string {
    const left = this.visit(ctx.expression(0));
    const right = this.visit(ctx.expression(1));

    // Union operation - in SQL Server, we'd need a more complex implementation
    // For now, we'll use a simplified approach
    return `COALESCE(${left}, ${right})`;
  }

  visitInequalityExpression(ctx: InequalityExpressionContext): string {
    const left = this.visit(ctx.expression(0));
    const right = this.visit(ctx.expression(1));
    const operator = this.getOperatorFromContext(ctx.text, left, right);

    switch (operator) {
      case "<":
        return `(${left} < ${right})`;
      case "<=":
        return `(${left} <= ${right})`;
      case ">":
        return `(${left} > ${right})`;
      case ">=":
        return `(${left} >= ${right})`;
      default:
        return `(${left} < ${right})`;
    }
  }

  visitEqualityExpression(ctx: EqualityExpressionContext): string {
    const left = this.visit(ctx.expression(0));
    const right = this.visit(ctx.expression(1));
    const operator = this.getOperatorFromContext(ctx.text, left, right);

    switch (operator) {
      case "=":
        // Handle boolean comparisons specially
        if (right === "1" || right === "0") {
          return `(CAST(${left} AS BIT) = ${right})`;
        } else if (left === "1" || left === "0") {
          return `(${left} = CAST(${right} AS BIT))`;
        }
        return `(${left} = ${right})`;
      case "!=":
        return `(${left} != ${right})`;
      case "~":
        // Equivalent/approximately equal
        return `(${left} = ${right})`;
      case "!~":
        // Not equivalent
        return `(${left} != ${right})`;
      default:
        return `(${left} = ${right})`;
    }
  }

  visitMembershipExpression(ctx: MembershipExpressionContext): string {
    const left = this.visit(ctx.expression(0));
    const right = this.visit(ctx.expression(1));
    const operator = this.getOperatorFromContext(ctx.text, left, right);

    if (operator === "in") {
      // Check if left is in the collection right
      return `EXISTS (SELECT 1 FROM OPENJSON(${right}) WHERE value = ${left})`;
    } else if (operator === "contains") {
      // Check if collection left contains right
      return `EXISTS (SELECT 1 FROM OPENJSON(${left}) WHERE value = ${right})`;
    }

    return this.defaultResult();
  }

  visitAndExpression(ctx: AndExpressionContext): string {
    const left = this.visit(ctx.expression(0));
    const right = this.visit(ctx.expression(1));
    return `(${left} AND ${right})`;
  }

  visitOrExpression(ctx: OrExpressionContext): string {
    const left = this.visit(ctx.expression(0));
    const right = this.visit(ctx.expression(1));
    const operator = this.getOperatorFromContext(ctx.text, left, right);

    if (operator === "or") {
      return `(${left} OR ${right})`;
    } else if (operator === "xor") {
      // Exclusive OR
      return `((${left} AND NOT ${right}) OR (NOT ${left} AND ${right}))`;
    }

    return `(${left} OR ${right})`;
  }

  visitImpliesExpression(ctx: ImpliesExpressionContext): string {
    const left = this.visit(ctx.expression(0));
    const right = this.visit(ctx.expression(1));
    // A implies B is equivalent to (NOT A) OR B
    return `((NOT ${left}) OR ${right})`;
  }

  // Literal visitors
  visitNullLiteral(_ctx: NullLiteralContext): string {
    return "NULL";
  }

  visitBooleanLiteral(ctx: BooleanLiteralContext): string {
    const value = ctx.text.toLowerCase();
    return value === "true" ? "1" : "0";
  }

  visitStringLiteral(ctx: StringLiteralContext): string {
    // Remove surrounding quotes and escape internal quotes
    const value = ctx.text.slice(1, -1).replace(/'/g, "''");
    return `'${value}'`;
  }

  visitNumberLiteral(ctx: NumberLiteralContext): string {
    return ctx.text;
  }

  visitLongNumberLiteral(ctx: LongNumberLiteralContext): string {
    return ctx.text.replace(/L$/i, "");
  }

  visitDateLiteral(ctx: DateLiteralContext): string {
    // Remove @ prefix and wrap in quotes for SQL
    const value = ctx.text.substring(1);
    return `'${value}'`;
  }

  visitDateTimeLiteral(ctx: DateTimeLiteralContext): string {
    // Remove @ prefix and wrap in quotes for SQL
    const value = ctx.text.substring(1);
    return `'${value}'`;
  }

  visitTimeLiteral(ctx: TimeLiteralContext): string {
    // Remove @T prefix and wrap in quotes for SQL
    const value = ctx.text.substring(2);
    return `'${value}'`;
  }

  visitQuantityLiteral(ctx: QuantityLiteralContext): string {
    return this.visit(ctx.quantity());
  }

  // Invocation visitors
  visitMemberInvocation(ctx: MemberInvocationContext): string {
    const memberName = this.visit(ctx.identifier());

    // Handle special identifiers
    if (memberName === "id") {
      return `${this.context.resourceAlias}.id`;
    }

    // Regular JSON property access
    if (this.context.iterationContext) {
      return `JSON_VALUE(${this.context.iterationContext}, '$.${memberName}')`;
    } else {
      return `JSON_VALUE(${this.context.resourceAlias}.json, '$.${memberName}')`;
    }
  }

  visitFunctionInvocation(ctx: FunctionInvocationContext): string {
    return this.visit(ctx.function());
  }

  visitThisInvocation(_ctx: ThisInvocationContext): string {
    // $this refers to the current item in an iteration context
    if (this.context.iterationContext) {
      return this.context.iterationContext;
    }
    return `${this.context.resourceAlias}.json`;
  }

  visitIndexInvocation(_ctx: IndexInvocationContext): string {
    // $index in forEach contexts - simplified implementation
    return "0"; // Default to first index
  }

  visitTotalInvocation(_ctx: TotalInvocationContext): string {
    // $total in forEach contexts - simplified implementation
    return "1"; // Default count
  }

  // Term visitors
  visitInvocationTerm(ctx: InvocationTermContext): string {
    return this.visit(ctx.invocation());
  }

  visitLiteralTerm(ctx: LiteralTermContext): string {
    return this.visit(ctx.literal());
  }

  visitExternalConstantTerm(ctx: ExternalConstantTermContext): string {
    return this.visit(ctx.externalConstant());
  }

  visitParenthesizedTerm(ctx: ParenthesizedTermContext): string {
    const expr = this.visit(ctx.expression());
    return `(${expr})`;
  }

  visitExternalConstant(ctx: ExternalConstantContext): string {
    let constantName: string;
    
    if (ctx.identifier()) {
      constantName = this.visit(ctx.identifier()!);
    } else {
      // STRING case - remove quotes
      constantName = ctx.STRING()?.text.slice(1, -1) || "";
    }

    // Check if the constant is defined in the context
    if (this.context.constants && this.context.constants[constantName] !== undefined) {
      return this.formatConstantValue(this.context.constants[constantName]);
    }

    return "NULL";
  }

  visitFunction(ctx: FunctionContext): string {
    const functionName = this.visit(ctx.identifier());
    const args = ctx.paramList() ? this.getParameterList(ctx.paramList()!) : [];

    return this.executeFunctionHandler(functionName, args);
  }

  visitQuantity(ctx: QuantityContext): string {
    const number = ctx.NUMBER().text;
    // For now, just return the number - unit handling would be more complex
    return number;
  }

  visitIdentifier(ctx: IdentifierContext): string {
    if (ctx.IDENTIFIER()) {
      return ctx.IDENTIFIER()!.text;
    } else if (ctx.DELIMITEDIDENTIFIER()) {
      // Remove backticks
      return ctx.DELIMITEDIDENTIFIER()!.text.slice(1, -1);
    } else {
      // One of the keyword identifiers
      return ctx.text;
    }
  }

  visitQualifiedIdentifier(ctx: QualifiedIdentifierContext): string {
    const parts = ctx.identifier().map(id => this.visit(id));
    return parts.join(".");
  }

  // Helper methods
  private handleMemberInvocation(base: string, memberCtx: MemberInvocationContext): string {
    const memberName = this.visit(memberCtx.identifier());

    // Create JSON path access
    if (base.includes("JSON_VALUE")) {
      const pathMatch = /JSON_VALUE\(([^,]+),\s*'([^']+)'\)/.exec(base);
      if (pathMatch) {
        const source = pathMatch[1];
        const existingPath = pathMatch[2];

        // Special handling for FHIR array fields
        const knownArrayFields = [
          "name", "telecom", "address", "identifier", 
          "extension", "contact"
        ];
        const pathParts = existingPath.split(".");
        if (
          pathParts.length >= 2 &&
          knownArrayFields.includes(pathParts[1]) &&
          !existingPath.includes("[")
        ) {
          const newPath = `${pathParts[0]}.${pathParts[1]}[0].${memberName}`;
          return `JSON_VALUE(${source}, '${newPath}')`;
        } else {
          const newPath = `${existingPath}.${memberName}`;
          return `JSON_VALUE(${source}, '${newPath}')`;
        }
      }
    }

    return `JSON_VALUE(${base}, '$.${memberName}')`;
  }

  private handleFunctionInvocation(base: string, functionCtx: FunctionInvocationContext): string {
    const functionName = this.visit(functionCtx.function().identifier());
    const args = functionCtx.function().paramList() ? 
      this.getParameterList(functionCtx.function().paramList()!) : [];

    // Special handling for first() function to match expected format
    if (functionName === "first") {
      // Check if the base is a simple JSON_VALUE call that we can optimize
      const simpleJsonMatch = /^JSON_VALUE\(([^,]+),\s*'([^']+)'\)$/.exec(base);
      if (simpleJsonMatch) {
        const source = simpleJsonMatch[1];
        const path = simpleJsonMatch[2];
        return `JSON_VALUE(${source}, '${path}[0]')`;
      } else if (!base.includes("JSON_VALUE") && !base.includes("EXISTS") && !base.includes("SELECT")) {
        // Simple identifier like 'name'
        return `JSON_VALUE(${this.context.resourceAlias}.json, '$.${base}[0]')`;
      } else {
        return `JSON_VALUE(${base}, '$[0]')`;
      }
    }

    // Create new context with the base as iteration context
    let newContext: TranspilerContext;

    if (!base.includes("JSON_VALUE") && !base.includes("EXISTS") && !base.includes("SELECT")) {
      // Simple identifier like 'name' - construct proper JSON path
      newContext = {
        ...this.context,
        iterationContext: `JSON_QUERY(${this.context.resourceAlias}.json, '$.${base}')`,
      };
    } else {
      newContext = {
        ...this.context,
        iterationContext: base,
      };
    }

    // For other functions, use the visitor approach
    const visitor = new FHIRPathToTSqlVisitor(newContext);
    return visitor.executeFunctionHandler(functionName, args);
  }

  private getParameterList(paramListCtx: ParamListContext): string[] {
    return paramListCtx.expression().map(expr => this.visit(expr));
  }

  private getOperatorFromContext(fullText: string, left: string, right: string): string {
    // Extract operator by removing left and right operands from full text
    // This is a simplified approach - in practice, you'd use the parse tree structure
    const leftIndex = fullText.indexOf(left);
    const rightIndex = fullText.lastIndexOf(right);
    
    if (leftIndex !== -1 && rightIndex !== -1) {
      const operatorPart = fullText.substring(leftIndex + left.length, rightIndex).trim();
      
      // Common operators
      if (operatorPart.includes("<=")) return "<=";
      if (operatorPart.includes(">=")) return ">=";
      if (operatorPart.includes("!=")) return "!=";
      if (operatorPart.includes("!~")) return "!~";
      if (operatorPart.includes("<")) return "<";
      if (operatorPart.includes(">")) return ">";
      if (operatorPart.includes("=")) return "=";
      if (operatorPart.includes("~")) return "~";
      if (operatorPart.includes("and")) return "and";
      if (operatorPart.includes("or")) return "or";
      if (operatorPart.includes("xor")) return "xor";
      if (operatorPart.includes("implies")) return "implies";
      if (operatorPart.includes("in")) return "in";
      if (operatorPart.includes("contains")) return "contains";
      if (operatorPart.includes("is")) return "is";
      if (operatorPart.includes("as")) return "as";
      if (operatorPart.includes("div")) return "div";
      if (operatorPart.includes("mod")) return "mod";
      if (operatorPart.includes("*")) return "*";
      if (operatorPart.includes("/")) return "/";
      if (operatorPart.includes("+")) return "+";
      if (operatorPart.includes("-")) return "-";
      if (operatorPart.includes("&")) return "&";
    }
    
    return "";
  }

  private formatConstantValue(value: any): string {
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

  private executeFunctionHandler(functionName: string, args: string[]): string {
    switch (functionName) {
      case "exists":
        return this.handleExistsFunction(args);
      case "empty":
        return this.handleEmptyFunction(args);
      case "first":
        return this.handleFirstFunction(args);
      case "last":
        return this.handleLastFunction(args);
      case "count":
        return this.handleCountFunction(args);
      case "join":
        return this.handleJoinFunction(args);
      case "where":
        return this.handleWhereFunction(args);
      case "select":
        return this.handleSelectFunction(args);
      case "getResourceKey":
        return this.handleGetResourceKeyFunction();
      case "ofType":
        return this.handleOfTypeFunction(args);
      case "getReferenceKey":
        return this.handleGetReferenceKeyFunction(args);
      case "not":
        return this.handleNotFunction(args);
      case "extension":
        return this.handleExtensionFunction(args);
      case "lowBoundary":
      case "highBoundary":
        return this.handleBoundaryFunction(functionName, args);
      default:
        throw new Error(`Unsupported FHIRPath function: ${functionName}`);
    }
  }

  // Function handlers (simplified versions of the original implementations)
  private handleExistsFunction(args: string[]): string {
    if (args.length === 0) {
      return `(${this.context.resourceAlias}.json IS NOT NULL)`;
    } else {
      return `(${args[0]} IS NOT NULL)`;
    }
  }

  private handleEmptyFunction(_args: string[]): string {
    if (this.context.iterationContext) {
      if (this.context.iterationContext.includes("JSON_QUERY")) {
        return `CASE 
          WHEN ${this.context.iterationContext} IS NULL THEN 1
          WHEN CAST(${this.context.iterationContext} AS NVARCHAR(MAX)) = '[]' THEN 1
          WHEN CAST(${this.context.iterationContext} AS NVARCHAR(MAX)) = 'null' THEN 1
          ELSE 0 
        END`;
      } else if (this.context.iterationContext.includes("JSON_VALUE")) {
        return `CASE WHEN ${this.context.iterationContext} IS NULL THEN 1 ELSE 0 END`;
      } else {
        return `CASE 
          WHEN JSON_QUERY(${this.context.iterationContext}) IS NULL THEN 1
          WHEN JSON_QUERY(${this.context.iterationContext}) = '[]' THEN 1
          ELSE 0 
        END`;
      }
    } else {
      return `CASE WHEN ${this.context.resourceAlias}.json IS NULL THEN 1 ELSE 0 END`;
    }
  }

  private handleFirstFunction(_args: string[]): string {
    if (this.context.iterationContext) {
      // Check if we have a JSON_QUERY expression for an array
      if (this.context.iterationContext.includes("JSON_QUERY")) {
        const match = /JSON_QUERY\(([^,]+),\s*'([^']+)'\)/.exec(this.context.iterationContext);
        if (match) {
          const source = match[1];
          const path = match[2];
          return `JSON_VALUE(${source}, '${path}[0]')`;
        }
      }
      
      if (this.context.iterationContext.includes("[0]")) {
        return this.context.iterationContext;
      }
      return `JSON_VALUE(${this.context.iterationContext}, '$[0]')`;
    } else {
      return `JSON_VALUE(${this.context.resourceAlias}.json, '$[0]')`;
    }
  }

  private handleLastFunction(args: string[]): string {
    const pathExpr = args.length > 0 
      ? args[0]
      : (this.context.iterationContext ?? `${this.context.resourceAlias}.json`);
    return `JSON_VALUE(${pathExpr}, '$[last]')`;
  }

  private handleCountFunction(args: string[]): string {
    const countPath = args.length > 0 
      ? args[0]
      : (this.context.iterationContext ?? `${this.context.resourceAlias}.json`);
    return `JSON_ARRAY_LENGTH(${countPath})`;
  }

  private handleJoinFunction(args: string[]): string {
    let separator = "''";
    if (args.length > 0) {
      separator = args[0];
    }

    const context = this.context.iterationContext || `${this.context.resourceAlias}.json`;
    return `ISNULL((SELECT STRING_AGG(ISNULL(value, ''), ${separator}) WITHIN GROUP (ORDER BY [key]) 
            FROM OPENJSON(${context}) 
            WHERE type IN (1, 2)), '')`;
  }

  private handleWhereFunction(args: string[]): string {
    if (args.length !== 1) {
      throw new Error("where() function requires exactly one argument");
    }

    if (this.context.iterationContext) {
      let jsonPath = "$.name";
      let source = this.context.resourceAlias + ".json";

      if (this.context.iterationContext.includes("JSON_VALUE")) {
        const match = /JSON_VALUE\(([^,]+),\s*'([^']+)'\)/.exec(this.context.iterationContext);
        if (match) {
          source = match[1];
          jsonPath = match[2];
        }
      } else if (this.context.iterationContext.includes("JSON_QUERY")) {
        const match = /JSON_QUERY\(([^,]+),\s*'([^']+)'\)/.exec(this.context.iterationContext);
        if (match) {
          source = match[1];
          jsonPath = match[2];
        }
      }

      const tableAlias = "item";
      const condition = args[0];

      return `EXISTS (SELECT 1 FROM OPENJSON(${source}, '${jsonPath}') AS ${tableAlias} WHERE ${condition})`;
    } else {
      return args[0];
    }
  }

  private handleSelectFunction(args: string[]): string {
    if (args.length !== 1) {
      throw new Error("select() function requires exactly one argument");
    }
    return args[0];
  }

  private handleGetResourceKeyFunction(): string {
    return `${this.context.resourceAlias}.id`;
  }

  private handleOfTypeFunction(args: string[]): string {
    if (args.length !== 1) {
      throw new Error("ofType() function requires exactly one argument");
    }
    // Simplified implementation - return current context
    return this.context.iterationContext || `${this.context.resourceAlias}.json`;
  }

  private handleGetReferenceKeyFunction(_args: string[]): string {
    if (this.context.iterationContext) {
      return `SUBSTRING(${this.context.iterationContext}, CHARINDEX('/', ${this.context.iterationContext}) + 1, LEN(${this.context.iterationContext}))`;
    }
    return `${this.context.resourceAlias}.id`;
  }

  private handleNotFunction(args: string[]): string {
    if (args.length > 0) {
      return `NOT (${args[0]})`;
    }
    if (this.context.iterationContext) {
      return `NOT (${this.context.iterationContext})`;
    }
    return "NOT (1=1)";
  }

  private handleExtensionFunction(args: string[]): string {
    if (args.length !== 1) {
      throw new Error("extension() function requires exactly one argument");
    }
    const base = this.context.iterationContext || `${this.context.resourceAlias}.json`;
    return `JSON_QUERY(${base}, '$.extension')`;
  }

  private handleBoundaryFunction(_functionName: string, _args: string[]): string {
    const base = this.context.iterationContext || `${this.context.resourceAlias}.json`;
    // Simplified implementation - return the value as-is
    return base;
  }
}
