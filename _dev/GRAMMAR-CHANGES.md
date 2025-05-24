# Grammar Changes Log

This document tracks pending grammar changes requiring implementation.

## Priority Changes Required

### 1. Universal Content Assignment for @text Directive
**Status**: ✅ Completed
**Priority**: High
**Issue**: Enable @text to accept all content sources directly, matching user intuition

#### The Problem
Currently, @text has arbitrary restrictions on what content it can assign:
- ✅ `@text content = "literal text"`
- ✅ `@text content = [[template {{var}}]]`
- ✅ `@text content = @someVariable`
- ✅ `@text content = @run [command]`
- ✅ `@text content = [file.md]` (now works directly!)
- ✅ `@text section = "## Setup" from [file.md]` (now works directly!)

This distinction is confusing because all these operations are conceptually "reading content" - none are executing side effects.

#### The Solution: Direct Syntax for All Content Types

@text should accept ALL content sources directly, without requiring @add wrapper:

```meld
# All of these should work:
@text literal = "Hello World"                                    # Literal text
@text fromTemplate = [[Hello {{name}}!]]                        # Template with interpolation
@text fromVar = @someVariable                                   # Variable reference
@text fromCommand = @run [echo "hello"]                          # Command output
@text fromPath = [file.md]                                       # File content
@text fromSection = "## Setup" from [README.md]                  # Section extraction
@text renamed = "## Setup" from [README.md] as "## Installation" # Section with rename
@text greet(name) = [[Hello {{name}}!]]                         # Parameterized template
```

#### Key Design Decisions

1. **No @add Required**: Each syntax is already unambiguous:
   - `[...]` clearly means path
   - `"..." from [...]` clearly means section extraction
   - `[[...]]` clearly means template
   - `(params)` after variable clearly means parameterized template

2. **@add Still Works**: For backward compatibility and user preference:
   ```meld
   # These are equivalent:
   @text content = [file.md]
   @text content = @add [file.md]
   ```

3. **Consistent AST Structure**: Reuse existing AST patterns from @add

#### Implementation Strategy

##### Step 1: Analyze Existing Patterns
- Study how `add.peggy` implements path and section handling
- Identify which patterns can be moved to `grammar/core/` for reuse
- Note existing subtypes: likely `addPath`, `addSection` (rename to `addPathSection`)

##### Step 2: Create/Update Core Abstractions
```peggy
// In grammar/core/path.peggy or similar
PathContentCore = PathCore  // Already exists

// In grammar/core/section.peggy (new file)
SectionExtractionCore
  = section:QuotedString _ "from" _ path:PathCore {
      return { section, path, rename: null };
    }
  / section:QuotedString _ "from" _ path:PathCore _ "as" _ rename:QuotedString {
      return { section, path, rename };
    }
```

##### Step 3: Update text.peggy
```peggy
// Extend TextRHS to include all content sources
TextRHS
  = PathContentValue        // NEW: Direct path inclusion
  / SectionExtractionValue  // NEW: Section extraction
  / TemplateValue          // Existing
  / VariableValue          // Existing
  / RunDirectiveRef        // Existing
  / AddDirectiveRef        // Keep for compatibility

// New patterns
PathContentValue
  = path:PathCore {
      // Return appropriate structure for textPath subtype
    }

SectionExtractionValue
  = extraction:SectionExtractionCore {
      // Return appropriate structure for textPathSection subtype
    }
```

##### Step 4: Update AST Subtypes
- Add `textPath` subtype for direct path inclusion
- Add `textPathSection` subtype for section extraction
- Rename `addSection` to `addPathSection` for consistency
- Ensure all subtypes follow clear naming: operation + content type

##### Step 5: Maintain Consistency
- Both @text and @add should produce similar AST structures for same operations
- Meta flags should indicate source directive for interpreter

#### AST Structure Examples

```javascript
// @text content = [file.md]
{
  type: 'Directive',
  kind: 'text',
  subtype: 'textPath',
  values: {
    identifier: [...],
    path: [/* path nodes */]
  }
}

// @text section = "## Setup" from [README.md]
{
  type: 'Directive',
  kind: 'text',
  subtype: 'textPathSection',
  values: {
    identifier: [...],
    section: [/* section name nodes */],
    path: [/* path nodes */]
  },
  meta: {
    hasRename: false
  }
}

// @text section = "## Setup" from [README.md] as "## Installation"
{
  type: 'Directive',
  kind: 'text',
  subtype: 'textPathSection',
  values: {
    identifier: [...],
    section: [/* section name nodes */],
    path: [/* path nodes */],
    rename: [/* new name nodes */]
  },
  meta: {
    hasRename: true
  }
}
```

#### Implementation Notes (Completed)

1. **Created Core Pattern**: Added `grammar/core/section.peggy` with `SectionExtractionCore` pattern
   - Reusable by both @add and @text directives
   - Handles section extraction with optional rename

