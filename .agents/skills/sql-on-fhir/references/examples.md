# ViewDefinition examples

Worked examples for common SQL on FHIR patterns. Each ViewDefinition projects one resource type; join across the resulting tables in the SQL/analytics layer (optionally via an [SQLQuery](sql-query.md)).

## Contents

- [Basic patient demographics](#basic-patient-demographics)
- [Patient addresses (forEach)](#patient-addresses-foreach)
- [Patient addresses (forEachOrNull)](#patient-addresses-foreachornull)
- [Condition flat view](#condition-flat-view)
- [Observations with filtering](#observations-with-filtering)
- [Encounter with diagnoses (nested forEach)](#encounter-with-diagnoses-nested-foreach)
- [Union of telecoms](#union-of-telecoms)
- [Extensions (US Core)](#extensions-us-core)
- [Shareable ViewDefinition](#shareable-viewdefinition)
- [MedicationRequest view](#medicationrequest-view)
- [DiagnosticReport with results](#diagnosticreport-with-results)
- [QuestionnaireResponse items (repeat)](#questionnaireresponse-items-repeat)
- [Row index for ordering and surrogate keys](#row-index-for-ordering-and-surrogate-keys)
- [SQL type hints with tags](#sql-type-hints-with-tags)
- [Collection columns](#collection-columns)
- [SQLQuery over views](#sqlquery-over-views)

## Basic patient demographics

Simple extraction of scalar patient attributes:

```json
{
  "resourceType": "ViewDefinition",
  "name": "patient_demographics",
  "resource": "Patient",
  "status": "active",
  "select": [
    {
      "column": [
        { "name": "id", "path": "getResourceKey()", "type": "id" },
        { "name": "gender", "path": "gender", "type": "code" },
        { "name": "birth_date", "path": "birthDate", "type": "date" },
        {
          "name": "family_name",
          "path": "name.first().family",
          "type": "string"
        },
        {
          "name": "given_name",
          "path": "name.first().given.first()",
          "type": "string"
        }
      ]
    }
  ]
}
```

Output: one row per Patient with scalar demographics.

## Patient addresses (forEach)

Unnest patient addresses into separate rows:

```json
{
  "resourceType": "ViewDefinition",
  "name": "patient_addresses",
  "resource": "Patient",
  "status": "active",
  "select": [
    {
      "column": [
        { "name": "patient_id", "path": "getResourceKey()", "type": "id" }
      ]
    },
    {
      "forEach": "address",
      "column": [
        { "name": "use", "path": "use", "type": "code" },
        { "name": "line", "path": "line.join(', ')", "type": "string" },
        { "name": "city", "path": "city", "type": "string" },
        { "name": "state", "path": "state", "type": "string" },
        { "name": "postal_code", "path": "postalCode", "type": "string" },
        { "name": "country", "path": "country", "type": "string" }
      ]
    }
  ]
}
```

Output: one row per address. Patients without addresses produce no rows.

## Patient addresses (forEachOrNull)

Keep patients even when they have no addresses:

```json
{
  "resourceType": "ViewDefinition",
  "name": "patient_addresses_all",
  "resource": "Patient",
  "status": "active",
  "select": [
    {
      "column": [
        { "name": "patient_id", "path": "getResourceKey()", "type": "id" }
      ]
    },
    {
      "forEachOrNull": "address",
      "column": [
        { "name": "city", "path": "city", "type": "string" },
        { "name": "state", "path": "state", "type": "string" }
      ]
    }
  ]
}
```

Output: patients without addresses get one row with null city/state.

## Condition flat view

Flatten conditions with coded diagnoses and a foreign key to Patient:

```json
{
  "resourceType": "ViewDefinition",
  "name": "condition_flat",
  "resource": "Condition",
  "status": "active",
  "select": [
    {
      "column": [
        { "name": "id", "path": "getResourceKey()", "type": "id" },
        {
          "name": "patient_id",
          "path": "subject.getReferenceKey(Patient)",
          "type": "id"
        },
        {
          "name": "clinical_status",
          "path": "clinicalStatus.coding.first().code",
          "type": "code"
        },
        {
          "name": "verification_status",
          "path": "verificationStatus.coding.first().code",
          "type": "code"
        },
        {
          "name": "code_system",
          "path": "code.coding.first().system",
          "type": "uri"
        },
        { "name": "code", "path": "code.coding.first().code", "type": "code" },
        {
          "name": "code_display",
          "path": "code.coding.first().display",
          "type": "string"
        },
        {
          "name": "onset_date",
          "path": "onset.ofType(dateTime)",
          "type": "dateTime"
        },
        { "name": "recorded_date", "path": "recordedDate", "type": "dateTime" }
      ]
    }
  ]
}
```

## Observations with filtering

Filter observations by LOINC code using a constant, and pull blood pressure components:

```json
{
  "resourceType": "ViewDefinition",
  "name": "blood_pressure",
  "resource": "Observation",
  "status": "active",
  "constant": [{ "name": "bp_code", "valueCode": "85354-9" }],
  "where": [
    {
      "path": "code.coding.where(system = 'http://loinc.org' and code = %bp_code).exists()"
    }
  ],
  "select": [
    {
      "column": [
        { "name": "id", "path": "getResourceKey()", "type": "id" },
        {
          "name": "patient_id",
          "path": "subject.getReferenceKey(Patient)",
          "type": "id"
        },
        {
          "name": "effective_date",
          "path": "effective.ofType(dateTime)",
          "type": "dateTime"
        },
        {
          "name": "systolic",
          "path": "component.where(code.coding.where(code = '8480-6').exists()).value.ofType(Quantity).value",
          "type": "decimal"
        },
        {
          "name": "diastolic",
          "path": "component.where(code.coding.where(code = '8462-4').exists()).value.ofType(Quantity).value",
          "type": "decimal"
        }
      ]
    }
  ]
}
```

## Encounter with diagnoses (nested forEach)

Cross-product of an encounter and its diagnoses:

```json
{
  "resourceType": "ViewDefinition",
  "name": "encounter_diagnoses",
  "resource": "Encounter",
  "status": "active",
  "select": [
    {
      "column": [
        { "name": "encounter_id", "path": "getResourceKey()", "type": "id" },
        {
          "name": "patient_id",
          "path": "subject.getReferenceKey(Patient)",
          "type": "id"
        },
        { "name": "status", "path": "status", "type": "code" },
        { "name": "class_code", "path": "class.code", "type": "code" }
      ]
    },
    {
      "forEach": "diagnosis",
      "column": [
        {
          "name": "diagnosis_reference",
          "path": "condition.reference",
          "type": "string"
        },
        {
          "name": "diagnosis_use",
          "path": "use.coding.first().code",
          "type": "code"
        },
        { "name": "diagnosis_rank", "path": "rank", "type": "positiveInt" }
      ]
    }
  ]
}
```

## Union of telecoms

Combine patient and contact telecoms with a discriminator column. Each `unionAll` branch must produce identical columns:

```json
{
  "resourceType": "ViewDefinition",
  "name": "all_patient_telecoms",
  "resource": "Patient",
  "status": "active",
  "select": [
    {
      "column": [
        { "name": "patient_id", "path": "getResourceKey()", "type": "id" }
      ]
    },
    {
      "unionAll": [
        {
          "forEach": "telecom",
          "column": [
            { "name": "source", "path": "'patient'", "type": "string" },
            { "name": "system", "path": "system", "type": "code" },
            { "name": "value", "path": "value", "type": "string" },
            { "name": "use", "path": "use", "type": "code" }
          ]
        },
        {
          "forEach": "contact.telecom",
          "column": [
            { "name": "source", "path": "'contact'", "type": "string" },
            { "name": "system", "path": "system", "type": "code" },
            { "name": "value", "path": "value", "type": "string" },
            { "name": "use", "path": "use", "type": "code" }
          ]
        }
      ]
    }
  ]
}
```

## Extensions (US Core)

Extract simple and nested (complex) extensions:

```json
{
  "resourceType": "ViewDefinition",
  "name": "patient_us_core",
  "resource": "Patient",
  "status": "active",
  "select": [
    {
      "column": [
        { "name": "id", "path": "getResourceKey()", "type": "id" },
        {
          "name": "birth_sex",
          "path": "extension('http://hl7.org/fhir/us/core/StructureDefinition/us-core-birthsex').value.ofType(code)",
          "type": "code"
        },
        {
          "name": "race_code",
          "path": "extension('http://hl7.org/fhir/us/core/StructureDefinition/us-core-race').extension('ombCategory').value.ofType(Coding).code.first()",
          "type": "code"
        },
        {
          "name": "race_display",
          "path": "extension('http://hl7.org/fhir/us/core/StructureDefinition/us-core-race').extension('text').value.ofType(string)",
          "type": "string"
        },
        {
          "name": "ethnicity_code",
          "path": "extension('http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity').extension('ombCategory').value.ofType(Coding).code.first()",
          "type": "code"
        }
      ]
    }
  ]
}
```

## Shareable ViewDefinition

A portable view with full metadata and explicit types on every column:

```json
{
  "resourceType": "ViewDefinition",
  "url": "https://example.org/ViewDefinition/patient-summary",
  "name": "patient_summary",
  "title": "Patient Summary View",
  "status": "active",
  "experimental": false,
  "description": "Summary view of patient demographics for analytics",
  "resource": "Patient",
  "fhirVersion": ["4.0.1", "5.0.0"],
  "select": [
    {
      "column": [
        {
          "name": "id",
          "path": "getResourceKey()",
          "type": "id",
          "description": "Patient row key"
        },
        {
          "name": "gender",
          "path": "gender",
          "type": "code",
          "description": "Administrative gender"
        },
        {
          "name": "birth_date",
          "path": "birthDate",
          "type": "date",
          "description": "Date of birth"
        },
        {
          "name": "is_deceased",
          "path": "deceased.exists()",
          "type": "boolean",
          "description": "Whether patient is deceased"
        }
      ]
    }
  ]
}
```

## MedicationRequest view

```json
{
  "resourceType": "ViewDefinition",
  "name": "medication_requests",
  "resource": "MedicationRequest",
  "status": "active",
  "select": [
    {
      "column": [
        { "name": "id", "path": "getResourceKey()", "type": "id" },
        {
          "name": "patient_id",
          "path": "subject.getReferenceKey(Patient)",
          "type": "id"
        },
        { "name": "status", "path": "status", "type": "code" },
        { "name": "intent", "path": "intent", "type": "code" },
        {
          "name": "medication_code",
          "path": "medication.ofType(CodeableConcept).coding.first().code",
          "type": "code"
        },
        {
          "name": "medication_display",
          "path": "medication.ofType(CodeableConcept).coding.first().display",
          "type": "string"
        },
        { "name": "authored_on", "path": "authoredOn", "type": "dateTime" },
        {
          "name": "requester_id",
          "path": "requester.getReferenceKey()",
          "type": "id"
        }
      ]
    }
  ]
}
```

## DiagnosticReport with results

Unnest report result references:

```json
{
  "resourceType": "ViewDefinition",
  "name": "diagnostic_report_results",
  "resource": "DiagnosticReport",
  "status": "active",
  "select": [
    {
      "column": [
        { "name": "report_id", "path": "getResourceKey()", "type": "id" },
        {
          "name": "patient_id",
          "path": "subject.getReferenceKey(Patient)",
          "type": "id"
        },
        { "name": "status", "path": "status", "type": "code" },
        {
          "name": "category",
          "path": "category.first().coding.first().code",
          "type": "code"
        },
        { "name": "code", "path": "code.coding.first().code", "type": "code" },
        {
          "name": "code_display",
          "path": "code.coding.first().display",
          "type": "string"
        },
        {
          "name": "effective_date",
          "path": "effective.ofType(dateTime)",
          "type": "dateTime"
        },
        { "name": "issued", "path": "issued", "type": "instant" }
      ]
    },
    {
      "forEach": "result",
      "column": [
        {
          "name": "observation_reference",
          "path": "reference",
          "type": "string"
        }
      ]
    }
  ]
}
```

## QuestionnaireResponse items (repeat)

Flatten all items regardless of nesting depth:

```json
{
  "resourceType": "ViewDefinition",
  "name": "questionnaire_response_items",
  "resource": "QuestionnaireResponse",
  "status": "active",
  "select": [
    {
      "column": [
        { "name": "response_id", "path": "getResourceKey()", "type": "id" },
        {
          "name": "questionnaire",
          "path": "questionnaire",
          "type": "canonical"
        },
        {
          "name": "patient_id",
          "path": "subject.getReferenceKey(Patient)",
          "type": "id"
        },
        { "name": "authored", "path": "authored", "type": "dateTime" },
        { "name": "status", "path": "status", "type": "code" }
      ]
    },
    {
      "repeat": ["item", "answer.item"],
      "column": [
        { "name": "link_id", "path": "linkId", "type": "string" },
        { "name": "text", "path": "text", "type": "string" },
        {
          "name": "answer_string",
          "path": "answer.value.ofType(string).first()",
          "type": "string"
        },
        {
          "name": "answer_integer",
          "path": "answer.value.ofType(integer).first()",
          "type": "integer"
        },
        {
          "name": "answer_boolean",
          "path": "answer.value.ofType(boolean).first()",
          "type": "boolean"
        },
        {
          "name": "answer_date",
          "path": "answer.value.ofType(date).first()",
          "type": "date"
        },
        {
          "name": "answer_coding_code",
          "path": "answer.value.ofType(Coding).code.first()",
          "type": "code"
        },
        {
          "name": "answer_coding_display",
          "path": "answer.value.ofType(Coding).display.first()",
          "type": "string"
        }
      ]
    }
  ]
}
```

The `repeat` directive starts at the root, follows `item` to top-level items, then `answer.item` for items nested inside answers, recursing until none remain, and unions all levels into one flat table - so the maximum depth need not be known in advance.

## Row index for ordering and surrogate keys

`%rowIndex` captures element position. Combine with the resource key for a unique row identifier:

```json
{
  "resourceType": "ViewDefinition",
  "name": "patient_names_indexed",
  "resource": "Patient",
  "status": "active",
  "select": [
    { "column": [{ "name": "id", "path": "getResourceKey()", "type": "id" }] },
    {
      "forEach": "name",
      "column": [
        { "name": "name_index", "path": "%rowIndex", "type": "integer" },
        { "name": "family", "path": "family", "type": "string" },
        { "name": "given", "path": "given.first()", "type": "string" },
        { "name": "use", "path": "use", "type": "code" }
      ]
    }
  ]
}
```

Output for a Patient with two names:

| id  | name_index | family | given | use      |
| --- | ---------- | ------ | ----- | -------- |
| pt1 | 0          | Smith  | John  | official |
| pt1 | 1          | Jones  | John  | maiden   |

Nested iterations have independent indices; capture the outer index in a column before entering the inner iteration:

```json
{
  "resourceType": "ViewDefinition",
  "name": "patient_contact_telecoms",
  "resource": "Patient",
  "status": "active",
  "select": [
    { "column": [{ "name": "id", "path": "getResourceKey()", "type": "id" }] },
    {
      "forEach": "contact",
      "column": [
        { "name": "contact_index", "path": "%rowIndex", "type": "integer" }
      ],
      "select": [
        {
          "forEach": "telecom",
          "column": [
            { "name": "telecom_index", "path": "%rowIndex", "type": "integer" },
            { "name": "system", "path": "system", "type": "code" },
            { "name": "value", "path": "value", "type": "string" }
          ]
        }
      ]
    }
  ]
}
```

## SQL type hints with tags

Override the default SQL mapping with the `ansi/type` tag:

```json
{
  "resourceType": "ViewDefinition",
  "name": "patient_birth_dates",
  "resource": "Patient",
  "status": "active",
  "select": [
    {
      "column": [
        { "name": "id", "path": "getResourceKey()", "type": "id" },
        {
          "name": "birth_date",
          "path": "birthDate",
          "type": "date",
          "tag": [{ "name": "ansi/type", "value": "DATE" }]
        }
      ]
    }
  ]
}
```

Without the tag, `date` maps to `CHARACTER VARYING`. The tag signals the runner to use the native SQL `DATE` type.

## Collection columns

When arrays are acceptable in output (non-tabular runners only; incompatible with the TabularViewDefinition profile):

```json
{
  "resourceType": "ViewDefinition",
  "name": "patient_all_names",
  "resource": "Patient",
  "status": "active",
  "select": [
    {
      "column": [
        { "name": "id", "path": "getResourceKey()", "type": "id" },
        {
          "name": "all_family_names",
          "path": "name.family",
          "type": "string",
          "collection": true
        },
        {
          "name": "all_given_names",
          "path": "name.given",
          "type": "string",
          "collection": true
        }
      ]
    }
  ]
}
```

## SQLQuery over views

Package a join across two ViewDefinition outputs as a shareable, parameterised query. See [sql-query.md](sql-query.md) for the full profile.

```json
{
  "resourceType": "Library",
  "meta": {
    "profile": ["https://sql-on-fhir.org/ig/StructureDefinition/SQLQuery"]
  },
  "type": {
    "coding": [
      {
        "system": "https://sql-on-fhir.org/ig/CodeSystem/LibraryTypesCodes",
        "code": "sql-query"
      }
    ]
  },
  "name": "PatientBloodPressure",
  "status": "active",
  "relatedArtifact": [
    {
      "type": "depends-on",
      "resource": "https://example.org/ViewDefinition/patient_demographics",
      "label": "patient"
    },
    {
      "type": "depends-on",
      "resource": "https://example.org/ViewDefinition/blood_pressure",
      "label": "bp"
    }
  ],
  "parameter": [{ "name": "from_date", "type": "date", "use": "in" }],
  "content": [
    {
      "contentType": "application/sql",
      "extension": [
        {
          "url": "https://sql-on-fhir.org/ig/StructureDefinition/sql-text",
          "valueString": "SELECT patient.id, patient.birth_date, bp.systolic, bp.diastolic, bp.effective_date FROM patient JOIN bp ON patient.id = bp.patient_id WHERE bp.effective_date >= :from_date"
        }
      ],
      "data": "U0VMRUNUIC4uLg=="
    }
  ]
}
```
