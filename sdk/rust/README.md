# mlld Rust SDK

Rust wrapper for the mlld CLI.

## Installation

```toml
[dependencies]
mlld = "2.0"
```

**Requires**: Node.js and mlld CLI installed (`npm install -g mlld`)

## Quick Start

```rust
use mlld::Client;

fn main() -> mlld::Result<()> {
    let client = Client::new();

    // Process a script
    let output = client.process(r#"show "Hello World""#, None)?;
    println!("{}", output); // Hello World

    // Execute a file with payload
    let result = client.execute(
        "./agent.mld",
        Some(serde_json::json!({"text": "hello"})),
        None,
    )?;
    println!("{}", result.output);

    // Static analysis
    let analysis = client.analyze("./module.mld")?;
    println!("{:?}", analysis.exports);

    Ok(())
}
```

## API

### Client

- `Client::new()` - Create a new client with defaults
- `process(script, opts)` - Execute a script string
- `execute(filepath, payload, opts)` - Run a file
- `analyze(filepath)` - Static analysis without execution

### Configuration

```rust
let mut client = Client::new();
client.command = "mlld".to_string();           // CLI command
client.timeout = Some(Duration::from_secs(30)); // Default timeout
client.working_dir = Some("/path/to".into());   // Working directory
```

## Requirements

- Rust 2021 edition
- Node.js runtime
- mlld CLI (`npm install -g mlld`)

## Documentation

- [mlld Documentation](https://mlld.dev)
- [GitHub Repository](https://github.com/mlld-lang/mlld)
