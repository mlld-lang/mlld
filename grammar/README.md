# mlld Grammar Developer Guide

This guide explains the principles, patterns, and practices for developing and maintaining the mlld grammar. It serves as the primary reference for developers working on the grammar system.

> **For Grammar Consumers**: Use `npm run ast -- '<mlld syntax>'` to explore the AST output and refer to [docs/dev/AST.md](../../docs/dev/AST.md) for understanding the AST structure.
> **For debugging**: Refer to [grammar/DEBUG.md](./DEBUG.md)

## Critical: How the Grammar Build System Works

**IMPORTANT**: Understanding the build process is essential before making any changes.

### Build Process Overview

The grammar build system (`grammar/build-grammar.mjs`) works as follows:

1. **File Concatenation**: All `.peggy` files are concatenated in this order:
   - `mlld.peggy` (root file with initialization block)
   - `base/*.peggy` (core primitives)
   - `patterns/*.peggy` (reusable patterns)
   - `core/*.peggy` (directive cores)
   - `directives/*.peggy` (directive implementations)

2. **Parser Generation**: Peggy generates parser files to `grammar/generated/parser/`:
   - `parser.js` - JavaScript ESM version
   - `parser.ts` - TypeScript version with types
   - `parser.cjs` - CommonJS version
   - `grammar-core.*` - Core helper files
   - `deps/` - Generated dependency files
   
   These files reference dependencies:
   - `NodeType` imported from `./deps/node-type.js`
   - `DirectiveKind` imported from `./deps/directive-kind.js`
   - `helpers` imported from `./deps/helpers.js`

3. **Helper System**: 
   - Source files in `grammar/deps/` are the originals
   - Build process generates multiple versions in `grammar/generated/parser/`
   - These are available globally in all grammar rules
   - **NEVER modify any generated files in `grammar/generated/`**
   - **ONLY modify source files in `grammar/deps/`**

4. **Directory Structure**:
   ```
   grammar/
   ├── parser/           # Source files only
   │   └── index.ts     # Parser interface (the ONLY file here)
   ├── deps/            # Source dependency files
   ├── generated/       # All generated files (gitignored)
   │   └── parser/
   │       ├── parser.js/ts/cjs
   │       ├── grammar-core.*
   │       └── deps/
   └── *.peggy          # Grammar source files
   ```

### Critical Rules for Modifications

1. **Never use `peg$imports`**: The helpers, NodeType, and DirectiveKind are available globally, not through `peg$imports`.

2. **Modify source files only**: When adding helper functions:
   - Edit `grammar/deps/grammar-core.js` (this is the source file)
   - The build process generates multiple versions in `grammar/generated/parser/`
   - Never edit any files in `grammar/generated/` or `grammar/parser/` (except `index.ts`)

3. **No initialization blocks in pattern files**: Only `mlld.peggy` can have the `{...}` initialization block at the top.

4. **After changes, always rebuild**:
   ```bash
   npm run build:grammar
   npm test grammar/
   ```

5. **Syntax highlighting generation**: Generated syntax files in `grammar/generated/` are:
   - Automatically built on push to main branch
   - Skipped in feature branches to avoid merge conflicts
   - Can be manually generated with `npm run build:syntax:force`
   - See `grammar/syntax-generator/README.md` for details

### Example: Adding a Helper Function

```javascript
// ✅ CORRECT: Edit grammar/deps/grammar-core.js (source file)
export const helpers = {
  // ... existing helpers ...
  myNewHelper(param) {
    return /* implementation */;
  }
};
```

```peggy
// Then use in any .peggy file:
MyRule = value:Something {
  return helpers.myNewHelper(value);
}
```

```javascript
// ❌ WRONG: Don't use peg$imports
MyRule = value:Something {
  const { helpers } = peg$imports; // This doesn't exist!
  return helpers.myNewHelper(value);
}
```

## Critical: Grammar-Type Synchronization

**The grammar and TypeScript types in `core/types/` must remain 100% synchronized.**

### Design Principle
Every grammar decision is also a type system decision. When making changes:

