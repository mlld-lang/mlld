I'll run the tests to see what's failing:

```bash
npm test
```


Looking at the 11 failing tests, they fall into a few key categories that reveal misalignments with our specifications:

1. **Error Handling Philosophy Misalignment** (6 failures)
   - `api.test.ts`, `cli.test.ts`, and `cmd.test.ts` all expect errors to throw and halt execution
   - They test for specific error messages like "File not found" or "Invalid file extension"
   - This directly contradicts UX.md's "silent fail" philosophy where we should:
     - Produce blank output for missing files
     - Log warnings to stderr
     - Continue execution rather than halt

2. **State Management Issues** (3 failures)
   - `InterpreterService.integration.test.ts` has failures around state consistency
   - Tests expect state to be rolled back on errors, but UX.md specifies we should:
     - Continue with best effort
     - Return empty strings for missing/invalid data
     - Maintain partial state rather than roll back

3. **Variable Resolution Issues** (2 failures)
   - `ResolutionService.test.ts` and `DirectiveService.test.ts` have failures around variable resolution
   - Tests expect errors for undefined variables, but per UX.md:
     - Missing data fields should return empty string
     - Field access on non-existent fields returns empty string
     - ENV vars only generate errors when referenced and missing

Many of our tests are enforcing a strict, error-throwing approach when the spec actually calls for a more resilient, warning-based approach that prioritizes continuing execution with empty/default values over halting with errors.


## Additional Context

- The location handling test expects line 6 based on formula: base.line (5) + relative.line (2) - 1
- Multiple attempts to fix have included:
  - Adjusting location calculation in one place vs two places
  - Using different approaches to error handling for circular references
  - Making error handling async with await
  - Using ErrorFactory directly vs throwWithContext

## Task

Please analyze these test failures and provide:

1. Root cause analysis for each failure
2. Explanation of why previous attempts haven't worked
3. Specific code changes needed to fix both issues
4. Any potential gotchas or edge cases to consider

DO NOT GUESS. BE EVIDENCE-BASED AND EXPLICIT IN YOUR ANALYSIS. 

=== CONTEXT ===

We are trying to fix persistent test failures related to path mocking in a Node.js/TypeScript project. The main issues involve:
1. Path mock exports not being recognized
2. File system cleanup issues in tests
3. Missing test files

=== CODE AND TESTS ===

@cmd[cpai src tests --stdout]

=== TEST STATUS ===

@cmd[npm test src/services/__tests__/path-service.test.ts src/interpreter/directives/__tests__/embed.test.ts src/interpreter/directives/__tests__/import.test.ts tests/integration/cli.test.ts tests/integration/sdk.test.ts]

=== CONTEXT ===

We have recently centralized and fixed path mocks for some tests. However, we're seeing failures in several test files that seem to be related to path handling and the fs mock.

The main error we're seeing is:
```
FileSystemError: The "path" argument must be of type string or an instance of Buffer or URL. Received undefined
```

This is happening in the fs mock's normalizePath function when it receives undefined as a path argument.

YOUR TASK:

Please analyze the test failures and provide:
1. A root cause analysis of why we're getting undefined paths
2. A suggested fix approach that maintains consistency with our recent path mock centralization
3. Any potential issues we should watch out for when implementing the fix

DO NOT GUESS. DO NOT GIVE HAND-WAVY ADVICE. BE EVIDENCE-BASED, EXPLICIT, AND DECISIVE.

# Circular Import Detection Issue Analysis

We have a failing test in the import directive handler related to circular import detection. The test expects a promise rejection when a circular import is detected, but it's not working as expected.

## Relevant Code

### Import Test (src/interpreter/directives/__tests__/import.test.ts):
```typescript
it('should detect circular imports', async () => {
  // Create files that import each other
  await context.writeFile('project/a.meld', '@import "$PROJECTPATH/b.meld"');
  await context.writeFile('project/b.meld', '@import "$PROJECTPATH/a.meld"');
  
  const location = context.createLocation(1, 1);
  const node = context.createDirectiveNode('import', {
    source: '$PROJECTPATH/a.meld'
  }, location);
  
  await expect(handler.handle(node, context.state, context.createHandlerContext()))
    .rejects.toThrow('Circular import detected');
});
```

### Import Handler Implementation (src/interpreter/directives/import.ts):
```typescript
// Check for circular imports
if (state.hasImport(importPath)) {
  directiveLogger.error('Circular import detected', { path: importPath });
  return Promise.reject(
    ErrorFactory.createImportError('Circular import detected', node.location?.start)
  );
}

// Add import to state before reading file to detect circular imports
state.addImport(importPath);
```

