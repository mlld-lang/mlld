# ASTSemanticVisitor Refactoring Plan

## Current State
- Single 1700+ line file: `services/lsp/ASTSemanticVisitor.ts`
- Handles all AST node types in one class
- Difficult to debug and maintain
- TypeScript errors with object property access

## Goal
Modularize into focused, manageable components that are easier to test, debug, and extend.

## Proposed Structure

```
services/lsp/
├── ASTSemanticVisitor.ts (main orchestrator, ~200 lines)
├── visitors/
│   ├── base/
│   │   ├── BaseVisitor.ts
│   │   └── VisitorInterface.ts
│   ├── DirectiveVisitor.ts
│   ├── TemplateVisitor.ts
│   ├── VariableVisitor.ts
│   ├── ExpressionVisitor.ts
│   ├── LiteralVisitor.ts
│   ├── StructureVisitor.ts
│   ├── CommandVisitor.ts
│   └── FileReferenceVisitor.ts
├── context/
│   ├── VisitorContext.ts
│   └── ContextStack.ts
└── utils/
    ├── TokenBuilder.ts
    ├── LocationHelpers.ts
    └── TextExtractor.ts
```

## Component Breakdown

### 1. Main Orchestrator: `ASTSemanticVisitor.ts`
**Responsibilities:**
- Initialize visitor components
- Route nodes to appropriate visitors
- Manage visitor context stack
- Coordinate token building

**Key Methods:**
- `constructor(document, builder, tokenTypes, tokenModifiers)`
- `visitAST(ast: any[])`
- `visitNode(node: any)`
- `visitChildren(node: any)`

### 2. Context Management: `context/`
**VisitorContext.ts:**
- Define context interface
- Track template types (backtick, doubleColon, tripleColon)
- Track interpolation rules
- Track embedded language context

**ContextStack.ts:**
- Manage context stack operations
- `pushContext(context: Partial<VisitorContext>)`
- `popContext()`
- `getCurrentContext()`

### 3. Token Building: `utils/TokenBuilder.ts`
**Responsibilities:**
- Wrap SemanticTokensBuilder
- Handle token type/modifier mapping
- Add debug logging
- Validate token positions

**Key Methods:**
- `addToken(token: TokenInfo)`
- `getTokenTypeIndex(type: string)`
- `buildModifierMask(modifiers: string[])`

### 4. Individual Visitors

#### DirectiveVisitor.ts (~200 lines)
Handles: `/var`, `/show`, `/run`, `/exe`, `/path`, `/import`, `/when`, `/output`
- Extract directive keyword
- Handle variable declarations
- Delegate to specialized handlers for `/run`

#### TemplateVisitor.ts (~250 lines)
Handles: Backticks, `::`, `:::`, quotes
- Identify template type from AST
- Apply correct interpolation rules
- Highlight template delimiters
- Process template content with context

#### VariableVisitor.ts (~200 lines)
Handles: `@var`, `{{var}}`, field access, array indexing
- Variable declarations vs references
- Field access (`.field`)
- Array indexing (`[0]`)
- Context-aware interpolation

#### ExpressionVisitor.ts (~150 lines)
Handles: Operators, conditions, when expressions
- Binary operators (`&&`, `||`, `==`, etc.)
- Unary operators (`!`)
- Ternary expressions
- When expression patterns

#### LiteralVisitor.ts (~100 lines)
Handles: Strings, numbers, booleans, null
- String literals (with quote type awareness)
- Numeric literals
- Boolean literals
- Null values

#### StructureVisitor.ts (~150 lines)
Handles: Objects, arrays, properties
- Object braces `{}`
- Array brackets `[]`
- Property keys
- Nested structures

#### CommandVisitor.ts (~200 lines)
Handles: Command execution contexts
- Plain shell commands
- Language-specific blocks (`js`, `python`)
- Embedded code highlighting
- Command interpolation rules

#### FileReferenceVisitor.ts (~150 lines)
Handles: Alligator syntax, file references
- `<file.md>` patterns
- Section extraction `# Section`
- XML vs alligator distinction
- Context-aware handling

### 5. Utilities

#### LocationHelpers.ts
- Calculate token positions
- Handle AST location quirks
- Position adjustment utilities

#### TextExtractor.ts
- Extract text from AST nodes
- Handle nested node structures
- Cache extracted text for performance

## Implementation Steps

### Phase 1: Setup Structure
1. Create directory structure
2. Define interfaces and types
3. Create base classes

### Phase 2: Extract Core Components
1. Extract TokenBuilder from addToken logic
2. Extract Context management
3. Create BaseVisitor abstract class

### Phase 3: Migrate Visitors (one at a time)
1. DirectiveVisitor (most complex, good test case)
2. VariableVisitor (has known issues to fix)
3. TemplateVisitor
4. Others in order of complexity

### Phase 4: Integration
1. Update main visitor to use new components
2. Ensure all tests still pass
3. Add new tests for individual components

### Phase 5: Bug Fixes
1. Fix TypeScript errors
2. Add missing token generation
3. Improve context tracking

## Testing Strategy
- Keep existing integration tests
- Add unit tests for each visitor
- Test context management separately
- Test token builder edge cases

## Migration Notes
- Preserve all existing functionality
- Fix bugs as we refactor
- Improve type safety
- Add documentation to each component

## Known Issues to Address
1. Variable field access not highlighted as single token
2. Template delimiters not highlighted
3. Language keywords (js, python) not highlighted
4. String literals showing wrong color
5. TypeScript errors with object property access
6. Missing embedded language support