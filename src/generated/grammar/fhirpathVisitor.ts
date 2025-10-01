// Generated from grammar/fhirpath.g4 by ANTLR 4.9.0-SNAPSHOT

import { ParseTreeVisitor } from "antlr4ts/tree/ParseTreeVisitor";

import { TermExpressionContext } from "./fhirpathParser";
import { InvocationExpressionContext } from "./fhirpathParser";
import { IndexerExpressionContext } from "./fhirpathParser";
import { PolarityExpressionContext } from "./fhirpathParser";
import { MultiplicativeExpressionContext } from "./fhirpathParser";
import { AdditiveExpressionContext } from "./fhirpathParser";
import { TypeExpressionContext } from "./fhirpathParser";
import { UnionExpressionContext } from "./fhirpathParser";
import { InequalityExpressionContext } from "./fhirpathParser";
import { EqualityExpressionContext } from "./fhirpathParser";
import { MembershipExpressionContext } from "./fhirpathParser";
import { AndExpressionContext } from "./fhirpathParser";
import { OrExpressionContext } from "./fhirpathParser";
import { ImpliesExpressionContext } from "./fhirpathParser";
import { NullLiteralContext } from "./fhirpathParser";
import { BooleanLiteralContext } from "./fhirpathParser";
import { StringLiteralContext } from "./fhirpathParser";
import { NumberLiteralContext } from "./fhirpathParser";
import { LongNumberLiteralContext } from "./fhirpathParser";
import { DateLiteralContext } from "./fhirpathParser";
import { DateTimeLiteralContext } from "./fhirpathParser";
import { TimeLiteralContext } from "./fhirpathParser";
import { QuantityLiteralContext } from "./fhirpathParser";
import { MemberInvocationContext } from "./fhirpathParser";
import { FunctionInvocationContext } from "./fhirpathParser";
import { ThisInvocationContext } from "./fhirpathParser";
import { IndexInvocationContext } from "./fhirpathParser";
import { TotalInvocationContext } from "./fhirpathParser";
import { InvocationTermContext } from "./fhirpathParser";
import { LiteralTermContext } from "./fhirpathParser";
import { ExternalConstantTermContext } from "./fhirpathParser";
import { ParenthesizedTermContext } from "./fhirpathParser";
import { EntireExpressionContext } from "./fhirpathParser";
import { ExpressionContext } from "./fhirpathParser";
import { TermContext } from "./fhirpathParser";
import { LiteralContext } from "./fhirpathParser";
import { ExternalConstantContext } from "./fhirpathParser";
import { InvocationContext } from "./fhirpathParser";
import { FunctionContext } from "./fhirpathParser";
import { ParamListContext } from "./fhirpathParser";
import { QuantityContext } from "./fhirpathParser";
import { UnitContext } from "./fhirpathParser";
import { DateTimePrecisionContext } from "./fhirpathParser";
import { PluralDateTimePrecisionContext } from "./fhirpathParser";
import { TypeSpecifierContext } from "./fhirpathParser";
import { QualifiedIdentifierContext } from "./fhirpathParser";
import { IdentifierContext } from "./fhirpathParser";

/**
 * This interface defines a complete generic visitor for a parse tree produced
 * by `fhirpathParser`.
 *
 * @param <Result> The return type of the visit operation. Use `void` for
 * operations with no return type.
 */
