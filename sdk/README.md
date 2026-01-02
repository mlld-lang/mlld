# mlld SDKs

Thin wrappers around the mlld CLI for Go, Python, and Rust.

## Philosophy

These SDKs wrap the mlld CLI rather than reimplementing it. This gives you:

- **100% feature parity** - Every feature works, including JS/Node/Python code blocks
- **Zero maintenance burden** - As mlld evolves, you get new features automatically
- **Battle-tested** - Uses the same implementation as the CLI
- **Tiny footprint** - Each SDK is ~200-300 lines of code

The tradeoff is requiring Node.js at runtime. For most use cases, this is fine.

## Installation

### Go

```bash
go get github.com/mlld-lang/mlld-go
```

### Python

```bash
pip install mlld
```

### Rust

```toml
[dependencies]
mlld = "0.1"
```

## Quick Start

### Go

```go
import "github.com/mlld-lang/mlld-go"

client := mlld.New()

// Process a script
output, _ := client.Process(`/var @x = 1
/show @x`, nil)

// Execute a file with payload
result, _ := client.Execute("./agent.mld", map[string]any{
    "text": "hello",
}, &mlld.ExecuteOptions{
    State: map[string]any{"count": 0},
})

// Static analysis
analysis, _ := client.Analyze("./module.mld")
```

### Python

```python
from mlld import Client

client = Client()

# Process a script
output = client.process('/var @x = 1\n/show @x')

# Execute a file with payload
result = client.execute('./agent.mld', {'text': 'hello'}, state={'count': 0})

# Static analysis
analysis = client.analyze('./module.mld')
```

### Rust

```rust
use mlld::Client;

let client = Client::new();

// Process a script
let output = client.process("/var @x = 1\n/show @x", None)?;

// Execute a file with payload
let result = client.execute(
    "./agent.mld",
    Some(serde_json::json!({"text": "hello"})),
    Some(ExecuteOptions {
        state: Some(serde_json::json!({"count": 0})),
        ..Default::default()
    }),
)?;

// Static analysis
let analysis = client.analyze("./module.mld")?;
```

## API

All three SDKs provide the same core API:

| Method | Description |
|--------|-------------|
| `process(script)` | Execute a script string, return output |
| `execute(filepath, payload, opts)` | Run a file with payload/state |
| `analyze(filepath)` | Static analysis without execution |

### ProcessOptions

| Option | Type | Description |
|--------|------|-------------|
| `file_path` | string | Context for relative imports |
| `format` | string | Output format ("text" or "json") |
| `timeout` | duration | Override default timeout |

### ExecuteOptions

| Option | Type | Description |
|--------|------|-------------|
| `state` | object | Injected as `@state` |
| `dynamic_modules` | object | Additional modules to inject |
| `timeout` | duration | Override default timeout |

### ExecuteResult

| Field | Type | Description |
|-------|------|-------------|
| `output` | string | Script output |
| `state_writes` | array | Writes to `state://` protocol |
| `exports` | object | Exported variables |
| `metrics` | object | Timing and counts |

### AnalyzeResult

| Field | Type | Description |
|-------|------|-------------|
| `filepath` | string | Analyzed file |
| `valid` | bool | Parse success |
| `errors` | array | Parse errors |
| `executables` | array | Defined functions |
| `exports` | array | Exported names |
| `imports` | array | Import statements |
| `guards` | array | Security guards |
| `needs` | object | Capability requirements |

## Requirements

- **mlld CLI** must be installed and in PATH (`npm install -g mlld`)
- **Node.js** runtime (required by mlld)

## When to use native reimplementation instead

Consider a native mlld implementation if you need:

- No Node.js dependency (embedded systems, edge computing)
- Sub-millisecond startup (millions of executions per second)
- WebAssembly target for browsers
- Single binary distribution

For everything else, these wrappers are the pragmatic choice.
