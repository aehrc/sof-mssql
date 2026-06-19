# row-index-variable

## Purpose

Define how the transpiler recognises and resolves the `%rowIndex` built-in
FHIRPath environment variable, so that column `path` expressions can reference
the 0-based position of the current element within the active iteration context
and emit a valid T-SQL integer.

## Requirements

### Requirement: Recognise %rowIndex as a built-in environment variable

The transpiler SHALL recognise `%rowIndex` as a built-in FHIRPath environment
variable in column `path` expressions. It MUST NOT reject `%rowIndex` as an
undefined constant, regardless of whether the ViewDefinition declares any
`constant` entries. The resolved value SHALL be emitted as valid T-SQL of type
`INT` so that a column declared with `"type": "integer"` produces an integer
result.

#### Scenario: %rowIndex is accepted without a matching constant

- **WHEN** a column `path` is `%rowIndex` and the ViewDefinition declares no
  constant named `rowIndex`
- **THEN** transpilation succeeds and the column expression resolves to a T-SQL
  integer rather than raising an "is not defined" error

#### Scenario: A user-defined constant does not shadow %rowIndex

- **WHEN** `%rowIndex` appears in a column `path`
- **THEN** it resolves to the iteration index defined by this capability and is
  not interpreted as a user-supplied `constant` value

### Requirement: Resolve %rowIndex to the innermost iteration index

`%rowIndex` SHALL resolve to the 0-based position of the current element within
the innermost active iteration introduced by `forEach` or `forEachOrNull`. When
the same `select` chain nests multiple iterations, `%rowIndex` SHALL reflect the
index of the nearest enclosing iteration, with each nesting level tracking its
own independent index.

#### Scenario: forEach exposes element position

- **WHEN** a `forEach: "name"` select evaluates `%rowIndex` over a Patient whose
  `name` collection has two entries
- **THEN** the first iterated row reports `0` and the second reports `1`

#### Scenario: forEachOrNull on a non-empty collection behaves like forEach

- **WHEN** a `forEachOrNull: "name"` select evaluates `%rowIndex` over a
  non-empty `name` collection
- **THEN** the rows report their 0-based positions `0`, `1`, ...

#### Scenario: forEachOrNull on an empty collection reports zero

- **WHEN** a `forEachOrNull: "name"` select evaluates `%rowIndex` for a resource
  whose `name` collection is empty, producing the single null-padded row
- **THEN** `%rowIndex` for that row reports `0`

#### Scenario: Nested forEach levels track independent indices

- **WHEN** an outer `forEach: "contact"` containing an inner `forEach: "telecom"`
  both evaluate `%rowIndex`
- **THEN** the outer column reports the contact's index and the inner column
  reports the telecom's index within that contact, each independent of the other

### Requirement: Resolve %rowIndex to zero when no iteration is active

`%rowIndex` SHALL resolve to `0` whenever it is evaluated outside any `forEach`,
`forEachOrNull`, or `repeat` iteration, including at the resource (top) level.

#### Scenario: Top-level %rowIndex is zero per resource

- **WHEN** a column at the resource level (no `forEach`) evaluates `%rowIndex`
- **THEN** every resource row reports `0`

### Requirement: Resolve %rowIndex within repeat traversal

When `%rowIndex` is evaluated inside a `repeat` select, it SHALL resolve to the
0-based position of the current element within the flattened depth-first
traversal produced by the recursive expansion, ordered so that each parent is
immediately followed by its descendants.

#### Scenario: repeat reports flattened traversal position

- **WHEN** a `repeat: ["item"]` select over a QuestionnaireResponse whose items
  form the depth-first sequence `1`, `1.1`, `1.2`, `2` evaluates `%rowIndex`
- **THEN** those rows report `0`, `1`, `2`, `3` respectively

### Requirement: Resolve %rowIndex independently within each unionAll branch

Within a `unionAll`, each branch SHALL resolve `%rowIndex` according to its own
iteration context. A branch that introduces its own `forEach` /
`forEachOrNull` / `repeat` SHALL report that iteration's index, while a branch
with no iteration of its own SHALL inherit `%rowIndex` from the enclosing
context (which is `0` when no enclosing iteration exists).

#### Scenario: Each iterating branch maintains its own sequence

- **WHEN** a `unionAll` contains one branch with `forEach: "name"` and another
  with `forEach: "contact"`, both evaluating `%rowIndex`
- **THEN** the rows from each branch report 0-based indices over that branch's
  own collection, independent of the other branch

#### Scenario: A non-iterating branch inherits the enclosing index

- **WHEN** a `unionAll` branch has no iteration expression of its own and
  evaluates `%rowIndex`
- **THEN** it reports the `%rowIndex` of the enclosing context - `0` at the top
  level, or the enclosing `forEach` index when nested inside one

#### Scenario: unionAll inside forEach mixes branch and inherited indices

- **WHEN** a `unionAll` nested inside `forEach: "contact"` contains an iterating
  branch (`forEach: "telecom"`) and a non-iterating branch, both evaluating
  `%rowIndex`
- **THEN** the iterating branch reports the telecom index while the
  non-iterating branch reports the enclosing contact index
