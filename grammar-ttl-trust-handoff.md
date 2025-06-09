# Grammar TTL/Trust Implementation Handoff

## Summary of Work Completed

We've successfully implemented Phases 1, 2, and 3 of the grammar implementation plan for TTL, trust levels, and unified tail modifiers. The system now supports:

1. **TTL (Time-To-Live)** on `@path` and `@import` directives for URL caching
2. **Trust levels** (always/never/verify) as part of unified tail modifiers
3. **Unified tail modifier syntax** where trust, pipeline (|), needs, and with all normalize to `withClause`
4. **Exec invocations with tail modifiers** - commands defined with `@exec` can now use tail modifiers without requiring `@run` wrapper
5. **Complete type definitions** - All TypeScript types updated to support new AST structures

## What Was Changed

### New Grammar Files Created
1. `/grammar/patterns/tail-modifiers.peggy` - Unified tail modifier parsing
2. `/grammar/patterns/ttl-syntax.peggy` - TTL parsing (5d, 30m, static, etc.)
3. `/grammar/patterns/exec-invocation.peggy` - Exec invocations with tail support

### Updated Grammar Files
1. `/grammar/directives/path.peggy` - Added TTL and tail modifier support
2. `/grammar/directives/import.peggy` - Added TTL and tail modifier support
3. `/grammar/directives/add.peggy` - Added ExecInvocationWithTail support
4. `/grammar/directives/text.peggy` - Added ExecInvocationWithTail support
5. `/grammar/directives/data.peggy` - Added ExecInvocationWithTail support
6. `/grammar/directives/output.peggy` - Added ExecInvocationWithTail support
7. `/grammar/directives/when.peggy` - Added ExecInvocationWithTail support
8. `/grammar/directives/run.peggy` - Updated to use TailModifiers instead of WithClause

## Current State

### Updated Type Definitions (Phase 3)
1. `/core/types/run.ts` - Added `trust` property to `WithClause` interface
2. `/core/types/primitives.ts` - Added `ExecInvocation`, `CommandReference`, and `TTLValue` types
3. `/core/types/path.ts` - Added `ttl` and `withClause` to `PathValues`
4. `/core/types/import.ts` - Added `ttl` and `withClause` to `ImportValues`
5. `/core/types/values.ts` - Updated `ContentNodeArray` to include `ExecInvocation`
6. `/core/types/data.ts` - Updated `DataValue` to include `ExecInvocation`
7. `/core/types/guards.ts` - Added `isExecInvocation` and `hasWithClause` type guards
8. `/core/types/index.ts` - Updated `MlldNode` union to include `ExecInvocation`

## Current State

### What's Working
- Grammar compiles successfully
- Type definitions compile without errors
- AST generation works correctly for all new syntax:
  ```
  @path api = [https://api.com] (5d) trust always
  @import [config.mld] (30s) | @validate
  @add @greeting() | @uppercase
  @data config = @getConfig() | @json
  @run [(npm test)] | @filter("error")
  ```
- All syntax normalizes to `withClause` in the AST
- 157 tests pass, 9 skipped, 63 failing (expected - interpreter needs updating)

### What Needs to Be Done

## Phase 4: Update AST Helpers (NEXT PHASE)

### What Needs to Be Done

The grammar is generating ExecInvocation nodes, but we need helper functions to work with them properly.

### 1. Update `/grammar/deps/grammar-core.js`

Add these helper functions:
```javascript
// Helper to create ExecInvocation nodes
createExecInvocation(commandRef, withClause, location) {
  return {
    type: 'ExecInvocation',
    nodeId: generateNodeId(),
    commandRef,
    withClause: withClause || null,
    location
  };
}

// Helper to extract command name from ExecInvocation
getExecInvocationName(node) {
  return node.commandRef?.identifier || node.commandRef?.name;
}

// Helper to check if a node is an exec invocation
isExecInvocationNode(node) {
  return node?.type === 'ExecInvocation';
}
```

### 2. Update `/grammar/deps/helpers.js` (if needed)

Ensure helper functions are exported and available to grammar rules.

### 3. Key Implementation Notes

- ExecInvocation nodes appear in place of variables in many contexts
- The `commandRef` contains the command name and arguments
- The `withClause` contains any tail modifiers (normalized)
- These nodes need special handling in the interpreter

## Phase 5: Update Interpreter (CRITICAL PHASE)

### Overview of Failing Tests

The 63 failing tests are primarily due to:
1. **Unknown node type: ExecInvocation** - Interpreter doesn't recognize the new node type
2. **Unsupported add subtype: addExecInvocation** - Add evaluator needs updating
3. **Template interpolation showing [object Object]** - ExecInvocation nodes in templates

### 1. Update Core Interpreter (`/interpreter/core/interpreter.ts`)

The `interpolate` function needs to handle ExecInvocation nodes:
```typescript
if (isExecInvocation(node)) {
  // Evaluate the exec invocation
  const result = await evaluateExecInvocation(node, env);
  return result;
}
```

### 2. Create Exec Invocation Evaluator

Create `/interpreter/eval/exec-invocation.ts`:
```typescript
export async function evaluateExecInvocation(
  node: ExecInvocation,
  env: Environment
): Promise<string> {
  // 1. Get the command from environment
  const commandName = node.commandRef.identifier;
  const command = env.getVariable(commandName);
  
  // 2. Execute the command with arguments
  const args = node.commandRef.args || [];
  const result = await executeCommand(command, args, env);
  
  // 3. Apply withClause transformations if present
  if (node.withClause) {
    return applyWithClause(result, node.withClause, env);
  }
  
  return result;
}
```

### 3. Update Directive Evaluators

Each evaluator that encounters ExecInvocation nodes needs updating:

