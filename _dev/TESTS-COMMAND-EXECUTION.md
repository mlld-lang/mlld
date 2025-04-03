# Testing with CommandExecutionService

This document describes how to set up tests that use the `CommandExecutionService`, which was introduced as part of Phase 3 of the RUN command refactoring. The `CommandExecutionService` is responsible for executing shell commands and language-specific code, and is used by the various Run directive handlers.

## The Problem

Many tests may fail with an error like:

```
Cannot read properties of undefined (reading 'executeShellCommand')
```

This happens because the CommandExecutionService is not properly injected or mocked in the tests.

## Solution: Using TestContextDI with Automatic CommandExecutionService Registration

The TestContextDI class automatically registers a mock `CommandExecutionService` during initialization:

```typescript
import { TestContextDI } from '@tests/utils/di/TestContextDI';

describe('My Test Suite', () => {
  let context: TestContextDI;
  
  beforeEach(async () => {
    // Create an isolated test context
    context = TestContextDI.createIsolated();
    
    // Initialize the context - CommandExecutionService is automatically registered
    await context.initialize();
    
    // Resolve the service under test using the DI container
    myService = await context.resolve(MyService);
  });
  
  afterEach(async () => {
    // Clean up
    await context?.cleanup();
  });
  
  // Tests go here...
});
```

If you need to explicitly re-register or customize the CommandExecutionService mock, you can use the public `registerCommandExecutionService()` method:

```typescript
// Re-register or customize the CommandExecutionService mock
context.registerCommandExecutionService();
```

## API Tests

For API tests that use the `main` function, you need to include the CommandExecutionService in the services object:

```typescript
// Helper to get services with CommandExecution included
function getServicesWithCommandExecution() {
  // Get the mock CommandExecutionService from the container
  const mockCommandExecution = context.resolveSync('ICommandExecutionService');
  
  return {
    ...context.services,
    commandExecution: mockCommandExecution
  };
}

// Use the helper when calling main
const result = await main(testFilePath, {
  fs: context.services.filesystem,
  services: getServicesWithCommandExecution() as any,
  transformation: true
});
```

## Testing RunDirectiveHandler

When testing RunDirectiveHandler, the CommandExecutionService will be automatically injected if you resolve the handler from the DI container:

```typescript
// Create a mock directive context
function createDirectiveContext(): DirectiveContext {
  return {
    state: context.resolveSync('IStateService'),
    currentFilePath: 'test.meld',
    workingDirectory: '/project',
    resolutionContext: {
      currentFilePath: 'test.meld',
      workingDirectory: '/project'
    }
  };
}

it('should execute a command', async () => {
  // Get the handler from the container
  const handler = await context.resolve(RunDirectiveHandler);
  
  // Get the mock CommandExecutionService to verify calls
  const mockCommandExecutionService = context.resolveSync('ICommandExecutionService');
  
  // Create a directive node
  const directive: DirectiveNode = {
    type: 'Directive',
    directive: {
      kind: 'run',
      command: 'echo "hello world"',
      subtype: 'basicCommand'
    },
    location: { start: { line: 1, column: 1 }, end: { line: 1, column: 25 } }
  };
  
  // Execute the directive
  await handler.execute(directive, createDirectiveContext());
  
  // Verify the command execution service was called with the correct arguments
  expect(mockCommandExecutionService.executeShellCommand).toHaveBeenCalledWith(
    'echo "hello world"',
    expect.objectContaining({
      animationMessage: expect.stringContaining('Running')
    })
  );
});
```

## Migration Guide

To fix tests failing with CommandExecutionService errors:

1. **Ensure you're using TestContextDI** with isolated containers: `TestContextDI.createIsolated()`
2. **Always call await context.initialize()** to properly set up the container
3. **Resolve services from the container** instead of creating them directly 
4. **For API tests**, add CommandExecutionService to the services object using the example above
5. **For run directive tests**, follow the RunDirectiveHandler pattern above

## Best Practices for Tests

As you migrate tests, follow these best practices:

1. Use isolated DI containers for each test suite to avoid cross-contamination: `TestContextDI.createIsolated()`
2. Properly clean up after each test with `await context.cleanup()`
3. Use async/await with `context.resolve()` instead of `resolveSync()` (except when getting mocks for verification)
4. Test individual handlers by resolving them from the container, not by constructing them directly
5. Access mock services through `context.resolveSync()` when verifying calls

Following these patterns will ensure tests use the new CommandExecutionService correctly and maintain consistency across the codebase.