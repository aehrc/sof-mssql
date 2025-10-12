/**
 * SQL Server identifier and FHIR resource type validation utilities.
 */

/**
 * FHIR R4 resource types.
 * Complete list of all resource types defined in FHIR R4 specification.
 */
const FHIR_R4_RESOURCE_TYPES = new Set([
  "Account",
  "ActivityDefinition",
  "AdverseEvent",
  "AllergyIntolerance",
  "Appointment",
  "AppointmentResponse",
  "AuditEvent",
  "Basic",
  "Binary",
  "BiologicallyDerivedProduct",
  "BodyStructure",
  "Bundle",
  "CapabilityStatement",
  "CarePlan",
  "CareTeam",
  "CatalogEntry",
  "ChargeItem",
  "ChargeItemDefinition",
  "Claim",
  "ClaimResponse",
  "ClinicalImpression",
  "CodeSystem",
  "Communication",
  "CommunicationRequest",
  "CompartmentDefinition",
  "Composition",
  "ConceptMap",
  "Condition",
  "Consent",
  "Contract",
  "Coverage",
  "CoverageEligibilityRequest",
  "CoverageEligibilityResponse",
  "DetectedIssue",
  "Device",
  "DeviceDefinition",
  "DeviceMetric",
  "DeviceRequest",
  "DeviceUseStatement",
  "DiagnosticReport",
  "DocumentManifest",
  "DocumentReference",
  "DomainResource",
  "EffectEvidenceSynthesis",
  "Encounter",
  "Endpoint",
  "EnrollmentRequest",
  "EnrollmentResponse",
  "EpisodeOfCare",
  "EventDefinition",
  "Evidence",
  "EvidenceVariable",
  "ExampleScenario",
  "ExplanationOfBenefit",
  "FamilyMemberHistory",
  "Flag",
  "Goal",
  "GraphDefinition",
  "Group",
  "GuidanceResponse",
  "HealthcareService",
  "ImagingStudy",
  "Immunization",
  "ImmunizationEvaluation",
  "ImmunizationRecommendation",
  "ImplementationGuide",
  "InsurancePlan",
  "Invoice",
  "Library",
  "Linkage",
  "List",
  "Location",
  "Measure",
  "MeasureReport",
  "Media",
  "Medication",
  "MedicationAdministration",
  "MedicationDispense",
  "MedicationKnowledge",
  "MedicationRequest",
  "MedicationStatement",
  "MedicinalProduct",
  "MedicinalProductAuthorization",
  "MedicinalProductContraindication",
  "MedicinalProductIndication",
  "MedicinalProductIngredient",
  "MedicinalProductInteraction",
  "MedicinalProductManufactured",
  "MedicinalProductPackaged",
  "MedicinalProductPharmaceutical",
  "MedicinalProductUndesirableEffect",
  "MessageDefinition",
  "MessageHeader",
  "MolecularSequence",
  "NamingSystem",
  "NutritionOrder",
  "Observation",
  "ObservationDefinition",
  "OperationDefinition",
  "OperationOutcome",
  "Organization",
  "OrganizationAffiliation",
  "Parameters",
  "Patient",
  "PaymentNotice",
  "PaymentReconciliation",
  "Person",
  "PlanDefinition",
  "Practitioner",
  "PractitionerRole",
  "Procedure",
  "Provenance",
  "Questionnaire",
  "QuestionnaireResponse",
  "RelatedPerson",
  "RequestGroup",
  "ResearchDefinition",
  "ResearchElementDefinition",
  "ResearchStudy",
  "ResearchSubject",
  "Resource",
  "RiskAssessment",
  "RiskEvidenceSynthesis",
  "Schedule",
  "SearchParameter",
  "ServiceRequest",
  "Slot",
  "Specimen",
  "SpecimenDefinition",
  "StructureDefinition",
  "StructureMap",
  "Subscription",
  "Substance",
  "SubstanceNucleicAcid",
  "SubstancePolymer",
  "SubstanceProtein",
  "SubstanceReferenceInformation",
  "SubstanceSourceMaterial",
  "SubstanceSpecification",
  "SupplyDelivery",
  "SupplyRequest",
  "Task",
  "TerminologyCapabilities",
  "TestReport",
  "TestScript",
  "ValueSet",
  "VerificationResult",
  "VisionPrescription",
]);

