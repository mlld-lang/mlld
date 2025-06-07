# Parallel Work Streams for Grammar/AST Realignment

## Overview
These work streams can be executed in parallel by different Claudes. Each stream is independent and focuses on a specific aspect of the grammar/AST realignment.

## Work Stream 1: Remove Raw Field Dependencies
**Priority**: High
**Complexity**: Medium
**Dependencies**: None

### Objective
Systematically remove or minimize the use of `raw` fields in grammar files, as they should only be used for debugging/display purposes.

### Files to Modify
- grammar/core/*.peggy (6 files)
- grammar/directives/*.peggy (5 files)  
- grammar/patterns/*.peggy (5 files)

### Approach
1. For each file, identify where `raw:` is being assigned
2. Determine if the raw field is necessary for debugging
3. If not necessary, remove it
4. If necessary for debugging, ensure it's not used as primary data storage
5. Update any helper functions that create raw fields

### Testing
- Run `npm run build:grammar` after each file
- Run `npm test grammar/` to ensure no regressions
- Use `npm run ast -- '<syntax>'` to verify AST structure

---

## Work Stream 2: Add Command Invocation Parsing
**Priority**: High  
**Complexity**: High
**Dependencies**: None

### Objective
Add proper AST structure for command invocations like `@greet("Alice", 42)` instead of parsing as text.

### Current State
- Command invocations are parsed as text: `"@greet(Alice, 42)"`
- Interpreter uses regex to extract arguments (text.ts:221-240)

### Required Changes
1. Create a new pattern for command invocations in `patterns/command-invocation.peggy`
2. Parse command name and arguments into structured AST
3. Update text directive to use this pattern
4. Update anywhere else command invocations are used

### AST Structure Goal
```javascript
{
  type: 'CommandInvocation',
  name: 'greet',
  arguments: [
    { type: 'Text', content: 'Alice' },
    { type: 'Literal', value: 42 }
  ]
}
```

### Testing
- Add tests for command invocation parsing
- Verify interpreter can use structured AST without regex

---

## Work Stream 3: Add Parameter Node Type
**Priority**: Medium
**Complexity**: Medium  
**Dependencies**: None

### Objective
Create a proper Parameter node type for exec directive parameters (Issue #50).

### Current State
- Parameters are parsed as strings: `["name", "age"]`
- Interpreter has workarounds in exec.ts:14-29

### Required Changes
1. Add `Parameter: 'Parameter'` to NodeType enum in `grammar/deps/grammar-core.ts`
2. Create Parameter node structure in exec directive grammar
3. Update exec directive to create Parameter nodes instead of strings
4. Add TypeScript type definition for ParameterNode

### AST Structure Goal
```javascript
{
  type: 'Parameter',
  name: 'age',
  defaultValue?: any,
  location: {...}
}
```

### Testing
- Update exec tests to verify Parameter nodes
- Ensure interpreter can handle new node type

---

## Work Stream 4: Structure Field Access
**Priority**: Medium
**Complexity**: Medium
**Dependencies**: None

### Objective  
Parse field access like `user.profile.name` into structured AST instead of single string.

### Current State
- Field access stored as: `identifier: "user.profile.name"`
- Interpreter uses string splitting (data.ts:60, 84)

### Required Changes
1. Update DottedIdentifier pattern to create structured field access
2. Add fields array to identifier representation
3. Update all directives that use identifiers

### AST Structure Goal
```javascript
{
  type: 'FieldAccess',
  base: 'user',
  fields: ['profile', 'name'],
  location: {...}
}
```

### Testing
- Test nested field access parsing
- Verify interpreter can use structured access

---

## Work Stream 5: Type System Alignment
**Priority**: Medium
**Complexity**: Low
**Dependencies**: Work Streams 2 & 3 (for new node types)

### Objective
Ensure type definitions align with grammar output and add missing type guards.

### Tasks
1. Add missing node types to TypeScript definitions
2. Create type guards for all node types
3. Ensure DirectiveNode values are typed correctly
4. Add proper discriminated unions where needed

### Files to Modify
- core/types/primitives.ts
- core/types/guards.ts
- core/types/nodes.ts

---

## Work Stream 6: Apply Consistent Meta Flags
**Priority**: Low
**Complexity**: Low
**Dependencies**: None

### Objective
Ensure all grammar rules set appropriate meta flags consistently.

### Meta Flags to Apply
- `isDataValue` - for directives in data structures
- `isRHSRef` - for RHS directive references  
- `valueType` - for VariableReference contexts
- `hasVariables` - for content with interpolation

### Approach
1. Review each directive's grammar
2. Identify all contexts where flags should be set
3. Update helper functions to set flags consistently
4. Document flag usage patterns

---

## Coordination Notes

### Before Starting
- Each Claude should read:
  - docs/dev/AST.md
  - grammar/README.md  
  - The specific work stream section
  - grammar-ast-realignment-changes.md

### During Work
- Create feature branches for each work stream
- Commit frequently with clear messages
- Document any design decisions
- Add tests for new functionality

### After Completion
- Update grammar-ast-realignment-changes.md
- Run full test suite
- Create PR with detailed description

### Communication
- If a work stream discovers issues affecting others, document in a shared file
- If grammar patterns need to be shared, create them in patterns/ directory
- Update parse trees in grammar/README.md if behavior changes