# Grammar Changes Log

This document tracks grammar changes and provides implementation guidance for the interpreter team.

## Summary of Today's Changes

1. **Renamed `addSection` to `addPathSection`** - Grammar complete, awaiting interpreter update
2. **Fixed path parsing issue** - Paths starting with @variable (like `@env/data.json`) now correctly parse as paths instead of command references

## Active Changes (January 2025)

### 1. Rename addSection to addPathSection
**Status**: ✅ Grammar Complete - Awaiting Interpreter Update
**Impact**: AST subtype rename for consistency

#### What Changed
The `addSection` subtype has been renamed to `addPathSection` to align with the naming pattern used for `textPathSection`:

```meld
# This directive now generates different AST:
@add "## Setup" from [file.md]
# Old: subtype = 'addSection'
# New: subtype = 'addPathSection'
```

#### Interpreter Team Action Required
Update your `add.ts` evaluator to handle the new subtype:

```typescript
// Old code looking for:
if (node.subtype === 'addSection') { ... }

// Should now be:
if (node.subtype === 'addPathSection') { ... }
```

**Note**: No backward compatibility is needed - we haven't shipped v1.0 yet. The AST structure remains otherwise identical, only the subtype string has changed.

## Known Issues

### 1. Optional Brackets for Path Values
**Status**: ✅ Feature Complete - Has Known Limitation
**Impact**: Syntax sugar only, no AST changes

Paths can now be written without brackets in all directives, producing identical AST:

```meld
# All of these now work:
@text file = path/to/@version/file.md        # Unbracketed with @var interpolation
@import * from ./utils/@env/config.mld       # Unbracketed relative path with @var
@add docs/@lang/README.md                     # Unbracketed in @add directive

# These are all equivalent (same AST):
@text file = [path/to/@version/file.md]      # Bracketed
@text file = path/to/@version/file.md        # Unbracketed
@text file = "path/to/file.md"               # Quoted (literal, no interpolation)
```

#### Known Limitations (Fixed)
- ~~**Unbracketed paths starting with @variable** were parsed as command references~~ ✅ FIXED
  - `@text config = @env/data.json` ✅ NOW correctly parsed as path with variable interpolation
  - `@text config = [@env/data.json]` ✅ parsed as path with variable interpolation
  - `@text config = prod/@env.json` ✅ works because @ is not at the start

**Fix Applied**: Added `PathStartingWithVariableContext` predicate in `context.peggy` to detect paths starting with @variable (e.g., `@env/config.json`). Updated `text.peggy` to check for this pattern before attempting to parse as command reference.

### 2. Variable Interpolation in Quoted Strings
**Status**: Grammar Limitation
**Impact**: Variables inside quoted strings are treated as literal text

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