# mlld Python SDK

Python wrapper for mlld using a persistent NDJSON RPC transport over `mlld live --stdio`.

## Installation

```bash
pip install mlld-sdk
```

## Development

For local SDK work, use an editable install so changes in `mlld.py` apply immediately:

```bash
uv pip install -e /path/to/mlld/sdk/python
```

If you are already in the repo root, `uv pip install -e ./sdk/python` works too.

## Requirements

- Python 3.10+
- Node.js runtime
- mlld CLI available by command path

## Quick Start

```python
from mlld import Client

client = Client()

# Optional command override and process heap configuration
# client = Client(command='node', command_args=['./dist/cli.cjs'], heap='8g')

output = client.process('show "Hello World"')
print(output)

result = client.execute(
    './agent.mld',
    {'text': 'hello'},
    state={'count': 0},
    dynamic_modules={
        '@config': {'mode': 'demo'}
    },
    timeout=10,
)
print(result.output)

client.close()
```

## MCP Server Injection

Pass per-execution MCP server commands so each parallel call gets its own server instance:

```python
result = client.execute(
    './agent.mld',
    payload,
    mcp_servers={
        'tools': f'uv run python3 mcp_server.py {config_b64}'
    },
)
```

In the mlld script, `import tools from mcp "tools" as @mcp` resolves `"tools"` to the command provided by the SDK. Each `execute()` call gets an independent server lifecycle.

## Filesystem Integrity

```python
from mlld import Client

client = Client()

signed = client.sign("docs/note.txt", identity="user:alice")
verified = client.verify("docs/note.txt")
content_sig = client.sign_content(
    "runtime payload",
    "user:alice",
    signature_id="payload-1",
    metadata={"channel": "sdk"},
)

handle = client.execute_async("./agent.mld", state={"exit": False})
file_sig = handle.write_file("out.txt", "hello from sdk")
handle.update_state("exit", True)
handle.result()
```

`client.sign_content()` stores signatures under `.sig/content/`. `ExecuteHandle.write_file()` writes relative to the executing script and auto-signs the output as `agent:{script}` with provenance metadata from the live request.

## In-Flight State Updates

```python
handle = client.process_async(
    'loop(99999, 50ms) until @state.exit [\n  continue\n]\nshow "done"',
    state={'exit': False},
    mode='strict',
    timeout=10,
)

time.sleep(0.12)
handle.update_state('exit', True)
print(handle.result())
```

## API

### Client

- `Client(command='mlld', command_args=None, heap=None, heap_snapshot_near_limit=None, timeout=30.0, working_dir=None)`
- `process(script, *, file_path=None, payload=None, payload_labels=None, state=None, dynamic_modules=None, dynamic_module_source=None, mode=None, allow_absolute_paths=None, trace=None, trace_memory=None, trace_file=None, trace_stderr=None, timeout=None, mcp_servers=None)`
- `process_async(...) -> ProcessHandle`
- `execute(filepath, payload=None, *, payload_labels=None, state=None, dynamic_modules=None, dynamic_module_source=None, allow_absolute_paths=None, mode=None, trace=None, trace_memory=None, trace_file=None, trace_stderr=None, timeout=None, mcp_servers=None)`
- `execute_async(...) -> ExecuteHandle`
- `analyze(filepath)`
- `sign(path, *, identity=None, metadata=None, base_path=None, timeout=None) -> FileVerifyResult`
- `verify(path, *, base_path=None, timeout=None) -> FileVerifyResult`
- `sign_content(content, identity, *, metadata=None, signature_id=None, base_path=None, timeout=None) -> ContentSignature`
- `fs_status(glob=None, *, base_path=None, timeout=None) -> list[FilesystemStatus]`
- `close()`

### Handle Methods

`ProcessHandle` and `ExecuteHandle` both provide:

- `request_id`
- `cancel()`
- `update_state(path, value, *, labels=None, timeout=None)`
- `next_event(timeout=None) -> HandleEvent | None`
- `wait()`
- `result()`

`ExecuteHandle` also provides:

- `write_file(path, content, *, timeout=None) -> FileVerifyResult`

### Module-level Convenience Functions

- `mlld.process(...)`
- `mlld.process_async(...)`
- `mlld.execute(...)`
- `mlld.execute_async(...)`
- `mlld.analyze(...)`
- `mlld.sign(...)`
- `mlld.verify(...)`
- `mlld.sign_content(...)`
- `mlld.fs_status(...)`

## Security Labels

Attach labels to payload fields for mlld's taint tracking:

```python
from mlld import execute, trusted, untrusted, labeled

result = execute("script.mld", {
    "config": trusted({"mode": "safe"}),
    "user_input": untrusted(raw_input),
    "data": labeled(value, "pii", "sensitive"),
})
```

`labeled(value, *labels)` wraps a value with security labels. `trusted(value)` and `untrusted(value)` are shortcuts. The SDK extracts labels into `payload_labels` automatically.

## Notes

- Each `Client` keeps one live RPC subprocess for repeated calls.
- `ExecuteResult.state_writes` merges final-result writes and streamed `state:write` events.
- `ExecuteResult.denials` collects structured guard/policy label-flow denials seen during execution.
- `ExecuteResult.effects` contains output effects with security metadata.
- `ExecuteResult.metrics` contains timing statistics (`total_ms`, `parse_ms`, `evaluate_ms`).
- `handle.next_event()` yields `HandleEvent` with type `"state_write"`, `"session_write"`, `"guard_denial"`, `"trace_event"`, or `"complete"`.
- `trace_memory=True` enables `memory.*` runtime trace events for that request; use `trace_file` to persist them as JSONL.
- `heap` and `heap_snapshot_near_limit` are process-scoped `Client` options and apply when the live subprocess starts.
- Sync methods are wrappers around async handle methods.
