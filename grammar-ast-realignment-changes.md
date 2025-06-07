# Grammar and AST Realignment Changes

## Summary of Progress

### Critical Issues Fixed ✅
- **No more invalid node types** - Fixed 'type: raw' bug
- **Interpreter uses .values exclusively** - No more raw field usage
- **Command invocation parsing works** - @greet("Alice", 42) properly parsed

### Remaining Issues
- **Parameter nodes** - Type mismatch: strings instead of nodes
- **Field access** - user.profile.name parsed as string, not structured
- **Type alignment** - Some values not properly wrapped in arrays

## Status: In Progress

### Completed Changes

✅ **1. Fixed Invalid 'type: raw' Node Generation (Issue #183)**
- **Location**: `grammar/patterns/command-reference.peggy:38`
- **Change**: Modified CommandArgument rule to create proper Text or VariableReference nodes instead of invalid 'raw' type
- **Result**: No more 'raw' type nodes in AST output
- **Tests**: All grammar tests pass

✅ **2. Verified Values Fields Contain Node Arrays**
- **Finding**: Grammar already follows this principle correctly
- **Exception**: Data directive uses type discriminators for complex values (as documented in AST.md)
- **Status**: No changes needed - principle is already followed

✅ **3. Fixed Interpreter Raw Field Violation**
- **Change**: Removed the only `.raw` usage in interpreter (run.ts:322)
- **Result**: Interpreter now uses `.values` exclusively as required by CLAUDE.md

✅ **4. Command Invocation Parsing**
- **Finding**: Already implemented! `@greet("Alice", 42)` is properly parsed with:
  - `commandName`: Extracted as structured data
  - `commandArgs`: Array of typed arguments (string/variable)
- **Location**: `grammar/patterns/command-reference.peggy` and `grammar/directives/text.peggy`
- **Status**: No changes needed - already working correctly

### Important Clarification on Raw Fields

**Raw fields are NOT being removed** - they serve legitimate purposes:
- **Debugging**: Seeing the original text that was parsed
- **Error messages**: Showing users what they wrote
- **Source mapping**: Correlating AST nodes back to source text

The key principle is: **Interpreter must NEVER use raw fields** (already fixed).
Raw fields should remain in the AST for debugging purposes.

🔄 **4. Add Missing Grammar Features (Issue #181)**
- **Field Access in Identifiers**: 
  - Already supported in data directive (`user.profile.name`)
  - But stored as single string "user.profile.name" instead of structured field access
  - Need: Proper AST structure with fields array
- **Command Invocation Arguments**: 
  - Currently parsed as text content: `"@greet(Alice, 42)"`
  - Need: Proper AST structure for command name and arguments array
- **Parameter Node Type (Issue #50)**: 
  - Parameters parsed as strings in exec directive
  - Need: Proper Parameter node type distinct from VariableReference

### In Progress

🔄 **5. Add Parameter Node Type for Exec Directives**
- **Issue**: Parameters are stored as `string[]` but types expect `VariableNodeArray[]`
- **Current**: `params: ['name', 'age']` 
- **Expected**: `params: [ParameterNode, ParameterNode]` or similar
- **Impact**: Type mismatch between grammar output and TypeScript interfaces
- **Needs**: Define Parameter node type and update exec parameter parsing

### Still To Do

❌ **6. Structure Field Access Properly**
- **Issue**: `user.profile.name` is parsed as single string "user.profile.name"
- **Expected**: Structured AST with fields array for proper traversal
- **Location**: Currently in data directive DottedIdentifier rule

❌ **7. Fix Type System Alignment**
- DirectiveNode interface expects `values: { [key: string]: BaseMlldNode[] }`
- Need to ensure grammar always produces arrays (except data directive exceptions)
- Add missing type guards for all node types

❌ **8. Apply Consistent Meta Flags**
- `isDataValue` - for directives embedded in data structures
- `isRHSRef` - for directives used as RHS references
- `valueType` - for VariableReference nodes (varIdentifier, varInterpolation, identifier)
- Ensure all contexts set appropriate flags

❌ **9. Update Parse Tree Documentation**
- Verify all parse trees in grammar/README.md match actual grammar behavior
- Document any new patterns added

❌ **10. Fix Grammar Pattern Violations**
- Eliminate local variable redefinition patterns
- Create and use GenericList pattern for consistent list parsing
- Fix inconsistent naming (all rules should be PascalCase)

## Implementation Priority

1. **High Priority**: Remove raw field dependencies (blocking interpreter cleanup)
2. **High Priority**: Add proper command argument parsing (fixes string manipulation in interpreter)
3. **Medium Priority**: Add Parameter node type (fixes exec parameter handling)
4. **Medium Priority**: Structure field access properly (enables proper data access)
5. **Low Priority**: Documentation and naming convention fixes

## Testing Strategy

- Run `npm run ast -- '<syntax>'` after each change to verify AST structure
- Ensure all existing tests pass with `npm test grammar/`
- Add new tests for each grammar enhancement
- Verify interpreter can use new AST without string manipulation workarounds