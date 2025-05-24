# VSCode Extension Implementation Plan

## Overview
This plan outlines the implementation of a modern VSCode extension for Meld that leverages the actual grammar parser and provides intelligent features like autocomplete, syntax highlighting, and semantic analysis.

## Key Features to Implement

### 1. Syntax Highlighting (TextMate Grammar)
- **Generate from PEG grammar**: Create a script that converts our PEG grammar to TextMate JSON
- **Directive highlighting**: `@add`, `@text`, `@data`, `@run`, `@exec`, `@path`, `@import`
- **Variable patterns**:
  - `@variableName` - Variable references
  - `{{variableName}}` - Template interpolation in `[[...]]` blocks
- **Comment syntax**: `>>` line comments
- **Markdown integration**: Treat base content as markdown

### 2. Autocomplete Features

#### Path Autocomplete
When user types `[` after a path-accepting directive:
- Show files in project matching Meld path rules
- Support special variables: `@PROJECTPATH`, `@CWD`, etc.
- Filter to show only `.md` and `.mld` files

#### Section Autocomplete
When user types `@add "`:
- Scan project for markdown files
- Extract headers using regex: `/^#{1,6}\s+(.+)$/gm`
- Show headers as completion items
- On selection, complete as: `@add "Header Name" from [file.md]`

**Future**: When shorthand syntax is added back (`[file.md # Header]`):
- Trigger autocomplete after `#` in path context
- Show headers from the specified file

#### Variable Autocomplete
- Parse current file and imported files for variable definitions
- Track: `@text`, `@data`, `@path`, `@exec` declarations
- Provide completions for:
  - `@` prefix contexts
  - `{{` in template contexts
  - Data object field access (e.g., `{{user.name}}`)

### 3. Language Server Implementation

Use the actual Meld parser for accurate analysis:

```typescript
// parser-bridge.ts
import { parse } from '../../grammar/parser';

export async function parseDocument(text: string) {
  const result = await parse(text);
  if (!result.success) {
    return { 
      ast: [], 
      errors: [result.error] 
    };
  }
  return { ast: result.ast, errors: [] };
}
```

#### Features powered by parser:
- **Syntax validation**: Show errors from parser
- **Semantic tokens**: Enhanced highlighting based on AST
- **Go to definition**: Navigate to variable declarations
- **Find references**: Find all uses of a variable
- **Hover information**: Show variable values and types

### 4. File Structure

```
editors/vscode/
├── package.json                    # Extension manifest
├── language-configuration.json     # Brackets, comments config
├── syntaxes/
│   └── meld.tmLanguage.json      # TextMate grammar
├── src/
│   ├── extension.ts               # Main extension entry
│   ├── parser-bridge.ts           # Interface to Meld parser
│   ├── providers/
│   │   ├── completion-provider.ts # Autocomplete logic
│   │   ├── hover-provider.ts      # Hover information
│   │   ├── definition-provider.ts # Go to definition
│   │   └── semantic-tokens.ts     # Semantic highlighting
│   ├── utils/
│   │   ├── document-analyzer.ts   # Parse & analyze documents
│   │   ├── header-extractor.ts    # Extract markdown headers
│   │   └── import-resolver.ts     # Resolve imports
│   └── test/
│       └── *.test.ts              # Extension tests
├── scripts/
│   └── generate-grammar.ts        # PEG → TextMate converter
└── README.md                      # User documentation
```

### 5. Implementation Steps

#### Phase 1: Basic Syntax Highlighting
1. Create TextMate grammar manually based on current syntax
2. Set up basic extension structure
3. Test with example files

#### Phase 2: Parser Integration
1. Create parser-bridge to use actual Meld parser
2. Add syntax validation and error reporting
3. Implement semantic token provider for enhanced highlighting

#### Phase 3: Intelligent Features
1. Implement path autocomplete with project file scanning
2. Add section autocomplete by parsing markdown headers
3. Create variable tracking and autocomplete

#### Phase 4: Advanced Features
1. Go to definition for variables and imports
2. Find all references
3. Hover information showing variable values
4. Import resolution and multi-file analysis

### 6. Configuration

Add settings for:
- `meld.enableAutocomplete`: Enable/disable autocomplete
- `meld.projectPath`: Override `@PROJECTPATH` detection
- `meld.includePaths`: Additional paths for import resolution

### 7. Key Implementation Details

#### Header Extraction for Autocomplete
```typescript
function extractHeaders(content: string): Header[] {
  const headerRegex = /^(#{1,6})\s+(.+)$/gm;
  const headers: Header[] = [];
  let match;
  
  while ((match = headerRegex.exec(content)) !== null) {
    headers.push({
      level: match[1].length,
      text: match[2].trim(),
      line: content.substring(0, match.index).split('\n').length
    });
  }
  
  return headers;
}
```

#### Variable Tracking
```typescript
interface Variable {
  name: string;
  kind: 'text' | 'data' | 'path' | 'exec';
  value?: any;
  location: Location;
  source: 'local' | 'imported';
}

class VariableTracker {
  private variables = new Map<string, Variable>();
  
  async analyzeDocument(doc: TextDocument) {
    const { ast } = await parseDocument(doc.getText());
    
    for (const node of ast) {
      if (node.type === 'Directive') {
        this.trackDirective(node);
      }
    }
  }
}
```

### 8. Testing Strategy

- Unit tests for parsers and analyzers
- Integration tests using real Meld files
- Manual testing with complex examples
- Test autocomplete in various contexts

### 9. Future Enhancements

- **Formatting**: Auto-format Meld files
- **Refactoring**: Rename variables across files
- **Code lens**: Show variable values inline
- **Snippets**: Common patterns like `@text name = "value"`
- **Diagnostics**: Warn about undefined variables, circular imports

## Notes for Implementation

1. The parser is at `grammar/parser/index.ts` with the main `parse()` function
2. AST types are in `core/types/`
3. Current syntax uses `@add "Section" from [file.md]` but shorthand `[file.md # Section]` may be added
4. Variables use `@var` syntax or `{{var}}` in templates
5. Special path variables: `@PROJECTPATH`, `@CWD`
6. Comments use `>>` prefix

This extension will provide a superior editing experience by using the actual Meld parser, ensuring perfect consistency with the language implementation.