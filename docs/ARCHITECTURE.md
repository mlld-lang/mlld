# Meld Architecture Documentation

## Overview

Meld is a powerful document processing system that combines markdown content with directives for dynamic content generation. It uses llmxml for markdown processing and section extraction, providing robust support for both LLM-friendly XML output and standard markdown.

## Core Components

### Converter
The converter module handles transformation between formats:
- Uses llmxml for markdown ↔ XML conversion
- Supports section extraction with fuzzy matching
- Handles error cases with typed errors
- Provides consistent XML structure for LLMs

```
   +----------------+        +----------------+
   |    Markdown    |  --->  |    LLM-XML     |
   |    Content     |  <---  |    Content     |
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
- PARSE_ERROR: Failed to parse markdown
- INVALID_FORMAT: Invalid document format
- SECTION_NOT_FOUND: Section extraction failed
- INVALID_LEVEL: Invalid header level
- INVALID_SECTION_OPTIONS: Invalid extraction options

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
- Fuzzy matching for headings
- Configurable threshold (default 0.8)
- Nested section handling
- Ambiguous match detection

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