# Converter Module Documentation

## Overview
The converter module transforms Meld AST nodes into various output formats, primarily focusing on Markdown and LLM-friendly text output. It handles the final stage of the Meld pipeline, converting interpreted content into the desired output format.

## Architecture

```
+--------------------+
|  MeldNode[] input  |
+---------+----------+
          |
          v
   converter.toXml(...)
          |
          v
    <XML output>

Similarly for toMarkdown:

+--------------------+
|  MeldNode[] input  |
+---------+----------+
          |
          v
   converter.toMarkdown(...)
          |
          v
    Markdown output
```

## Core Components

### Node Types
- `TextNode`: Raw text content
- `CodeFenceNode`: Code blocks with optional language
- `DirectiveNode`: Directive placeholders

### Conversion Methods

#### `toMarkdown(nodes: MeldNode[]): string`
- Converts nodes to GitHub-flavored Markdown
- Handles code fences and text blocks
- Preserves line breaks and formatting

#### `toXml(nodes: MeldNode[]): string`
- Converts nodes to XML format
- Maintains node hierarchy

## Implementation Details

### Text Handling
- Preserves whitespace where significant
- Maintains line breaks
- Escapes special characters

### Code Fence Processing
- Preserves language tags
- Maintains indentation
- Handles triple backticks correctly

### Directive Conversion
- Converts to appropriate format markers
- Preserves directive context
- Handles nested content

## Error Handling
- Invalid node types
- Malformed content
- XML validation errors
- Character encoding issues

## Logging
- Conversion progress tracking
- Error reporting
- Debug information for node processing

## Troubleshooting

### Common Issues
- **"Unknown node type"**
  - Solution: Verify node type is supported
- **"Invalid XML character"**
  - Solution: Check for special characters needing escape
- **"Markdown formatting error"**
  - Solution: Verify input node structure

### Debugging Tips
1. Enable debug logging
2. Check node structure
3. Verify output format requirements
4. Review error messages

## References
- [Architecture Overview](../../../docs/ARCHITECTURE.md)
- [Interpreter Documentation](../interpreter/__docs__/README.md)
- [Parser Documentation](../parser/__docs__/README.md) 