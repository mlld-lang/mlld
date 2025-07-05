# Fuzzy Matching with Path Variables: Technical Analysis

## Executive Summary

The mlld fuzzy matching system works well for literal paths but encounters fundamental challenges when path variables are interpolated within bracket syntax like `[@folder/readme.md]`. This document analyzes the root causes and proposes solutions.

## The Problem

Consider this failing test case:
```mlld
/path @folder = "./my_projects"
/var @content = [@folder/readme.md]  # Parse error!
```

Expected behavior:
1. Resolve `@folder` to `"./my_projects"`
2. Construct path `"./my_projects/readme.md"`
3. Apply fuzzy matching to find `"/My Projects/README.md"`

Actual behavior:
- Parse error at line 2, column 1: "Expected valid directive but found '/'"

## Root Cause Analysis

### 1. Parse-Time vs Runtime Separation

The mlld architecture maintains strict separation between parsing and interpretation:

**Parse Time:**
- Grammar identifies `@folder` as a VariableReference node
- Grammar identifies `/` as a PathSeparator
- Grammar identifies `readme.md` as PathTextSegment
- Result: AST with structure `[VariableReference, PathSeparator, Text]`

**Runtime:**
- Interpreter evaluates the VariableReference to get `"./my_projects"`
- Interpreter must reconstruct the complete path
- Fuzzy matcher needs the full path string to work

### 2. Current Path Resolution Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Parser        │     │   Interpreter   │     │  Fuzzy Matcher  │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ [@folder/file]  │ --> │ Evaluate nodes  │ --> │ Match full path │
│                 │     │ Reconstruct     │     │ "./my_projects/ │
│ AST:            │     │ path string     │     │ readme.md"      │
│ - VarRef        │     │                 │     │                 │
│ - PathSep       │     │                 │     │ Find:           │
│ - Text          │     │                 │     │ "/My Projects/  │
└─────────────────┘     └─────────────────┘     │ README.md"      │
                                                 └─────────────────┘
```

### 3. Why The Parse Error Occurs

The error "Expected valid directive but found '/'" suggests the parser is exiting the bracket context prematurely after encountering the variable reference. This could be due to:

1. Grammar ambiguity in how PathParts handles variable references
2. Context loss when transitioning from variable to path separator
3. Incorrect lookahead or backtracking in the parser

## Technical Constraints

### 1. AST Immutability
- The AST must represent the source structure accurately
- We cannot "pre-resolve" variables during parsing
- The AST is used for error reporting and must map to source positions

### 2. Fuzzy Matching Requirements
- Needs complete path strings to normalize (spaces → dashes/underscores)
- Must handle case-insensitive matching on full paths
- Cannot work on path fragments

### 3. Performance Considerations
- Fuzzy matching is expensive (directory scanning, string normalization)
- Caching requires full path keys
- Partial paths would require multiple filesystem scans

## Solution Options

### Option 1: Enhanced Path Reconstruction (Recommended)

Modify the interpreter's path evaluation to better handle variable interpolation:

```typescript
// In path evaluator
async function evaluatePathParts(parts: Node[], env: Environment): Promise<string> {
  const segments: string[] = [];
  let currentSegment = '';
  
  for (const part of parts) {
    if (part.type === 'VariableReference') {
      const value = await evaluateVariable(part, env);
      // Don't add separator if value already ends with one
      currentSegment += value.replace(/\/$/, '');
    } else if (part.type === 'PathSeparator') {
      if (currentSegment) {
        segments.push(currentSegment);
        currentSegment = '';
      }
    } else if (part.type === 'Text') {
      currentSegment += part.content;
    }
  }
  
  if (currentSegment) {
    segments.push(currentSegment);
  }
  
  return segments.join('/');
}
```

**Pros:**
- Maintains current grammar structure
- Preserves AST accuracy
- Minimal code changes

**Cons:**
- Complex edge cases (what if variable contains separators?)
- May not handle all path construction patterns

### Option 2: Grammar-Level Path String Support

Add alternative grammar rule that treats bracketed content as a single interpolated string:

```peggy
// New rule for string-style path interpolation
StringStylePath
  = '[' parts:PathStringParts ']' {
      return {
        type: 'interpolatedPath',
        parts: parts,
        requiresStringReconstruction: true
      };
    }

PathStringParts
  = parts:(Variable / PathStringText)* {
      return parts;
    }