1. **Check Type Definitions First**
   - Review relevant files in `core/types/` before changing grammar
   - Understand existing type constraints and contracts
   - Consider impact on type guards and validation

2. **Update Both Together**
   - Grammar changes must include corresponding type updates
   - Type changes must be reflected in grammar rules
   - Never ship one without the other

3. **Type-Driven Grammar Design**
   ```typescript
   // Example: If types define a directive structure
   interface DirectiveNode {
     type: 'Directive';
     kind: DirectiveKind;
     subtype: DirectiveSubtype;
     values: DirectiveValues;
     raw: RawSegments;
     meta: DirectiveMeta;
   }
   
   // Grammar MUST produce exactly this structure
   ```

4. **Validation Points**
   - AST output must match TypeScript interfaces
   - Type guards must work with grammar output
   - Runtime validation depends on this alignment

### Before Any Grammar Change

- [ ] Review types in `core/types/` for affected nodes
- [ ] Plan type updates alongside grammar updates  
- [ ] Ensure AST structure matches type definitions
- [ ] Update type guards if needed
- [ ] Test type validation with new grammar output

## Core Principles

### 1. **Values Are Node Arrays (With One Exception)**
The `values` field in AST nodes MUST contain arrays of nodes for all content that could require processing or interpolation.

```javascript
// ❌ WRONG: Raw string in values
{
  "values": {
    "path": "https://example.com/file.mld"
  }
}

// ✅ CORRECT: Array of nodes
{
  "values": {
    "path": [
      {
        "type": "Text",
        "content": "https://example.com/file.mld"
      }
    ]
  }
}
```

**Rationale**: This ensures consistent processing across the interpreter and enables features like:
- Variable interpolation in any value (e.g., `[https://{{domain}}/{{path}}]`)
- Section extraction from URLs (e.g., `[url # Section Name]`)
- Uniform handling of all directive arguments

**Exception: Data Directive Complex Values**
The `@data` directive uses type discriminators instead of node arrays for complex values:

```javascript
// Data directive with embedded directive
{
  "values": {
    "value": {
      "type": "object",
      "properties": {
        "test": {
          "type": "directive",
          "directive": { /* full directive node */ }
        },
        "name": "literal string"  // Primitives stored directly
      }
    }
  }
}
```

This exception exists because:
1. Data directive stores JavaScript-like data structures
2. Embedded directives need lazy evaluation
3. Type preservation is critical for data access patterns
4. Primitives in data objects/arrays don't support interpolation

**Rule of Thumb**: If a value could have variable interpolation or needs processing, it must be a node array. If it's a data structure literal, it follows JavaScript semantics.

**Note on Section Syntax**: The space before `#` is required in mlld section extraction syntax (e.g., `[file.md # Section]`). This is not an HTML anchor - it's mlld-specific syntax for extracting markdown sections.

### 2. **Abstraction-First Design**
Build reusable patterns at the appropriate abstraction level. Don't repeat parsing logic.

```peggy
// ❌ BAD: Repeating list logic
TextParamsList = first:Param rest:(_ "," _ p:Param { return p; })* { return [first, ...rest]; }
ImportList = first:Import rest:(_ "," _ i:Import { return i; })* { return [first, ...rest]; }

// ✅ GOOD: Abstract the pattern
GenericList(ItemRule, Separator)
  = first:ItemRule rest:(Separator item:ItemRule { return item; })* {
      return [first, ...rest];
    }

TextParamsList = GenericList(TextParam, CommaSpace)
ImportList = GenericList(ImportItem, CommaSpace)
```

### 2. **Hierarchical Pattern Organization**
Follow the established abstraction hierarchy with standardized naming conventions:

```
Level 1: Core Primitives      → base/
Level 2: Variable References  → patterns/variables.peggy
Level 3: Content Patterns     → patterns/content.peggy
Level 4: Combinatorial        → patterns/
Level 5: Wrapped Patterns     → patterns/
Level 6: Directive Cores      → core/
Level 7: Directive Rules      → directives/
Level 8: RHS Patterns         → patterns/rhs.peggy
```

#### Naming Convention Standard

Each abstraction level follows specific naming patterns for consistency:

