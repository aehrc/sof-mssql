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
  constants?: { [key: string]: string | number | boolean | null };
  iterationContext?: string;
  // forEach iteration context
  currentForEachAlias?: string; // The OPENJSON table alias (e.g., "forEach_0")
  forEachSource?: string; // The JSON source being iterated (e.g., "r.json")
  forEachPath?: string; // The JSON path being iterated (e.g., "$.name")
}

export class FHIRPathToTSqlVisitor
  extends AbstractParseTreeVisitor<string>
  implements fhirpathVisitor<string>
{
  constructor(private readonly context: TranspilerContext) {
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
    const operator = this.getOperatorFromContext(
      ctx.text,
      expression,
      typeSpec,
    );

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
        // Handle boolean comparisons - now that boolean literals return quoted strings
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
    // Return quoted boolean for JSON comparisons
    return value === "true" ? "'true'" : "'false'";
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

    // Known FHIR array fields should use JSON_QUERY
    const knownArrayFields = [
      "name",
      "telecom",
      "address",
      "identifier",
      "extension",
      "contact",
    ];

    // Regular JSON property access
    if (this.context.iterationContext) {
      return `JSON_VALUE(${this.context.iterationContext}, '$.${memberName}')`;
    } else {
      // Use JSON_QUERY for known array fields, JSON_VALUE for others
      if (knownArrayFields.includes(memberName)) {
        return `JSON_QUERY(${this.context.resourceAlias}.json, '$.${memberName}')`;
      } else {
        return `JSON_VALUE(${this.context.resourceAlias}.json, '$.${memberName}')`;
      }
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
    // $index in forEach contexts - return current iteration index (0-based)
    if (this.context.currentForEachAlias) {
      // In a forEach context, use the [key] column from OPENJSON which gives the array index
      return `${this.context.currentForEachAlias}.[key]`;
    }
    // Outside forEach context, default to 0
    return "0";
  }

  visitTotalInvocation(_ctx: TotalInvocationContext): string {
    // $total in forEach contexts - return total count of items in current iteration
    if (this.context.currentForEachAlias && this.context.forEachSource && this.context.forEachPath) {
      // Calculate total count using JSON_VALUE with array length
      // Use a subquery to count items in the JSON array
      return `(
        SELECT COUNT(*)
        FROM OPENJSON(${this.context.forEachSource}, '${this.context.forEachPath}') 
      )`;
    }
    // Outside forEach context, default to 1
    return "1";
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

    const identifier = ctx.identifier();
    if (identifier) {
      constantName = this.visit(identifier);
    } else {
      // STRING case - remove quotes
      constantName = ctx.STRING()?.text.slice(1, -1) ?? "";
    }

    // Check if the constant is defined in the context
    if (
      this.context.constants &&
      this.context.constants[constantName] !== undefined
    ) {
      return this.formatConstantValue(this.context.constants[constantName]);
    }

    return "NULL";
  }

  visitFunction(ctx: FunctionContext): string {
    const functionName = this.visit(ctx.identifier());
    const paramList = ctx.paramList();
    const args = paramList ? this.getParameterList(paramList) : [];

    return this.executeFunctionHandler(functionName, args);
  }

  visitQuantity(ctx: QuantityContext): string {
    // For now, just return the number - unit handling would be more complex
    return ctx.NUMBER().text;
  }

  visitIdentifier(ctx: IdentifierContext): string {
    const identifier = ctx.IDENTIFIER();
    const delimitedIdentifier = ctx.DELIMITEDIDENTIFIER();

    if (identifier) {
      return identifier.text;
    } else if (delimitedIdentifier) {
      // Remove backticks
      return delimitedIdentifier.text.slice(1, -1);
    } else {
      // One of the keyword identifiers
      return ctx.text;
    }
  }

  visitQualifiedIdentifier(ctx: QualifiedIdentifierContext): string {
    const parts = ctx.identifier().map((id) => this.visit(id));
    return parts.join(".");
  }

  // Helper methods
  private handleMemberInvocation(
    base: string,
    memberCtx: MemberInvocationContext,
  ): string {
    const memberName = this.visit(memberCtx.identifier());

    // Handle JSON_QUERY expressions (arrays)
    if (base.includes("JSON_QUERY")) {
      return this.handleJsonQueryMember(base, memberName);
    }

    // Handle JSON_VALUE expressions
    if (base.includes("JSON_VALUE")) {
      return this.handleJsonValueMember(base, memberName);
    }

    return `JSON_VALUE(${base}, '$.${memberName}')`;
  }

  private handleJsonQueryMember(base: string, memberName: string): string {
    const pathMatch = /JSON_QUERY\(([^,]+),\s*'([^']+)'\)/.exec(base);
    if (pathMatch) {
      const source = pathMatch[1];
      const existingPath = pathMatch[2];
      // For array access, we need to use array indexing
      const newPath = `${existingPath}[0].${memberName}`;
      return `JSON_VALUE(${source}, '${newPath}')`;
    }
    return `JSON_VALUE(${base}, '$.${memberName}')`;
  }

  private handleJsonValueMember(base: string, memberName: string): string {
    const pathMatch = /JSON_VALUE\(([^,]+),\s*'([^']+)'\)/.exec(base);
    if (!pathMatch) {
      return `JSON_VALUE(${base}, '$.${memberName}')`;
    }

    const source = pathMatch[1];
    const existingPath = pathMatch[2];
    const pathParts = existingPath.split(".");

    const shouldAddArrayIndex = this.shouldAddArrayIndexForField(
      pathParts,
      existingPath,
    );

    if (shouldAddArrayIndex) {
      const newPath = `${pathParts[0]}.${pathParts[1]}[0].${memberName}`;
      return `JSON_VALUE(${source}, '${newPath}')`;
    } else {
      const newPath = `${existingPath}.${memberName}`;
      return `JSON_VALUE(${source}, '${newPath}')`;
    }
  }

  private shouldAddArrayIndexForField(
    pathParts: string[],
    existingPath: string,
  ): boolean {
    // Special handling for FHIR array fields
    // Only add [0] when NOT in a forEach iteration context
    // In forEach, we're already at the element level, so arrays within elements are accessed directly
    // Note: "name" is excluded because it's an array at Patient level but an object within Contact
    const knownArrayFields = [
      "telecom",
      "address",
      "identifier",
      "extension",
      "contact",
    ];

    // Determine if we should add [0] for this array field
    // We should NOT add [0] if:
    // 1. We're in a forEach context AND
    // 2. The field is actually the forEach collection itself (not a nested array)
    //
    // For example:
    // - forEach on "contact", accessing "name.family": "name" is NOT an array in contact
    // - forEach on "contact", accessing "telecom.system": "telecom" IS an array in contact, so add [0]
    // - forEach on "name", accessing "family": we're iterating names, don't add [0] to name itself

    if (pathParts.length < 2 || existingPath.includes("[")) {
      return false;
    }

    const fieldName = pathParts[1];

    // Check if this field is in the known array fields list
    if (knownArrayFields.includes(fieldName)) {
      // Don't add [0] if this is the forEach array itself
      return !(
        this.context.forEachPath?.endsWith(fieldName)
      );
    } else if (fieldName === "name") {
      // "name" is special: it's an array in Patient but an object in Contact
      // Only add [0] for "name" when NOT in a forEach context
      return !this.context.iterationContext;
    }

    return false;
  }

  private handleFunctionInvocation(
    base: string,
    functionCtx: FunctionInvocationContext,
  ): string {
    const functionName = this.visit(functionCtx.function().identifier());
    const paramList = functionCtx.function().paramList();
    const args = paramList ? this.getParameterList(paramList) : [];

    // Special handling for first() function to match expected format
    if (functionName === "first") {
      return this.handleFirstFunctionInvocation(base);
    }

    // Create new context and delegate to function handler
    const newContext = this.createNewIterationContext(base);
    const visitor = new FHIRPathToTSqlVisitor(newContext);
    return visitor.executeFunctionHandler(functionName, args);
  }

  private handleFirstFunctionInvocation(base: string): string {
    // Check if the base is a JSON_QUERY call for an array
    const queryMatch = /^JSON_QUERY\(([^,]+),\s*'([^']+)'\)$/.exec(base);
    if (queryMatch) {
      const source = queryMatch[1];
      const path = queryMatch[2];
      return `JSON_VALUE(${source}, '${path}[0]')`;
    }

    // Check if the base is a JSON_VALUE call - first() on a scalar should return the scalar as-is
    const simpleJsonMatch = /^JSON_VALUE\(([^,]+),\s*'([^']+)'\)$/.exec(base);
    if (simpleJsonMatch) {
      // For JSON_VALUE calls, first() should return the value as-is since it's already a scalar
      return base;
    } else if (
      !base.includes("JSON_VALUE") &&
      !base.includes("JSON_QUERY") &&
      !base.includes("EXISTS") &&
      !base.includes("SELECT")
    ) {
      // Simple identifier like 'name'
      return `JSON_VALUE(${this.context.resourceAlias}.json, '$.${base}[0]')`;
    } else {
      return `JSON_VALUE(${base}, '$[0]')`;
    }
  }

  private createNewIterationContext(base: string): TranspilerContext {
    if (
      !base.includes("JSON_VALUE") &&
      !base.includes("EXISTS") &&
      !base.includes("SELECT")
    ) {
      // Simple identifier like 'name' - construct proper JSON path
      return {
        ...this.context,
        iterationContext: `JSON_QUERY(${this.context.resourceAlias}.json, '$.${base}')`,
      };
    } else {
      return {
        ...this.context,
        iterationContext: base,
      };
    }
  }

  private getParameterList(paramListCtx: ParamListContext): string[] {
    return paramListCtx.expression().map((expr) => this.visit(expr));
  }

  private getOperatorFromContext(
    fullText: string,
    left: string,
    right: string,
  ): string {
    const leftIndex = fullText.indexOf(left);
    const rightIndex = fullText.lastIndexOf(right);

    if (leftIndex === -1 || rightIndex === -1) {
      return "";
    }

    const operatorPart = fullText
      .substring(leftIndex + left.length, rightIndex)
      .trim();
    return this.extractOperatorFromText(operatorPart);
  }

  private extractOperatorFromText(operatorPart: string): string {
    // Order matters: check longer operators first to avoid substring matches
    const operators = [
      "<=",
      ">=",
      "!=",
      "!~",
      "implies",
      "contains",
      "and",
      "or",
      "xor",
      "div",
      "mod",
      "in",
      "is",
      "as",
      "<",
      ">",
      "=",
      "~",
      "*",
      "/",
      "+",
      "-",
      "&",
    ];

    for (const operator of operators) {
      if (operatorPart.includes(operator)) {
        return operator;
      }
    }

    return "";
  }

  private formatConstantValue(value: string | number | boolean | null): string {
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
    const functionMap: Record<string, (args: string[]) => string> = {
      exists: (args) => this.handleExistsFunction(args),
      empty: (args) => this.handleEmptyFunction(args),
      first: (args) => this.handleFirstFunction(args),
      last: (args) => this.handleLastFunction(args),
      count: (args) => this.handleCountFunction(args),
      join: (args) => this.handleJoinFunction(args),
      where: (args) => this.handleWhereFunction(args),
      select: (args) => this.handleSelectFunction(args),
      getResourceKey: () => this.handleGetResourceKeyFunction(),
      ofType: (args) => this.handleOfTypeFunction(args),
      getReferenceKey: (args) => this.handleGetReferenceKeyFunction(args),
      not: (args) => this.handleNotFunction(args),
      extension: (args) => this.handleExtensionFunction(args),
      lowBoundary: (args) => this.handleBoundaryFunction(functionName, args),
      highBoundary: (args) => this.handleBoundaryFunction(functionName, args),
    };

    const handler = functionMap[functionName];
    if (!handler) {
      throw new Error(`Unsupported FHIRPath function: ${functionName}`);
    }

    return handler(args);
  }

  // Function handlers (simplified versions of the original implementations)
  private handleExistsFunction(args: string[]): string {
    if (args.length === 0) {
      return `(${this.context.resourceAlias}.json IS NOT NULL)`;
    } else {
      return `(${args[0]} IS NOT NULL)`;
    }
  }

  private handleEmptyFunction(args: string[]): string {
    // If we have arguments, we need to check if that expression is empty
    if (args.length > 0) {
      const expression = args[0];
      
      // If the expression is an EXISTS clause, we need to negate it
      if (expression.includes("EXISTS")) {
        return `(NOT ${expression})`;
      }
      
      return `(CASE 
        WHEN ${expression} IS NULL THEN 1
        WHEN JSON_QUERY(${expression}) = '[]' THEN 1
        WHEN JSON_VALUE(${expression}) IS NULL THEN 1
        ELSE 0 
      END = 1)`;
    }
    
    // No arguments - check current iteration context
    if (this.context.iterationContext) {
      // If the current iteration context is an EXISTS clause, negate it
      if (this.context.iterationContext.includes("EXISTS")) {
        return `(NOT ${this.context.iterationContext})`;
      }
      
      if (this.context.iterationContext.includes("JSON_QUERY")) {
        return `(CASE 
          WHEN ${this.context.iterationContext} IS NULL THEN 1
          WHEN CAST(${this.context.iterationContext} AS NVARCHAR(MAX)) = '[]' THEN 1
          WHEN CAST(${this.context.iterationContext} AS NVARCHAR(MAX)) = 'null' THEN 1
          ELSE 0 
        END = 1)`;
      } else if (this.context.iterationContext.includes("JSON_VALUE")) {
        return `(CASE WHEN ${this.context.iterationContext} IS NULL THEN 1 ELSE 0 END = 1)`;
      } else {
        return `(CASE 
          WHEN JSON_QUERY(${this.context.iterationContext}) IS NULL THEN 1
          WHEN JSON_QUERY(${this.context.iterationContext}) = '[]' THEN 1
          ELSE 0 
        END = 1)`;
      }
    } else {
      return `(CASE WHEN ${this.context.resourceAlias}.json IS NULL THEN 1 ELSE 0 END = 1)`;
    }
  }

  private handleFirstFunction(_args: string[]): string {
    if (this.context.iterationContext) {
      // Check if we have a JSON_QUERY expression for an array
      if (this.context.iterationContext.includes("JSON_QUERY")) {
        const match = /JSON_QUERY\(([^,]+),\s*'([^']+)'\)/.exec(
          this.context.iterationContext,
        );
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
    const pathExpr =
      args.length > 0
        ? args[0]
        : (this.context.iterationContext ??
          `${this.context.resourceAlias}.json`);
    return `JSON_VALUE(${pathExpr}, '$[last]')`;
  }

  private handleCountFunction(args: string[]): string {
    const countPath =
      args.length > 0
        ? args[0]
        : (this.context.iterationContext ??
          `${this.context.resourceAlias}.json`);
    return `JSON_ARRAY_LENGTH(${countPath})`;
  }

  private handleJoinFunction(args: string[]): string {
    let separator = "''";
    if (args.length > 0) {
      separator = args[0];
    }

    const context =
      this.context.iterationContext ?? `${this.context.resourceAlias}.json`;
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
        const match = /JSON_VALUE\(([^,]+),\s*'([^']+)'\)/.exec(
          this.context.iterationContext,
        );
        if (match) {
          source = match[1];
          jsonPath = match[2];
        }
      } else if (this.context.iterationContext.includes("JSON_QUERY")) {
        const match = /JSON_QUERY\(([^,]+),\s*'([^']+)'\)/.exec(
          this.context.iterationContext,
        );
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
    return (
      this.context.iterationContext ?? `${this.context.resourceAlias}.json`
    );
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
    const base =
      this.context.iterationContext ?? `${this.context.resourceAlias}.json`;
    return `JSON_QUERY(${base}, '$.extension')`;
  }

  private handleBoundaryFunction(
    _functionName: string,
    _args: string[],
  ): string {
    // Simplified implementation - return the value as-is
    return this.context.iterationContext ?? `${this.context.resourceAlias}.json`;
  }
}
