/**
 * Core types for SQL on FHIR ViewDefinition processing.
 */

export interface ViewDefinition {
  resourceType: 'ViewDefinition';
  id?: string;
  url?: string;
  identifier?: Identifier[];
  version?: string;
  name?: string;
  title?: string;
  status: 'draft' | 'active' | 'retired' | 'unknown';
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

export interface ViewDefinitionSelect {
  column?: ViewDefinitionColumn[];
  select?: ViewDefinitionSelect[];
  forEach?: string;
  forEachOrNull?: string;
  unionAll?: ViewDefinitionSelect[];
  where?: ViewDefinitionWhere[];
}

export interface ViewDefinitionColumn {
  name: string;
  path: string;
  description?: string;
  collection?: boolean;
  type?: string;
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
  expect: any[];
  expectColumns?: string[];
}

export interface TestSuite {
  title: string;
  description?: string;
  fhirVersion?: string[];
  resources: any[];
  tests: TestCase[];
}

/**
 * Transpilation result containing the generated T-SQL query.
 */
export interface TranspilationResult {
  sql: string;
  parameters?: { [key: string]: any };
  columns: ColumnInfo[];
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  description?: string;
}