**Prefixes:**
- `Base*` - Fundamental abstractions (BaseToken, BaseSegment)
- `At*` - Directive types (AtRun, AtText, AtPath)
- `Wrapped*` - Container patterns that provide structured output (WrappedPathContent)

**Suffixes:**
- `*Identifier` - Identifiers and names (VariableIdentifier)
- `*Pattern` - Matching patterns (InterpolationPattern)
- `*Interpolation` - Variable insertion patterns (CommandInterpolation)
- `*Content` - Content production (TemplateContent)
- `*Core` - Reusable logic (RunCommandCore)
- `*Context` - Context detection predicates (DirectiveContext)
- `*Segment` - Basic text pieces (TextSegment)
- `*Separator` - Delimiter characters (PathSeparator)
- `*Whitespace` - Spacing patterns (HorizontalWhitespace)
- `*Literal` - Literal values (StringLiteral)
- `*Assignment` - Assignment operations (TextAssignment)
- `*Reference` - Reference operations (VariableReference)
- `*Token` - Atomic lexical elements (PathSeparatorToken)
- `*List` - Comma-separated lists (ParameterList, not ParametersList)

**Directive Subtype Naming:**
Use composition pattern: Operation + ContentType
- `textPath` - Text directive operating on path content
- `textPathSection` - Text directive extracting section from path
- `addPath` - Add directive including path content  
- `addPathSection` - Add directive extracting section from path

*Rationale: Section extraction is meaningless without context - it's always a section OF something. The naming should reflect this relationship.*

### 3. **Single Source of Truth**
Each pattern should be defined once and imported where needed.

```peggy
// ❌ BAD: Redefining variable patterns
// In content.peggy:
BracketVar = "@" id:BaseIdentifier { /* logic */ }

// In directives/text.peggy:
TextVar = "@" id:BaseIdentifier { /* same logic */ }

// ✅ GOOD: Import and use shared pattern
// In content.peggy:
BracketContent = '[' parts:(AtVar / TextSegment)* ']'
// AtVar is imported from patterns/variables.peggy
```

### 4. **Context Detection System**
The grammar includes a sophisticated context detection system (`base/context.peggy`) for disambiguating syntax in different parsing contexts.

**Key Contexts:**
- `DirectiveContext` - Top-level directives (`@run`, `@text`)
- `VariableContext` - Variable references (`@varName`)
- `RHSContext` - Right-hand side of assignments (`= @run [cmd]`)
- `RunCodeBlockContext` - Language + code patterns

**Usage:**
```peggy
// Use predicates to select appropriate parsing rules
CommandContent
  = &{ return helpers.isRHSContext(input, peg$currPos); } RHSCommandPattern
  / &{ return helpers.isInRunCodeBlockContext(input, peg$currPos); } CodePattern
  / DefaultCommandPattern

// Context helpers available: isAtDirectiveContext(), isRHSContext(), etc.
```

This system enables context-aware parsing without runtime state tracking, maintaining clean separation between syntactic and semantic concerns.

### 5. **Semantic Design Philosophy**
The grammar follows a semantic-first approach where directives determine their content parsing rules, not the delimiters.

**Core Principle**: Same syntax can have different semantics based on context. The directive chooses its semantic parser.

```peggy
// ❌ WRONG: Universal bracket parser trying to guess context
BracketContent = "[" content:UniversalContent "]"

// ✅ RIGHT: Directive chooses semantic parser
AtRun
  = "@run" _ lang:Language _ code:CodeContent    // Language → Code semantics
  / "@run" _ command:CommandContent              // No language → Command semantics
```

**Why This Matters**: Peggy is a top-down parser that commits to branches. Once it takes a fork, it follows that semantic path. This aligns perfectly with how we think about Mlld directives.

## Directive Parse Trees

**CRITICAL**: Before making ANY grammar changes, you MUST update the relevant parse tree documentation below. The tree must accurately reflect the parsing decisions and semantic choices. This is not optional.

### @run Directive