/**
 * SQL Server reserved words that cannot be used as identifiers without quoting.
 * This is a subset of commonly used reserved words.
 */
const SQL_SERVER_RESERVED_WORDS = new Set([
  "SELECT",
  "FROM",
  "WHERE",
  "INSERT",
  "UPDATE",
  "DELETE",
  "DROP",
  "CREATE",
  "ALTER",
  "TABLE",
  "INDEX",
  "VIEW",
  "PROCEDURE",
  "FUNCTION",
  "TRIGGER",
  "DATABASE",
  "SCHEMA",
  "USER",
  "ROLE",
  "GRANT",
  "REVOKE",
  "JOIN",
  "UNION",
  "ORDER",
  "GROUP",
  "HAVING",
  "AS",
  "ON",
  "IN",
  "EXISTS",
  "BETWEEN",
  "LIKE",
  "AND",
  "OR",
  "NOT",
  "NULL",
  "IS",
]);

/**
 * Validate a SQL Server identifier (table name, schema name, etc.).
 *
 * SQL Server identifier rules:
 * - Can start with: letter (A-Z, a-z), underscore (_), @, or #
 * - Followed by: letters, digits (0-9), underscore, @, #, or $
 * - Maximum length: 128 characters
 * - Must not be a reserved word
 *
 * @param identifier - The identifier to validate
 * @param type - The type of identifier (for error messages)
 * @throws Error if the identifier is invalid
 */
export function validateSqlServerIdentifier(
  identifier: string,
  type: string,
): void {
  // Check for empty identifier
  if (!identifier || identifier.trim().length === 0) {
    throw new Error(`${type} cannot be empty.`);
  }

  // Check length
  if (identifier.length > 128) {
    throw new Error(
      `${type} '${identifier}' exceeds maximum length of 128 characters.`,
    );
  }

  // Check pattern: must start with letter, underscore, @, or #
  // Followed by letters, digits, underscore, @, #, or $
  if (!/^[a-zA-Z_@#][a-zA-Z0-9_@#$]*$/.test(identifier)) {
    throw new Error(
      `${type} '${identifier}' contains invalid characters. Must start with a letter, underscore, @, or #, followed by letters, digits, underscore, @, #, or $.`,
    );
  }

  // Check for reserved words (case-insensitive)
  if (SQL_SERVER_RESERVED_WORDS.has(identifier.toUpperCase())) {
    throw new Error(
      `${type} '${identifier}' is a SQL Server reserved word and cannot be used as an identifier.`,
    );
  }
}

/**
 * Validate a FHIR resource type against the R4 specification.
 *
 * @param resourceType - The resource type to validate
 * @throws Error if the resource type is not valid
 */
export function validateResourceType(resourceType: string): void {
  if (!resourceType || resourceType.trim().length === 0) {
    throw new Error("Resource type cannot be empty.");
  }

  if (!FHIR_R4_RESOURCE_TYPES.has(resourceType)) {
    throw new Error(
      `Invalid FHIR resource type: '${resourceType}'. Must be a valid FHIR R4 resource type.`,
    );
  }
}

/**
 * Validate a test ID format.
 * Test IDs must be valid UUIDs (version 4).
 *
 * @param testId - The test ID to validate
 * @throws Error if the test ID format is invalid
 */
export function validateTestId(testId: string): void {
  if (!testId || testId.trim().length === 0) {
    throw new Error("Test ID cannot be empty.");
  }

  // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  // where x is any hexadecimal digit and y is one of 8, 9, a, or b
  const uuidV4Pattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidV4Pattern.test(testId)) {
    throw new Error(
      `Invalid test ID format: '${testId}'. Must be a valid UUID v4.`,
    );
  }
}

/**
 * Valid MS SQL Server base type names.
 */
const VALID_SQL_SERVER_TYPES = new Set([
  "BIT",
  "TINYINT",
  "SMALLINT",
  "INT",
  "BIGINT",
  "DECIMAL",
  "NUMERIC",
  "MONEY",
  "SMALLMONEY",
  "FLOAT",
  "REAL",
  "DATE",
  "TIME",
  "DATETIME",
  "DATETIME2",
  "DATETIMEOFFSET",
  "SMALLDATETIME",
  "CHAR",
  "VARCHAR",
  "TEXT",
  "NCHAR",
  "NVARCHAR",
  "NTEXT",
  "BINARY",
  "VARBINARY",
  "IMAGE",
  "UNIQUEIDENTIFIER",
  "XML",
  "SQL_VARIANT",
]);

