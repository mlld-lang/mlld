# mlld Python SDK

Python wrapper for mlld using a persistent NDJSON RPC transport over `mlld live --stdio`.

## Installation

```bash
pip install mlld-sdk
```

## Requirements

- Python 3.10+
- Node.js runtime
- mlld CLI available by command path

## Quick Start

```python
from mlld import Client

client = Client()

# Optional command override (local repo build example)
# client = Client(command='node', command_args=['./dist/cli.cjs'])

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

- `Client(command='mlld', command_args=None, timeout=30.0, working_dir=None)`
- `process(script, *, file_path=None, payload=None, state=None, dynamic_modules=None, dynamic_module_source=None, mode=None, allow_absolute_paths=None, timeout=None)`
- `process_async(...) -> ProcessHandle`
- `execute(filepath, payload=None, *, state=None, dynamic_modules=None, dynamic_module_source=None, allow_absolute_paths=None, mode=None, timeout=None)`
- `execute_async(...) -> ExecuteHandle`
- `analyze(filepath)`
- `close()`

### Handle Methods

`ProcessHandle` and `ExecuteHandle` both provide:

- `request_id`
- `cancel()`
- `update_state(path, value, *, timeout=None)`
- `wait()`
- `result()`

### Module-level Convenience Functions

- `mlld.process(...)`
- `mlld.process_async(...)`
- `mlld.execute(...)`
- `mlld.execute_async(...)`
- `mlld.analyze(...)`

## Notes

- Each `Client` keeps one live RPC subprocess for repeated calls.
- `ExecuteResult.state_writes` merges final-result writes and streamed `state:write` events.
- Sync methods remain as wrappers around async handle methods.