```
@run ...
├─ Language keyword detected (js, python, bash, etc.)?
│  ├─ YES: "@run language [(code)]"
│  │  └─ Code execution mode
│  │     └─ Language specified outside brackets
│  │        └─ [(code content)]
│  │           ├─ No @ variable processing in code
│  │           ├─ Preserve all [brackets]
│  │           └─ Preserve all quotes
│  │
├─ "[(" detected?
│  ├─ YES: "@run [(command)]"
│  │  └─ Command execution mode
│  │     └─ CommandParts with @var interpolation
│  │        ├─ @var → Variable reference
│  │        └─ text → Command text segments
│  │
├─ "@" detected?
│  ├─ YES: "@run @command"
│  │  └─ Command reference (exec)
│  │
└─ Other patterns
   └─ Parse error (invalid syntax)
```

### Command Parsing Logic Tree

**CRITICAL**: This tree documents the ACTUAL implementation in `patterns/unified-run-content.peggy` as of the current codebase.

```
@run [(echo '<div>Hello</div>')]
│
├─ AtRun (directives/run.peggy)
│  ├─ "@run" ✓
│  ├─ _ (whitespace) ✓
│  └─ UnifiedCommandBrackets
│     ├─ "[(" ✓
│     ├─ _ ✓
│     ├─ UnifiedCommandParts
│     │  └─ UnifiedCommandToken* (zero or more tokens)
│     │     │
│     │     ├─ Token Order (first match wins):
│     │     │  1. UnifiedCommandVariable      (@varname)
│     │     │  2. UnifiedCommandQuotedString  ("..." or '...')
│     │     │  3. UnifiedCommandWord          (unquoted text)
│     │     │  4. UnifiedCommandSpace         (whitespace)
│     │     │
│     │     ├─ Parsing "echo '<div>Hello</div>'":
│     │     │  │
│     │     │  ├─ Token 1: "echo"
│     │     │  │  ├─ Try UnifiedCommandVariable → @ not found ✗
│     │     │  │  ├─ Try UnifiedCommandQuotedString → No quote at start ✗
│     │     │  │  └─ Try UnifiedCommandWord → Matches "echo" ✓
│     │     │  │     └─ UnifiedCommandWordChar checks:
│     │     │  │        ├─ Not a quote → continue
│     │     │  │        ├─ Not a space → continue
│     │     │  │        ├─ Not @ → continue
│     │     │  │        ├─ Not )] → continue
│     │     │  │        ├─ Security checks pass → ✓
│     │     │  │        └─ Returns: Text node "echo"
│     │     │  │
│     │     │  ├─ Token 2: " "
│     │     │  │  ├─ Try UnifiedCommandVariable → @ not found ✗
│     │     │  │  ├─ Try UnifiedCommandQuotedString → No quote ✗
│     │     │  │  ├─ Try UnifiedCommandWord → Space stops word ✗
│     │     │  │  └─ Try UnifiedCommandSpace → Matches " " ✓
│     │     │  │     └─ Returns: Text node " "
│     │     │  │
│     │     │  └─ Token 3: "'<div>Hello</div>'"
│     │     │     ├─ Try UnifiedCommandVariable → @ not found ✗
│     │     │     └─ Try UnifiedCommandQuotedString → Matches ✓
│     │     │        └─ Single quote detected
│     │     │           └─ UnifiedCommandSingleQuotedContent*
│     │     │              ├─ No variable interpolation
│     │     │              ├─ No security checks inside quotes
│     │     │              └─ Returns: Text node "'<div>Hello</div>'"
│     │     │
│     │     └─ Result: Array of 3 Text nodes
│     │
│     ├─ _ ✓
│     └─ ")]" ✓
│
└─ Success: Command parsed with quoted content preserved
```

#### Key Implementation Details

1. **Token-Based Parsing**: Commands are parsed as discrete tokens, not character-by-character
2. **First-Match Semantics**: Peggy commits to the first successful token match
3. **Quote Handling**: Quoted strings are recognized as complete tokens BEFORE security checks
4. **Security Checks**: Only applied to UnifiedCommandWord (unquoted content)
5. **Variable Interpolation**: 
   - Double quotes: Variables are expanded (`"Hello @name"` → `"Hello "` + VariableReference + `""`)
   - Single quotes: No interpolation (`'Hello @name'` → `'Hello @name'`)