export interface fhirpathVisitor<Result> extends ParseTreeVisitor<Result> {
  /**
   * Visit a parse tree produced by the `termExpression`
   * labeled alternative in `fhirpathParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitTermExpression?: (ctx: TermExpressionContext) => Result;

  /**
   * Visit a parse tree produced by the `invocationExpression`
   * labeled alternative in `fhirpathParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitInvocationExpression?: (ctx: InvocationExpressionContext) => Result;

  /**
   * Visit a parse tree produced by the `indexerExpression`
   * labeled alternative in `fhirpathParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitIndexerExpression?: (ctx: IndexerExpressionContext) => Result;

  /**
   * Visit a parse tree produced by the `polarityExpression`
   * labeled alternative in `fhirpathParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitPolarityExpression?: (ctx: PolarityExpressionContext) => Result;

  /**
   * Visit a parse tree produced by the `multiplicativeExpression`
   * labeled alternative in `fhirpathParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitMultiplicativeExpression?: (
    ctx: MultiplicativeExpressionContext,
  ) => Result;

  /**
   * Visit a parse tree produced by the `additiveExpression`
   * labeled alternative in `fhirpathParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitAdditiveExpression?: (ctx: AdditiveExpressionContext) => Result;

  /**
   * Visit a parse tree produced by the `typeExpression`
   * labeled alternative in `fhirpathParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitTypeExpression?: (ctx: TypeExpressionContext) => Result;

  /**
   * Visit a parse tree produced by the `unionExpression`
   * labeled alternative in `fhirpathParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitUnionExpression?: (ctx: UnionExpressionContext) => Result;

  /**
   * Visit a parse tree produced by the `inequalityExpression`
   * labeled alternative in `fhirpathParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitInequalityExpression?: (ctx: InequalityExpressionContext) => Result;

  /**
   * Visit a parse tree produced by the `equalityExpression`
   * labeled alternative in `fhirpathParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitEqualityExpression?: (ctx: EqualityExpressionContext) => Result;

  /**
   * Visit a parse tree produced by the `membershipExpression`
   * labeled alternative in `fhirpathParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitMembershipExpression?: (ctx: MembershipExpressionContext) => Result;

  /**
   * Visit a parse tree produced by the `andExpression`
   * labeled alternative in `fhirpathParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitAndExpression?: (ctx: AndExpressionContext) => Result;

  /**
   * Visit a parse tree produced by the `orExpression`
   * labeled alternative in `fhirpathParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitOrExpression?: (ctx: OrExpressionContext) => Result;

  /**
   * Visit a parse tree produced by the `impliesExpression`
   * labeled alternative in `fhirpathParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitImpliesExpression?: (ctx: ImpliesExpressionContext) => Result;

  /**
   * Visit a parse tree produced by the `nullLiteral`
   * labeled alternative in `fhirpathParser.literal`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitNullLiteral?: (ctx: NullLiteralContext) => Result;

  /**
   * Visit a parse tree produced by the `booleanLiteral`
   * labeled alternative in `fhirpathParser.literal`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitBooleanLiteral?: (ctx: BooleanLiteralContext) => Result;

  /**
   * Visit a parse tree produced by the `stringLiteral`
   * labeled alternative in `fhirpathParser.literal`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitStringLiteral?: (ctx: StringLiteralContext) => Result;

  /**
   * Visit a parse tree produced by the `numberLiteral`
   * labeled alternative in `fhirpathParser.literal`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitNumberLiteral?: (ctx: NumberLiteralContext) => Result;

  /**
   * Visit a parse tree produced by the `longNumberLiteral`
   * labeled alternative in `fhirpathParser.literal`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitLongNumberLiteral?: (ctx: LongNumberLiteralContext) => Result;

  /**
   * Visit a parse tree produced by the `dateLiteral`
   * labeled alternative in `fhirpathParser.literal`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitDateLiteral?: (ctx: DateLiteralContext) => Result;

  /**
   * Visit a parse tree produced by the `dateTimeLiteral`
   * labeled alternative in `fhirpathParser.literal`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitDateTimeLiteral?: (ctx: DateTimeLiteralContext) => Result;

  /**
   * Visit a parse tree produced by the `timeLiteral`
   * labeled alternative in `fhirpathParser.literal`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitTimeLiteral?: (ctx: TimeLiteralContext) => Result;

  /**
   * Visit a parse tree produced by the `quantityLiteral`
   * labeled alternative in `fhirpathParser.literal`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitQuantityLiteral?: (ctx: QuantityLiteralContext) => Result;

  /**
   * Visit a parse tree produced by the `memberInvocation`
   * labeled alternative in `fhirpathParser.invocation`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitMemberInvocation?: (ctx: MemberInvocationContext) => Result;

  /**
   * Visit a parse tree produced by the `functionInvocation`
   * labeled alternative in `fhirpathParser.invocation`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitFunctionInvocation?: (ctx: FunctionInvocationContext) => Result;

  /**
   * Visit a parse tree produced by the `thisInvocation`
   * labeled alternative in `fhirpathParser.invocation`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitThisInvocation?: (ctx: ThisInvocationContext) => Result;

  /**
   * Visit a parse tree produced by the `indexInvocation`
   * labeled alternative in `fhirpathParser.invocation`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitIndexInvocation?: (ctx: IndexInvocationContext) => Result;

  /**
   * Visit a parse tree produced by the `totalInvocation`
   * labeled alternative in `fhirpathParser.invocation`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitTotalInvocation?: (ctx: TotalInvocationContext) => Result;

  /**
   * Visit a parse tree produced by the `invocationTerm`
   * labeled alternative in `fhirpathParser.term`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitInvocationTerm?: (ctx: InvocationTermContext) => Result;

  /**
   * Visit a parse tree produced by the `literalTerm`
   * labeled alternative in `fhirpathParser.term`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitLiteralTerm?: (ctx: LiteralTermContext) => Result;

  /**
   * Visit a parse tree produced by the `externalConstantTerm`
   * labeled alternative in `fhirpathParser.term`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitExternalConstantTerm?: (ctx: ExternalConstantTermContext) => Result;

  /**
   * Visit a parse tree produced by the `parenthesizedTerm`
   * labeled alternative in `fhirpathParser.term`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitParenthesizedTerm?: (ctx: ParenthesizedTermContext) => Result;

  /**
   * Visit a parse tree produced by `fhirpathParser.entireExpression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitEntireExpression?: (ctx: EntireExpressionContext) => Result;

  /**
   * Visit a parse tree produced by `fhirpathParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitExpression?: (ctx: ExpressionContext) => Result;

  /**
   * Visit a parse tree produced by `fhirpathParser.term`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitTerm?: (ctx: TermContext) => Result;

  /**
   * Visit a parse tree produced by `fhirpathParser.literal`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitLiteral?: (ctx: LiteralContext) => Result;

  /**
   * Visit a parse tree produced by `fhirpathParser.externalConstant`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitExternalConstant?: (ctx: ExternalConstantContext) => Result;

  /**
   * Visit a parse tree produced by `fhirpathParser.invocation`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitInvocation?: (ctx: InvocationContext) => Result;

  /**
   * Visit a parse tree produced by `fhirpathParser.function`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitFunction?: (ctx: FunctionContext) => Result;

  /**
   * Visit a parse tree produced by `fhirpathParser.paramList`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitParamList?: (ctx: ParamListContext) => Result;

  /**
   * Visit a parse tree produced by `fhirpathParser.quantity`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitQuantity?: (ctx: QuantityContext) => Result;

  /**
   * Visit a parse tree produced by `fhirpathParser.unit`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitUnit?: (ctx: UnitContext) => Result;

  /**
   * Visit a parse tree produced by `fhirpathParser.dateTimePrecision`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitDateTimePrecision?: (ctx: DateTimePrecisionContext) => Result;

  /**
   * Visit a parse tree produced by `fhirpathParser.pluralDateTimePrecision`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitPluralDateTimePrecision?: (
    ctx: PluralDateTimePrecisionContext,
  ) => Result;

  /**
   * Visit a parse tree produced by `fhirpathParser.typeSpecifier`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitTypeSpecifier?: (ctx: TypeSpecifierContext) => Result;

  /**
   * Visit a parse tree produced by `fhirpathParser.qualifiedIdentifier`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitQualifiedIdentifier?: (ctx: QualifiedIdentifierContext) => Result;

  /**
   * Visit a parse tree produced by `fhirpathParser.identifier`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitIdentifier?: (ctx: IdentifierContext) => Result;
}
