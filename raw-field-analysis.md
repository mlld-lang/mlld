# Raw Field Analysis for mlld Grammar

## Summary

The `raw` field is used throughout the mlld grammar to store the original string representation of parsed content. According to CLAUDE.md, these are **legacy/debug fields** that should **NEVER be used** by the interpreter. The interpreter MUST use `.values` arrays exclusively.

## Key Finding from CLAUDE.md

> **NEVER use `.raw` fields** - These are legacy/debug fields. Use `.values` arrays exclusively

This means ALL raw fields should be considered debugging aids only, not part of the official AST structure used by the interpreter.

## Analysis by File

### 1. `grammar/patterns/rhs.peggy`
- **Lines 77, 160, 167**: Stores raw content for templates, commands, and code
- **Purpose**: Preserves original formatting for debugging
- **Recommendation**: KEEP - useful for debugging template/command issues

### 2. `grammar/directives/add.peggy`
- **Multiple occurrences**: Stores raw representations of paths, sections, templates, variables
- **Purpose**: Used for debugging and potentially error messages
- **Recommendation**: REMOVE MOST - Only keep for complex structures like foreach expressions

### 3. `grammar/directives/data.peggy`
- **Line 39**: Stores raw identifier and value
- **Lines 134-136**: Stores raw security options
- **Purpose**: Debugging and error context
- **Recommendation**: REMOVE - The values field contains all necessary data

### 4. `grammar/directives/when.peggy`
- **Lines 46-47, 90-104**: Stores raw conditions and actions
- **Purpose**: Debugging conditional logic
- **Recommendation**: KEEP for conditions only - useful for debugging complex conditionals

### 5. `grammar/patterns/unified-run-content.peggy`
- **Lines 62-64, 142-144**: Stores raw command and command bases
- **Purpose**: Command security analysis and debugging
- **Recommendation**: KEEP - Security features may use raw command strings

### 6. `grammar/patterns/command-base.peggy`
- **Line 49**: Stores raw command string
- **Purpose**: Security command analysis
- **Recommendation**: KEEP - Essential for security features

### 7. `grammar/patterns/content.peggy`
- **Lines 352, 373, 384, 402**: Stores raw strings for wrapped content
- **Purpose**: Preserves original formatting
- **Recommendation**: REMOVE - Can be reconstructed from parts

### 8. `grammar/directives/import.peggy`
- **Lines 45-46, 108-109, 164, 189**: Stores raw import paths
- **Purpose**: Error messages and debugging
- **Recommendation**: KEEP for paths only - useful for error messages

### 9. `grammar/directives/output.peggy`
- **Similar pattern to other directives**
- **Recommendation**: REMOVE - Values field is sufficient

### 10. Other directive files (text.peggy, exec.peggy, path.peggy, run.peggy)
- **Similar patterns**: Store raw representations
- **Recommendation**: REMOVE - Values field contains all necessary data

## Interpreter Usage

The interpreter has minimal dependency on `raw` fields:
- `interpreter/eval/run.ts`: Uses `directive.raw` when creating reference directives
- This can be easily refactored to use values instead

## Recommendations

Based on CLAUDE.md guidelines, the recommendation is clear:

### Phase 1: Fix Interpreter Violations
1. **Remove ALL uses of `.raw` in the interpreter** - The one instance in `interpreter/eval/run.ts` must be fixed
2. **Ensure all code uses `.values` exclusively** - No exceptions

### Phase 2: Consider Raw Field Purpose
Since raw fields are for debugging only:

1. **Keep raw fields that aid debugging**:
   - Complex command strings (for security debugging)
   - Template content (for formatting debugging)
   - Error-prone constructs (for troubleshooting)

2. **Remove raw fields that add no debugging value**:
   - Simple identifiers (obvious from values)
   - Primitive values (no debugging needed)
   - Redundant data (like JSON.stringify of objects)

## Benefits of Removal

1. **Smaller AST size** - Reduced memory usage
2. **Cleaner code** - Less duplication
3. **Easier maintenance** - Single source of truth in values
4. **Better consistency** - Forces use of proper AST traversal

## Migration Strategy

1. **IMMEDIATE**: Fix the interpreter violation in `run.ts` - remove `.raw` usage
2. **Phase 1**: Remove unnecessary raw fields that provide no debugging value:
   - Simple identifiers (e.g., `raw: { identifier: "foo" }`)
   - Primitive values (e.g., `raw: { value: "42" }`)
   - JSON stringification of security options
3. **Phase 2**: Evaluate remaining raw fields for debugging utility
4. **Testing**: Since raw fields are debug-only, tests should not depend on them
5. **Documentation**: Update any docs that reference raw fields

## Test Impact

All 150 test fixtures contain raw fields, but since these are debugging fields:
- Tests should focus on `.values` field correctness
- Raw fields in fixtures can remain for debugging
- New tests should not assert on raw field content