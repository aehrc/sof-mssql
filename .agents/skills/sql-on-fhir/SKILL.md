---
name: sql-on-fhir
description: Implement SQL on FHIR v2 to create portable tabular projections of FHIR data. Use when authoring ViewDefinitions, flattening or unnesting FHIR into tables, writing FHIRPath columns, filtering with where, unioning with unionAll, recursing with repeat, joining via getResourceKey/getReferenceKey, packaging shareable SQL with SQLQuery/SQLView Libraries, or executing with $viewdefinition-run, $viewdefinition-export, $sqlquery-run or $sqlquery-export. Trigger keywords include ViewDefinition, SQL on FHIR, flatten FHIR, tabular FHIR, FHIR analytics, FHIRPath columns, unnest FHIR, SQLQuery, SQLView, $run, $export, rowIndex, ansi/type.
---

# SQL on FHIR

SQL on FHIR v2 defines portable, tabular projections of FHIR resources using a FHIRPath subset. It turns hierarchical FHIR data into flat tables that work with standard SQL and analytic tools (Spark, Athena, DuckDB, data warehouses).

The specification has three complementary components:

1. **ViewDefinition** - a portable format that projects one FHIR resource type into a table using FHIRPath. This is the core of the spec and the focus of most work.
2. **SQLQuery / SQLView** - FHIR `Library` profiles that package shareable, parameterised SQL over the tables produced by ViewDefinitions. Use these to join and aggregate across views. See [references/sql-query.md](references/sql-query.md).
3. **HTTP API** - FHIR operations that run views and queries. See [references/operations.md](references/operations.md).

> Naming note: operations were renamed from the early drafts. Use `$viewdefinition-run` and `$viewdefinition-export` (not the old `$run`/`$export`), plus the newer `$sqlquery-run` and `$sqlquery-export`.

## Core concepts

A **ViewDefinition** projects exactly one FHIR resource type into rows and columns. Key elements:

- `resource` (required): the FHIR resource type (Patient, Observation, …).
- `select` (required): column definitions and row-iteration logic.
- `where` (optional): row-level filtering criteria.
- `constant` (optional): reusable values referenced as `%name`.
- `profile`, `fhirVersion`, `name`, `url`, `status`: metadata for portability.

ViewDefinitions intentionally exclude cross-resource joins, sorting, aggregation, and limits. Produce flat tables, then join and aggregate in the SQL/analytics layer (optionally packaged as an SQLQuery).

Basic structure:

```json
{
  "resourceType": "ViewDefinition",
  "resource": "Patient",
  "status": "active",
  "select": [
    {
      "column": [
        { "name": "id", "path": "getResourceKey()", "type": "id" },
        { "name": "gender", "path": "gender", "type": "code" },
        { "name": "birth_date", "path": "birthDate", "type": "date" }
      ]
    }
  ]
}
```

For the complete element reference, constraints, column ordering, type inference, and the processing algorithm, see [references/view-definition-structure.md](references/view-definition-structure.md).

## Columns

Each `column` has:

- `name` (required): output column name. MUST match `^[A-Za-z][A-Za-z0-9_]*$` (constraint `sql-name`).
- `path` (required): a FHIRPath expression yielding the value. May reference constants as `%name`.
- `type` (optional): FHIR type as a StructureDefinition URI (relative URIs imply `http://hl7.org/fhir/StructureDefinition/`).
- `collection` (optional, default false): set true if the column may hold multiple values.
- `description` (optional): markdown explanation.
- `tag` (optional): implementation metadata; `ansi/type` overrides the default SQL type.

**Always set `type` explicitly on every column for shared views.** Type inference is optional and some runners do not implement it; absent a type, runners may treat the column as a string. A non-`collection` path that returns more than one value is an error ("Multiple values found but not expected for column"), so reduce with `first()`, `where(...)`, or `ofType(...)`.

## Row iteration

Without iteration, a `select` produces one row per resource. To unroll a collection into multiple rows, use one of `forEach`, `forEachOrNull`, or `repeat` - **at most one per `select`** (constraint `sql-expressions`).

- `forEach`: one row per element; like an `INNER JOIN`. No rows when the collection is empty.
- `forEachOrNull`: like a `LEFT OUTER JOIN`; emits one row with null columns when the collection is empty.
- `repeat`: recursively traverses an array of paths to any depth, unioning results from every level. Essential for arbitrarily nested structures like `QuestionnaireResponse.item`.

Iteration applies to the `select`'s own columns and any nested `select`s. Parent/child selects repeat parent values for each child row; sibling selects are cross-joined.

```json
{
  "resource": "Patient",
  "select": [
    { "column": [{ "name": "id", "path": "getResourceKey()", "type": "id" }] },
    {
      "forEach": "name",
      "column": [
        { "name": "family", "path": "family", "type": "string" },
        { "name": "given", "path": "given.first()", "type": "string" }
      ]
    }
  ]
}
```

`repeat` example:

```json
{
  "resource": "QuestionnaireResponse",
  "select": [
    {
      "column": [
        { "name": "response_id", "path": "getResourceKey()", "type": "id" }
      ]
    },
    {
      "repeat": ["item", "answer.item"],
      "column": [
        { "name": "link_id", "path": "linkId", "type": "string" },
        { "name": "text", "path": "text", "type": "string" }
      ]
    }
  ]
}
```