#### Why This Works

The token-based approach ensures that:
- Quotes are recognized at token boundaries, not mid-parse
- Security checks only apply to unquoted content
- Shell operators inside quotes are preserved as literal text
- Variable interpolation respects quote semantics

#### Common Misconceptions

1. **Character-by-character parsing**: The old approach that caused issues
2. **Security checks everywhere**: Only in unquoted content (UnifiedCommandWordChar)
3. **Quote consumption**: Quotes are preserved in the output, not consumed

### @text Directive

```
@text name = ...
├─ "[[" detected?
│  ├─ YES: Template
│  │  └─ [[TemplateContent]]
│  │     └─ {{var}} interpolation only
│  │
├─ "[" detected?
│  ├─ YES: Could be path or section
│  │  ├─ Contains " # "?
│  │  │  ├─ YES: [SectionExtraction]
│  │  │  │  └─ [path # section]
│  │  │  └─ NO: [PathContent]
│  │  │     └─ [/path/to/@var/file]
│  │
├─ "@run" detected?
│  ├─ YES: RunReference
│  │  └─ @run directive (see tree above)
│  │
└─ '"' or "'" detected?
   └─ QuotedLiteral
      └─ "simple string" (no interpolation)
```

### @data Directive

```
@data obj = ...
├─ "{" detected?
│  ├─ YES: ObjectLiteral
│  │  └─ { key: DataValue, ... }
│  │     └─ DataValue can be:
│  │        ├─ Primitive: "string", 123, true
│  │        ├─ @run [...] → Embedded directive
│  │        └─ Nested object/array
│  │
├─ "[" detected?
│  ├─ YES: ArrayLiteral
│  │  └─ [DataValue, DataValue, ...]
│  │     └─ Same DataValue options as above
│  │
├─ "@run" detected?
│  ├─ YES: DirectiveValue
│  │  └─ Execute and use result
│  │
└─ Other: PrimitiveValue
   └─ String, number, boolean, null
```

### @exec Directive

```
@exec name(params) = @run ...
└─ Must use @run:
   ├─ @exec cmd(p) = @run [(echo @p)]      - Command
   ├─ @exec fn(x) = @run js [(return x)]   - Code (language outside brackets)
   └─ @exec alias() = @run @other          - Reference
```

### @path Directive

```
@path var = ...
├─ "[" detected?
│  ├─ YES: BracketPath
│  │  └─ [@var/path/segments]
│  │
├─ '"' detected?
│  ├─ YES: QuotedPath
│  │  └─ "path with spaces"
│  │
└─ No delimiter?
   └─ UnquotedPath
      └─ @var/path/segments
```

### @import Directive

```
@import ...
├─ Security options? (optional)
│  ├─ (TTL): (10d), (30m), (static)
│  └─ trust: always, verify, never
│
├─ Import pattern?
│  ├─ { imports } from source → Selective import
│  │  ├─ { var1, var2 } → Named imports
│  │  ├─ { var1 as alias1 } → Aliased imports
│  │  └─ { * } → Import all (explicit)
│  │
│  └─ source (no braces) → Import all (implicit)
│
└─ Source types:
   ├─ @input → Special stdin/pipe input
   ├─ @author/module → Registry module
   ├─ @resolver/path/to/mod → Module with path
   ├─ [@var/path.mld] → Path with variables
   ├─ [path/to/file.mld] → Local file path
   ├─ [https://url.com/file] → Remote URL
   └─ "path/to/file.mld" → Quoted path

Full syntax examples:
- @import { x, y } from [path/to/file.mld]
- @import { x as X } from @author/module
- @import [file.mld] (10d) trust always
- @import { * } from [@pathvar/file.mld]
- @import { data } from @input
- @import @corp/utils (static) trust verify
```

### @add Directive

```
@add ...
├─ "foreach" detected?
│  ├─ YES: ForeachExpression
│  │  └─ foreach @command(@arrays) [with options]
│  │     └─ Text concatenation mode
│  │        └─ Default separator: "\n"
│  │
├─ "[[" detected?
│  ├─ YES: TemplateContent
│  │  └─ [[text with {{vars}}]]
│  │
├─ "[" detected?
│  ├─ YES: PathOrSection
│  │  └─ Same logic as @text
│  │
├─ "@" detected?
│  ├─ YES: VariableReference
│  │  └─ @varname to output
│  │
└─ '"' detected?
   └─ LiteralContent
      └─ "text to add"
```

