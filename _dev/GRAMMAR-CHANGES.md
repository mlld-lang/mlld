# Grammar Changes Log

This document tracks grammar changes made and their implications for type updates.

## Completed Changes

### 12. Fixed path separator stripping in brackets (Issue #53)
**Status**: ✅ Completed
**Issue**: Parser was stripping forward slashes from paths in bracket notation
**Changes made**:
- Created new `PathTextSegment` rule in `base/segments.peggy` that excludes `/` to allow PathSeparator nodes
- Updated `BracketContent` in `patterns/content.peggy` to use `PathTextSegment` instead of `CommandTextSegment`
- Added comprehensive regression tests in `grammar/tests/regression/path-separator-brackets.test.ts`
**Type Implications**: None - the AST structure already supported PathSeparator nodes
**Result**: Paths like `[path/to/file.md]` now correctly parse with PathSeparator nodes between text segments
**Test Coverage**: Added 4 regression tests to ensure paths in brackets maintain proper PathSeparator nodes

### 1. Fixed exec directive bracket inclusion (Issue #51)
**Change**: Updated `CommandTextSegment` in `/grammar/base/segments.peggy` to exclude opening bracket `[` from the character exclusion list.
```peggy
// Before: chars:$(![/\]@${}] .)+
// After:  chars:$(![/[\]@${}] .)+
```
**Type Implications**: None - this was a parsing bug fix only.

### 2. Fixed exec parameters as VariableReference nodes (Issue #50)
**Change**: Modified `ExecParam` in `/grammar/directives/exec.peggy` to return simple strings instead of VariableReference nodes.
```peggy
// Before: return helpers.createVariableReferenceNode('variable', { identifier: paramName }, location());
// After:  return paramName; // Just return the parameter name as a string
```
**Type Implications**: 
- The `params` array in exec directive values now contains strings instead of VariableReference nodes
- Any code consuming exec params needs to handle strings directly
- This aligns with the semantic meaning - parameter names are identifiers, not variable references

### 3. Added nested property notation support (Issues #46, #47)
**Change**: Added `DottedIdentifier` rule in `/grammar/directives/data.peggy` to support nested property paths like `greeting.text`.
```peggy
DottedIdentifier "Dotted Identifier"
  = first:BaseIdentifier rest:("." id:BaseIdentifier { return "." + id; })* {
      return first + rest.join('');
    }
```
**Type Implications**: 
- The identifier in data directives can now contain dots
- No type changes needed - identifier is still a string, just with expanded allowed values

### 4. Fixed multiline template parsing (Issues #44, #45)
**Change**: Added negative lookahead `!("[[")` to path variant in `/grammar/directives/add.peggy` to prevent `[[` from being parsed as a path.
```peggy
// Before: / DirectiveContext "@add" _ path:PathCore _ headerLevel:HeaderLevel? underHeader:UnderHeader? {
// After:  / DirectiveContext "@add" _ !("[[") path:PathCore _ headerLevel:HeaderLevel? underHeader:UnderHeader? {
```
**Type Implications**: None - this ensures correct parsing of existing syntax.

### 5. Removed Import Alias Support - MEDIUM
**File**: `grammar/directives/import.peggy`
**Change**: Removed alias handling from `/grammar/directives/import.peggy`
- Simplified ImportsList to return string array instead of objects with name/alias
- Simplified ImportItem to just return the identifier
- Updated grammar to no longer parse `as alias` syntax
**Type Implications**: 
- The `alias` property is no longer created in VariableReference nodes for imports
- Grammar now rejects import statements with alias syntax
- Test for alias syntax has been removed

### 6. Added Metadata to Run/Exec Directives (#43) - MEDIUM
**Files**: `grammar/core/code.peggy`
**Change**: Updated metadata in `/grammar/core/code.peggy` and ensured proper metadata propagation
- Removed `isBracketed` from code block metadata
- Added `hasVariables` to all code block metadata (always false as code blocks don't support interpolation)
- Ensured `isMultiLine` is calculated for all code blocks
- `language` already present for code blocks
- Commands already have `hasVariables` from CommandCore
**Type Implications**: 
- The `isBracketed` field should be removed from type interfaces
- `RunMeta` and `ExecMeta` should include: `hasVariables`, `language` (for code), `isMultiLine`

### 7. Section Extraction Syntax Update (#48) - MEDIUM
**Status**: User indicated the syntax has changed, no action needed

### 8. Fixed Path Validation with Text Variables (#41) - HIGH
**File**: `grammar/directives/text.peggy`
**Change**: Modified special case in `text.peggy` to use `BracketContent` instead of plain text capture
```peggy
// Before: "[" path:$([^\]]*) "]"
// After:  pathContent:BracketContent
```
**Type Impact**: 
- The content array now properly contains VariableReference nodes for @var interpolation
- `hasVariables` metadata correctly reflects presence of variables in paths

### 9. HeaderLevel Type Mismatch (#42) - MEDIUM
**Note**: Needs type updates, not grammar changes - marked as complete for grammar work
**Type Impact**: Update `AddValues` interfaces to use `NumberNodeArray` for `headerLevel`

### 10. Removed RHS @add (but kept @run) - HIGH
**File**: `grammar/directives/text.peggy`
**Changes**: 
- Removed RHS `@add` from text directive - paths can now be assigned directly
  - `@text id = @add [path]` → `@text id = [path]`
- Kept RHS `@run` for disambiguation between paths and commands
- Path content with single brackets now interpolates @var variables
- Template rule moved before command rules to ensure proper parsing of `[[...]]`
**Type Impact**: 
- sourceType 'path' for direct path assignment
- sourceType 'directive' retained for @run commands
**Note**: Initially attempted to remove all RHS directives but discovered ambiguity
between `[path]` and `[command]` syntax requires keeping `@run` for commands

### 10. Text Node Position Calculation (#49) - LOW
**Status**: ✅ Investigated - No issues found
**Investigation**: All createNode calls in grammar include location() properly
**Result**: No changes needed

### 11. Field Access Syntax Support (#42) - LOW
**Status**: ✅ Completed
**Issue**: Support for @colors[0] or {{students.0.name}} field access
**Investigation**: 
- Dot notation ({{students.0.name}}) already worked
- Bracket notation (@colors[0]) needed implementation
**Changes made**:
- Modified `AtVar` rule in `patterns/variables.peggy` to support `AnyFieldAccess*`
- Added special case for top-level `@var[...]` without VariableContext check to ensure full expression is captured
- Updated `BracketVar` in `patterns/content.peggy` to support field access
- Updated `VariableReference` in `directives/add.peggy` to support field access
**Type Implications**: 
- VariableReference nodes already have optional `fields` property
- No type changes needed as the structure was already supported