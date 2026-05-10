/**
 * T-SQL query generator for ViewDefinition structures.
 *
 * Public façade over the tree-walker query compiler. Builds the base
 * transpiler context (resource alias, constants, optional test id) and
 * delegates SQL generation to `compileViewDefinition`.
 */

import { TranspilerContext } from "./fhirpath/transpiler.js";
import { compileViewDefinition } from "./queryGenerator/treeWalker/index.js";
import {
  TranspilationResult,
  ViewDefinition,
  ViewDefinitionConstant,
} from "./types.js";

export interface QueryGeneratorOptions {
  tableName?: string;
  schemaName?: string;
  resourceIdColumn?: string;
  resourceJsonColumn?: string;
}

/**
 * Compiles a SQL on FHIR `ViewDefinition` to a T-SQL query.
 */
export class QueryGenerator {
  private readonly options: Required<QueryGeneratorOptions>;

  constructor(options: QueryGeneratorOptions = {}) {
    this.options = {
      tableName: "fhir_resources",
      schemaName: "dbo",
      resourceIdColumn: "id",
      resourceJsonColumn: "json",
      ...options,
    };
  }

  /**
   * Generate a T-SQL query from a ViewDefinition.
   */
  generateQuery(viewDef: ViewDefinition, testId?: string): TranspilationResult {
    try {
      const transpilerCtx = this.createBaseContext(viewDef, testId);
      return compileViewDefinition(viewDef, {
        tableName: this.options.tableName,
        schemaName: this.options.schemaName,
        testId,
        transpilerCtx,
      });
    } catch (error) {
      throw new Error(`Failed to generate query for ViewDefinition: ${error}`);
    }
  }

  /**
   * Create the base transpiler context with resource alias and constants.
   */
  private createBaseContext(
    viewDef: ViewDefinition,
    testId?: string,
  ): TranspilerContext {
    const constants: { [key: string]: string | number | boolean | null } = {};

    if (viewDef.constant) {
      for (const constant of viewDef.constant) {
        constants[constant.name] = this.getConstantValue(constant);
      }
    }

    return {
      resourceAlias: "r",
      constants,
      testId,
    };
  }

  /**
   * Extract the value from a ViewDefinitionConstant. Throws if zero or more
   * than one `value[x]` element is set.
   */
  private getConstantValue(
    constant: ViewDefinitionConstant,
  ): string | number | boolean | null {
    const primitiveKeys: (keyof ViewDefinitionConstant)[] = [
      "valueString",
      "valueInteger",
      "valueDecimal",
      "valueBoolean",
      "valueDate",
      "valueDateTime",
      "valueTime",
      "valueInstant",
      "valueCode",
      "valueId",
      "valueUri",
      "valueUrl",
      "valueCanonical",
      "valueUuid",
      "valueOid",
      "valueMarkdown",
      "valueBase64Binary",
      "valuePositiveInt",
      "valueUnsignedInt",
      "valueInteger64",
    ];

    const definedValues = primitiveKeys.filter(
      (key) => constant[key] !== undefined,
    );

    if (definedValues.length === 0) {
      throw new Error(
        `Constant '${constant.name}' must have exactly one value[x] element defined`,
      );
    }

    if (definedValues.length > 1) {
      throw new Error(
        `Constant '${constant.name}' must have exactly one value[x] element defined, but has ${definedValues.length}`,
      );
    }

    const key = definedValues[0];
    return constant[key] as string | number | boolean;
  }
}
