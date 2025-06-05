# mlld-python

Python wrapper for the mlld (Meld) markup language processor.

## Installation

```bash
pip install mlld
```

## Usage

```python
from mlld import Mlld

# Create processor instance
mlld = Mlld()

# Process mlld content
output = mlld.process("""
@text greeting = "Hello, World!"
@run [echo "Processing..."]
@add @greeting
""")

# Process files
mlld.process_file("input.mld", "output.md")

# Handle errors
try:
    result = mlld.process("@invalid syntax")
except MlldError as e:
    print(e.formatted_error)
```

## Requirements

- Python 3.7+
- Node.js 14+ (automatically detected or specify path)

## Development

This package is part of the mlld monorepo. To contribute:

1. Clone the main repository: `git clone https://github.com/mlld-lang/mlld`
2. Install dependencies: `cd lib/mlld-python && pip install -e .`
3. Run tests: `pytest`

## License

Same as mlld - see main repository for details.