2. **Updated text.peggy**: Added patterns for:
   - Direct path content (`textPath` subtype)
   - Section extraction (`textPathSection` subtype)
   - @add backward compatibility (both path and section forms)

3. **Pattern Ordering**: Critical for proper parsing:
   - Section extraction must come before general template pattern
   - Section extraction must come before path pattern (for @add)
   - This prevents quoted strings from being matched as templates/paths

4. **Shared Patterns**: Added `QuotedSectionTitle` to `grammar/patterns/content.peggy`
   - Provides consistent quoted string handling
   - Reused by multiple directives

5. **Backward Compatibility**: @add syntax still works
   - `@text content = @add [file.md]` → same AST as direct form
   - `@text content = @add "## Setup" from [file.md]` → same AST as direct form
   - Meta includes `directive: 'add'` to indicate source

### 2. Optional Brackets for Path Values Everywhere
**Status**: 🚀 Ready for Implementation
**Priority**: Medium
**Issue**: Allow cleaner path syntax without brackets while maintaining @var interpolation

#### The Problem
Currently, paths require brackets for variable interpolation:
- ✅ `@text file = [path/to/@version/file.md]` - Interpolates @version
- ✅ `@text file = "path/to/file.md"` - Literal string, no interpolation
- ❌ `@text file = path/to/@version/file.md` - Parse error

This feels unnecessarily verbose for a common use case.

#### The Solution: Unbracketed Paths with Interpolation

Allow unbracketed paths everywhere paths are accepted, treating them identically to single-bracket paths:

```meld
# These should be equivalent:
@text file = [path/to/@version/file.md]
@text file = path/to/@version/file.md

# Both interpolate @version (but not {{version}})
```

#### Implementation Strategy

##### Step 1: Identify All Path Contexts
Audit all directives that accept paths:
- @import: `@import * from [path]` → `@import * from path`
- @add: `@add [path]` → `@add path`
- @text: (after implementing change #1)
- @path: Already supports some unbracketed forms
- Others?

##### Step 2: Create UnbracketedPath Pattern
```peggy
// In grammar/patterns/content.peggy or grammar/core/path.peggy
UnbracketedPath "Unbracketed path"
  = !ReservedWord first:PathStartSegment rest:PathContinuation* {
      // Treat exactly like single-bracket path
      // Must handle @var interpolation
    }

PathStartSegment
  = segment:UnquotedPathText { return helpers.createTextNode(segment); }
  / varRef:AtVar { return varRef; }
  
// Must not match reserved words or known patterns
ReservedWord = "from" / "as" / ... // Context-dependent
```

##### Step 3: Update Existing Path Rules
For each directive, add UnbracketedPath as an option:
```peggy
// Example for import directive
ImportPath
  = BracketedPath      // [path] - existing
  / QuotedPath        // "path" - existing
  / UnbracketedPath   // path - NEW
```

##### Step 4: Handle Ambiguity
Key challenge: Distinguishing paths from other identifiers
- Require at least one `/` or `.` to identify as path?
- Use lookahead to check for path-like patterns?
- Context-sensitive parsing based on directive?

##### Step 5: Consistent Behavior
- Unbracketed = Single-bracket (both interpolate @var)
- Quoted = Literal (no interpolation)
- Double-bracket would still mean template interpolation {{var}}

#### Examples Across Directives

```meld
# Import
@import * from path/to/@version/module.mld
@import { helper } from ./utils/@env/helpers.mld

# Add
@add docs/@lang/README.md
@add "## Setup" from guides/@version/install.md

# Text (after change #1)
@text readme = docs/@lang/README.md
@text config = ./@env/config.json

# Path
@path assets = ./assets/@theme/images
```

## Implementation Order

1. **First**: Implement universal content assignment for @text
   - Higher priority, bigger user impact
   - Builds on existing patterns
   
2. **Second**: Implement optional brackets for paths
   - Depends on first change for @text paths
   - Requires careful ambiguity handling

## Testing Strategy

### For Universal @text Content:
- Test all content types with and without @add
- Verify AST consistency between direct and @add forms
- Test parameterized templates still work correctly
- Ensure backward compatibility

### For Optional Brackets:
- Test in all path contexts
- Verify @var interpolation works correctly
- Test ambiguous cases (e.g., single word paths)
- Ensure quoted strings still work as literals

## Notes for Implementer

1. **Maximize Reuse**: Move shared patterns to `grammar/core/` and `grammar/patterns/`
2. **Consistent Naming**: Follow established patterns (e.g., `textPathSection` not just `textSection`)
3. **Preserve Compatibility**: Existing syntax must continue working
4. **Think Holistically**: Changes should feel natural across all directives
5. **Update Documentation**: Both AST Context Guide and examples need updates

These changes will significantly improve Meld's usability by making the syntax more intuitive and consistent with user expectations.