## Combining with unionAll

`unionAll` concatenates the rows of several `select`s (like SQL `UNION ALL`, no de-duplication, no guaranteed ordering). Every branch MUST produce the same columns - same names, order, and types - or validation fails ("Union Branches Inconsistent"). A `select` may contain only one `unionAll`; nest selects when more are needed.

```json
{
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
            { "name": "system", "path": "system", "type": "code" },
            { "name": "value", "path": "value", "type": "string" }
          ]
        },
        {
          "forEach": "contact.telecom",
          "column": [
            { "name": "system", "path": "system", "type": "code" },
            { "name": "value", "path": "value", "type": "string" }
          ]
        }
      ]
    }
  ]
}
```

## Filtering with where

Each `where.path` is a FHIRPath expression that must evaluate to true for the resource to be included. Multiple `where` entries are ANDed.

```json
{
  "resource": "Observation",
  "constant": [{ "name": "bp_code", "valueCode": "85354-9" }],
  "where": [
    {
      "path": "code.coding.exists(system = 'http://loinc.org' and code = %bp_code)"
    }
  ],
  "select": [
    { "column": [{ "name": "id", "path": "getResourceKey()", "type": "id" }] }
  ]
}
```

## Joins: getResourceKey and getReferenceKey

ViewDefinitions do not join across resources; instead, emit keys so the analytics layer can join. These two functions are **required** of all runners.

- `getResourceKey()`: called at the resource root, returns an opaque primary key for the row (often the `id`).
- `getReferenceKey([Type])`: called on a `Reference`, returns the matching foreign key. Pass an expected type to get null when the reference points elsewhere - e.g. `subject.getReferenceKey(Patient)`.

Keys returned by the two functions match for the same logical resource, so `observation.patient_id` joins to `patient.id`. The key mechanism (resource `id`, primary `identifier`, or a cross-link table) is implementation-defined.

## Constants and %rowIndex

Define reusable values with `constant` (name + a `value[x]`) and reference them as `%name`. Names follow the `sql-name` pattern. See [references/view-definition-structure.md](references/view-definition-structure.md) for the full `value[x]` list.

`%rowIndex` is a built-in environment variable: the 0-based position of the current element in the iterated collection (0 at the top level). Each nesting level has its own independent index; capture a parent index in a column before entering a child iteration. Use it to preserve FHIR ordering, disambiguate repeats, or build surrogate keys. Type `integer`.

## Column types and SQL type hints

A column's FHIR type comes from its explicit `type` or, optionally, inference from the path. How that maps to a physical SQL type follows the default FHIR-to-SQL and FHIRPath-to-SQL mappings (e.g. `integer`→`INT`, `instant`→`TIMESTAMP WITH TIME ZONE`, most others→`CHARACTER VARYING`). Override per column with a `tag` named `ansi/type` carrying an ISO/IEC 9075 SQL type:

```json
{
  "name": "birth_date",
  "path": "birthDate",
  "type": "date",
  "tag": [{ "name": "ansi/type", "value": "DATE" }]
}
```

The full mapping tables are in [references/fhirpath-subset.md](references/fhirpath-subset.md).

## FHIRPath subset

ViewDefinitions use a minimal FHIRPath subset. Runners MUST implement `getResourceKey` and `getReferenceKey`; runners targeting shared views SHOULD implement the ShareableViewDefinition subset (literals, `where`, `exists`, `empty`, `extension`, `ofType`, `first`, boolean/math/comparison operators, indexers). `join`, `lowBoundary`, and `highBoundary` are experimental. Full reference and extension-handling patterns: [references/fhirpath-subset.md](references/fhirpath-subset.md).

## Profiles for portability

- **ShareableViewDefinition**: for distributable views. Requires `url`, `name`, `fhirVersion`, explicit column `type`s, and the FHIRPath subset above.
- **TabularViewDefinition**: for scalar CSV-style output. Forbids `collection: true` and non-primitive types.

## Validation

Validate generated ViewDefinitions and SQLQuery/SQLView Libraries with the `mcp__fhir-tools__validate` tool against the SQL on FHIR profiles before declaring the work complete. Key invariants to self-check first: `sql-name` on every `name`/`constant.name`/`column.name`; at most one of `forEach`/`forEachOrNull`/`repeat` per select; unique column names across a view; consistent columns across `unionAll` branches.

## References

- [references/view-definition-structure.md](references/view-definition-structure.md) - complete element reference, constraints, column ordering, type inference, contained resources, joins, and the processing algorithm.
- [references/fhirpath-subset.md](references/fhirpath-subset.md) - the FHIRPath subset, required/experimental functions, extension patterns, and FHIR/FHIRPath-to-SQL type mappings.
- [references/operations.md](references/operations.md) - the four HTTP operations, shared behaviour, parameters, formats, content negotiation, and the async export pattern.
- [references/sql-query.md](references/sql-query.md) - SQLQuery and SQLView Library profiles, dependencies, parameters, dialect variants, and SQL annotations.
- [references/examples.md](references/examples.md) - worked ViewDefinition and SQLQuery examples for common resource types and patterns.
