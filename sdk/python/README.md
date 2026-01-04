# mlld Python SDK

Python wrapper for the mlld CLI.

## Installation

```bash
pip install mlld-sdk
```

**Requires**: Node.js and mlld CLI installed (`npm install -g mlld`)

## Quick Start

```python
from mlld import Client

client = Client()

# Process a script
output = client.process('show "Hello World"')
print(output)  # Hello World

# Execute a file with payload
result = client.execute('./agent.mld', {'text': 'hello'})
print(result.output)

# Static analysis
analysis = client.analyze('./module.mld')
print(analysis.exports)
```

## API

### Client

- `process(script, *, file_path=None, timeout=None)` - Execute a script string
- `execute(filepath, payload=None, *, state=None, dynamic_modules=None, timeout=None)` - Run a file
- `analyze(filepath)` - Static analysis without execution

### Module-level functions

For convenience, you can also use module-level functions:

```python
import mlld

output = mlld.process('show "Hello"')
result = mlld.execute('./agent.mld', {'text': 'hello'})
analysis = mlld.analyze('./module.mld')
```

## Requirements

- Python 3.10+
- Node.js runtime
- mlld CLI (`npm install -g mlld`)

## Documentation

- [mlld Documentation](https://mlld.dev)
- [GitHub Repository](https://github.com/mlld-lang/mlld)
