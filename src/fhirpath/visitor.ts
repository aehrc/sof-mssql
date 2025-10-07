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
  ExpressionContext,
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
  testId?: string; // Optional test identifier for parallel test execution
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

    // Get the original expression texts from the parse tree to find the operator
    const leftText = ctx.expression(0).text;
    const rightText = ctx.expression(1).text;
    const operator = this.getOperatorFromContext(ctx.text, leftText, rightText);

    // Cast JSON_VALUE results to DECIMAL for numeric operations
    const leftCasted = this.castForNumericOperation(left);
    const rightCasted = this.castForNumericOperation(right);

    switch (operator) {
      case "*":
        return `(${leftCasted} * ${rightCasted})`;
      case "/":
      case "div":
        return `(${leftCasted} / ${rightCasted})`;
      case "mod":
        return `(${leftCasted} % ${rightCasted})`;
      default:
        return `(${leftCasted} * ${rightCasted})`;
    }
  }

  visitAdditiveExpression(ctx: AdditiveExpressionContext): string {
    const left = this.visit(ctx.expression(0));
    const right = this.visit(ctx.expression(1));

    // Get the original expression texts from the parse tree to find the operator
    const leftText = ctx.expression(0).text;
    const rightText = ctx.expression(1).text;
    const operator = this.getOperatorFromContext(ctx.text, leftText, rightText);

    switch (operator) {
      case "+":
      case "-": {
        // Cast JSON_VALUE results to DECIMAL for numeric operations
        const leftCasted = this.castForNumericOperation(left);
        const rightCasted = this.castForNumericOperation(right);
        return operator === "+"
          ? `(${leftCasted} + ${rightCasted})`
          : `(${leftCasted} - ${rightCasted})`;
      }
      case "&":
        // String concatenation in FHIRPath, use CONCAT in SQL Server
        return `CONCAT(${left}, ${right})`;
      default: {
        const leftCasted = this.castForNumericOperation(left);
        const rightCasted = this.castForNumericOperation(right);
        return `(${leftCasted} + ${rightCasted})`;
      }
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

    // Get the operator from the middle child (between the two expressions)
    // The context has 3 children: expr0, operator, expr1
    const operator = ctx.childCount >= 3 ? ctx.getChild(1).text : "";

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
      // Extract id from JSON, not from database row ID
      return `JSON_VALUE(${this.context.resourceAlias}.json, '$.id')`;
    }

    // Known FHIR array fields should use JSON_QUERY
    const knownArrayFields = [
      "name",
      "given",
      "telecom",
      "address",
      "line",
      "identifier",
      "extension",
      "contact",
      "output",
      "item",
      "udiCarrier",
      "coding",
      "component",
    ];

    // Regular JSON property access
    if (this.context.iterationContext) {
      // Check if the member is a known array field - use JSON_QUERY for arrays
      if (knownArrayFields.includes(memberName)) {
        return `JSON_QUERY(${this.context.iterationContext}, '$.${memberName}')`;
      }
      return `JSON_VALUE(${this.context.iterationContext}, '$.${memberName}')`;
    }

    // Use JSON_QUERY for known array fields, JSON_VALUE for others
    if (knownArrayFields.includes(memberName)) {
      return `JSON_QUERY(${this.context.resourceAlias}.json, '$.${memberName}')`;
    }

    return `JSON_VALUE(${this.context.resourceAlias}.json, '$.${memberName}')`;
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
    if (
      this.context.currentForEachAlias &&
      this.context.forEachSource &&
      this.context.forEachPath
    ) {
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

    // Constant not found - throw an error
    throw new Error(
      `Constant '%${constantName}' is not defined in the ViewDefinition`,
    );
  }

  visitFunction(ctx: FunctionContext): string {
    const functionName = this.visit(ctx.identifier());
    const paramList = ctx.paramList();

    // Special handling for where() function - need raw expression, not transpiled
    if (functionName === "where") {
      if (!paramList || paramList.expression().length !== 1) {
        throw new Error("where() function requires exactly one argument");
      }

      // Get the raw filter expression context (not transpiled yet)
      const filterExprCtx = paramList.expression()[0];

      // Transpile the filter expression with current context
      const filterVisitor = new FHIRPathToTSqlVisitor(this.context);

      // Return the condition directly - this is for root-level where() calls
      return filterVisitor.visit(filterExprCtx);
    }

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

    // Handle subquery results from .where() or .extension() functions
    // Pattern: (SELECT TOP 1 value FROM OPENJSON(...) WHERE ...)
    // OR: (SELECT TOP 1 JSON_VALUE(value, '$.field') FROM OPENJSON(...) WHERE ...)
    if (base.startsWith("(SELECT TOP 1 ")) {
      // Check if it already has JSON_VALUE in the SELECT
      const jsonValueMatch =
        /\(SELECT TOP 1 JSON_VALUE\(value, '\$\.([^']+)'\)(.*)/.exec(base);
      if (jsonValueMatch) {
        // Already has JSON_VALUE, append to the path
        // Convert: (SELECT TOP 1 JSON_VALUE(value, '$.field') FROM ...)
        // To: (SELECT TOP 1 JSON_VALUE(value, '$.field.member') FROM ...)
        const existingPath = jsonValueMatch[1];
        const rest = jsonValueMatch[2];
        return `(SELECT TOP 1 JSON_VALUE(value, '$.${existingPath}.${memberName}')${rest}`;
      } else if (base.startsWith("(SELECT TOP 1 value FROM OPENJSON")) {
        // Simple value select, add JSON_VALUE
        // Convert: (SELECT TOP 1 value FROM OPENJSON(...))
        // To: (SELECT TOP 1 JSON_VALUE(value, '$.member') FROM OPENJSON(...))
        const fromPart = base.substring(base.indexOf(" FROM "));
        return `(SELECT TOP 1 JSON_VALUE(value, '$.${memberName}')${fromPart}`;
      }
    }

    // Handle JSON_VALUE expressions - check this BEFORE JSON_QUERY
    // because the base might be JSON_VALUE(JSON_QUERY(...))
    if (base.startsWith("JSON_VALUE")) {
      return this.handleJsonValueMember(base, memberName);
    }

    // Handle JSON_QUERY expressions (arrays)
    if (base.includes("JSON_QUERY")) {
      return this.handleJsonQueryMember(base, memberName);
    }

    return `JSON_VALUE(${base}, '$.${memberName}')`;
  }

  private handleJsonQueryMember(base: string, memberName: string): string {
    const pathMatch = /JSON_QUERY\(([^,]+),\s*'([^']+)'\)/.exec(base);
    if (!pathMatch) {
      return `JSON_VALUE(${base}, '$.${memberName}')`;
    }

    const source = pathMatch[1];
    const existingPath = pathMatch[2];
    const isForEachValue = /forEach_\d+\.value/.test(source);

    const previousFieldIsArray = this.checkPreviousFieldIsArray(
      existingPath,
      isForEachValue,
    );
    const currentMemberIsArray = this.checkCurrentMemberIsArray(
      memberName,
      existingPath,
      isForEachValue,
    );

    const newPath = previousFieldIsArray
      ? `${existingPath}[0].${memberName}`
      : `${existingPath}.${memberName}`;

    return currentMemberIsArray
      ? `JSON_QUERY(${source}, '${newPath}')`
      : `JSON_VALUE(${source}, '${newPath}')`;
  }

  private checkPreviousFieldIsArray(
    existingPath: string,
    isForEachValue: boolean,
  ): boolean {
    const alwaysArrayFields = this.getAlwaysArrayFields();
    const contextDependentFields = ["name"];

    const indexPattern = /\[\d+]/;
    const pathSegments = existingPath
      .split(".")
      .filter((s) => s !== "$" && !indexPattern.exec(s));
    const lastSegment = pathSegments[pathSegments.length - 1];

    const previousFieldIsAlwaysArray =
      !!lastSegment && alwaysArrayFields.includes(lastSegment);
    const previousFieldIsContextArray =
      !!lastSegment &&
      contextDependentFields.includes(lastSegment) &&
      !isForEachValue;

    return previousFieldIsAlwaysArray || previousFieldIsContextArray;
  }

  private checkCurrentMemberIsArray(
    memberName: string,
    existingPath: string,
    isForEachValue: boolean,
  ): boolean {
    const alwaysArrayFields = this.getAlwaysArrayFields();
    const contextDependentFields = ["name"];

    const indexPattern = /\[\d+]/;
    const pathSegments = existingPath
      .split(".")
      .filter((s) => s !== "$" && !indexPattern.exec(s));

    return (
      alwaysArrayFields.includes(memberName) ||
      (contextDependentFields.includes(memberName) &&
        !isForEachValue &&
        pathSegments.length === 0)
    );
  }

  private getAlwaysArrayFields(): string[] {
    return [
      "given",
      "telecom",
      "address",
      "line",
      "identifier",
      "extension",
      "contact",
      "output",
      "item",
      "udiCarrier",
      "coding",
      "component",
    ];
  }

  /**
   * Checks if a member name represents a FHIR array field.
   */
  private isArrayField(memberName: string): boolean {
    const knownArrayFields = [
      "name",
      "given",
      "telecom",
      "address",
      "line",
      "identifier",
      "extension",
      "contact",
      "output",
      "item",
      "udiCarrier",
      "coding",
      "component",
    ];
    return knownArrayFields.includes(memberName);
  }

  /**
   * Handles nested JSON_QUERY with array indexing.
   */
  private handleNestedQueryWithIndex(
    source: string,
    existingPath: string,
    memberName: string,
  ): string | null {
    const queryMatch = /^JSON_QUERY\(([^,]+),\s*'([^']+)'\)$/.exec(source);
    const isArrayIndexPath = /^\$\[\d+]$/.test(existingPath);

    if (queryMatch && isArrayIndexPath) {
      const innerSource = queryMatch[1];
      const arrayPath = queryMatch[2];
      const indexMatch = /\[(\d+)]/.exec(existingPath);
      const index = indexMatch?.[1] ?? "0";
      const newPath = `${arrayPath}[${index}].${memberName}`;
      return `JSON_VALUE(${innerSource}, '${newPath}')`;
    }

    return null;
  }

  private handleJsonValueMember(base: string, memberName: string): string {
    const pathMatch = /^JSON_VALUE\((.*),\s*'([^']+)'\)$/.exec(base);
    if (!pathMatch) {
      return `JSON_VALUE(${base}, '$.${memberName}')`;
    }

    const source = pathMatch[1];
    const existingPath = pathMatch[2];

    // Check if the member being accessed is an array field
    if (this.isArrayField(memberName)) {
      const newPath = `${existingPath}.${memberName}`;
      return `JSON_QUERY(${source}, '${newPath}')`;
    }

    // Handle nested JSON_QUERY with array indexing
    const nestedResult = this.handleNestedQueryWithIndex(
      source,
      existingPath,
      memberName,
    );
    if (nestedResult) {
      return nestedResult;
    }

    // Check if the path already has an array index
    if (existingPath.includes("[") && existingPath.includes("]")) {
      const newPath = `${existingPath}.${memberName}`;
      return `JSON_VALUE(${source}, '${newPath}')`;
    }

    const pathParts = existingPath.split(".");
    const shouldAddArrayIndex = this.shouldAddArrayIndexForField(
      pathParts,
      existingPath,
    );

    if (shouldAddArrayIndex) {
      const newPath = `${pathParts[0]}.${pathParts[1]}[0].${memberName}`;
      return `JSON_VALUE(${source}, '${newPath}')`;
    }

    const newPath = `${existingPath}.${memberName}`;
    return `JSON_VALUE(${source}, '${newPath}')`;
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
      "link",
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
      return !this.context.forEachPath?.endsWith(fieldName);
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

    // Special handling for first() function to match expected format
    if (functionName === "first") {
      return this.handleFirstFunctionInvocation(base);
    }

    // Special handling for where() function - need raw expression, not transpiled
    if (functionName === "where") {
      return this.handleWhereFunctionInvocation(base, functionCtx);
    }

    // Special handling for ofType() function - need raw type name, not transpiled
    if (functionName === "ofType") {
      return this.handleOfTypeFunctionInvocation(base, functionCtx);
    }

    // Special handling for getReferenceKey() function - need raw type name, not transpiled
    if (functionName === "getReferenceKey") {
      return this.handleGetReferenceKeyFunctionInvocation(base, functionCtx);
    }

    // Special handling for exists() function - need raw expression, not transpiled
    if (functionName === "exists") {
      return this.handleExistsFunctionInvocation(base, functionCtx);
    }

    const args = paramList ? this.getParameterList(paramList) : [];

    // Create new context and delegate to function handler
    const newContext = this.createNewIterationContext(base);
    const visitor = new FHIRPathToTSqlVisitor(newContext);
    return visitor.executeFunctionHandler(functionName, args);
  }

  private handleOfTypeFunctionInvocation(
    base: string,
    functionCtx: FunctionInvocationContext,
  ): string {
    const paramList = functionCtx.function().paramList();
    if (!paramList || paramList.expression().length !== 1) {
      throw new Error("ofType() function requires exactly one argument");
    }

    // Get the raw type expression - it should be an identifier
    const typeExprCtx = paramList.expression()[0];
    const typeName = typeExprCtx.text; // Get the raw text (e.g., "integer")

    return this.applyPolymorphicFieldMapping(base, typeName);
  }

  private handleGetReferenceKeyFunctionInvocation(
    base: string,
    functionCtx: FunctionInvocationContext,
  ): string {
    const paramList = functionCtx.function().paramList();

    // Get the optional resource type parameter
    let resourceType: string | null = null;
    if (paramList && paramList.expression().length > 0) {
      // Get the raw type expression - it should be an identifier
      const typeExprCtx = paramList.expression()[0];
      resourceType = typeExprCtx.text; // Get the raw text (e.g., "Patient")
    }

    // Create new context and call the handler
    const newContext = this.createNewIterationContext(base);
    const visitor = new FHIRPathToTSqlVisitor(newContext);
    return visitor.handleGetReferenceKeyFunctionWithType(resourceType);
  }

  /**
   * Maps polymorphic FHIR fields to their typed variants.
   * Example: value.ofType(integer) → valueInteger
   * Handles paths with array indices like "output[0].value" → "output[0].valueUrl"
   */
  private applyPolymorphicFieldMapping(base: string, typeName: string): string {
    // Handle SELECT subqueries from extension() function
    // Pattern: (SELECT TOP 1 JSON_VALUE(value, '$.value') FROM ...)
    if (base.startsWith("(SELECT TOP 1 JSON_VALUE(value, '$.")) {
      const suffix = this.getTypeSuffix(typeName);
      // Find the JSON_VALUE path part
      const pathMatch = /JSON_VALUE\(value, '\$\.([^']+)'\)/.exec(base);
      if (pathMatch) {
        const path = pathMatch[1];
        if (this.isPolymorphicField(path)) {
          // Replace the polymorphic field with its typed variant
          const newPath = `${path}${suffix}`;
          return base.replace(
            `JSON_VALUE(value, '$.${path}')`,
            `JSON_VALUE(value, '$.${newPath}')`,
          );
        }
      }
      return base;
    }

    // Check if base is a JSON_VALUE call for a polymorphic field
    const match = /JSON_VALUE\(([^,]+),\s*'\$\.([^']+)'\)/.exec(base);
    if (!match) {
      return base; // Not a JSON_VALUE call, return unchanged
    }

    const source = match[1];
    const path = match[2];
    const suffix = this.getTypeSuffix(typeName);

    // Check if this is a known polymorphic field pattern
    if (this.isPolymorphicField(path)) {
      // Extract the last segment and replace it with the typed variant
      const lastDotIndex = path.lastIndexOf(".");
      if (lastDotIndex === -1) {
        // No dot, so the whole path is the polymorphic field
        return `JSON_VALUE(${source}, '$.${path}${suffix}')`;
      } else {
        // Replace the last segment with its typed variant
        const prefix = path.substring(0, lastDotIndex);
        const lastSegment = path.substring(lastDotIndex + 1);
        return `JSON_VALUE(${source}, '$.${prefix}.${lastSegment}${suffix}')`;
      }
    }

    return base; // Not a polymorphic field, return unchanged
  }

  /**
   * Returns the type suffix for polymorphic field mapping.
   */
  private getTypeSuffix(typeName: string): string {
    const typeMap: Record<string, string> = {
      integer: "Integer",
      string: "String",
      boolean: "Boolean",
      decimal: "Decimal",
      dateTime: "DateTime",
      date: "Date",
      time: "Time",
      instant: "Instant",
      uri: "Uri",
      url: "Url",
      canonical: "Canonical",
      uuid: "Uuid",
      oid: "Oid",
      id: "Id",
      code: "Code",
      markdown: "Markdown",
      base64Binary: "Base64Binary",
      positiveInt: "PositiveInt",
      unsignedInt: "UnsignedInt",
      integer64: "Integer64",
      // Complex types use PascalCase as they match FHIR type names
      // eslint-disable-next-line @typescript-eslint/naming-convention
      Period: "Period",
      // eslint-disable-next-line @typescript-eslint/naming-convention
      Range: "Range",
      // eslint-disable-next-line @typescript-eslint/naming-convention
      Quantity: "Quantity",
      // eslint-disable-next-line @typescript-eslint/naming-convention
      CodeableConcept: "CodeableConcept",
      // eslint-disable-next-line @typescript-eslint/naming-convention
      Reference: "Reference",
    };

    return typeMap[typeName] || typeName;
  }

  /**
   * Checks if a path represents a polymorphic field (value[x], onset[x], effective[x], deceased[x], identified[x]).
   * Handles paths with array indices like "output[0].value" or "item[1].onset".
   */
  private isPolymorphicField(path: string): boolean {
    // Extract the last segment after the last dot (or the whole path if no dot)
    // This handles paths like "output[0].value" → "value" or "item[1].onset" → "onset"
    const lastSegment = path.includes(".")
      ? (path.split(".").pop() ?? "")
      : path;

    return (
      lastSegment === "value" ||
      lastSegment === "onset" ||
      lastSegment === "effective" ||
      lastSegment === "deceased" ||
      lastSegment === "identified"
    );
  }

  /**
   * Cast expression to DECIMAL for numeric operations if needed.
   * JSON_VALUE returns NVARCHAR by default, which can't be used in arithmetic operations.
   */
  private castForNumericOperation(expression: string): string {
    // Check if expression contains JSON_VALUE and isn't already wrapped in CAST
    if (expression.includes("JSON_VALUE") && !expression.includes("CAST(")) {
      return `CAST(${expression} AS DECIMAL(18,6))`;
    }
    // Already has CAST or doesn't need it
    return expression;
  }

  private handleWhereFunctionInvocation(
    base: string,
    functionCtx: FunctionInvocationContext,
  ): string {
    const paramList = functionCtx.function().paramList();
    if (!paramList || paramList.expression().length !== 1) {
      throw new Error("where() function requires exactly one argument");
    }

    const filterExprCtx = paramList.expression()[0];

    // Special case: where() called at resource root level (no collection)
    if (this.isResourceRootLevel(base)) {
      const filterVisitor = new FHIRPathToTSqlVisitor(this.context);
      return filterVisitor.visit(filterExprCtx);
    }

    // Extract source and path from the base expression
    const { source, jsonPath } = this.extractSourceAndPath(base);

    // Build and return the EXISTS clause with filtered collection
    return this.buildWhereExistsClause(source, jsonPath, filterExprCtx);
  }

  /**
   * Checks if the base expression represents the resource root level (not a collection).
   */
  private isResourceRootLevel(base: string): boolean {
    return (
      base === `${this.context.resourceAlias}.json` ||
      base === this.context.resourceAlias ||
      (!base.includes("JSON_QUERY") &&
        !base.includes("JSON_VALUE") &&
        !base.includes("EXISTS") &&
        !base.includes("SELECT"))
    );
  }

  /**
   * Extracts the source and JSON path from a base expression.
   */
  private extractSourceAndPath(base: string): {
    source: string;
    jsonPath: string;
  } {
    let source = `${this.context.resourceAlias}.json`;
    let jsonPath = "$";

    if (base.includes("JSON_QUERY")) {
      const match = /JSON_QUERY\(([^,]+),\s*'([^']+)'\)/.exec(base);
      if (match) {
        source = match[1];
        jsonPath = match[2];
      }
    } else if (base.includes("JSON_VALUE")) {
      const match = /JSON_VALUE\(([^,]+),\s*'([^']+)'\)/.exec(base);
      if (match) {
        source = match[1];
        jsonPath = match[2];
      }
    }

    return { source, jsonPath };
  }

  /**
   * Builds a subquery for filtering a collection with a where condition.
   * Returns a subquery that selects the filtered items, allowing further navigation.
   */
  private buildWhereExistsClause(
    source: string,
    jsonPath: string,
    filterExprCtx: ExpressionContext,
  ): string {
    const tableAlias = "whereItem";

    // Create a new context for the filter condition where expressions refer to items in the collection
    const itemContext: TranspilerContext = {
      resourceAlias: tableAlias,
      constants: this.context.constants,
      iterationContext: `${tableAlias}.value`,
    };

    // Transpile the filter expression with the item context
    const filterVisitor = new FHIRPathToTSqlVisitor(itemContext);
    const condition = filterVisitor.visit(filterExprCtx);

    // Return a subquery that selects the filtered collection
    // This allows further navigation (e.g., .family) to work correctly
    return `(SELECT TOP 1 value FROM OPENJSON(${source}, '${jsonPath}') AS ${tableAlias} WHERE ${condition})`;
  }

  private handleExistsFunctionInvocation(
    base: string,
    functionCtx: FunctionInvocationContext,
  ): string {
    const paramList = functionCtx.function().paramList();

    // If no arguments, delegate to the standard handler
    if (!paramList || paramList.expression().length === 0) {
      const args: string[] = [];
      return this.handleExistsFunction(args, base);
    }

    // Get the raw filter expression context (not transpiled yet)
    const filterExprCtx = paramList.expression()[0];

    // Call the handler with the base and filter expression context
    return this.handleExistsFunction([], base, filterExprCtx);
  }

  private handleFirstFunctionInvocation(base: string): string {
    // Check if the base is a JSON_QUERY call for an array
    const queryMatch = /^JSON_QUERY\(([^,]+),\s*'([^']+)'\)$/.exec(base);
    if (queryMatch) {
      const source = queryMatch[1];
      const path = queryMatch[2];
      return `JSON_VALUE(${source}, '${path}[0]')`;
    }

    // Check if the base is a JSON_VALUE call
    const simpleJsonMatch = /^JSON_VALUE\(([^,]+),\s*'([^']+)'\)$/.exec(base);
    if (simpleJsonMatch) {
      const source = simpleJsonMatch[1];
      const path = simpleJsonMatch[2];

      // Check if the path ends with an array field that needs [0] indexing
      // For known array fields like "given", "family" etc, add [0]
      const knownArrayFields = [
        "given",
        "line",
        "coding",
        "telecom",
        "identifier",
      ];
      const pathSegments = path.split(".");
      const lastSegment = pathSegments[pathSegments.length - 1];

      if (knownArrayFields.includes(lastSegment)) {
        // This is an array field, add [0] to get first element
        return `JSON_VALUE(${source}, '${path}[0]')`;
      }

      // For non-array fields, first() should return the value as-is since it's already a scalar
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
      // For complex expressions that aren't JSON_QUERY or JSON_VALUE,
      // we can't easily add [0] indexing, so return as-is
      return base;
    }
  }

  private createNewIterationContext(base: string): TranspilerContext {
    if (
      !base.includes("JSON_VALUE") &&
      !base.includes("JSON_QUERY") &&
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
      // Format as string to match JSON_VALUE output for boolean fields
      return value ? "'true'" : "'false'";
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
  private handleExistsFunction(
    args: string[],
    base?: string,
    filterExprCtx?: ExpressionContext,
  ): string {
    // If we have a filter expression context, use it (this comes from handleExistsFunctionInvocation)
    if (filterExprCtx) {
      return this.handleExistsWithArgs("", base, filterExprCtx);
    }

    // Otherwise check args
    if (args.length === 0) {
      return this.handleExistsWithoutArgs(base);
    }

    return this.handleExistsWithArgs(args[0], base, filterExprCtx);
  }

  /**
   * Handles exists() function without arguments, using iteration context or base.
   */
  private handleExistsWithoutArgs(base?: string): string {
    if (base) {
      return this.handleExistsWithBase(base);
    }

    if (this.context.iterationContext) {
      return this.handleExistsWithIterationContext();
    }

    // No iteration context or base - check resource
    return `(${this.context.resourceAlias}.json IS NOT NULL)`;
  }

  private handleExistsWithBase(base: string): string {
    const trimmedBase = base.trim();

    // SELECT subquery from .where() function - wrap in EXISTS
    if (trimmedBase.startsWith("(SELECT")) {
      return `EXISTS ${base}`;
    }

    // Already a boolean expression - return as-is
    if (this.isBooleanExpression(base)) {
      return base;
    }

    // JSON_QUERY (array) - check if not null and not empty
    if (base.includes("JSON_QUERY")) {
      return `(${base} IS NOT NULL AND ${base} != '[]')`;
    }

    return `(${base} IS NOT NULL)`;
  }

  private handleExistsWithIterationContext(): string {
    // This method is only called when iterationContext is defined
    const iterCtx = this.context.iterationContext;
    if (!iterCtx) {
      throw new Error(
        "handleExistsWithIterationContext called without iteration context",
      );
    }

    const trimmedIterCtx = iterCtx.trim();

    // Already an EXISTS clause - return as-is
    if (trimmedIterCtx.startsWith("EXISTS")) {
      return iterCtx;
    }

    // SELECT subquery - wrap in EXISTS
    if (trimmedIterCtx.startsWith("(SELECT")) {
      return `EXISTS ${iterCtx}`;
    }

    // Already a boolean expression - return as-is
    if (this.isBooleanExpression(trimmedIterCtx)) {
      return iterCtx;
    }

    // JSON_QUERY (array) - check if not null and not empty
    if (trimmedIterCtx.includes("JSON_QUERY")) {
      return `(${iterCtx} IS NOT NULL AND ${iterCtx} != '[]')`;
    }

    // Otherwise check if not null
    return `(${iterCtx} IS NOT NULL)`;
  }

  /**
   * Builds an EXISTS clause with an OPENJSON subquery for filtering a collection.
   */
  private buildExistsWithFilter(
    base: string,
    filterExprCtx: ExpressionContext,
  ): string {
    const { source, jsonPath } = this.extractSourceAndPath(base);
    const tableAlias = "existsItem";

    const itemContext: TranspilerContext = {
      resourceAlias: tableAlias,
      constants: this.context.constants,
      iterationContext: `${tableAlias}.value`,
    };

    const filterVisitor = new FHIRPathToTSqlVisitor(itemContext);
    const condition = filterVisitor.visit(filterExprCtx);

    return `EXISTS (SELECT 1 FROM OPENJSON(${source}, '${jsonPath}') AS ${tableAlias} WHERE ${condition})`;
  }

  /**
   * Handles exists() function with an argument expression.
   */
  private handleExistsWithArgs(
    arg: string,
    base?: string,
    filterExprCtx?: ExpressionContext,
  ): string {
    // If we have a filter expression context and a base, create an OPENJSON subquery
    if (filterExprCtx && base) {
      return this.buildExistsWithFilter(base, filterExprCtx);
    }

    const trimmedArg = arg.trim();

    // If already an EXISTS clause, return as-is
    if (trimmedArg.startsWith("EXISTS")) {
      return arg;
    }

    // If the argument is a SELECT subquery (from .where() function), wrap in EXISTS
    if (trimmedArg.startsWith("(SELECT")) {
      return `EXISTS ${arg}`;
    }

    // If already a boolean expression, return as-is
    if (this.isBooleanExpression(trimmedArg)) {
      return arg;
    }

    // If the argument is a JSON_QUERY (array), check if it's not null and not empty
    if (trimmedArg.includes("JSON_QUERY")) {
      return `(${arg} IS NOT NULL AND ${arg} != '[]')`;
    }

    // Otherwise wrap in IS NOT NULL check
    return `(${arg} IS NOT NULL)`;
  }

  /**
   * Checks if an expression is a boolean expression (contains comparison operators).
   */
  private isBooleanExpression(expr: string): boolean {
    return (
      expr.includes(" = ") ||
      expr.includes(" != ") ||
      expr.includes(" < ") ||
      expr.includes(" > ") ||
      expr.includes(" <= ") ||
      expr.includes(" >= ") ||
      expr.includes(" AND ") ||
      expr.includes(" OR ") ||
      expr.startsWith("NOT ") ||
      expr.startsWith("(NOT ")
    );
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

    // Check if context is a JSON_QUERY that accesses a nested array path (e.g., '$.name[0].given')
    // If so, we need to iterate over ALL parent array elements, not just [0]
    const nestedArrayMatch =
      /JSON_QUERY\(([^,]+),\s*'(\$\.[^']+)\[0]\.([^']+)'\)/.exec(context);

    if (nestedArrayMatch) {
      const source = nestedArrayMatch[1];
      const parentPath = nestedArrayMatch[2]; // e.g., '$.name'
      const childField = nestedArrayMatch[3]; // e.g., 'given'

      // Generate SQL that iterates over ALL parent array elements and gets ALL child array values
      return `ISNULL((SELECT STRING_AGG(ISNULL(childValue.value, ''), ${separator}) WITHIN GROUP (ORDER BY parentItem.[key], childValue.[key])
              FROM OPENJSON(${source}, '${parentPath}') AS parentItem
              CROSS APPLY OPENJSON(parentItem.value, '$.${childField}') AS childValue
              WHERE childValue.type IN (1, 2)), '')`;
    }

    // Standard join for simple arrays
    return `ISNULL((SELECT STRING_AGG(ISNULL(value, ''), ${separator}) WITHIN GROUP (ORDER BY [key])
            FROM OPENJSON(${context})
            WHERE type IN (1, 2)), '')`;
  }

  private handleWhereFunction(_args: string[]): string {
    // This should not be called anymore since where() is handled specially in handleFunctionInvocation
    throw new Error(
      "where() function should be handled by handleWhereFunctionInvocation",
    );
  }

  private handleSelectFunction(args: string[]): string {
    if (args.length !== 1) {
      throw new Error("select() function requires exactly one argument");
    }
    return args[0];
  }

  private handleGetResourceKeyFunction(): string {
    // Returns resourceType/id as the resource key, extracting id from JSON
    return `CONCAT(${this.context.resourceAlias}.resource_type, '/', JSON_VALUE(${this.context.resourceAlias}.json, '$.id'))`;
  }

  private handleOfTypeFunction(_args: string[]): string {
    // This should not be called anymore since ofType() is handled specially in handleFunctionInvocation
    throw new Error(
      "ofType() function should be handled by handleOfTypeFunctionInvocation",
    );
  }

  private handleGetReferenceKeyFunctionWithType(
    resourceType: string | null,
  ): string {
    // Extract the .reference field from a Reference object
    // Optional type parameter filters by resource type

    if (this.context.iterationContext) {
      // If we're in an iteration context, the context points to the Reference object
      // We need to extract the .reference field
      const refSource = this.context.iterationContext;

      let referenceExpr: string;

      // Check if it's a JSON_VALUE call - extract just the reference field
      if (refSource.includes("JSON_VALUE")) {
        // Replace the current path with .reference
        const match = /JSON_VALUE\(([^,]+),\s*'([^']+)'\)/.exec(refSource);
        if (match) {
          const source = match[1];
          const path = match[2];
          referenceExpr = `JSON_VALUE(${source}, '${path}.reference')`;
        } else {
          // Fallback
          referenceExpr = `JSON_VALUE(${refSource}, '$.reference')`;
        }
      } else {
        // For simple iteration context like "forEach_0.value"
        referenceExpr = `JSON_VALUE(${refSource}, '$.reference')`;
      }

      // If a resource type is specified, only return the reference if it matches
      if (resourceType) {
        return `IIF(LEFT(${referenceExpr}, ${resourceType.length + 1}) = '${resourceType}/', ${referenceExpr}, NULL)`;
      }

      return referenceExpr;
    }

    // No iteration context - shouldn't happen for getReferenceKey
    throw new Error("getReferenceKey() requires a Reference object context");
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

    // extension('url') is equivalent to .extension.where(url = 'url')
    // Returns the filtered extension object(s) as a JSON_QUERY result
    const extensionUrl = args[0];
    const base =
      this.context.iterationContext ?? `${this.context.resourceAlias}.json`;

    // Generate SQL that filters the extension array by URL
    // Returns the first matching extension as a JSON value
    return `(SELECT TOP 1 value FROM OPENJSON(${base}, '$.extension') WHERE JSON_VALUE(value, '$.url') = ${extensionUrl})`;
  }

  private handleBoundaryFunction(
    _functionName: string,
    _args: string[],
  ): string {
    // Simplified implementation - return the value as-is
    return (
      this.context.iterationContext ?? `${this.context.resourceAlias}.json`
    );
  }
}
