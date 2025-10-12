/**
 * Core types for SQL on FHIR ViewDefinition processing.
 */

/**
 * Unvalidated JSON structures from FHIR resources or test data.
 * These types represent the expected shape of input data before validation.
 */

/**
 * FHIR resource as untyped JSON object.
 * FHIR resources have dynamic structures that vary by resourceType.
 */
export type FhirResource = Record<string, unknown>;

/**
 * Test expectation result - can be any JSON value.
 */
export type TestExpectation = Record<string, unknown>;

/**
 * Unvalidated ViewDefinition column from JSON input.
 * Fields are marked as unknown since validation will check types at runtime.
 */
export interface UnvalidatedColumn {
  name?: unknown;
  path?: unknown;
  description?: unknown;
  collection?: unknown;
  type?: unknown;
  tag?: unknown;
  [key: string]: unknown;
}

/**
 * Unvalidated ViewDefinition select element from JSON input.
 * Arrays and nested structures use unknown[] to allow iteration while preserving type safety.
 */
export interface UnvalidatedSelect {
  column?: UnvalidatedColumn[];
  select?: UnvalidatedSelect[];
  forEach?: unknown;
  forEachOrNull?: unknown;
  unionAll?: UnvalidatedSelect[];
  where?: unknown[];
  [key: string]: unknown;
}

/**
 * Unvalidated ViewDefinition from JSON input.
 * Top-level structure that accepts any JSON but hints at expected fields.
 */
export interface UnvalidatedViewDefinition {
  resourceType?: unknown;
  resource?: unknown;
  select?: UnvalidatedSelect[];
  constant?: unknown[];
  [key: string]: unknown;
}

/**
 * Validated ViewDefinition with strict typing.
 * Extends UnvalidatedViewDefinition to support type predicates.
 */
export interface ViewDefinition extends UnvalidatedViewDefinition {
  resourceType: "ViewDefinition";
  id?: string;
  url?: string;
  identifier?: Identifier[];
  version?: string;
  name?: string;
  title?: string;
  status: "draft" | "active" | "retired" | "unknown";
  experimental?: boolean;
  date?: string;
  publisher?: string;
  contact?: ContactDetail[];
  description?: string;
  useContext?: UsageContext[];
  jurisdiction?: CodeableConcept[];
  purpose?: string;
  copyright?: string;
  copyrightLabel?: string;
  resource: string;
  profile?: string;
  fhirVersion?: string[];
  constant?: ViewDefinitionConstant[];
  select: ViewDefinitionSelect[];
  where?: ViewDefinitionWhere[];
}

export interface ViewDefinitionSelect extends UnvalidatedSelect {
  column?: ViewDefinitionColumn[];
  select?: ViewDefinitionSelect[];
  forEach?: string;
  forEachOrNull?: string;
  unionAll?: ViewDefinitionSelect[];
  where?: ViewDefinitionWhere[];
}

export interface ViewDefinitionColumn extends UnvalidatedColumn {
  name: string;
  path: string;
  description?: string;
  collection?: boolean;
  type?: string;
  tag?: ViewDefinitionColumnTag[];
}

/**
 * ViewDefinition column tag for implementation-specific directives.
 * Tags provide database-specific type hints or other metadata.
 *
 * Example: { name: "mssql/type", value: "NVARCHAR(50)" }
 */
export interface ViewDefinitionColumnTag {
  name: string;
  value: string;
}

export interface ViewDefinitionWhere {
  path: string;
  description?: string;
}

export interface ViewDefinitionConstant {
  name: string;
  valueBase64Binary?: string;
  valueBoolean?: boolean;
  valueCanonical?: string;
  valueCode?: string;
  valueDate?: string;
  valueDateTime?: string;
  valueDecimal?: number;
  valueId?: string;
  valueInstant?: string;
  valueInteger?: number;
  valueInteger64?: string;
  valueMarkdown?: string;
  valueOid?: string;
  valuePositiveInt?: number;
  valueString?: string;
  valueTime?: string;
  valueUnsignedInt?: number;
  valueUri?: string;
  valueUrl?: string;
  valueUuid?: string;
  valueAddress?: Address;
  valueAge?: Age;
  valueAnnotation?: Annotation;
  valueAttachment?: Attachment;
  valueCodeableConcept?: CodeableConcept;
  valueCoding?: Coding;
  valueContactPoint?: ContactPoint;
  valueCount?: Count;
  valueDistance?: Distance;
  valueDuration?: Duration;
  valueHumanName?: HumanName;
  valueIdentifier?: Identifier;
  valueMoney?: Money;
  valuePeriod?: Period;
  valueQuantity?: Quantity;
  valueRange?: Range;
  valueRatio?: Ratio;
  valueRatioRange?: RatioRange;
  valueReference?: Reference;
  valueSampledData?: SampledData;
  valueSignature?: Signature;
  valueTiming?: Timing;
  valueContactDetail?: ContactDetail;
  valueContributor?: Contributor;
  valueDataRequirement?: DataRequirement;
  valueExpression?: Expression;
  valueParameterDefinition?: ParameterDefinition;
  valueRelatedArtifact?: RelatedArtifact;
  valueTriggerDefinition?: TriggerDefinition;
  valueUsageContext?: UsageContext;
  valueDosage?: Dosage;
}

// Supporting FHIR types
export interface Identifier {
  use?: string;
  type?: CodeableConcept;
  system?: string;
  value?: string;
  period?: Period;
  assigner?: Reference;
}

export interface ContactDetail {
  name?: string;
  telecom?: ContactPoint[];
}

export interface ContactPoint {
  system?: string;
  value?: string;
  use?: string;
  rank?: number;
  period?: Period;
}

export interface UsageContext {
  code: Coding;
  valueCodeableConcept?: CodeableConcept;
  valueQuantity?: Quantity;
  valueRange?: Range;
  valueReference?: Reference;
}

export interface CodeableConcept {
  coding?: Coding[];
  text?: string;
}

export interface Coding {
  system?: string;
  version?: string;
  code?: string;
  display?: string;
  userSelected?: boolean;
}

export interface Period {
  start?: string;
  end?: string;
}

export interface Reference {
  reference?: string;
  type?: string;
  identifier?: Identifier;
  display?: string;
}

export interface Quantity {
  value?: number;
  comparator?: string;
  unit?: string;
  system?: string;
  code?: string;
}

export interface Range {
  low?: Quantity;
  high?: Quantity;
}

// Placeholder interfaces for other FHIR types
export interface Address {}
export interface Age {}
export interface Annotation {}
export interface Attachment {}
export interface Count {}
export interface Distance {}
export interface Duration {}
export interface HumanName {}
export interface Money {}
export interface Ratio {}
export interface RatioRange {}
export interface SampledData {}
export interface Signature {}
export interface Timing {}
export interface Contributor {}
export interface DataRequirement {}
export interface Expression {}
export interface ParameterDefinition {}
export interface RelatedArtifact {}
export interface TriggerDefinition {}
export interface Dosage {}

/**
 * Test case structure from sql-on-fhir-v2 repository.
 */
export interface TestCase {
  title: string;
  description?: string;
  tags?: string[];
  view: ViewDefinition;
  expect: TestExpectation[];
  expectColumns?: string[];
  expectError?: boolean;
}

export interface TestSuite {
  title: string;
  description?: string;
  fhirVersion?: string[];
  resources: FhirResource[];
  tests: TestCase[];
}

/**
 * Transpilation result containing the generated T-SQL query.
 */
export interface TranspilationResult {
  sql: string;
  columns: ColumnInfo[];
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  description?: string;
}