### @output Directive

```
@output ...
├─ "@" variable/command detected?
│  ├─ YES: Output variable/command result
│  │  ├─ @output @var [file.md]
│  │  │  └─ Variable content → file
│  │  │
│  │  ├─ @output @template(args) [file.md]
│  │  │  └─ Template result → file
│  │  │
│  │  └─ @output @cmd(args) [file.md]
│  │     └─ Command result → file
│  │
│  └─ Followed by "[" path?
│     └─ [path/to/file.md]
│        └─ Path can have @var interpolation
│
├─ '"' string detected?
│  ├─ YES: Output literal text
│  │  └─ @output "text content" [file.md]
│  │     └─ Literal text → file
│  │
├─ "[" path detected (no source)?
│  ├─ YES: Output full document
│  │  └─ @output [file.md]
│  │     └─ Complete document → file
│  │
└─ Other patterns
   └─ Parse error (invalid syntax)

Usage in @when blocks:
- @when @condition => @output [file.md]
- @when @var: [@cond => @output @result [file.md]]
```

## Parse Tree Maintenance

When modifying the grammar:

1. **FIRST**: Update the parse tree for affected directives
2. **SECOND**: Ensure the tree accurately reflects all branches
3. **THIRD**: Implement changes that match the tree
4. **FOURTH**: Verify tests match the tree structure

The parse trees are the source of truth for grammar behavior. Any mismatch between trees and implementation is a bug.

## Pattern Usage Guide

### Variable References
Always use the patterns from `patterns/variables.peggy`:

```peggy
// Direct variable reference: @varname
AtVar

// Template interpolation: {{varname}}
InterpolationVar

// ❌ NEVER create local variable patterns
```

### Content Handling
Use the appropriate wrapped pattern from `patterns/content.peggy`:

```peggy
// For paths (quotes, brackets, or unquoted)
WrappedPathContent

// For templates (quotes or double brackets)
WrappedTemplateContent  

// For commands (all interpolation types)
WrappedCommandContent

// For code blocks
WrappedCodeContent
```

### List Parsing
Use generic patterns (to be created in `patterns/lists.peggy`):

```peggy
// Instead of writing custom list logic:
ParameterList = GenericList(Parameter, CommaSpace)
ArgumentList = GenericList(Argument, CommaSpace)
```

### Directive Cores
Use core patterns from `core/` for directive logic:

```peggy
// ❌ BAD: Inline template parsing in directive
AtText = "@text" _ id:BaseIdentifier _ "=" _ template:TemplateStyleInterpolation { 
  // inline logic 
}

// ✅ GOOD: Use TemplateCore
AtText = "@text" _ id:BaseIdentifier _ "=" _ template:TemplateCore {
  // Use template.values, template.raw, template.meta
}
```

## Grammar Rule Format Standards

For consistency across all grammar files, follow these formatting standards:

### Rule Definition Format
```peggy
// PATTERN NAME - Short description
// Used by: List of directives/patterns that use this
// Purpose: What this pattern matches and why

PatternName "Human-readable description"
  = /* implementation */
```

### Naming Requirements
1. **Rule Names**: PascalCase for all rules
2. **Comments**: Include a string literal description after the rule name
3. **Debug Statements**: Standardized format for debug output
   ```peggy
   helpers.debug('RuleName matched', { details });
   ```
4. **Location Capture**: Consistent location capture for AST nodes
   ```peggy
   return helpers.createNode(NodeType.Text, { content }, location());
   ```

### Implementation Guidelines
1. Use the correct prefix/suffix combination that best describes the rule's purpose and level
2. Maintain consistency within abstraction levels
3. Document each rule with a clear string description
4. Use structured debug output with rule name and relevant details
5. Follow the abstraction hierarchy for rule dependencies

## Anti-Patterns to Avoid