### State Implementation (src/interpreter/state/state.ts):
```typescript
// Imports
addImport(path: string): void {
  this.checkMutable();
  this.imports.add(path);
  this.localChanges.add(`import:${path}`);
  interpreterLogger.debug('Added import', { path });
}

removeImport(path: string): void {
  this.checkMutable();
  this.imports.delete(path);
  this.localChanges.delete(`import:${path}`);
  interpreterLogger.debug('Removed import', { path });
}

hasImport(path: string): boolean {
  return this.imports.has(path) || !!this.parentState?.hasImport(path);
}
```

=== TEST STATUS ===

@cmd[npm test src/interpreter/directives/__tests__/import.test.ts]

=== END TEST STATUS ===

YOUR TASK:

Please analyze the circular import detection implementation and test failure. We need to understand:

1. Why is the promise resolving to undefined instead of rejecting when a circular import is detected?
2. Is the state tracking of imports working correctly?
3. Is there a timing/async issue in how we're handling the circular import detection?
4. What's the best way to fix this to ensure reliable circular import detection?

DO NOT GUESS. DO NOT GIVE HAND-WAVY ADVICE. BE EVIDENCE-BASED, EXPLICIT, AND DECISIVE.

Focus on:
- The flow of execution in the import handler
- How the state tracking interacts with async operations
- Whether the promise rejection is being handled correctly
- If there are any race conditions or timing issues
- The relationship between parent/child states and import tracking 

# Circular Import Detection Promise Rejection Analysis

## Current Behavior
The test `should detect circular imports` is failing with:
```
AssertionError: promise resolved "undefined" instead of rejecting
```

## Implementation Attempts

1. Using Promise.reject:
```typescript
if (state.hasImport(importPath)) {
  directiveLogger.error('Circular import detected', { path: importPath });
  return Promise.reject(
    ErrorFactory.createImportError('Circular import detected', node.location?.start)
  );
}
```

2. Using throw directly:
```typescript
if (state.hasImport(importPath)) {
  directiveLogger.error('Circular import detected', { path: importPath });
  throw ErrorFactory.createImportError('Circular import detected', node.location?.start);
}
```

3. Using throwWithContext:
```typescript
if (state.hasImport(importPath)) {
  directiveLogger.error('Circular import detected', { path: importPath });
  await throwWithContext(
    ErrorFactory.createImportError,
    'Circular import detected',
    node.location,
    context
  );
}
```

## Key Observations
1. The handler method is async and returns Promise<void>
2. We need to handle location adjustments for rightside mode
3. throwWithContext is synchronous and uses throw directly
4. The test expects a rejected promise with a specific error message

## Questions for Analysis
1. Why is the promise resolving to undefined instead of rejecting in each attempt?
2. What is the correct way to handle promise rejections in an async method when using throw?
3. How should we handle location adjustments while ensuring proper promise rejection?
4. Is there a timing issue between the error being thrown and the promise rejection?

Please provide a detailed analysis of:
1. The exact flow of execution in each attempt
2. Why each approach failed to produce the expected rejection
3. The correct pattern for ensuring promise rejection in this async context
4. Best practices for combining error throwing with promise rejections in TypeScript

Focus on being explicit about the async/await and promise mechanics at play. 

# Promise Rejection Analysis in Circular Import Detection

## Current Implementation
```typescript
// In import.ts
if (state.hasImport(importPath)) {
  directiveLogger.error('Circular import detected', { path: importPath });
  await throwWithContext(
    ErrorFactory.createImportError,
    'Circular import detected',
    node.location,
    context
  );
}

// In location-helpers.ts
export function throwWithContext(...): never {
  // ...
  throw error;
}
```

## Test Expectation
```typescript
await expect(handler.handle(node, context.state, context.createHandlerContext()))
  .rejects.toThrow('Circular import detected');
```

## Key Questions

1. How should we handle the mismatch between:
   - throwWithContext being synchronous and using throw
   - The test expecting a promise rejection
   - The handler method being async

2. What's the correct pattern for:
   - Using throwWithContext in an async context
   - Ensuring proper promise rejection
   - Maintaining location context in errors

3. Is there a fundamental issue with:
   - Using await with a synchronous throw
   - How errors propagate through the async chain
   - The way we're mixing sync and async error handling

Please provide specific guidance on:
1. Whether throwWithContext should be modified to handle async cases
2. If we should use a different approach for circular import detection
3. The correct way to ensure promise rejection while preserving error context
4. Best practices for error handling in async TypeScript methods

Focus on the exact mechanics of how errors propagate through async/await chains and how to ensure proper promise rejection. 