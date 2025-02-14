# Embed Directive Handler Documentation

## Overview
The Embed directive (`@embed`) allows including the contents of external files directly into the Meld document. It supports both text files and Meld files, with proper handling of file paths and content processing. The directive also supports extracting specific sections from markdown files using fuzzy matching.

## Syntax

### Basic File Embedding
```
@embed path/to/file.txt
```

### Section Extraction
```
@embed [file.md # Section Name]
@embed [file.md # Section Name >> fuzzy=0.7]
```

### With Variable Path
```
@embed {filePath}
```

## Architecture

```
   +----------------------+
   |   EmbedDirective     |
   |   kind: 'embed'      |
   |   source: string     |
   |   section?: string   |
   |   fuzzyThreshold?: number |
   +--------+-------------+
            |
            v
   [ EmbedDirectiveHandler.handle(...) ]
            |
            +---> Read file contents
            |
            +---> Extract section (if specified)
            |
            +---> Process content if .meld
            |
            v
   [Content added to output]
```

## Implementation Details

### Handler Interface
```typescript
class EmbedDirectiveHandler implements DirectiveHandler {
  canHandle(kind: string, mode: string): boolean
  handle(node: DirectiveNode, state: InterpreterState, context: Context): void
}
```

### Key Methods

#### `canHandle(kind: string, mode: string)`
- Returns `true` if `kind === 'embed'`
- Mode-agnostic (works in any interpreter mode)

#### `handle(node: DirectiveNode, state: InterpreterState, context: Context)`
1. Resolves file path (handles variables)
2. Reads file contents
3. If section specified, extracts section using fuzzy matching
4. If .meld file, processes with subInterpreter
5. Adds content to output
6. Logs progress via `directiveLogger`

## Section Extraction
- Uses llmxml for basic section extraction
- Configurable fuzzy matching threshold
- Optional nested section inclusion
- Basic error handling

### Fuzzy Matching Details
The fuzzy matching system provides:
- Basic string similarity matching
- Configurable threshold (default 0.8)
- Simple match/no-match determination

### Examples with Explanations

#### Basic Section Extraction
```markdown
# Source file (guide.md):
## Getting Started
Content here...

## Installation
More content...

# Meld file:
@embed [guide.md # Getting Started]
```
Extracts exact section match

#### Fuzzy Matching
```markdown
# Source file (guide.md):
## Getting Started Guide
Content here...

# Meld file:
@embed [guide.md # Getting Started >> fuzzy=0.9]  # Stricter matching
@embed [guide.md # Getting Started]               # Default threshold
```
Shows threshold configuration

## Error Handling
The handler implements basic error handling:

### Section Extraction Errors
- SECTION_NOT_FOUND
  - Basic error message
  - Section title in details
- INVALID_SECTION_OPTIONS
  - Reports configuration issues
  - Basic error context

### File System Errors
- File not found errors
- Permission errors
- Invalid path errors
- Meld processing errors
- Circular reference detection

## Logging
- Logs file access attempts
- Records successful embeddings
- Logs section extraction results
- Logs any file system errors
- Debug-level content logging

## Examples

### Basic Text File
```
@embed README.md
```

### Extract Specific Section
```
@embed [docs/guide.md # Installation]
```

### Fuzzy Section Matching
```
@embed [docs/guide.md # Getting Started >> fuzzy=0.7]
```

### Meld File with Processing
```
@embed template.meld
```

### Variable Path
```
@define docPath = docs/intro.md
@embed {docPath}
```

### Nested Content
```
@embed outer.meld  # which might contain @embed inner.meld
```

## Troubleshooting

### Common Issues
- **"File not found"**
  - Solution: Check file path and working directory
- **"Permission denied"**
  - Solution: Verify file access permissions
- **"Section not found"**
  - Check section name in source file
  - Try adjusting fuzzy threshold
  - Verify markdown is valid
- **"Invalid section options"**
  - Check fuzzy threshold is between 0 and 1
  - Verify section name is provided

### Debugging Tips
1. Enable debug logging
2. Check section names carefully
3. Verify file content
4. Test different thresholds
5. Review error messages

## References
- [Interpreter Documentation](../../__docs__/README.md)
- [File System Handling](../../utils/__docs__/fs.md)
- [Path Resolution](../../utils/__docs__/paths.md) 