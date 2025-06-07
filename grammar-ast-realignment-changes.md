# Grammar and AST Realignment Changes

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

### In Progress

🔄 **3. Remove Dependency on Raw Fields in Grammar**
- **Status**: 16 grammar files use raw fields (28 instances in directives alone)
- **Impact**: Raw fields should be for debugging only, not primary data storage
- **Files affected**:
  - grammar/core/*.peggy (6 files)
  - grammar/directives/*.peggy (5 files)  
  - grammar/patterns/*.peggy (5 files)
- **Next Steps**: Need systematic removal of raw field dependencies

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

### Still To Do

❌ **5. Fix Type System Alignment**
- DirectiveNode interface expects `values: { [key: string]: BaseMlldNode[] }`
- Need to ensure grammar always produces arrays (except data directive exceptions)
- Add missing type guards for all node types

❌ **6. Apply Consistent Meta Flags**
- `isDataValue` - for directives embedded in data structures
- `isRHSRef` - for directives used as RHS references
- `valueType` - for VariableReference nodes (varIdentifier, varInterpolation, identifier)
- Ensure all contexts set appropriate flags

❌ **7. Update Parse Tree Documentation**
- Verify all parse trees in grammar/README.md match actual grammar behavior
- Document any new patterns added

❌ **8. Fix Grammar Pattern Violations**
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