# Path Syntax: Recovering Semantic Clarity

## The Critical Insight

The distinction between `[...]` and `"..."` isn't about syntax preference - it's about **semantic intent**:

- `[path/to/file.md]` → "Get me the CONTENTS of this file"
- `"path/to/file.md"` → "Get me this STRING value"

This is a fundamental difference that the current grammar changes have obscured.

## Why This Distinction Matters

### Clear Intent Examples

```mlld
# CLEAR: I want the file contents
/text @readme = [./README.md]
/add [./header.md]

# CLEAR: I want the string value
/text @filename = "./README.md"
/path @docsDir = "./documentation"

# AMBIGUOUS with current grammar: What do I want?
/text @value = "./config.json"  # Contents or string?
```

### The Resolver Consistency

Resolvers naturally follow the bracket pattern because they ALWAYS mean "get the value":

```mlld
# These are semantically consistent:
/import { config } from [./config.mld]       # Get contents via path
/import { config } from @corp/config         # Get contents via resolver

# The resolver can omit brackets because no ambiguity exists:
@corp/config  # Can't have spaces, always means "get value"
```

## Current Grammar Problems

### 1. Semantic Ambiguity in Directives

```mlld
# What does this mean?
/path @config = "config.json"

# Option A: Store the string "config.json"
# Option B: Store a reference that will load config.json
# Option C: Load config.json contents now?

# With brackets, it's clear:
/path @config = "./config.json"    # String value
/path @config = [./config.json]    # Path reference (not contents)
```

### 2. Lost Expressiveness

The current grammar can't easily express:
- "I want to store the literal path string for later use"
- "I want to load these contents now"
- "I want a reference to this path"

### 3. Context-Dependent Parsing

We need complex context rules to guess intent:
```peggy
QuotedPath
  = &{ return isInPathDirective(); } QuotedPathReference
  / &{ return isInTextDirective(); } QuotedPathOrString  // Ambiguous!
  / &{ return isInAddDirective(); } QuotedPathContents
```

## Proposed Semantic Model

### Core Rules

1. **Brackets `[...]` = Dereference Operator**
   - Always means "get the value at this location"
   - For files: load contents
   - For URLs: fetch contents
   - For sections: extract section

2. **Quotes `"..."` = String Literal**
   - Always means "this string value"
   - Supports interpolation with `@var`
   - Never loads external content

3. **Bare Resolvers = Implicit Dereference**
   - `@corp/module` implicitly means `[@corp/module]`
   - Works because resolvers can't have spaces

### Directive Semantics

```mlld
# /text - Assigns text content
/text @a = "config.json"        # a = "config.json" (string)
/text @b = [config.json]        # b = <contents of config.json>
/text @c = `Path: @a`           # c = "Path: config.json"

# /path - Creates path references
/path @a = "./docs"             # a = path object pointing to ./docs
/path @b = [./config.json]      # ERROR: Can't assign contents to path
/path @c = "docs/@section"      # a = path to "docs/<section value>"

# /add - Outputs content
/add "Hello world"              # Output: "Hello world"
/add [./README.md]              # Output: <contents of README.md>
/add @myvar                     # Output: <value of myvar>

# /import - Loads from sources
/import { x } from "./utils.mld"     # Traditional file import
/import { x } from [./utils.mld]     # Equivalent (explicit)
/import { x } from @corp/utils       # Resolver import
```

## Benefits of Restoration

### 1. Semantic Clarity (Confidence: 98%)
Every syntax has ONE clear meaning:
- See `[...]` → Know it's dereferencing/loading
- See `"..."` → Know it's a string literal
- See `@resolver/...` → Know it's module loading

### 2. Reduced Context Needs (Confidence: 95%)
No need for complex context detection:
```peggy
// Simple rule
BracketPath = "[" path:PathContent "]" {
  return helpers.createDereferenceNode(path);
}

// Instead of context-dependent:
QuotedSomething = "..." {
  // What is this? String? Path? Command?
  // Need context to know!
}
```

### 3. Enhanced Expressiveness (Confidence: 97%)
Can clearly express different intents:
```mlld
# Store path for later use
/data @config = {
  "readmePath": "./README.md",      # String value
  "readmeContent": [./README.md]    # Loaded content
}

# Conditional loading
/text @file = "./data.json"
/when @needsData => /text @data = [@file]  # Load when needed
```

### 4. Consistency with Design (Confidence: 96%)
Aligns with mlld philosophy:
- **Explicit over implicit** ✓
- **Clear visual distinctions** ✓
- **No magic** ✓

## Implementation Impact

### Grammar Simplification

```peggy
// REMOVE: Complex quoted path handling in directives
// No more guessing if "..." is a path or string

// KEEP: Simple, clear patterns
StringLiteral = '"' content:QuotedContent '"' {
  return helpers.createStringNode(content);
}

PathDereference = '[' path:PathContent ']' {
  return helpers.createDereferenceNode(path);
}
```

### Migration Examples

```mlld
# Old (ambiguous)
/text @config = "config.json"
/add "header.md"

# New (clear)
/text @config = [./config.json]    # Load contents
/text @configPath = "./config.json" # Store path string
/add [./header.md]                  # Add file contents
/add "# Header"                     # Add literal text
```

## Edge Cases Resolved

### 1. Dynamic Path Building
```mlld
/text @userFile = "data/@username/profile.json"  # Build path string
/data @profile = [@userFile]                      # Load when needed
```

### 2. Path vs Content in Conditionals
```mlld
/when @useDefault: [
  true  => /text @config = [./defaults.json]    # Load contents
  false => /text @config = @userProvidedConfig  # Use existing
]
```

### 3. Templates with Paths
```mlld
/text @report = `
  Config location: @configPath
  Config contents: @[configPath]
`
# Wait, can't do @[...] syntax... need to load separately
/text @configData = [@configPath]
/text @report = `
  Config location: @configPath
  Config contents: @configData
`
```

## Conclusion

The bracket/quote distinction isn't redundant syntax - it's a **critical semantic operator**. Removing this distinction in favor of "simplicity" actually creates complexity through ambiguity.

**Recommendation (Confidence: 97%)**: Restore the semantic distinction:
- `[...]` = dereference/load content
- `"..."` = string literal
- `@resolver/...` = implicit dereference (no brackets needed)

This change would:
1. Eliminate the need for QuotedContentContext
2. Reduce parser complexity
3. Increase language expressiveness
4. Align with mlld's explicit-over-implicit philosophy

The syntax difference makes the semantic difference visible, which is exactly what mlld is designed to do.