- `/interpreter/eval/add.ts` - Recognize `addExecInvocation` subtype
- `/interpreter/eval/text.ts` - Handle ExecInvocation in content
- `/interpreter/eval/data.ts` - Handle ExecInvocation in data values
- `/interpreter/eval/when.ts` - Handle ExecInvocation in conditions
- `/interpreter/eval/output.ts` - Handle ExecInvocation as sources

### 4. Implement WithClause Processing

Create `/interpreter/eval/with-clause.ts`:
```typescript
export async function applyWithClause(
  input: string,
  withClause: WithClause,
  env: Environment
): Promise<string> {
  let result = input;
  
  // Apply pipeline transformations
  if (withClause.pipeline) {
    for (const command of withClause.pipeline) {
      // Set @input for pipeline command
      const pipelineEnv = env.createChild();
      pipelineEnv.setVariable('input', result);
      result = await executeCommand(command, [], pipelineEnv);
    }
  }
  
  // Apply trust validation
  if (withClause.trust) {
    validateTrust(result, withClause.trust);
  }
  
  return result;
}
```

### 5. TTL Implementation for Path/Import

Update `/interpreter/eval/path.ts` and `/interpreter/eval/import.ts`:
- Extract TTL from directive values
- Pass TTL to cache when storing URLs/modules
- Convert TTL values to seconds for cache expiration

## Phase 6: Update Test Cases

### 1. Create New Test Cases
Location: `/tests/cases/valid/`

Create test cases for:
- `ttl/path-with-ttl/` - Path directive with TTL
- `ttl/import-with-ttl/` - Import directive with TTL
- `tail-modifiers/trust-levels/` - Trust level examples
- `tail-modifiers/pipeline/` - Pipeline examples
- `tail-modifiers/exec-invocations/` - Exec invocations with modifiers

### 2. Update Existing Test Fixtures
Run `npm run build:fixtures` to regenerate all test fixtures with new AST structure.

### 3. Fix Failing Tests
Most failures are due to:
- Interpreter expecting old AST structure
- Missing withClause handling
- Type mismatches

## Phase 7: Update Documentation

### 1. Update `/docs/dev/AST.md`
Add sections for:
- WithClause normalization
- TTL field documentation
- ExecInvocation type
- Examples of tail modifier syntax

### 2. Update User Documentation
- `/docs/syntax-reference.md` - Add TTL and tail modifier syntax
- `/docs/directives/*.md` - Update each directive doc with new features
- Create `/docs/security.md` - Document trust levels

### 3. Update CHANGELOG.md
Document all new features and breaking changes.

## Critical Implementation Notes

### 1. AST Normalization
ALL tail modifiers normalize to `withClause`:
- `trust always` → `{ withClause: { trust: 'always' } }`
- `| @cmd` → `{ withClause: { pipeline: [...] } }`
- `needs {...}` → `{ withClause: { needs: {...} } }`
- `with {...}` → `{ withClause: {...} }`

### 2. TTL Formats
- Duration: `(5d)`, `(30m)`, `(2h)`, `(1w)`
- Static: `(static)` - cache forever
- Positioned after source, before tail modifiers

### 3. Exec Invocation Priority
When parsing `@command()`:
- With tail modifiers → ExecInvocation
- Without modifiers in certain contexts → Template/command invocation
- The "@" prefix in add directive prevents variable reference matching

### 4. Grammar Precedence
Rules are ordered specifically to ensure correct matching:
- Exec invocations before variable references
- Commands with brackets before language+code

## Testing Your Changes

1. **Grammar Testing**: `npm run ast -- '<mlld syntax>'`
2. **Full Test Suite**: `npm test`
3. **Specific Tests**: `npm test <file>`
4. **Fixture Generation**: `npm run build:fixtures`

## Specific Failing Test Examples

To help the next implementer, here are the key failing patterns:

1. **ExecInvocation in templates**:
   - Test: `text-textTemplateDefinition-simple`
   - Expected: `Hello, World!`
   - Actual: `Hello, [object Object]!`
   - Cause: Template interpolation doesn't handle ExecInvocation nodes

2. **Add directive with exec invocation**:
   - Test: `text-assignment-add`
   - Error: `Unsupported add subtype: addExecInvocation`
   - Cause: Add evaluator doesn't recognize the new subtype

3. **When conditions with exec invocations**:
   - Test: `when-simple`
   - Error: `Unknown node type: ExecInvocation`
   - Cause: When evaluator can't evaluate ExecInvocation conditions

4. **Data values with exec invocations**:
   - Test: `data-mixed-types`
   - Error: `Unexpected node type in data value`
   - Cause: Data evaluator doesn't handle ExecInvocation nodes

## Known Issues

1. **Test Failures**: 63 tests failing due to interpreter not handling new AST
2. **Documentation**: AST.md needs updating with new structures  
3. **Module Version Checking**: Import evaluator was updated separately to add version checking

## Resources

- Implementation plan: `/docs/dev/specs/grammar-implementation-plan.md`
- Design specs: `/docs/dev/specs/ttl-trust-syntax.md`
- Context: `/docs/dev/specs/implementation-context.md`
- AST principles: `/docs/dev/AST.md`
- Grammar patterns: `/grammar/patterns/`
- Test cases: `/tests/cases/`

## Next Steps Priority

1. **Phase 4: Update AST Helpers** - Add helper functions for ExecInvocation handling
2. **Phase 5: Update Interpreter** - Critical for making tests pass
3. **Phase 6: Create Test Cases** - Validate the implementation
4. **Phase 7: Update Documentation** - Help users and future developers

The grammar and type work is complete. The next Claude should start with Phase 4 (AST helpers), then immediately move to Phase 5 (interpreter updates) to get the tests passing.