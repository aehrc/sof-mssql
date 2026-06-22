# SQLQuery and SQLView profiles

SQL on FHIR packages shareable SQL in two FHIR `Library` profiles. They bridge the View Layer (ViewDefinitions produce flat tables) and the Analytics Layer (SQL joins and aggregates them).

## Contents

- [When to use which](#when-to-use-which)
- [SQLQuery](#sqlquery)
- [SQLView](#sqlview)
- [Query composition](#query-composition)
- [Dialect variants](#dialect-variants)
- [SQL annotations](#sql-annotations)

## When to use which

- **SQLQuery** - a single, runnable SQL query, optionally parameterised, executed via `$sqlquery-run`/`$sqlquery-export`. Use for reports, dashboards, and analytics that join/aggregate view outputs.
- **SQLView** - a reusable, named query identified by a canonical URL that other queries reference as a virtual table, analogous to a SQL view. Cannot declare parameters.

Both are `Library` resources sharing the same content mechanics; they differ in `type` and whether parameters are allowed.

## SQLQuery

A `Library` profiled as SQLQuery holding exactly one query.

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
      "resource": "https://example.org/ViewDefinition/patient_view",
      "label": "patient"
    },
    {
      "type": "depends-on",
      "resource": "https://example.org/ViewDefinition/bp_view",
      "label": "bp"
    }
  ],
  "parameter": [
    { "name": "patient_id", "type": "string", "use": "in" },
    { "name": "from_date", "type": "date", "use": "in" }
  ],
  "content": [
    {
      "contentType": "application/sql",
      "extension": [
        {
          "url": "https://sql-on-fhir.org/ig/StructureDefinition/sql-text",
          "valueString": "SELECT patient.id, bp.systolic FROM ..."
        }
      ],
      "data": "U0VMRUNUIHBhdGllbnQu..."
    }
  ]
}
```

The decoded SQL for the above:

```sql
SELECT patient.id, bp.systolic
FROM patient
JOIN bp ON patient.id = bp.patient_id
WHERE patient.id = :patient_id
  AND bp.effective_date >= :from_date
```

### Dependencies (table sources)

List each ViewDefinition or SQLView with `relatedArtifact` `type = "depends-on"`. `resource` is the dependency's canonical URL; `label` is the SQL table name. Labels must be unique within the Library and valid SQL identifiers (`^[a-zA-Z_][a-zA-Z0-9_]*$`), avoiding reserved words. The allowed targets are recorded as a `targetProfile` on `relatedArtifact.resource`.

### Parameters

Declare each in `Library.parameter` with `name`, `type`, and `use = "in"`. Reference them in SQL with colon placeholders (`:name`). Implementations MUST bind values safely (parameterised queries or equivalent); simple string interpolation MUST NOT be used. The type-to-`value[x]` mapping when invoking via operations is in [operations.md](operations.md#sqlquery-run-and-sqlquery-export).

### SQL attachments

Store the SQL in `content`:

- `contentType` SHALL start with `application/sql` (from the All SQL Content Type Codes value set, extensible binding).
- `data` (base64-encoded SQL) SHALL be present.
- The `sql-text` extension MAY carry a plain-text copy for readability.

### Conformance summary

- `type` SHALL be `LibraryTypesCodes#sql-query`.
- Every `content.contentType` SHALL start with `application/sql`; `content.data` SHALL be present.
- Dependencies SHALL use `relatedArtifact` (`depends-on` + `label`) referencing a ViewDefinition or SQLView.
- Parameters SHALL use `Library.parameter` with `use = "in"`.

## SQLView

A near-twin of SQLQuery, identified by its canonical URL so other queries can build on it. Differences:

- `type` is fixed to `LibraryTypesCodes#sql-view`.
- `Library.parameter` SHALL be absent (`0..0`) - views are fixed building blocks; parameterise at the SQLQuery that composes them.

Everything else (dependencies, SQL attachments, dialect variants) matches SQLQuery.

```json
{
  "resourceType": "Library",
  "meta": {
    "profile": ["https://sql-on-fhir.org/ig/StructureDefinition/SQLView"]
  },
  "type": {
    "coding": [
      {
        "system": "https://sql-on-fhir.org/ig/CodeSystem/LibraryTypesCodes",
        "code": "sql-view"
      }
    ]
  },
  "name": "ActivePatientsView",
  "status": "active",
  "relatedArtifact": [
    {
      "type": "depends-on",
      "resource": "https://example.org/ViewDefinition/patient_view",
      "label": "patient_view"
    }
  ],
  "content": [
    {
      "contentType": "application/sql",
      "extension": [
        {
          "url": "https://sql-on-fhir.org/ig/StructureDefinition/sql-text",
          "valueString": "SELECT * FROM patient_view WHERE active = true"
        }
      ],
      "data": "U0VMRUNUICogRlJPTS..."
    }
  ]
}
```

## Query composition

ViewDefinitions, SQLViews, and SQLQueries form a directed graph: a ViewDefinition projects FHIR into tables; an SQLView wraps a query over those tables and exposes it under a canonical URL; an SQLQuery composes both as table sources. Each referenced result acts as a virtual table for the referencing query, letting queries build on one another like SQL views.

Authors SHOULD keep the graph acyclic. Cycle detection, dependency-depth limits, and whether intermediate results are materialised or inlined (CTEs, database views) are implementation decisions.

## Dialect variants

For dialect-specific SQL, include multiple `content` attachments, adding a `dialect` parameter to `contentType` (e.g. `application/sql;dialect=postgresql`). Keep aliases and parameter names consistent across variants; all variants SHALL be functionally equivalent.

Selection order when executing:

1. Prefer an attachment whose `dialect` matches the engine.
2. Otherwise fall back to the default `application/sql` (no dialect) attachment.
3. If neither is available, return an error rather than guess a translation.

Authors SHOULD always include a default `application/sql` attachment, restricting it to portable ANSI SQL.

## SQL annotations

SQL files MAY carry `@key: value` annotations in comments so tooling can generate the Library automatically (Library elements remain authoritative).

```sql
/*
@name: PatientBloodPressure
@title: Patient Blood Pressure Report
@version: 1.0.0
@status: active
*/

-- @param: patient_id string Patient identifier
-- @param: from_date date Start date
-- @relatedDependency: https://example.org/ViewDefinition/patient_view as patient
-- @relatedDependency: https://example.org/ViewDefinition/bp_view as bp

SELECT patient.id, bp.systolic
FROM patient JOIN bp ON patient.id = bp.patient_id
WHERE patient.id = :patient_id AND bp.effective_date >= :from_date
```

| Annotation           | FHIR mapping          | Format                                            |
| -------------------- | --------------------- | ------------------------------------------------- |
| `@name`              | `Library.name`        | `@name: identifier`                               |
| `@title`             | `Library.title`       | `@title: Human Title`                             |
| `@description`       | `Library.description` | `@description: text`                              |
| `@version`           | `Library.version`     | `@version: semver`                                |
| `@status`            | `Library.status`      | `@status: draft\|active\|retired`                 |
| `@author`            | `Library.author.name` | `@author: Name` (repeatable)                      |
| `@publisher`         | `Library.publisher`   | `@publisher: Org`                                 |
| `@param`             | `Library.parameter`   | `@param: name type [description]` (repeatable)    |
| `@relatedDependency` | `relatedArtifact`     | `@relatedDependency: URL [as label]` (repeatable) |

Tooling SHALL populate the `sql-text` extension and base64 `data`, set `contentType` to `application/sql`, set `type` to the matching `LibraryTypesCodes`, set `parameter.use` to `in`, and set `relatedArtifact.type` to `depends-on`. Builders SHOULD infer `name` from the filename if absent, default `status` to `draft`, validate parameter types and labels, and warn on unknown annotations.
