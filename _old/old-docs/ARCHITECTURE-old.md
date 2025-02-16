# Meld Architecture Documentation

## Overview

Meld is a powerful document processing system that combines markdown content with directives for dynamic content generation. It uses llmxml for markdown processing and section extraction, providing robust support for both LLM-friendly XML output and standard markdown.

## Core Components

### Converter
The converter module handles transformation between formats:
- Uses llmxml as the core library for markdown processing
- Provides markdown ↔ XML conversion
- Supports basic section extraction with fuzzy matching
- Implements error handling with typed errors

The XML format currently supports:
```xml
<code language="language-name">
  Code content here
</code>

<directive kind="directive-name">
</directive>
```

Key features of the XML format:
- Basic structural elements for code and directives
- Language attribution for code blocks
- Directive type preservation
- Plain text content handling

```
   +----------------+        +----------------+
   |    Markdown    |  --->  |      XML      |
   |    Content     |  <---  |    Content    |
   +----------------+        +----------------+
           |                        |
           |        llmxml          |
           +----------------------->+
           |                       |
           +<----------------------+
```

### Directives
Directives are special commands that modify or generate content:

#### @embed
- Includes external file content
- Supports section extraction with fuzzy matching
- Handles nested content
- Example: `@embed [file.md # Section Name >> fuzzy=0.7]`

#### @import
- Imports and processes Meld files
- Merges state into current context
- Example: `@import path/to/file.meld`

#### @define
- Creates reusable variables
- Example: `@define name = value`

### Interpreter
The interpreter processes Meld content:
1. Parses directives and content
2. Executes directives in order
3. Maintains state
4. Handles errors and logging

## Error Handling

### Converter Errors
The system implements basic error handling:
- PARSE_ERROR: Indicates markdown parsing failures
- INVALID_FORMAT: Reports structural issues
- SECTION_NOT_FOUND: Occurs when section extraction fails
- INVALID_LEVEL: Reports issues with heading levels
- INVALID_SECTION_OPTIONS: Indicates problems with extraction options

Each error includes:
- Specific error code
- Error message
- Basic error details when available

### Directive Errors
- File not found
- Permission denied
- Invalid syntax
- Circular references
- Section extraction failures

### State Errors
- Invalid variable names
- Type mismatches
- Undefined references

## Logging
- Structured logging with winston
- Debug-level content tracking
- Error reporting with context
- Performance metrics

## File Processing

### Content Types
- Markdown (.md)
- Meld files (.meld)
- Text files (.txt)
- Other supported formats

### Section Extraction
Section extraction provides:
- Basic fuzzy matching for headings
- Configurable threshold
- Optional nested section inclusion
- Simple error reporting

Example section extraction:
```
@embed [file.md # Setup Guide >> fuzzy=0.9]  // Custom threshold
@embed [file.md # Getting Started]           // Default threshold
```

The matching system:
- Supports basic fuzzy matching
- Uses configurable thresholds
- Allows nested section inclusion

## State Management
- Variable tracking
- Content accumulation
- Directive results
- Error context

## Testing
- Unit tests for components
- Integration tests for directives
- Format conversion tests
- Error handling coverage
- Section extraction verification

## Security
- Path validation
- Permission checks
- Content validation
- Error isolation

## Performance
- Async file operations
- Efficient content processing
- Minimal memory usage
- Caching where appropriate

## References
- [CLI Documentation](../src/cli/__docs__/CLI.md)
- [Interpreter Documentation](../src/interpreter/__docs__/README.md)
- [Converter Documentation](../src/converter/__docs__/CONVERTER.md)
- [Directive Documentation](../src/interpreter/directives/__docs__/DIRECTIVES.md) 