# CLI Module Documentation

## Overview
The CLI module handles command-line parsing and orchestrates the Meld flow by calling `runMeld`. It provides a user-friendly interface for executing Meld operations from the command line.

## Architecture

```
+------------------+  parseArgs  +--------------------+
|  process.argv    | ----------> |  CLIOptions object |
+------------------+             +--------------------+
                                       |
                                       v
                                  runMeld(inputFile, options)
                                       |
                                       v
                          [Return or write output to file/stdout]
```

## Core Components

### Command Line Arguments
- `--input`: Path to input Meld file (required)
- `--output`: Path for output file (optional)
- `--format`: Output format ('md' or 'llm', defaults to 'md')

### Key Functions

#### `parseArgs(args: string[]): CliOptions`
- Analyzes command line arguments
- Validates required parameters
- Returns structured options object

#### `run(args: string[]): Promise<void>`
- Entry point for CLI execution
- Orchestrates the full Meld pipeline:
  1. Parse arguments
  2. Read input file
  3. Process content
  4. Write output

## Error Handling
- Input validation errors
- File system errors
- Processing errors
- Each error includes:
  - Descriptive message
  - Error code
  - Stack trace when relevant

## Logging
- Uses Winston logger
- Configurable log levels
- Outputs to console and/or file

## Troubleshooting

### Common Issues
- **"Input file is required"**
  - Solution: Provide `--input path/to/file.meld`
- **"Invalid format specified"**
  - Solution: Use 'md' or 'llm' for `--format`
- **"Output file access denied"**
  - Solution: Check file permissions and path

### Debugging Tips
1. Run with DEBUG=true for verbose output
2. Check logs in logs/error.log
3. Verify file paths are correct
4. Ensure proper permissions

## References
- [Architecture Overview](../../../docs/ARCHITECTURE.md)
- [Interpreter Documentation](../../interpreter/__docs__/README.md)
- [SDK Documentation](../../sdk/__docs__/README.md) 