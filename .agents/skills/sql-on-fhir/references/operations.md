# SQL on FHIR HTTP operations

The FHIR operations for running ViewDefinitions and SQLQueries, plus the behaviour shared across them.

## Contents

- [Operation overview](#operation-overview)
- [Discovery](#discovery)
- [$viewdefinition-run](#viewdefinition-run)
- [$viewdefinition-export](#viewdefinition-export)
- [$sqlquery-run and $sqlquery-export](#sqlquery-run-and-sqlquery-export)
- [Shared: output formats](#shared-output-formats)
- [Shared: content negotiation](#shared-content-negotiation)
- [Shared: streaming and transfer encoding](#shared-streaming-and-transfer-encoding)
- [Shared: asynchronous delivery](#shared-asynchronous-delivery)
- [Error handling](#error-handling)

> Naming: these operations were renamed from the early drafts (`$run`/`$export`). Use the full names below.

## Operation overview

| Operation                | Sync/async | Target         | Purpose                                                                                |
| ------------------------ | ---------- | -------------- | -------------------------------------------------------------------------------------- |
| `$viewdefinition-run`    | sync       | ViewDefinition | Real-time evaluation; streamed tabular results. Authoring, debugging, live processing. |
| `$viewdefinition-export` | async      | ViewDefinition | Bulk export of view output to files (CSV/NDJSON/Parquet) in storage.                   |
| `$sqlquery-run`          | sync/async | SQLQuery       | Execute a shareable SQL query against materialised view tables.                        |
| `$sqlquery-export`       | async      | SQLQuery       | Bulk-export counterpart of `$sqlquery-run`.                                            |

Behaviour common to all four (output formats, return representation, content negotiation, transfer framing, async completion) is defined once and summarised in the shared sections below.

## Discovery

Servers MUST expose a `CapabilityStatement` at `/metadata` so clients can discover supported operations, ViewDefinitions, and output formats. Any format or reference style a server supports SHALL be documented there.

## $viewdefinition-run

Synchronous evaluation of a ViewDefinition into tabular rows. Invocable at type or instance level.

Endpoints:

```
GET  [base]/ViewDefinition/[id]/$run            # instance level (view inferred from path)
POST [base]/ViewDefinition/[id]/$run
GET  [base]/ViewDefinition/$run                 # type level (requires viewReference)
POST [base]/ViewDefinition/$run                 # type level (viewReference or viewResource)
```

### Parameters

| Name            | Type           | Scope          | Notes                                                                                                                           |
| --------------- | -------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `viewReference` | Reference      | type, instance | Reference to a ViewDefinition on the server. Required at type level if no `viewResource`. Inferred from path at instance level. |
| `viewResource`  | ViewDefinition | type           | Inline ViewDefinition. POST only. Mutually exclusive with `viewReference`.                                                      |
| `_format`       | code           | type, instance | `json`, `ndjson`, `csv`, `parquet`, `fhir`. Default `ndjson`.                                                                   |
| `header`        | boolean        | type, instance | Include CSV header row (default true); `csv` only.                                                                              |
| `patient`       | Reference      | type, instance | Restrict to the given patient's compartment.                                                                                    |
| `group`         | Reference      | type, instance | Restrict to members of the Group (repeatable).                                                                                  |
| `_since`        | instant        | type, instance | Include only resources modified after this time.                                                                                |
| `_limit`        | integer        | type, instance | Maximum rows to return.                                                                                                         |
| `resource`      | Resource       | type, instance | Inline FHIR resources to transform instead of server data (repeatable). POST only.                                              |
| `source`        | string         | type, instance | External data source (URI, bucket name, …).                                                                                     |
| `return`        | Binary         | output         | The transformed data as a raw stream (a `Parameters` resource when `_format=fhir`).                                             |

`viewReference` may be a relative URL (`ViewDefinition/123`), a canonical URL (optionally `|version`), or an absolute URL; servers choose which to support and document it.

A `resource` value that is a `Bundle` is **unwrapped** one level: the view runs against each `Bundle.entry[*].resource`, ignoring entries whose type does not match the view's `resource`. Discrete `resource` values and bundles may be mixed.

GET cannot carry `viewResource` or `resource` (no request body); use POST for inline views or resources.

### Example (instance-level GET, CSV)

```http
GET /ViewDefinition/patient-demographics/$run HTTP/1.1
Accept: text/csv
```

```http
HTTP/1.1 200 OK
Content-Type: text/csv
Transfer-Encoding: chunked

id,birthDate,family,given
pt-1,1990-01-15,Smith,John
pt-2,1985-03-22,Johnson,Mary
```

### Example (type-level POST, inline view, JSON)

```http
POST /ViewDefinition/$run HTTP/1.1
Accept: application/json
Content-Type: application/fhir+json

{
  "resourceType": "Parameters",
  "parameter": [
    {
      "name": "viewResource",
      "resource": {
        "resourceType": "ViewDefinition",
        "resource": "Patient",
        "select": [
          {
            "column": [
              { "name": "id", "type": "id", "path": "getResourceKey()" },
              { "name": "birthDate", "type": "date", "path": "birthDate" },
              { "name": "family", "type": "string", "path": "name.family" }
            ]
          }
        ]
      }
    }
  ]
}
```

Returns a JSON array of row objects.

## $viewdefinition-export

Asynchronous bulk export of one or more ViewDefinitions to files (CSV, NDJSON, Parquet) for analytics, reporting, or warehouse loading. Follows the [async delivery](#shared-asynchronous-delivery) pattern.

Endpoints:

```
POST [base]/$viewdefinition-export                    # system level
POST [base]/ViewDefinition/$viewdefinition-export     # type level
POST [base]/ViewDefinition/[id]/$viewdefinition-export# instance level
```

Supports the same filtering parameters as run (`patient`, `group`, `_since`) and `_format`. Multiple views can be exported in one job. The operation exposes start, status, cancel, and results endpoints.

## $sqlquery-run and $sqlquery-export

Execute a [SQLQuery](sql-query.md) Library against the tables materialised from its dependency ViewDefinitions and SQLViews. The server builds the views and runs the SQL; the client supplies any declared parameters.

Pass query parameters as a `Parameters` resource, binding each by name to the matching `Library.parameter`, using the `value[x]` that matches the declared type:

| Library.parameter.type | Parameters value |
| ---------------------- | ---------------- |
| string                 | valueString      |
| integer                | valueInteger     |
| date                   | valueDate        |
| dateTime               | valueDateTime    |
| boolean                | valueBoolean     |
| decimal                | valueDecimal     |

`$sqlquery-run` returns results synchronously; `$sqlquery-export` is the asynchronous counterpart for bulk reports and analytics. Both share the output-format and delivery behaviour below. Note `_format=fhir` is available on the run operations only, not the export operations.

## Shared: output formats

| `_format` | Native media type                | Shape                                                                                 |
| --------- | -------------------------------- | ------------------------------------------------------------------------------------- |
| `csv`     | `text/csv`                       | Header row (unless `header=false`), then one row per result row.                      |
| `json`    | `application/json`               | A single JSON array of row objects.                                                   |
| `ndjson`  | `application/x-ndjson`           | One JSON object per line.                                                             |
| `parquet` | `application/vnd.apache.parquet` | Apache Parquet file.                                                                  |
| `fhir`    | `application/fhir+json`          | A `Parameters` resource with one repeating `row` per result row. Run operations only. |

Conformance:

- RECOMMENDED to support `json`, `ndjson`, `csv`. `parquet` is optional; `fhir` is optional and run-only. Declare supported formats in the CapabilityStatement; reject unsupported ones with `400` + `OperationOutcome`.
- If `_format` is omitted and no format derives from `Accept`, the server SHALL use `ndjson`.
- `header` applies only to `csv` (default true).
- For `_format=fhir`, each row's columns become `part`s with the appropriate `value[x]`; SQL `NULL` omits the `part`; no rows → a `Parameters` with no parameters.

## Shared: content negotiation

Two independent axes:

- **Axis 1 - which format.** `_format` takes precedence over `Accept`. If `_format` is absent, the server MAY use `Accept` to choose a format; if neither selects one, it uses `ndjson`.
- **Axis 2 - representation (flat formats only).** Once a flat format is chosen, `Accept` selects how it is wrapped:
  - native media type, `application/octet-stream`, or no `Accept` → the **raw payload** (default).
  - `application/fhir+json`/`+xml` → a serialised `Binary` resource whose `data` is the base64-encoded payload.

`Binary` here means a binary stream, not a serialised `Binary` envelope by default. Servers MAY decline the envelope form for large/streaming formats (`parquet`, `ndjson`), responding `406 Not Acceptable` + `OperationOutcome`. When the format is `fhir`, the response is always the `Parameters` resource and Axis 2 does not apply.

## Shared: streaming and transfer encoding

Applies to the synchronous run operations. Two independent concepts:

1. **Transfer framing** - `Transfer-Encoding: chunked` is an HTTP framing choice, independent of format; any payload MAY be chunked.
2. **Incremental production** - whether output can be emitted before the full result set materialises (trivial for NDJSON/CSV; JSON needs bracket bookkeeping; Parquet finalises its footer last). This is independent of chunked framing.

## Shared: asynchronous delivery

The export operations follow the [FHIR Asynchronous Bulk Data Request Pattern](https://www.hl7.org/fhir/async-bulk.html):

1. **Kick-off** with `Prefer: respond-async` → `202 Accepted` with a `Content-Location` status (polling) URL.
2. **Poll while processing** → `202 Accepted`, optionally with `Retry-After` and `X-Progress`, and an optional interim body.
3. **Completion** → `200 OK` whose body is the manifest as a FHIR `Parameters` resource (`exportId`, `status`, `_format`, timing parameters, and repeating `output` entries carrying `location` download URLs). The manifest is returned in the status-poll body - no `303` redirect.
4. **Failure** → the relevant error status with an `OperationOutcome` body.

The one deliberate deviation from the bulk-data pattern: the manifest is a `Parameters` resource rather than the Bulk Data JSON manifest object. File downloads at `output.location` are ordinary HTTP responses.

## Error handling

All error responses (4xx/5xx) SHOULD carry an `OperationOutcome`.

| Status | When                                                                  |
| ------ | --------------------------------------------------------------------- |
| 200    | Success; results returned.                                            |
| 202    | Async job accepted / still processing.                                |
| 400    | Invalid, unsupported, or malformed parameters (incl. unknown format). |
| 404    | ViewDefinition (or referenced patient/group) not found.               |
| 406    | Requested representation not acceptable (e.g. envelope for parquet).  |
| 422    | Valid request but the ViewDefinition is invalid/unprocessable.        |
| 500    | Unexpected error during processing.                                   |