### 1. **Local Variable Redefinition**
```peggy
// ❌ ANTI-PATTERN
MyRule = content:('[' parts:(MyLocalVar / Text)* ']')
MyLocalVar = "@" id:BaseIdentifier { /* reimplements AtVar */ }

// ✅ GOOD: Using existing pattern with context
BracketContent = '[' parts:(AtVar / TextSegment)* ']'
```

### 2. **Duplicate List Logic**
```peggy
// ❌ ANTI-PATTERN  
Rule1List = first:Item rest:(_ "," _ item:Item { return item; })* { return [first, ...rest]; }
Rule2List = first:Thing rest:(_ "," _ thing:Thing { return thing; })* { return [first, ...rest]; }

// ✅ GOOD: Abstract the pattern
GenericList(ItemRule, Separator)
  = first:ItemRule rest:(Separator item:ItemRule { return item; })* {
      return [first, ...rest];
    }
```

### 3. **Inline Metadata Creation**
```peggy
// ❌ ANTI-PATTERN
{
  const meta = {
    path: {
      hasVariables: /* complex logic */,
      isAbsolute: rawPath.startsWith('/'),
      // repeated everywhere
    }
  };
}

// ✅ GOOD: Use helper functions for metadata creation
{ return helpers.createPathMeta(rawPath, variables); }
```

### 4. **Ignoring Core Abstractions**
```peggy
// ❌ ANTI-PATTERN: Not using available cores
AtAdd = "@add" _ content:DoubleBracketContent {
  // Manually handling what TemplateCore does
}

// ✅ GOOD: Use directive cores for common logic
AtAdd = "@add" _ content:TemplateCore {
  // Use content.values, content.raw, content.meta
}
```

### 5. **Inconsistent Naming**
```peggy
// ❌ ANTI-PATTERN: Not following naming conventions
myCustomVar = /* ... */        // Should be PascalCase
Path_Segment = /* ... */       // No underscores
pathpattern = /* ... */        // Should be PathPattern

// ✅ GOOD: Follow naming conventions
MyCustomVar = /* ... */
PathSegment = /* ... */
PathPattern = /* ... */
```

### 6. **Creating Duplicate Patterns**
```peggy
// ❌ ANTI-PATTERN: Creating new pattern instead of using existing
BracketVar = "@" id:BaseIdentifier { /* duplicate logic */ }

// ✅ GOOD: Using existing pattern from patterns/variables.peggy
// Import and use AtVar which already handles this case
```

## Pattern Deprecation and Removal

When identifying legacy patterns that should be cleaned up:

1. **Mark with comment**: `// DEPRECATED: Use AtVar instead`
2. **Remove in next major refactor**
3. **Never use in new code**

Example: `PathVar` is deprecated in favor of `AtVar`

This ensures a clean migration path while preventing further technical debt.

## Development Workflow

### 1. **Before Creating a New Pattern**
- Check if it exists in `base/`, `patterns/`, or `core/`
- Check if a similar pattern can be generalized
- Ensure you're at the right abstraction level

### 2. **When Adding to a Directive**
- Use existing patterns from lower levels
- Don't reimplement variable, content, or list parsing
- Use directive cores for common logic

### 3. **Testing Patterns**
```bash
# Test your grammar changes
npm run build:grammar
npm run ast -- '@your directive syntax'

# Run tests to ensure nothing breaks
npm test grammar/
```

### 4. **Pattern Documentation**
Each pattern should have:
```peggy
// PATTERN NAME - Short description
// Used by: List of directives/patterns that use this
// Purpose: What this pattern matches and why

PatternName "Human-readable description"
  = /* implementation */
```

## File Organization

```
grammar/
├── base/           # Level 1: Core primitives
├── patterns/       # Levels 2-5: Reusable patterns
├── core/          # Level 6: Directive cores
├── directives/    # Level 7: Directive implementations
├── deps/          # Source dependency files
├── parser/        # Source interface only
│   └── index.ts   # Parser wrapper (imports from generated/)
├── generated/     # All generated files (gitignored)
│   └── parser/    # Generated parser and deps
└── README.md      # This comprehensive guide
```

