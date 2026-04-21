# SDK Interface Specification

Canonical interface for all mlld language SDKs. This spec is the authority - if an implementation conflicts with this document, the spec wins.

Every SDK (Go, Python, Rust, Ruby, Elixir, JS/TS) must implement this interface. Language-specific idioms (naming conventions, error handling, async patterns) may vary, but the operations, parameters, and return structures must be equivalent.

The JS/TS codebase is the mlld runtime. All other SDKs wrap the `mlld live --stdio` NDJSON RPC transport. Features that require in-process access (VirtualFS, debug tracing, streaming format events) are JS/TS-only and out of scope for this spec.

Elixir-specific extensions are called out in [Elixir Extensions](#elixir-extensions).

## Table of Contents

- [Implementation Model](#implementation-model)
- [Transport Protocol](#transport-protocol)
- [Client Lifecycle](#client-lifecycle)
- [Core Operations](#core-operations)
- [Async Operations](#async-operations)
- [Handle Lifecycle](#handle-lifecycle)
- [Handle API](#handle-api)
- [Filesystem Operations](#filesystem-operations)
- [Label Helpers](#label-helpers)
- [Module-Level Convenience Functions](#module-level-convenience-functions)
- [Types](#types)
- [Parity Fixtures](#parity-fixtures)
- [Elixir Extensions](#elixir-extensions)

---

## Implementation Model

The spec defines one SDK contract, but the current codebase implements it through two execution models:

1. **JS/TS in-process runtime**
   - The JS/TS SDK executes directly against runtime modules in this repository.
   - Long-running executions are represented by `StreamExecution`, an async iterable that exposes event consumption plus live `updateState` and `writeFile` control.
   - JS/TS also exposes runtime-only capabilities such as VirtualFS, debug tracing, and richer streaming events.

2. **Transport-wrapping SDKs**
   - Go, Python, Rust, Ruby, and Elixir each keep one lazy `mlld live --stdio` subprocess per client.
   - Requests are multiplexed over NDJSON using integer request ids.
   - Async handles buffer `state:write` and `guard_denial` events, merge them into final results, and expose per-request control (`cancel`, `update_state`, `next_event`, `write_file`).

The required semantics are the same across both models even when the surface syntax differs. In particular, JS/TS uses `StreamExecution` event iteration where the wrapper SDKs use synchronous `next_event`.

---

## Transport Protocol

All SDKs (except JS/TS) communicate with the mlld runtime via a persistent `mlld live --stdio` subprocess using NDJSON over stdin/stdout.

### Request Format

```json
{ "id": 1, "method": "execute", "params": { ... } }
```

### Response Format

Responses always wrap the payload under a `result` key:

```json
{ "id": 1, "result": { ... } }
```

Error responses:

```json
{ "id": 1, "error": { "code": "TIMEOUT", "message": "..." } }
```

### Event Format

Events are emitted during in-flight executions:

```json
{ "event": { "requestId": 1, "type": "state:write", ... } }
```

Event types on the wire:
- `state:write` - a state:// write occurred
- `session_write` - a session slot write committed
- `guard_denial` - a guard/policy denied an operation
- `trace_event` - a runtime trace event was emitted
- `result` - execution completed (carries final payload)

### Envelope Rule

Every successful response has exactly one shape:

```json
{ "id": <int>, "result": <payload> }
```

Every error response has exactly one shape:

```json
{ "id": <int>, "error": { "code": <string>, "message": <string> } }
```

The `result` field always contains the complete response payload. The server never spreads payload fields into the top-level envelope, never special-cases payloads that happen to contain an `id` field, and never conditionally wraps in `{ "value": ... }`. SDKs always read `response.result` or `response.error` — no method-specific unwrapping, no conditional paths.

---

## Client Lifecycle

### Constructor

Create a client wrapping a persistent `mlld live --stdio` subprocess.

**Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| command | string | `"mlld"` | CLI command to invoke |
| command_args | string[] | `[]` | Extra args before `live --stdio` |
| heap | string \| int? | null | Process-scoped Node heap limit for the mlld subprocess, e.g. `"8g"` or `8192` |
| heap_snapshot_near_limit | int? | null | Process-scoped V8 heap snapshot count near the heap limit |
| timeout | duration | 30s | Default timeout for all operations |
| working_dir | string? | null | Working directory for script execution |

The subprocess is spawned lazily on first use, not at construction.

Transport-wrapping SDKs apply heap options when spawning the subprocess, before `live --stdio`. When `command` is the `mlld` wrapper, pass wrapper flags such as `--mlld-heap=<value>` and `--heap-snapshot-near-limit <n>`. When `command` is `node`, pass V8 flags before the CLI entrypoint. JS/TS runs in the host Node process, so heap cannot be changed per request or after startup; launch the host process with Node heap flags or `NODE_OPTIONS`.

### close

Terminate the subprocess and release resources. Idempotent.

---

## Core Operations

### process

Execute an mlld script string and return text output.

```
process(script, options?) -> string
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| script | string | yes | mlld script source |
| file_path | string? | no | Path context for relative imports |
| payload | any? | no | Injected as `@payload` |
| payload_labels | map[string, string[]]? | no | Per-field security labels for payload |
| state | map[string, any]? | no | Injected as `@state` |
| dynamic_modules | map[string, any]? | no | Injected as importable modules |
| dynamic_module_source | string? | no | Source label for dynamic modules |
| mode | "strict" \| "markdown"? | no | Parsing mode |
| allow_absolute_paths | bool? | no | Allow absolute path access |
| trace | string? | no | Runtime trace level (`"handle"`, `"effects"`, or `"verbose"`) |
| trace_memory | bool? | no | Include `memory.*` runtime trace events; implies effects tracing when `trace` is omitted |
| trace_file | string? | no | Write runtime trace events as JSONL |
| trace_stderr | bool? | no | Mirror runtime trace events to stderr |
| timeout | duration? | no | Override client default |
| mcp_servers | map[string, string]? | no | Logical name to MCP server command |

**Returns:** Script output as string.

### execute

Run an mlld file with a payload and return structured result.

```
execute(filepath, payload?, options?) -> ExecuteResult
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| filepath | string | yes | Path to .mld file |
| payload | any? | no | Injected as `@payload` |
| payload_labels | map[string, string[]]? | no | Per-field security labels for payload |
| state | map[string, any]? | no | Injected as `@state` |
| dynamic_modules | map[string, any]? | no | Injected as importable modules |
| dynamic_module_source | string? | no | Source label for dynamic modules |
| mode | "strict" \| "markdown"? | no | Parsing mode |
| allow_absolute_paths | bool? | no | Allow absolute path access |
| trace | string? | no | Runtime trace level (`"handle"`, `"effects"`, or `"verbose"`) |
| trace_memory | bool? | no | Include `memory.*` runtime trace events; implies effects tracing when `trace` is omitted |
| trace_file | string? | no | Write runtime trace events as JSONL |
| trace_stderr | bool? | no | Mirror runtime trace events to stderr |
| timeout | duration? | no | Override client default |
| mcp_servers | map[string, string]? | no | Logical name to MCP server command |

**Returns:** `ExecuteResult` (see [Types](#types)).

### analyze

Static analysis of an mlld module without execution.

```
analyze(filepath) -> AnalyzeResult
```

**Returns:** `AnalyzeResult` (see [Types](#types)).

---

## Async Operations

### process_async

Start a script execution and return a handle for in-flight control.

```
process_async(script, options?) -> ProcessHandle
```

Same parameters as `process`. Returns a `ProcessHandle`.

### execute_async

Start a file execution and return a handle for in-flight control.

```
execute_async(filepath, payload?, options?) -> ExecuteHandle
```

Same parameters as `execute`. Returns an `ExecuteHandle`.

---

## Handle Lifecycle

Handles follow a three-state lifecycle. All SDKs must implement this state machine.

```
PENDING -> STREAMING -> COMPLETE
```

**PENDING**: Handle created, execution started, no events received yet.

**STREAMING**: Events are arriving from the transport. `next_event` returns them in FIFO order. `update_state` and `write_file` are valid.

**COMPLETE**: Final result received. `next_event` returns the `complete` event once, then returns null forever. `result()`/`wait()` return immediately. `update_state` and `write_file` error.

### Rules

1. Events are buffered in FIFO order. If nobody calls `next_event`, they accumulate until `result()` is called.
2. `result()` can be called at any time — it blocks until COMPLETE, then returns the final result. Uncollected events are discarded.
3. `next_event` and `result()` can be interleaved — consume some events, then call `result()` to get the final answer.
4. After `result()` returns, `next_event` returns null. The event stream is drained.
5. State writes and guard denials from events are merged into the final `ExecuteResult` regardless of whether `next_event` was called. Session writes remain event-stream only; final session state is reported through `ExecuteResult.sessions`.
6. `cancel()` is valid in any state before COMPLETE.

### Terminal Semantics

Behavior of each method after the handle reaches terminal states:

| Method | After COMPLETE | After cancellation | After execution timeout |
|--------|---------------|-----------------|---------------|
| `next_event` | Returns null | Returns null | Returns null |
| `result()` / `wait()` | Returns cached result (idempotent) | Returns error (cancelled) | Returns error (timeout) |
| `cancel()` | No-op | No-op | No-op |
| `update_state` | Returns error | Returns error | Returns error |
| `write_file` | Returns error | Returns error | Returns error |

- A per-call `next_event(timeout?)` poll timeout while the handle is still active is not terminal. It only returns null for that call and leaves the handle in `PENDING` or `STREAMING`.
- `result()` is idempotent — calling it multiple times after COMPLETE returns the same value.
- After `cancel()`, the handle transitions to COMPLETE with an error result. Pending events may still arrive before the cancellation takes effect; they are buffered normally.
- After a timeout, the handle transitions to COMPLETE with a timeout error. The SDK sends a cancel to the transport and cleans up.
- Errors from `update_state` and `write_file` after terminal states are SDK-specific (exception, error return, etc.) but must not silently succeed.

---

## Handle API

Both `ProcessHandle` and `ExecuteHandle` share a common base interface. `ExecuteHandle` adds `write_file`.

Implementation note: Go, Python, Rust, Ruby, and Elixir expose the handle API directly. JS/TS maps the same lifecycle semantics onto `StreamExecution`, which provides async event iteration instead of a synchronous `next_event` method.

### Common Handle Methods

#### request_id

The unique identifier for this in-flight request. Read-only property.

```
handle.request_id -> int
```

#### cancel

Request graceful cancellation of the in-flight execution.

```
handle.cancel() -> void
```

#### update_state

Send a live state mutation to the in-flight execution. Updates `@state` at the given path.

```
handle.update_state(path, value, labels?, timeout?) -> void
```

| Name | Type | Required | Description |
|------|------|----------|-------------|
| path | string | yes | Dot-separated state path |
| value | any | yes | New value |
| labels | string[]? | no | Security labels to attach |
| timeout | duration? | no | Override default |

#### next_event

Block until the next event from the in-flight execution. Returns null/none on timeout.

```
handle.next_event(timeout?) -> HandleEvent?
```

Events are delivered in order. Event types:

| Type | Description | Payload |
|------|-------------|---------|
| `"state_write"` | A state:// write occurred | `StateWrite` |
| `"session_write"` | A session slot write committed | `SessionWrite` |
| `"guard_denial"` | A guard/policy denied an operation | `GuardDenial` |
| `"trace_event"` | A runtime trace event was emitted | `TraceEvent` |
| `"complete"` | Execution finished | none |

#### wait / result

Block until execution completes and return the final result.

```
ProcessHandle.wait() -> string
ProcessHandle.result() -> string

ExecuteHandle.wait() -> ExecuteResult
ExecuteHandle.result() -> ExecuteResult
```

`wait` and `result` are aliases.

### ExecuteHandle Extensions

#### write_file

Write a file within the active execution context. The file is auto-signed with provenance metadata from the live request.

```
handle.write_file(path, content, timeout?) -> FileVerifyResult
```

| Name | Type | Required | Description |
|------|------|----------|-------------|
| path | string | yes | File path to write |
| content | string | yes | File content |
| timeout | duration? | no | Override default |

---

## Filesystem Operations

These methods provide cryptographic signing and integrity verification for files in an mlld project. They operate on the `.sig/` directory managed by the mlld runtime.

### fs_status

Query filesystem signature/integrity status for tracked files.

```
client.fs_status(glob?, base_path?, timeout?) -> FilesystemStatus[]
```

| Name | Type | Required | Description |
|------|------|----------|-------------|
| glob | string? | no | Filter pattern (e.g. `"src/**/*.mld"`) |
| base_path | string? | no | Project-relative resolution base |
| timeout | duration? | no | Override default |

### sign

Sign a file and return its verification status.

```
client.sign(path, identity?, metadata?, base_path?, timeout?) -> FileVerifyResult
```

| Name | Type | Required | Description |
|------|------|----------|-------------|
| path | string | yes | File to sign |
| identity | string? | no | Signer identity (defaults to server resolution) |
| metadata | map[string, any]? | no | Metadata to persist with signature |
| base_path | string? | no | Project-relative resolution base |
| timeout | duration? | no | Override default |

### verify

Verify a file's signature and return its status.

```
client.verify(path, base_path?, timeout?) -> FileVerifyResult
```

### sign_content

Sign runtime content and persist in the project's `.sig/content/` store.

```
client.sign_content(content, identity, metadata?, signature_id?, base_path?, timeout?) -> ContentSignature
```

| Name | Type | Required | Description |
|------|------|----------|-------------|
| content | string | yes | Content to sign |
| identity | string | yes | Signer identity |
| metadata | map[string, string]? | no | Metadata to persist |
| signature_id | string? | no | Stable ID for the signature |
| base_path | string? | no | Project-relative resolution base |
| timeout | duration? | no | Override default |

---

## Label Helpers

Convenience functions for attaching security labels to payload values. These wrap values so the SDK can extract and send per-field labels via the `payload_labels` parameter.

### labeled

Attach one or more labels to a value.

```
labeled(value, *labels) -> LabeledValue
```

### trusted

Shortcut for `labeled(value, "trusted")`.

```
trusted(value) -> LabeledValue
```

### untrusted

Shortcut for `labeled(value, "untrusted")`.

```
untrusted(value) -> LabeledValue
```

When a payload dict/map contains `LabeledValue` entries, the SDK must:
1. Extract the raw value for the payload
2. Collect the labels into the `payload_labels` map
3. Send both to the transport

---

## Module-Level Convenience Functions (RECOMMENDED)

SDKs should provide module-level functions that use a lazily-initialized default client, cleaned up on process exit. This is RECOMMENDED, not required - implementations should follow language-idiomatic patterns for singletons and lifecycle management.

```
process(script, **options) -> string
process_async(script, **options) -> ProcessHandle
execute(filepath, payload?, **options) -> ExecuteResult
execute_async(filepath, payload?, **options) -> ExecuteHandle
analyze(filepath) -> AnalyzeResult
fs_status(glob?, **options) -> FilesystemStatus[]
sign(path, **options) -> FileVerifyResult
verify(path, **options) -> FileVerifyResult
sign_content(content, identity, **options) -> ContentSignature
close() -> void
labeled(value, *labels) -> LabeledValue
trusted(value) -> LabeledValue
untrusted(value) -> LabeledValue
```

---

## Types

### ExecuteResult

| Field | Type | Description |
|-------|------|-------------|
| output | string | Text output from execution |
| state_writes | StateWrite[] | All state:// writes (merged: streamed + final) |
| sessions | SessionFinalState[] | Final state for each attached session frame |
| exports | any | Exported values (array or map) |
| effects | Effect[] | Output effects |
| denials | GuardDenial[] | Guard/policy denials observed during execution |
| trace_events | TraceEvent[] | Runtime trace events emitted during execution |
| metrics | Metrics? | Execution timing statistics |

### StateWrite

| Field | Type | Description |
|-------|------|-------------|
| path | string | State path (e.g. `"result"`, `"tool_result.status"`) |
| value | any | The value (JSON strings auto-decoded to structures) |
| timestamp | string? | ISO timestamp |
| security | map? | Security metadata |

### SessionFinalState

| Field | Type | Description |
|-------|------|-------------|
| frame_id | string | Stable per-frame identifier |
| declaration_id | string | Stable session declaration identity |
| name | string | Canonical declaration name |
| origin_path | string? | Source path where the declaration lives |
| final_state | map | Final slot values for the frame |

### SessionWrite

| Field | Type | Description |
|-------|------|-------------|
| frame_id | string | Stable per-frame identifier |
| session_name | string | Canonical declaration name |
| declaration_id | string | Stable session declaration identity |
| origin_path | string? | Source path where the declaration lives |
| slot_path | string | Written slot or nested slot path |
| operation | string | `seed`, `set`, `write`, `update`, `append`, `increment`, or `clear` |
| prev | any | Previous value after redaction, when present |
| next | any | Next value after redaction, when present |

### GuardDenial

| Field | Type | Description |
|-------|------|-------------|
| guard | string? | Guard name |
| operation | string | Operation that was denied |
| reason | string | Human-readable denial reason |
| rule | string? | Specific rule that triggered denial |
| labels | string[] | Labels involved in denial |
| args | map? | Operation arguments |

### Effect

| Field | Type | Description |
|-------|------|-------------|
| type | string | Effect type |
| content | string? | Effect content |
| security | map? | Security metadata |

### Metrics

| Field | Type | Description |
|-------|------|-------------|
| total_ms | float | Total execution time |
| parse_ms | float | Parse phase time |
| evaluate_ms | float | Evaluation phase time |

### HandleEvent

| Field | Type | Description |
|-------|------|-------------|
| type | string | `"state_write"`, `"session_write"`, `"guard_denial"`, `"trace_event"`, or `"complete"` |
| state_write | StateWrite? | Present when type is `"state_write"` |
| session_write | SessionWrite? | Present when type is `"session_write"` |
| guard_denial | GuardDenial? | Present when type is `"guard_denial"` |
| trace_event | TraceEvent? | Present when type is `"trace_event"` |

### AnalyzeResult

| Field | Type | Description |
|-------|------|-------------|
| filepath | string | Absolute path to analyzed file |
| valid | bool | Whether the module is valid |
| errors | AnalysisError[] | Parse/analysis errors |
| executables | Executable[] | Executable definitions |
| exports | string[] | Exported names |
| imports | Import[] | Import statements |
| guards | Guard[] | Guard definitions |
| needs | Needs? | Capability requirements |

### AnalysisError

| Field | Type | Description |
|-------|------|-------------|
| message | string | Error description |
| line | int? | Line number |
| column | int? | Column number |

### Executable

| Field | Type | Description |
|-------|------|-------------|
| name | string | Executable name |
| params | string[] | Parameter names |
| labels | string[] | Security labels |

### Import

| Field | Type | Description |
|-------|------|-------------|
| from | string | Source module |
| names | string[] | Imported names |

### Guard

| Field | Type | Description |
|-------|------|-------------|
| name | string | Guard name |
| timing | string | `"before"`, `"after"`, or `"always"` |
| trigger | string | What activates the guard - a label (`secret`, `pii`) or operation pattern (`net:w`, `op:show`, `tool:w`) |

### Needs

| Field | Type | Description |
|-------|------|-------------|
| cmd | string[] | Required shell commands |
| node | string[] | Required Node.js packages |
| py | string[] | Required Python packages |

### FilesystemStatus

| Field | Type | Description |
|-------|------|-------------|
| path | string | Absolute path |
| relative_path | string | Project-relative path |
| status | string | Status code |
| verified | bool | Whether signature is valid |
| signer | string? | Identity of signer |
| labels | string[] | Security labels |
| taint | string[] | Taint labels |
| signed_at | string? | ISO timestamp |
| error | string? | Error message if verification failed |

### FileVerifyResult

| Field | Type | Description |
|-------|------|-------------|
| path | string | Absolute path |
| relative_path | string | Project-relative path |
| status | string | Status code |
| verified | bool | Whether signature is valid |
| signer | string? | Identity of signer |
| signed_at | string? | ISO timestamp |
| hash | string? | Current content hash |
| expected_hash | string? | Expected hash from signature |
| metadata | map? | Signature metadata |
| error | string? | Error message |

### ContentSignature

| Field | Type | Description |
|-------|------|-------------|
| id | string | Signature identifier |
| hash | string | Content hash |
| algorithm | string | Hash algorithm used |
| signed_by | string | Signer identity |
| signed_at | string | ISO timestamp |
| content_length | int | Content length in bytes |
| metadata | map[string, string]? | Signature metadata |

### LabeledValue

| Field | Type | Description |
|-------|------|-------------|
| value | any | The wrapped value |
| labels | string[] | Security labels |

Immutable/frozen. Used in payload dicts to attach per-field labels.

### Error

SDK-specific error type with:

| Field | Type | Description |
|-------|------|-------------|
| message | string | Human-readable error message |
| code | string? | Machine-readable error code (e.g. `"TIMEOUT"`, `"TRANSPORT_ERROR"`) |

---

## Parity Fixtures

To prevent transport schema drift, shared fixture files live in `sdk/fixtures/`. Each fixture is a JSON file representing a wire-format response for a specific RPC method.

Every transport-wrapping SDK must include a test that loads these fixtures and round-trips them through its type system. If a field appears in the fixture that the SDK doesn't decode, the test fails.

JS/TS does not deserialize these payloads through a wrapper client, so it should cover the same schema through live server/runtime tests rather than a wrapper-level fixture harness.

### Fixture files

```
sdk/fixtures/
|- execute-result.json        # Full ExecuteResult with all fields populated
|- analyze-result.json        # AnalyzeResult with executables, guards, imports
|- state-write-event.json     # state:write event with security metadata
|- guard-denial-event.json    # guard_denial event with all fields
|- trace-event.json           # trace_event with scope and data
|- fs-status-result.json      # fs_status response array
|- sign-result.json           # sign/verify FileVerifyResult
|- sign-content-result.json   # sign_content ContentSignature
`- error-result.json          # Error response
```

When the protocol gains a new field, add it to the relevant fixture. All SDKs that don't handle it will fail their parity tests.

Future: these fixtures may be accompanied by a JSON Schema for each response type.

---

## Elixir Extensions

Elixir's BEAM runtime enables features not possible in other SDK languages. These are in addition to the full spec above.

### OTP Integration

- **GenServer client**: `Client` is a GenServer process with `start_link/1` and `child_spec/1`
- **Named registration**: Supports `:name` option for process discovery in supervision trees
- **Supervision**: Clients can be placed directly in supervision trees

### Connection Pooling

`Mlld.Pool` provides a pool of client processes with checkout/checkin semantics.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| size | int | 5 | Number of persistent workers |
| overflow | int | 0 | Additional workers under load |

### Telemetry

Emits standard `:telemetry` events:

| Event | Description |
|-------|-------------|
| `[:mlld, :process, :start \| :stop \| :exception]` | Process lifecycle |
| `[:mlld, :execute, :start \| :stop \| :exception]` | Execute lifecycle |
| `[:mlld, :transport, :restart]` | Transport recovery |

### Event Subscriptions

Alternative to `next_event` for OTP-style message passing:

```
Client.subscribe(client, request_id, subscriber_pid) -> :ok
Client.unsubscribe(client, request_id, subscriber_pid) -> :ok
```

Subscribers receive `{:mlld_event, request_id, event}` messages in their mailbox.

Elixir must also implement the spec-required `next_event` on handles for cross-language consistency.

### Task Integration

```
Client.process_task(client, script, opts) -> Task.t()
Client.execute_task(client, filepath, payload, opts) -> Task.t()
```

Returns an Elixir `Task` for integration with `Task.await`, `Task.yield`, and supervision.

### Phoenix Channel Bridge

`Mlld.Phoenix.stream_execute/3` bridges streaming execution events to Phoenix channels for real-time browser updates.