PathStringText
  = chars:(![@\]] .)+ {
      return helpers.createNode(NodeType.Text, { 
        content: chars.join(''), 
        location: location() 
      });
    }
```

**Pros:**
- Simpler mental model
- Natural string interpolation
- Easier fuzzy matching integration

**Cons:**
- Requires grammar changes
- May break existing path parsing
- Less structured AST representation

### Option 3: Preprocessing Pass

Add a preprocessing step that resolves simple variable references before fuzzy matching:

```typescript
interface PathPreprocessor {
  // Resolve variables in path before fuzzy matching
  async preprocessPath(
    pathParts: Node[], 
    env: Environment
  ): Promise<string | PreprocessedPath>;
}

class PreprocessedPath {
  constructor(
    public literal: string,      // Resolved path string
    public hasVariables: boolean, // Had variable interpolation
    public original: Node[]      // Original AST nodes
  ) {}
}
```

**Pros:**
- Clean separation of concerns
- Extensible for future path features
- Preserves original AST

**Cons:**
- Additional complexity layer
- Performance overhead
- May duplicate logic

### Option 4: Document as Limitation

Accept this as a known limitation and provide clear workarounds:

```mlld
# Instead of this (doesn't work):
/path @folder = "./my_projects"
/var @content = [@folder/readme.md]

# Use one of these workarounds:
# Option A: Use run with cat
/var @content = run {cat "@folder/readme.md"}

# Option B: Use string concatenation in command
/var @file = run {echo "@folder/readme.md"}
/var @content = [@file]

# Option C: Use direct paths
/var @content = [./my_projects/readme.md]
```

**Pros:**
- No code changes required
- Clear user guidance
- Avoids complexity

**Cons:**
- User experience impact
- Inconsistent behavior
- May limit adoption

## Recommendation

**Short-term:** Implement Option 4 (Document as Limitation) with clear workarounds in the documentation and helpful error messages.

**Medium-term:** Implement Option 1 (Enhanced Path Reconstruction) as it:
- Requires minimal changes
- Preserves existing architecture
- Solves most common use cases

**Long-term:** Consider Option 2 (Grammar-Level Path String Support) if:
- User feedback indicates this is a common pain point
- We need to support more complex path interpolation patterns
- We're willing to make breaking changes for mlld 2.0

## Implementation Notes

### For Option 1 Implementation

1. **Modify path evaluators** in:
   - `interpreter/eval/show.ts`
   - `interpreter/eval/var.ts`
   - `interpreter/eval/import.ts`
   - `interpreter/eval/add.ts`

2. **Add path reconstruction utilities** to handle:
   - Variables containing path separators
   - Windows vs Unix path separators
   - Relative vs absolute path resolution

3. **Update tests** to cover:
   - Variable with trailing slash: `/path @dir = "./folder/"`
   - Variable with multiple segments: `/path @deep = "./a/b/c"`
   - Mixed separators: `[@winPath\\file.txt]`

### Error Message Improvements

When encountering this pattern, provide helpful error messages:

```
Error: Cannot interpolate path variable '@folder' within bracket syntax
  at line 2, column 15
  
  /var @content = [@folder/readme.md]
                  ^^^^^^^^^^^^^^^^^

This syntax is not currently supported. Try one of these alternatives:

1. Use a run command:
   /var @content = run {cat "@folder/readme.md"}

2. Use the full path directly:
   /var @content = [./my_projects/readme.md]

See: https://mlld.org/docs/fuzzy-matching#path-variables
```

## Testing Considerations

### Test Cases to Add

```mlld
# Basic variable interpolation
/path @dir = "./tests"
/var @file1 = run {echo "@dir/file.txt"}  # Workaround

# Variable with trailing slash
/path @dir = "./tests/"
/var @file2 = run {echo "@dir/file.txt"}  # Should not double slash

# Nested paths
/path @base = "./projects"
/path @sub = "frontend"
/var @deep = run {echo "@base/@sub/index.js"}

# Windows paths (future consideration)
/path @win = "C:\\Users\\Test"
# How should this work with fuzzy matching?
```

## Conclusion

The path variable interpolation issue represents a fundamental architectural challenge in mlld. While the current limitation is unfortunate, the proposed solutions provide a clear path forward that balances user experience with implementation complexity. The key insight is that fuzzy matching requires complete path strings, which conflicts with the AST's structural representation of paths with embedded variables.