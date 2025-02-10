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
- Uses llmxml for section extraction
- Supports fuzzy matching for section titles
- Default fuzzy threshold of 0.8
- Includes nested subsections by default
- Handles ambiguous matches with warnings

## File Handling
- Uses fs/promises for async file operations
- Resolves paths relative to working directory
- Supports variable substitution in paths
- Handles different file types appropriately

## Error Handling
- File not found errors
- Permission errors
- Invalid path errors
- Section not found errors
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
  - Solution: Check section name or lower fuzzy threshold
- **"Circular reference detected"**
  - Solution: Check for recursive embed chains
- **"Invalid file type"**
  - Solution: Ensure file type is supported

### Debugging Tips
1. Check file paths
2. Verify file permissions
3. Enable debug logging
4. Review section names
5. Check fuzzy threshold
6. Review embed chain

## References
- [Interpreter Documentation](../../__docs__/README.md)
- [File System Handling](../../utils/__docs__/fs.md)
- [Path Resolution](../../utils/__docs__/paths.md) 