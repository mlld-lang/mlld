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

```typescript
interface MeldLLMXMLError extends Error {
  code: string;
  details?: any;
}
```

### Directives
Directives are special commands that modify or generate content:

#### @embed
- Includes external file content
- Supports section extraction with fuzzy matching
- Handles nested content
- Example: `@embed [file.md # Section Name >> fuzzy=0.7]`

## Error Handling

### Converter Errors
- PARSE_ERROR: Failed to parse markdown
- INVALID_FORMAT: Invalid document format
- SECTION_NOT_FOUND: Section extraction failed
- INVALID_LEVEL: Invalid header level
- INVALID_SECTION_OPTIONS: Invalid extraction options

## Testing Strategy

### Core Tests
1. Basic conversion
2. Complex documents
3. Section extraction
4. Error handling

### Integration Tests
1. Full document flow
2. Structure preservation
3. Mixed content types 