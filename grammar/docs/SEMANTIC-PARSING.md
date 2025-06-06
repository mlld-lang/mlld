# Semantic Parsing in mlld Grammar

## Overview

The mlld grammar uses a **semantic-first parsing approach** where directives determine their content parsing rules based on context, rather than trying to guess intent from delimiters. This document explains how this system works and why it's designed this way.

## Core Philosophy

**Principle**: Same syntax can have different semantics based on context. The directive chooses its semantic parser.

Instead of having universal patterns that try to guess what `[...]` means everywhere, each directive knows what kind of content it expects and selects the appropriate parser.

## The Problem We Solved

Previously, the grammar had universal bracket handlers with complex lookaheads trying to guess context:

```peggy
// ❌ OLD: Universal bracket parser trying to guess context
BracketContent = "[" content:UniversalContent "]"
  &{
    // Complex lookahead to guess if this is a path, command, or section
    const hasHash = content.includes(' # ');
    const looksLikePath = /\.[a-zA-Z]{2,4}$/.test(content);
    // ... more guessing logic
  }
```

This approach was fragile and led to incorrect parsing when the same syntax had different meanings in different contexts.

## The Semantic Solution

Now, directives explicitly choose their semantic parsers:

```peggy
// ✅ NEW: Directive chooses semantic parser
AtRun
  = "@run" _ lang:Language _ code:CodeContent    // Language → Code semantics
  / "@run" _ command:CommandContent              // No language → Command semantics
```

## Content Pattern Hierarchy

### 1. Semantic Content Patterns

These patterns know their parsing context:

#### SemanticCommandBracketContent
- **Purpose**: Parse shell commands
- **Context**: `@run [echo "test"]`, `@exec cmd = @run [grep -v error]`
- **Features**: 
  - Preserves quotes for shell semantics
  - Allows @variable interpolation
  - Handles nested brackets naturally

```peggy
SemanticCommandBracketContent
  = '[' parts:(SpecialVariable / Variable / QuotedCommandString / CommandTextContent)* ']'
```

#### SemanticCodeContent
- **Purpose**: Parse code blocks literally
- **Context**: `@run python [data[0] = [1,2,3]]`
- **Features**:
  - NO variable interpolation
  - Preserves ALL characters literally
  - Natural bracket nesting

```peggy
SemanticCodeContent
  = '[' content:$(CodeLiteralContent) ']' {
      // Everything is literal - no @ processing
    }
```

#### SemanticPathContent
- **Purpose**: Parse file paths
- **Context**: `@path p = [@var/file.txt]`, `@import { * } from [./config.mld]`
- **Features**:
  - @variable interpolation
  - Path separators as distinct nodes
  - Section extraction support

```peggy
SemanticPathContent
  = '[' parts:PathParts ']' {
      // Return path components for processing
    }
```

### 2. Wrapper Patterns

These provide consistent interfaces for directives:

- **WrappedPathContent**: Handles path reconstruction and metadata
- **WrappedTemplateContent**: Manages template interpolation
- **WrappedCommandContent**: Processes command structure
- **WrappedCodeContent**: Preserves code literally

### 3. Interpolation Patterns

Different contexts use different variable syntax:

- **AtVar**: `@varname` in paths and commands
- **InterpolationVar**: `{{varname}}` in templates
- **SpecialVariable**: `@.`, `@TIME`, `@INPUT` (case-insensitive)

## How Directives Choose Parsers

### @run Directive

```
@run ...
├─ [Language] detected?
│  ├─ YES: "@run python ..."
│  │  └─ SemanticCodeContent
│  │     └─ Preserves everything literally
│  │
│  └─ NO: "@run ..."
│     └─ SemanticCommandBracketContent
│        └─ Shell command with @var interpolation
```

### @text Directive

```
@text name = ...
├─ "[[" detected?
│  ├─ YES: Template
│  │  └─ TemplateContent with {{var}}
│  │
├─ "[" detected?
│  ├─ YES: Path
│  │  └─ SemanticPathContent with @var
│  │
├─ "@run" detected?
│  ├─ YES: RunReference
│  │  └─ Delegates to @run semantics
│  │
└─ Quote detected?
   └─ Literal string (no interpolation)
```

### @path Directive

```
@path var = ...
├─ "[" detected?
│  ├─ YES: BracketPath
│  │  └─ SemanticPathContent
│  │
├─ '"' detected?
│  ├─ YES: QuotedPath
│  │  └─ Literal path (no interpolation)
│  │
└─ No delimiter?
   └─ UnquotedPath with @var
```

## Special Variables

The grammar supports special reserved variables with case-insensitive matching:

- `@.` → `@PROJECTPATH`
- `@time`, `@TIME`, `@Time` → `@TIME`
- `@input`, `@INPUT` → `@INPUT`
- `@stdin` → `@INPUT` (deprecated)
- `@projectpath`, `@PROJECTPATH` → `@PROJECTPATH`

## Benefits of Semantic Parsing

1. **Clarity**: Each directive knows exactly what it's parsing
2. **No Ambiguity**: Same syntax can mean different things in different contexts
3. **Better Error Messages**: Parser knows what was expected
4. **Maintainability**: Changes to one directive don't affect others
5. **Performance**: No complex lookaheads or backtracking

## Implementation Guidelines

When adding new directives or content types:

1. **Define the Semantic Parser**: Create a specific parser for your content type
2. **Choose at the Directive Level**: Let the directive select the appropriate parser
3. **Don't Guess**: Never try to determine meaning from syntax alone
4. **Document the Choice**: Make it clear in the grammar why each branch exists

## Example: Adding a New Directive

If you wanted to add a hypothetical `@shell` directive that executes shell scripts:

```peggy
AtShell
  = "@shell" _ "bash" _ script:ShellScriptContent    // Bash script
  / "@shell" _ "zsh" _ script:ShellScriptContent     // Zsh script
  / "@shell" _ command:SemanticCommandBracketContent // Single command

ShellScriptContent
  = "[" content:$(ShellScriptLiteral) "]" {
      // Custom parsing for multi-line shell scripts
    }
```

The key is that `@shell` explicitly chooses how to parse its content based on what follows the directive, not by examining the content itself.

## Common Pitfalls to Avoid

1. **Don't Create Universal Patterns**: Avoid patterns that try to work everywhere
2. **Don't Use Complex Lookaheads**: Let directives make explicit choices
3. **Don't Mix Contexts**: Keep command, code, path, and template parsing separate
4. **Don't Forget Special Variables**: Always support @., @TIME, etc. where variables are allowed

## Testing Semantic Parsers

Each semantic context should be tested independently:

```bash
# Test command parsing
npm test grammar/tests/semantic/command.test.ts

# Test code parsing  
npm test grammar/tests/semantic/code.test.ts

# Test path parsing
npm test grammar/tests/semantic/path.test.ts
```

## Debugging

When debugging parsing issues:

1. Check which semantic parser the directive is using
2. Verify the content matches what that parser expects
3. Look for context predicates that might be interfering
4. Use `--debug` flag to see parser decisions

```bash
npm run ast -- '@run [echo test]' --debug
```

## Future Considerations

The semantic parsing approach makes it easy to:

- Add new content types without affecting existing ones
- Support different interpolation styles in different contexts
- Provide better error messages and recovery
- Enable context-aware syntax highlighting

Remember: **The directive chooses the parser, not the other way around.**