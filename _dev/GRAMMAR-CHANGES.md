# Grammar Changes Log

This document tracks completed grammar changes and their impact on the interpreter implementation.

## Summary of Changes (December 2024)

Two major enhancements to the grammar have been completed:

1. **Universal Content Assignment for @text Directive** - New AST subtypes `textPath` and `textPathSection`
2. **Optional Brackets for Path Values** - Syntax sugar only, no AST changes

## Planned Changes

### 1. Rename addSection to addPathSection
**Status**: 📋 Planned
**Impact**: AST subtype rename for consistency

#### What Will Change
Rename the `addSection` subtype to `addPathSection` to better align with the naming pattern used for `textPathSection`:

```meld
# This directive's AST subtype will change:
@add "## Setup" from [file.md]
# Current: subtype = 'addSection'
# New:     subtype = 'addPathSection'
```

#### Rationale
- Both `@add "## Setup" from [file.md]` and `@text section = "## Setup" from [file.md]` extract sections from paths
- Using consistent naming (`addPathSection` and `textPathSection`) makes the relationship clearer
- The "Path" in the name clarifies that this extracts from a file path, not from inline content

#### Implementation Requirements
1. **Grammar**: Update `add.peggy` to generate `addPathSection` subtype
2. **Interpreter**: Update `add.ts` evaluator to handle `addPathSection` 
3. **Backward Compatibility**: Consider supporting both names temporarily if needed
4. **Tests**: Update all test fixtures that use `addSection`

## Completed Changes

### 1. Universal Content Assignment for @text Directive
**Status**: ✅ Completed
**Impact**: New AST subtypes for @text directive

#### What Changed
The @text directive now accepts direct path and section extraction syntax without requiring @add wrapper:

```meld
# New syntax now supported:
@text fromPath = [file.md]                                       # Direct file content
@text fromSection = "## Setup" from [README.md]                  # Section extraction
@text renamed = "## Setup" from [README.md] as "## Installation" # Section with rename

# Backward compatibility maintained:
@text content = @add [file.md]                                  # Still works
@text content = @add "## Setup" from [file.md]                  # Still works
```

#### New AST Subtypes for Interpreter

**1. `textPath` - Direct path content**
```javascript
// @text content = [file.md]
{
  type: 'Directive',
  kind: 'text',
  subtype: 'textPath',
  source: 'path',
  values: {
    identifier: [/* variable reference node */],
    path: [/* path nodes array */]
  },
  raw: {
    identifier: 'content',
    path: 'file.md'
  },
  meta: {
    sourceType: 'path',
    hasVariables: false  // true if path contains @var references
  }
}
```

**2. `textPathSection` - Section extraction**
```javascript
// @text section = "## Setup" from [README.md]
{
  type: 'Directive',
  kind: 'text',
  subtype: 'textPathSection',
  source: 'section',
  values: {
    identifier: [/* variable reference node */],
    section: [/* Text node with section title */],
    path: [/* path nodes array */]
  },
  raw: {
    identifier: 'section',
    section: '## Setup',
    path: 'README.md'
  },
  meta: {
    sourceType: 'section',
    hasRename: false,
    hasVariables: false
  }
}

// With rename: @text section = "## Setup" from [README.md] as "## Installation"
// Same structure but with:
// - values.rename: [/* Text node with new title */]
// - raw.rename: '## Installation'
// - meta.hasRename: true
```

**3. Backward Compatibility with @add**
When using @add syntax, the AST is identical except:
- `source: 'directive'` instead of `source: 'path'` or `source: 'section'`
- `meta.sourceType: 'directive'`
- `meta.directive: 'add'`

#### Implementation Requirements for Interpreter

**For `textPath` subtype:**
- Read file content from the path in `values.path` array
- Handle variable interpolation if `meta.hasVariables` is true
- Store result in the variable named in `values.identifier`

**For `textPathSection` subtype:**
- Read file from path in `values.path` array
- Extract section matching title in `values.section`
- If `values.rename` exists, use it as the section title in output
- Handle variable interpolation if `meta.hasVariables` is true
- Store result in the variable named in `values.identifier`

**Key differences from previous behavior:**
- Previously, paths in @text required wrapping with @add directive
- Now paths are first-class citizens in @text with dedicated subtypes
- The `values` object structure differs: `textPath` uses `values.path` instead of `values.content`

## Completed Changes (Continued)

### 2. Optional Brackets for Path Values Everywhere
**Status**: ✅ Completed
**Priority**: Medium
**Impact**: No new AST subtypes, just additional syntax support

#### What Changed
Paths can now be written without brackets in all directives:

```meld
# All of these now work:
@text file = path/to/@version/file.md        # Unbracketed with @var interpolation
@import * from ./utils/@env/config.mld       # Unbracketed relative path with @var
@add docs/@lang/README.md                     # Unbracketed in @add directive

# These are all equivalent:
@text file = [path/to/@version/file.md]      # Bracketed (still works)
@text file = path/to/@version/file.md        # Unbracketed (new!)
@text file = "path/to/file.md"               # Quoted (literal, no interpolation)
```

#### AST Structure (No Changes)
The AST is identical regardless of bracket usage:
- Unbracketed paths produce the same AST as bracketed paths
- Both support @var interpolation (e.g., `@version` becomes a VariableReference node)
- Quoted paths remain literal strings (no interpolation)
- `meta.hasVariables` correctly reflects whether the path contains variable references

#### Implementation Notes for Interpreter
No changes needed - the interpreter receives the same AST structure whether brackets are used or not. Variable interpolation works identically in both cases.

#### Known Limitations
- **Unbracketed paths starting with @variable** are parsed as command references, not paths
  - `@text config = @env/data.json` ❌ parsed as command reference
  - `@text config = [@env/data.json]` ✅ parsed as path with variable interpolation
  - `@text config = prod/@env.json` ✅ works because @ is not at the start

### 3. Variable Interpolation in Quoted Strings
**Status**: Grammar Limitation
**Impact**: Variables inside quoted strings are treated as literal text

#### Limitation
Variable references inside quoted strings are not interpolated:

```meld
# Variable interpolation doesn't work in quoted strings:
@text section = "## @sectionName" from [file.md]  # @sectionName is literal text
@text path = "@env/config.json"                   # @env is literal text

# Workarounds:
# 1. Use brackets for paths with variables:
@text config = [@env/config.json]                 # ✅ @env is interpolated

# 2. For section titles, construct them differently:
@text section = @add [[## {{sectionName}}]] from [file.md]  # Using template syntax
```

This is a fundamental grammar limitation where quoted strings are parsed as literal Text nodes without variable reference parsing.

#### Grammar Implementation Notes (Completed)
The implementation leveraged existing patterns:
1. **PathCore already supported unbracketed paths** through `WrappedPathContent` → `PathStyleInterpolation` → `UnquotedPath`
2. **Fixed variable handling in unbracketed paths** by creating `UnquotedPathVar` that doesn't require `VariableContext` predicate
3. **No changes to directives** - @import, @add, and @text already used PathCore correctly
4. **Fallback for @ symbols** - When @ doesn't match a variable pattern, it's treated as literal text