# FHIRPath subset and type mappings

The FHIRPath capabilities a SQL on FHIR view runner must or should support, plus the FHIR/FHIRPath-to-SQL type mappings.

## Contents

- [Required additional functions](#required-additional-functions)
- [ShareableViewDefinition subset](#shareableviewdefinition-subset)
- [Experimental functions](#experimental-functions)
- [Path navigation and context](#path-navigation-and-context)
- [Common functions in practice](#common-functions-in-practice)
- [Working with extensions](#working-with-extensions)
- [Choice types with ofType](#choice-types-with-oftype)
- [FHIR type to SQL type mapping](#fhir-type-to-sql-type-mapping)
- [FHIRPath type to SQL type mapping](#fhirpath-type-to-sql-type-mapping)

FHIRPath defines many functions; runners need not implement all of them. The spec defines three tiers: functions every runner MUST add, the subset shared views SHOULD rely on, and experimental functions not yet stable.

## Required additional functions

Every view runner MUST implement these two functions, which extend base FHIRPath because they are essential for views. See [view-definition-structure.md](view-definition-structure.md#joins-with-resource-and-reference-keys) for the join model.

| Function                  | Invoked on    | Returns                                                         |
| ------------------------- | ------------- | --------------------------------------------------------------- |
| `getResourceKey()`        | resource root | Opaque primary key for the row (KeyType - a FHIR primitive).    |
| `getReferenceKey([Type])` | a `Reference` | Matching foreign key, or `{}` if not of `Type` or unresolvable. |

`getReferenceKey` MUST support the relative literal reference form (`Patient/123`) and MAY support others. With an explicit type argument it returns `{}` when the reference points to a different type.

## ShareableViewDefinition subset

Runners that execute shared views SHOULD implement this subset (defined by the ShareableViewDefinition profile):

- **Literals** for String, Integer, Decimal.
- `where(criteria)`, `exists([criteria])`, `empty()`, `first()`.
- `extension(url)`.
- `ofType(type)`.
- Boolean operators: `and`, `or`, `not()`.
- Math operators: `+`, `-`, `*`, `/`.
- Comparison operators: `=`, `!=`, `>`, `<=` (and the other inequalities).
- Indexer expressions: `collection[0]`.

## Experimental functions

Intended for the required subset eventually, but not yet in a normative FHIRPath release and subject to change:

- `join(separator)` - concatenate a string collection.
- `lowBoundary([precision])` and `highBoundary([precision])` - including on `Period`.

Use these only when the target runner is known to support them; avoid them in broadly shared views.

## Path navigation and context

- Dot navigation: `name.family`.
- Indexing: `name[0].family`.
- `$this`: the current context element (useful inside `forEach` over primitives, e.g. `name.given` then `$this`).
- Constants and environment variables: `%name`, `%rowIndex`.

## Common functions in practice

| Pattern                                           | Purpose                                               |
| ------------------------------------------------- | ----------------------------------------------------- |
| `name.first().family`                             | Reduce a collection to a single value.                |
| `telecom.where(system = 'phone').value`           | Filter a collection by a condition.                   |
| `code.coding.exists(system = 'http://loinc.org')` | Boolean test for `where` clauses.                     |
| `effective.ofType(dateTime)`                      | Pick one type from a choice (`effective[x]`).         |
| `line.join(', ')`                                 | Flatten a string list into one column (experimental). |
| `deceased.exists()`                               | Derive a boolean column.                              |

A non-`collection` column must resolve to a single value; add `first()` or a filtering `where(...)` when a path could return many.

## Working with extensions

Extract extension values with `extension(url)` then pick the value type:

```json
{
  "name": "birth_sex",
  "path": "extension('http://hl7.org/fhir/us/core/StructureDefinition/us-core-birthsex').value.ofType(code).first()",
  "type": "code"
}
```

Nested (complex) extensions chain `extension(...)`:

```json
{
  "name": "race_code",
  "path": "extension('http://hl7.org/fhir/us/core/StructureDefinition/us-core-race').extension('ombCategory').value.ofType(Coding).code.first()",
  "type": "code"
}
```

## Choice types with ofType

For `value[x]`, `effective[x]`, `onset[x]`, `medication[x]`, etc., select the concrete type with `ofType`:

```
value.ofType(Quantity).value
effective.ofType(dateTime)
medication.ofType(CodeableConcept).coding.first().code
```

## FHIR type to SQL type mapping

Default mapping from FHIR types to ISO/IEC 9075 (ANSI) SQL types. Runners SHOULD align to these or the closest equivalent. Where the SQL type is `CHARACTER VARYING`, the string MUST comply with the FHIR primitive string representation.

| FHIR type    | ISO/IEC 9075 SQL type    |
| ------------ | ------------------------ |
| base64Binary | BINARY                   |
| boolean      | BOOLEAN                  |
| canonical    | CHARACTER VARYING        |
| code         | CHARACTER VARYING        |
| date         | CHARACTER VARYING        |
| dateTime     | CHARACTER VARYING        |
| decimal      | CHARACTER VARYING        |
| id           | CHARACTER VARYING        |
| instant      | TIMESTAMP WITH TIME ZONE |
| integer      | INT                      |
| integer64    | BIGINT                   |
| markdown     | CHARACTER VARYING        |
| oid          | CHARACTER VARYING        |
| positiveInt  | INT                      |
| string       | CHARACTER VARYING        |
| time         | CHARACTER VARYING        |
| unsignedInt  | INT                      |
| uri          | CHARACTER VARYING        |
| url          | CHARACTER VARYING        |
| uuid         | CHARACTER VARYING        |

## FHIRPath type to SQL type mapping

| FHIRPath type | ISO/IEC 9075 SQL type |
| ------------- | --------------------- |
| Boolean       | BOOLEAN               |
| String        | CHARACTER VARYING     |
| Integer       | INT                   |
| Decimal       | CHARACTER VARYING     |
| Date          | CHARACTER VARYING     |
| Time          | CHARACTER VARYING     |
| DateTime      | CHARACTER VARYING     |

Where a path has both a FHIR type and a FHIRPath type, the FHIR type mapping takes precedence.

## Overriding the mapping

Override the SQL type for a column with a `tag` named `ansi/type` whose value is the desired ISO/IEC 9075 type (e.g. `DATE`, `DECIMAL(10,2)`). Behaviour is undefined if the value is unknown or incompatible with the underlying database. Implementations may also define their own namespaced tags for database-specific types.
