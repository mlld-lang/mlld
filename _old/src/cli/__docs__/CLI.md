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
  - 'md': Standard markdown output
  - 'llm': XML format with basic structure

### Output Formats

#### Markdown Format
Standard markdown output preserves the original document structure while applying any directive transformations:
```markdown
# Title
Content text...

## Section
- List item 1
- List item 2
```

#### XML Format
When using `--format llm`, output uses a simple XML structure:
```xml
<code language="typescript">
const example = "code block";
</code>

<directive kind="embed">
</directive>

Plain text content
```

Key XML format features:
- Code block handling with language support
- Directive type preservation
- Plain text content
- Basic structural elements

### Section Extraction
The CLI supports basic section extraction through the @embed directive:
```bash
# Extract with default fuzzy matching
meld --input doc.md --output result.md

# Content of doc.md:
@embed [source.md # Getting Started]

# Extract with custom fuzzy threshold
@embed [source.md # Setup Guide >> fuzzy=0.9]
```

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
- **"Section not found in source file"**
  - Check section heading exists in source
  - Try adjusting fuzzy threshold
  - Verify file content is valid markdown

### Debugging Tips
1. Run with DEBUG=true for verbose output
2. Check logs in logs/error.log
3. Verify file paths are correct
4. Ensure proper permissions
5. Use `--debug` for basic extraction details

## References
- [Architecture Overview](../../../docs/ARCHITECTURE.md)
- [Interpreter Documentation](../../interpreter/__docs__/README.md)
- [SDK Documentation](../../sdk/__docs__/README.md) 