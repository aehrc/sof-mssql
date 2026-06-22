# ViewDefinition structure reference

Complete element reference and processing semantics for SQL on FHIR v2 ViewDefinitions.

## Contents

- [Element reference](#element-reference)
- [Constants and value types](#constants-and-value-types)
- [Constraints and invariants](#constraints-and-invariants)
- [Unnesting semantics](#unnesting-semantics)
- [Multiple selects](#multiple-selects)
- [unionAll and composition](#unionall-and-composition)
- [Column ordering](#column-ordering)
- [Column types and inference](#column-types-and-inference)
- [Joins with resource and reference keys](#joins-with-resource-and-reference-keys)
- [Contained resources](#contained-resources)
- [Schema generation](#schema-generation)
- [Processing algorithm](#processing-algorithm)

## Element reference

ViewDefinition is a `CanonicalResource`. Its element is `ViewDefinition` with the following structure.

### Metadata

| Element        | Card. | Type            | Notes                                                        |
| -------------- | ----- | --------------- | ------------------------------------------------------------ |
| `url`          | 0..1  | uri             | Canonical identifier for the definition.                     |
| `identifier`   | 0..\* | Identifier      | Additional formal identifiers.                               |
| `version`      | 0..1  | string          | Business version.                                            |
| `name`         | 0..1  | string          | Computer-friendly name. Must satisfy `sql-name`.             |
| `title`        | 0..1  | string          | Human-friendly title.                                        |
| `status`       | 1..1  | code            | `draft \| active \| retired \| unknown` (PublicationStatus). |
| `experimental` | 0..1  | boolean         | For testing rather than production.                          |
| `date`         | 0..1  | dateTime        | Date of last significant change.                             |
| `publisher`    | 0..1  | string          | Responsible organisation/individual.                         |
| `contact`      | 0..\* | ContactDetail   | Publisher contact details.                                   |
| `description`  | 0..1  | markdown        | Natural-language description.                                |
| `jurisdiction` | 0..\* | CodeableConcept | Intended geographic/legal region.                            |
| `purpose`      | 0..1  | markdown        | Why the definition exists.                                   |
| `copyright`    | 0..1  | markdown        | Usage and publishing restrictions.                           |

### Resource configuration

| Element       | Card. | Type      | Notes                                                                           |
| ------------- | ----- | --------- | ------------------------------------------------------------------------------- |
| `resource`    | 1..1  | code      | The FHIR resource type the view projects (ResourceType, required binding).      |
| `profile`     | 0..\* | canonical | Profiles the view targets; each must conform to `resource`.                     |
| `fhirVersion` | 0..\* | code      | FHIR versions supported, e.g. `4.0.1`, `5.0.0` (FHIRVersion, required binding). |

### constant

| Element             | Card. | Type   | Notes                                                      |
| ------------------- | ----- | ------ | ---------------------------------------------------------- |
| `constant`          | 0..\* | -      | Reusable values injected into FHIRPath as `%name`.         |
| `constant.name`     | 1..1  | string | Referenced as `%[name]`. Must satisfy `sql-name`.          |
| `constant.value[x]` | 1..1  | choice | The value (see [value types](#constants-and-value-types)). |

### select

| Element                | Card. | Type   | Notes                                                                  |
| ---------------------- | ----- | ------ | ---------------------------------------------------------------------- |
| `select`               | 1..\* | -      | Defines columns and nested selection logic.                            |
| `select.column`        | 0..\* | -      | Columns produced (see below).                                          |
| `select.forEach`       | 0..1  | string | FHIRPath; one row per selected element.                                |
| `select.forEachOrNull` | 0..1  | string | Like `forEach`, but one null row when the collection is empty.         |
| `select.repeat`        | 0..\* | string | Paths to traverse recursively; union of all levels.                    |
| `select.select`        | 0..\* | select | Nested selects, evaluated relative to this select's iteration context. |
| `select.unionAll`      | 0..\* | select | Branches combined as a union; must have matching columns.              |

### select.column

| Element       | Card. | Type     | Notes                                                                                                                                                                     |
| ------------- | ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `path`        | 1..1  | string   | FHIRPath defining the column content. May reference constants as `%name`.                                                                                                 |
| `name`        | 1..1  | string   | Output column name. Must satisfy `sql-name`.                                                                                                                              |
| `description` | 0..1  | markdown | Human-readable explanation.                                                                                                                                               |
| `collection`  | 0..1  | boolean  | True if the column may contain multiple values (default false).                                                                                                           |
| `type`        | 0..1  | uri      | FHIR type as StructureDefinition URI. Relative URIs imply `http://hl7.org/fhir/StructureDefinition/`. Element-id notation (e.g. `Observation.referenceRange`) is allowed. |
| `tag`         | 0..\* | -        | Implementation metadata.                                                                                                                                                  |
| `tag.name`    | 1..1  | string   | Namespaced tag name, e.g. `ansi/type`.                                                                                                                                    |
| `tag.value`   | 1..1  | string   | Tag value.                                                                                                                                                                |

### where

| Element             | Card. | Type   | Notes                                                             |
| ------------------- | ----- | ------ | ----------------------------------------------------------------- |
| `where`             | 0..\* | -      | Inclusion filters; multiple entries are ANDed.                    |
| `where.path`        | 1..1  | string | FHIRPath that must evaluate true for the resource to be included. |
| `where.description` | 0..1  | string | Human-readable explanation.                                       |

## Constants and value types

`constant.value[x]` accepts one of:
`valueBase64Binary`, `valueBoolean`, `valueCanonical`, `valueCode`, `valueDate`, `valueDateTime`, `valueDecimal`, `valueId`, `valueInstant`, `valueInteger`, `valueInteger64`, `valueOid`, `valueString`, `valuePositiveInt`, `valueTime`, `valueUnsignedInt`, `valueUri`, `valueUrl`, `valueUuid`.

Constants are substituted into the FHIRPath expression before evaluation, so they can appear anywhere a `%name` reference is valid (in `column.path` and `where.path`).

## Constraints and invariants

| Id                | Grade   | Path(s)                                       | Rule                                                                                                      |
| ----------------- | ------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `sql-name`        | error   | `name`, `constant.name`, `select.column.name` | `empty() or matches('^[A-Za-z][A-Za-z0-9_]*$')` - letters, digits, underscores; must start with a letter. |
| `sql-expressions` | error   | `select`                                      | At most one of `forEach`, `forEachOrNull`, `repeat` per select.                                           |
| `cnl-0`           | warning | `ViewDefinition`                              | If `name` is present it should match `^[A-Z]([A-Za-z0-9_]){1,254}$`.                                      |

Two runtime validation errors are defined by the processing model:

- **Column Already Defined** - duplicate column name across the view (names must be unique).
- **Union Branches Inconsistent** - `unionAll` branches do not all produce the same column names/order.
- **Multiple values found but not expected for column** - a non-`collection` column path returned more than one value.

## Unnesting semantics

`forEach` and `forEachOrNull` apply to the select's own columns and to any nested `select`s. These two forms are equivalent:

```json
{
  "select": [
    {
      "forEach": "address",
      "column": [{ "name": "zip", "path": "postalCode" }]
    }
  ]
}
```

```json
{
  "select": [
    {
      "forEach": "address",
      "select": [{ "column": [{ "name": "zip", "path": "postalCode" }] }]
    }
  ]
}
```

`forEach` behaves like an `INNER JOIN` (no row if the collection is empty); `forEachOrNull` behaves like a `LEFT OUTER JOIN` (one row with null columns if empty).

## Multiple selects

A ViewDefinition may have several `select`s, as siblings or parent/child:

- Parent/child: parent column values repeat for each child row.
- Siblings: cross-joined - each row in one select is duplicated for every row in its siblings.

## unionAll and composition

`unionAll` concatenates the rows of its branches without de-duplicating and without guaranteeing row order. Every branch MUST produce the same number of columns with the same names, order, and types. A select may hold only one `unionAll`; nest selects when more unions are needed. The columns produced by a `unionAll` are added to the parent select, placed after the parent's own columns and nested-select columns.

`unionAll` rows compose like `select` rows, so unions and selects can be nested with intuitive behaviour. Prefer a single flat `unionAll` over nested equivalents for readability.

## Column ordering

Runners that support column ordering MUST order columns as: the parent select's columns first, then columns from nested `select`s, then columns from the `unionAll` list. To control ordering, move columns or the `unionAll` into a nested select positioned where desired.

## Column types and inference

Every value in a column must share one data type, set explicitly via `type` (and `collection`). Inference, when supported, applies to primitives:

1. If `collection` is not true, the path must return a single value.
2. A `parent.child.subPath` navigation from a known type takes the type from the StructureDefinition.
3. A terminal FHIRPath function with a defined return type sets the column type (e.g. `exists()`→boolean, `lowBoundary()`→instant-like).
4. A path ending in `ofType(X)` is of type `X`.

Inference is optional; some runners do not implement it and may treat untyped columns as strings. **For shared views, set `type` explicitly on every column, including primitives.** Non-primitive types are not supported by all runners. The FHIR type determines the logical column type; physical SQL representation follows the [type mappings](fhirpath-subset.md) and any `ansi/type` tag.

## Joins with resource and reference keys

ViewDefinitions do not join across resources. Instead emit primary/foreign keys so the database or analytic tool can join.

- `getResourceKey()` at the resource root returns an opaque, join-friendly primary key.
- `getReferenceKey([Type])` on a `Reference` returns the matching foreign key, or the empty collection (`{}`) if the reference is not of the expected `Type` or cannot be resolved.

Both must return equal values for the same logical resource. Runners MUST support the relative literal reference form (`Patient/123`) and MAY support others. How keys are derived is implementation-defined; common strategies:

- **Return the resource `id`** - simplest, when ids are stable and references are relative.
- **Return a "primary" `identifier`** - when ids change across systems; pick an identifier by `system`/`use` and convert to a key (string or hash).
- **Pre-process / cross-link table** - when neither id nor a single identifier is reliable.

Example pairing:

```json
{
  "name": "active_patients",
  "resource": "Patient",
  "select": [
    {
      "column": [
        { "path": "getResourceKey()", "name": "id" },
        { "path": "active", "name": "active" }
      ]
    }
  ]
}
```

```json
{
  "name": "simple_obs",
  "resource": "Observation",
  "select": [
    {
      "column": [
        { "path": "getResourceKey()", "name": "id" },
        { "path": "subject.getReferenceKey(Patient)", "name": "patient_id" }
      ]
    }
  ]
}
```

Then `simple_obs.patient_id` joins to `active_patients.id`.

## Contained resources

Contained resources are not emitted by a ViewDefinition. Because they lack independent identity and may be duplicated across parents, the spec requires implementers to pre-process any contained resources that need to appear in views into normalised, independent resources accessible via `getReferenceKey`. A view of Practitioner resources includes top-level Practitioners only, not Practitioners contained inside Patients.

## Schema generation

Output format is technology-specific. Runners SHOULD offer a way to compute the output schema (e.g. a `CREATE TABLE`/`CREATE VIEW` statement) from a ViewDefinition where applicable. This does not apply to schemaless outputs like CSV.

## Processing algorithm

Implementations need not follow this literally, but their output must match it.

### Validate columns

1. Recursively gather columns across each selection structure.
2. Within a select: column names must be unique and disjoint from already-defined columns, else "Column Already Defined".
3. Nested selects: each produced column name must not already exist.
4. For `unionAll`: validate the first branch, then require every other branch to produce the identical list of column names (and types), else "Union Branches Inconsistent". Append the branch columns once.

### Process a resource

1. If `R.resourceType != V.resource`, emit nothing.
2. If `where` is present, evaluate each `where.path`; if any is false, emit nothing.
3. Initialise top-level `%rowIndex` to 0.
4. Emit all rows from the recursive `Process(select, resource)`.

### Process(S, N) recursive step

1. Compute the iteration foci:
   - `repeat`: recursively traverse each path from the current node, collecting every visited node (excluding the root) across all depths.
   - `forEach`: `fhirpath(S.forEach, N)`.
   - `forEachOrNull`: `fhirpath(S.forEachOrNull, N)`.
   - otherwise: `[N]`.
2. For each focus `f` at 0-based index `i`:
   - Set `%rowIndex = i` for this level.
   - Build partial rows for `S.column` (single value → value; empty → null; multiple with `collection` → array; multiple without `collection` → error).
   - Recurse into each `S.select`; recurse and concatenate each `S.unionAll` branch.
   - Emit the Cartesian product of the column partials, child-select rows, and union rows.
3. If `forEachOrNull` produced no foci, emit one row with all columns null (except `%rowIndex` columns, bound to 0).

The Cartesian product is only between a select and its direct children; deeper rows bubble up one level at a time through the recursion.