## Common Tasks

### Adding a New Directive
1. Check if similar directives exist
2. Identify required patterns (variable, content, list handling)
3. Use existing patterns and cores
4. Add to `directives/` with proper naming
5. Update `mlld.peggy` to include it

### Creating a Shared Pattern
1. Identify duplication across files
2. Abstract to appropriate level
3. Place in correct directory
4. Update all usages to import
5. Document in the pattern file

### Refactoring Existing Code
1. Identify anti-patterns using this guide
2. Find or create appropriate abstraction
3. Update incrementally, testing each change
4. Ensure all tests pass

## Debugging

```javascript
// Use helpers.debug for tracing
helpers.debug('RuleName matched', { 
  data: relevantData,
  location: location() 
});
```

## Review Checklist

Before committing grammar changes:

- [ ] No duplicate patterns introduced
- [ ] Used existing abstractions where available  
- [ ] Followed naming conventions
- [ ] Added pattern documentation
- [ ] All tests pass
- [ ] Used `npm run ast` to verify output
- [ ] No inline variable/list/content parsing

## Resources

- [docs/dev/AST.md](../../docs/dev/AST.md) - AST structure guide
- [grammar/docs/SEMANTIC-PARSING.md](./docs/SEMANTIC-PARSING.md) - Semantic parsing approach
- [grammar/docs/BRACKET-HANDLING-DESIGN.md](./docs/BRACKET-HANDLING-DESIGN.md) - Bracket handling design
- [Peggy.js Documentation](https://peggyjs.org/) - Parser generator docs
- `npm run ast -- '<mlld syntax>'` - Test AST output for any valid mlld syntax

## Lessons Learned the Hard Way

### The Delimiter Standardization Disaster

**What We Tried**: Standardize delimiter semantics (`"..."` = literal, `[...]` = interpolated, `[[...]]` = templates) across the grammar.

**What Went Wrong**: We violated every core grammar principle and turned 11 failing tests into 50+ failing tests.

#### Critical Mistakes Made

1. **Violated Abstraction-First Design** ❌  
   **WRONG**: Added custom delimiter logic directly in individual directives  
   **RIGHT**: Fix the underlying abstractions (`WrappedPathContent`, `TemplateCore`) once

2. **Violated Single Source of Truth** ❌  
   **WRONG**: Created duplicate delimiter handling across multiple directives  
   **RIGHT**: Implement delimiter semantics in core patterns, inherit everywhere

3. **Ignored Existing Abstractions** ❌  
   **WRONG**: Bypassed existing abstractions and implemented custom parsing  
   **RIGHT**: Fix `BracketContent` and `TemplateCore` to handle semantics correctly

4. **Classic Anti-Pattern: Not Using Available Cores** ❌  
   ```peggy
   // ❌ WHAT WE DID: Custom template parsing in @add
   @add _ '"' content:EscapedStringContent '"' {
     // Manual handling of what TemplateCore should do
   }
   
   // ✅ WHAT WE SHOULD HAVE DONE: Use TemplateCore with fixed semantics
   @add _ template:TemplateCore {
     // TemplateCore handles all delimiter logic
   }
   ```

#### The Fundamental Lesson

**Architectural changes require architectural solutions.** When a problem spans multiple directives, the solution belongs in the shared abstractions, not in individual directive implementations.

#### Process Lessons

1. **Read the Grammar Principles First** - Don't skip studying this README before system changes
2. **Understand Before Changing** - Don't jump into implementation without understanding existing abstractions  
3. **Bottom-Up vs Top-Down** - Fix core abstractions first, then let directives inherit the behavior
4. **Test Core Patterns** - Test abstractions before testing individual directives

#### Recovery Strategy

When you find yourself in a similar situation:
1. **Stop adding point solutions** to individual directives
2. **Revert and restart** with proper abstraction analysis
3. **Fix shared patterns once** rather than fixing symptoms everywhere
4. **Use the grammar's existing architecture** instead of fighting it

The grammar's "abstraction-first design" principle exists precisely to avoid this kind of systemic breakage. By violating it, we created exactly the kind of maintenance nightmare the architecture was designed to prevent.