/**
 * Validate MS SQL Server type specification.
 *
 * Ensures the type is a valid SQL Server data type with correct syntax.
 * Supports all common SQL Server types including:
 * - Integer types: BIT, TINYINT, SMALLINT, INT, BIGINT
 * - Decimal types: DECIMAL, NUMERIC, MONEY, SMALLMONEY, FLOAT, REAL
 * - Date/time types: DATE, TIME, DATETIME, DATETIME2, DATETIMEOFFSET, SMALLDATETIME
 * - String types: CHAR, VARCHAR, TEXT, NCHAR, NVARCHAR, NTEXT (with MAX or size)
 * - Binary types: BINARY, VARBINARY, IMAGE (with MAX or size)
 * - Other: UNIQUEIDENTIFIER, XML, SQL_VARIANT
 *
 * @param sqlType - SQL Server type string (e.g., 'NVARCHAR(MAX)', 'INT', 'DECIMAL(38,18)')
 * @throws Error if type is invalid
 */
export function validateMsSqlType(sqlType: string): void {
  if (!sqlType || sqlType.trim().length === 0) {
    throw new Error("SQL Server type cannot be empty.");
  }

  const trimmedType = sqlType.trim();

  // Extract base type and parameters by finding the opening parenthesis
  const openParenIndex = trimmedType.indexOf("(");
  const baseTypePart =
    openParenIndex === -1
      ? trimmedType
      : trimmedType.substring(0, openParenIndex).trim();
  const paramsPart =
    openParenIndex === -1 ? "" : trimmedType.substring(openParenIndex);

  // Validate base type name: letters, digits, underscore
  if (!/^[A-Z_][A-Z0-9_]*$/i.test(baseTypePart)) {
    throw new Error(
      `Invalid MS SQL Server type format: '${sqlType}'. Must be a valid SQL Server data type such as INT, NVARCHAR(MAX), DECIMAL(38,18), DATETIME2(7), or DATETIMEOFFSET(3).`,
    );
  }

  // Validate parameters if present: (size) or (precision,scale) where size can be MAX
  if (paramsPart && !/^\(\s*(\d+|MAX)(\s*,\s*\d+)?\s*\)$/i.test(paramsPart)) {
    throw new Error(
      `Invalid MS SQL Server type format: '${sqlType}'. Must be a valid SQL Server data type such as INT, NVARCHAR(MAX), DECIMAL(38,18), DATETIME2(7), or DATETIMEOFFSET(3).`,
    );
  }

  // Check if base type is valid
  const baseType = baseTypePart.toUpperCase();
  if (!VALID_SQL_SERVER_TYPES.has(baseType)) {
    throw new Error(
      `Unknown MS SQL Server type: '${baseType}'. Must be a valid SQL Server data type such as INT, NVARCHAR, DECIMAL, DATETIME2, or DATETIMEOFFSET.`,
    );
  }
}

/**
 * Mapping of ANSI/ISO SQL standard types to MS SQL Server equivalents.
 * Based on ISO/IEC 9075 SQL standard and SQL Server data type synonyms.
 */
const ANSI_TO_MSSQL_TYPE_MAP = new Map<string, string>([
  // Character types (SQL-92 and later)
  ["CHARACTER", "CHAR"],
  ["CHAR", "CHAR"],
  ["CHARACTER VARYING", "VARCHAR"],
  ["CHAR VARYING", "VARCHAR"],
  ["NATIONAL CHARACTER", "NCHAR"],
  ["NATIONAL CHAR", "NCHAR"],
  ["NATIONAL CHARACTER VARYING", "NVARCHAR"],
  ["NATIONAL CHAR VARYING", "NVARCHAR"],

  // Numeric types - exact (SQL-92)
  ["INTEGER", "INT"],
  ["INT", "INT"],
  ["SMALLINT", "SMALLINT"],
  ["BIGINT", "BIGINT"],
  ["DECIMAL", "DECIMAL"],
  ["DEC", "DECIMAL"],
  ["NUMERIC", "NUMERIC"],

  // Numeric types - approximate (SQL-92)
  ["FLOAT", "FLOAT"],
  ["REAL", "REAL"],
  ["DOUBLE PRECISION", "FLOAT"],

  // Date/time types (SQL-92 and later)
  ["DATE", "DATE"],
  ["TIME", "TIME"],
  // Note: ANSI TIMESTAMP maps to DATETIME2, not SQL Server's TIMESTAMP (which is for row versioning)
  ["TIMESTAMP", "DATETIME2"],

  // Boolean (SQL:1999)
  // Note: SQL Server doesn't have native BOOLEAN, BIT is the closest equivalent
  ["BOOLEAN", "BIT"],

  // Binary types
  ["BINARY VARYING", "VARBINARY"],
]);

