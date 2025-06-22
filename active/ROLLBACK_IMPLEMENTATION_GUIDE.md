# Rollback Implementation Guide

## Decision: Start Fresh from Main Branch

Based on the analysis, we should start fresh from the main branch rather than trying to fix the current new-grammar branch. Here's why and how.

## Why Start Fresh

1. **Semantic Model Intact**: Main branch has the correct `[...]` = load, `"..."` = string model
2. **Known Good State**: Everything works, just needs syntax updates
3. **Avoid Cascade Issues**: Current branch has pattern duplication and semantic ordering problems
4. **Cleaner History**: Clear record of what changed and why

## Implementation Steps

### Step 1: Create New Branch
```bash
git checkout main
git checkout -b new-grammar-v2
```

### Step 2: Update Directive Markers

**Files to update**:
- All files in `grammar/directives/*.peggy`
- `grammar/base/context.peggy`
- `grammar/base/tokens.peggy` (add SlashDirectiveMarker)

**Change**:
```peggy
// OLD
DirectiveContext "@add"

// NEW  
DirectiveContext "/add"
```

### Step 3: Update Command Brackets

**Files to update**:
- `grammar/patterns/unified-run-content.peggy`
- `grammar/core/run-command-core.peggy`
- Any exec patterns

**Change**:
```peggy
// OLD
"[(" _ parts:UnifiedCommandParts _ ")]"

// NEW
"{" _ parts:UnifiedCommandParts _ "}"
```

### Step 4: Add Quoted Command Syntax

**Add to** `grammar/directives/run.peggy`:
```peggy
// After existing patterns, before command reference
/ DirectiveContext "/run" _ command:QuotedCommand {
    // Handle quoted commands
  }
```

**Define** `QuotedCommand`:
```peggy
QuotedCommand
  = '"' content:DoubleQuotedCommandContent '"' { 
      return { quoted: true, content }; 
    }
  / "'" content:SingleQuotedCommandContent "'" {
      return { quoted: true, literal: true, content };
    }
```

### Step 5: Update Comment Syntax

**Files to update**:
- `grammar/patterns/comments.peggy`

**Change**:
```peggy
// OLD
">>" _ content:CommentContent

// NEW
"//" _ content:CommentContent
```

### Step 6: Preserve Semantic Model

**DO NOT CHANGE**:
- `PathStyleInterpolation` - Keep brackets only
- `StringLiteral` vs `BracketContent` distinction
- Section extraction patterns with `#`

**Key principle**: 
- `[...]` ALWAYS means dereference/load
- `"..."` ALWAYS means string literal

### Step 7: Update Tests

Focus on:
1. Directive marker changes
2. Command bracket changes  
3. Comment syntax
4. New quoted command feature

But verify:
- `[file.md]` still loads content
- `"file.md"` is still a string
- No ambiguity in parsing

## What NOT to Do

### Don't Add Quoted Path Loading
```peggy
// ❌ NEVER add this:
/ DirectiveContext "/add" _ path:QuotedPath {
    // This creates ambiguity!
  }
```

### Don't Create Context Ambiguity
```peggy
// ❌ AVOID:
QuotedContent = &{ isPathContext() } LoadPath / StringLiteral

// ✅ KEEP:
QuotedContent = StringLiteral  // Always literal
BracketPath = "[" path "]"   // Always loads
```

### Don't Duplicate Patterns
- Use shared patterns from `patterns/`
- Don't copy quoted path parsing into each directive

## Testing Strategy

### Phase 1: Syntax Tests
```mlld
# Test new directive syntax
/text @name = "Alice"         ✓
/run {echo "Hello"}           ✓
/add [README.md]              ✓
// This is a comment          ✓
```

### Phase 2: Semantic Tests
```mlld
# Verify semantic preservation
/text @path = "./config.json"     # String (path)
/text @content = [./config.json]  # Content (loaded)
/data @both = {
  "path": "./data.json",          # String
  "data": [./data.json]           # Loaded
}
```

### Phase 3: Edge Cases
```mlld
# Quoted commands
/run "echo Hello World"
/run 'echo $HOME'

# But NOT quoted paths for loading
/add "README.md"  # Should ERROR - use [README.md]
```

## Success Criteria

1. **All syntax updated**: `/`, `{}`, `//`
2. **Semantic model preserved**: `[]` = load, `""` = string
3. **No pattern duplication**: Shared patterns used
4. **No context ambiguity**: Each syntax has one meaning
5. **Tests pass**: Both syntax and semantic tests

## Timeline

- Day 1: Create branch, update directive markers
- Day 2: Update command brackets, add quoted commands
- Day 3: Update comments, verify semantics
- Day 4: Update tests
- Day 5: Documentation and cleanup

## Conclusion

Starting fresh from main branch is the right choice. It preserves the semantic clarity that makes mlld's grammar maintainable while adding only the necessary syntax updates. The key insight - that `[...]` is a semantic operator meaning "load/dereference" - must be preserved.