/**
 * Parse an ANSI/ISO SQL type into base type and parameters.
 *
 * @param typeString - The type string to parse
 * @returns Object with baseType and parameters
 */
function parseAnsiSqlType(typeString: string): {
  baseType: string;
  parameters: string;
} {
  const openParenIndex = typeString.indexOf("(");
  const baseTypePart =
    openParenIndex === -1
      ? typeString
      : typeString.substring(0, openParenIndex).trim();
  const paramsPart =
    openParenIndex === -1 ? "" : typeString.substring(openParenIndex);

  return {
    baseType: baseTypePart.trim().toUpperCase(),
    parameters: paramsPart,
  };
}

/**
 * Validate and convert ANSI/ISO SQL type specification to MS SQL Server type.
 *
 * Supports ANSI/ISO SQL standard types from SQL-92, SQL:1999, and later versions.
 * Converts standard types to their MS SQL Server equivalents and validates the result.
 *
 * Examples:
 * - 'INTEGER' → 'INT'
 * - 'CHARACTER(50)' → 'CHAR(50)'
 * - 'BOOLEAN' → 'BIT'
 * - 'TIMESTAMP' → 'DATETIME2'
 *
 * @param ansiType - ANSI/ISO SQL type string (e.g., 'INTEGER', 'CHARACTER(20)', 'DECIMAL(10,2)')
 * @returns MS SQL Server equivalent type
 * @throws Error if type is invalid or unsupported
 */
export function validateAnsiSqlType(ansiType: string): string {
  if (!ansiType || ansiType.trim().length === 0) {
    throw new Error("ANSI SQL type cannot be empty.");
  }

  const trimmedType = ansiType.trim();
  const { baseType, parameters } = parseAnsiSqlType(trimmedType);

  // Validate base type: must start with letter, followed by letters and spaces
  if (!/^[A-Z][A-Z\s]*$/i.test(baseType)) {
    throw new Error(
      `Invalid ANSI SQL type format: '${ansiType}'. Must be a valid ANSI/ISO SQL type such as INTEGER, CHARACTER(50), or DECIMAL(10,2).`,
    );
  }

  // Validate parameters if present: (size) or (precision,scale) where size can be MAX
  if (parameters && !/^\(\s*(\d+|MAX)(\s*,\s*\d+)?\s*\)$/i.test(parameters)) {
    throw new Error(
      `Invalid ANSI SQL type format: '${ansiType}'. Must be a valid ANSI/ISO SQL type such as INTEGER, CHARACTER(50), or DECIMAL(10,2).`,
    );
  }

  // Look up MS SQL Server equivalent
  const mssqlBaseType = ANSI_TO_MSSQL_TYPE_MAP.get(baseType);

  if (!mssqlBaseType) {
    // Check if it's already a valid SQL Server type (pass-through)
    const mssqlType = baseType + parameters;
    try {
      validateMsSqlType(mssqlType);
      return mssqlType;
    } catch {
      throw new Error(
        `Unsupported ANSI SQL type: '${baseType}'. Must be a valid ANSI/ISO SQL standard type such as INTEGER, CHARACTER, DECIMAL, TIMESTAMP, or BOOLEAN.`,
      );
    }
  }

  // Construct MS SQL Server type with parameters
  const mssqlType = mssqlBaseType + parameters;

  // Validate the resulting MS SQL Server type
  validateMsSqlType(mssqlType);

  return mssqlType;
}
