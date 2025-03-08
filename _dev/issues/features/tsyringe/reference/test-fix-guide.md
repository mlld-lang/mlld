# Quick Reference Guide for Fixing Tests with TSyringe

## Running Tests Safely

To run tests with the TSyringe implementation, use:

```bash
NODE_OPTIONS="--expose-gc --max-old-space-size=4096" npm test [test_file_path]
```

For example:
```bash
NODE_OPTIONS="--expose-gc --max-old-space-size=4096" npm test services/fs/PathService/PathService.test.ts
```

## Common Test Fixes

### 1. Fix Circular Dependencies in Tests

When encountering `Cannot inject the dependency...` errors:

1. Use `TestContextDI` and test in a single mode at a time, preferring DI-only mode:
```typescript
describe.each([
  // Run only one mode at a time to avoid memory issues
  // Prefer DI-only mode for future compatibility
  //{ mode: 'no DI', createContext: () => TestContextDI.withoutDI() },
  //{ mode: 'DI', createContext: () => TestContextDI.withDI({ autoInit: false }) },
  { mode: 'DI-only', createContext: () => TestContextDI.withDIOnlyMode({ autoInit: false }) },
])
```

2. Add explicit container cleanup for DI-only mode:
```typescript
afterEach(async () => {
  // Break circular dependencies before cleanup
  service = null;
  parserService = null;
  fs = null;
  
  // For DI-only mode, explicitly clear container instances
  if (isDIOnlyMode && context.container) {
    try {
      context.container.clearInstances();
    } catch (error) {
      console.error('Error clearing container instances:', error);
    }
  }
  
  // Clean up all resources
  await context.cleanup();
  
  // Force garbage collection
  if (global.gc) {
    global.gc();
  }
  
  // Allow more time for cleanup to complete
  await new Promise(resolve => setTimeout(resolve, 10));
});
```

3. Create lightweight mocks to avoid memory issues:
```typescript
const createMockParserService = () => {
  const resultCache = new Map<string, any>();
  
  return {
    parse: vi.fn(async (content) => {
      // Simple implementation that doesn't use dynamic imports
      if (resultCache.has(content)) {
        return resultCache.get(content);
      }
      const result = [{ type: 'Text', content }];
      resultCache.set(content, result);
      return result;
    }),
    cleanup: () => {
      resultCache.clear();
    }
  };
};
```

### 2. Fix Path Validation Errors

For path validation errors:
```
PathValidationError: Paths with segments must start with $. or $~ or $PROJECTPATH or $HOMEPATH
```

1. Use `$PROJECTPATH` in file paths:
```typescript
// Don't use absolute paths directly
// Bad:
await context.fs.writeFile('/project/test.meld', content);
await main('/project/test.meld', options);

// Good:
await context.fs.writeFile('/project/test.meld', content);
await main('$PROJECTPATH/test.meld', options);
```

2. Or use context.runMeld helper:
```typescript
const result = await context.runMeld({
  input: '/project/test.meld',
  transformation: true,
  format: 'markdown',
  stdout: true  // Important for seeing output in result.stdout
});
```

### 3. Fix Test Content Validation

When checking for content in test output:

```typescript
// For CLI tests
expect(result.stderr).not.toContain('Error:');  // Check no error, but allow warnings

// For stdout tests
expect(result.stdout).toContain('Expected content');  // Check specific content exists
```

## Common Error Patterns

### EventEmitter Max Listeners Warning

If you see:
```
MaxListenersExceededWarning: Possible EventEmitter memory leak detected
```

Add a method to increase EventEmitter limit in your test setup:
```typescript
import { EventEmitter } from 'events';
EventEmitter.defaultMaxListeners = 20;  // Increase from default 10
```

### Winston Logger Warnings

If you see:
```
[winston] Attempt to write logs with no transports...
```

These warnings can be ignored - we've modified the logger to use 'silent' level in tests.

## How to Debug Failing Tests

1. Run in a single mode first (`no DI` is safest)
2. Run with explicit garbage collection: `--expose-gc`
3. Run with increased memory: `--max-old-space-size=4096`
4. Add `console.log(...)` statements to track execution flow
5. Inspect errors carefully for circular dependency patterns in the full stack

## Testing in Smaller Batches

When running multiple tests, group them by compatibility:
```bash
# Run basic tests without complex DI needs
npm test tests/codefence-duplication-fix.test.ts tests/embed-line-number-fix.test.ts tests/cli/cli-error-handling.test.ts

# Run service tests separately
npm test services/fs/PathService/PathService.test.ts
```

### 6. Breaking Circular Dependencies with Setter Methods

For services with circular dependencies, add setter methods to break the cycle:

```typescript
// In ParserService.ts
@injectable()
export class ParserService implements IParserService {
  private resolutionService?: IResolutionService;

  constructor(@inject('IResolutionService') resolutionService: IResolutionService | null = null) {
    // Optional dependency to break circular reference
    if (resolutionService) {
      this.resolutionService = resolutionService;
    }
  }
  
  /**
   * Set the resolution service - used to avoid circular dependencies
   */
  setResolutionService(resolutionService: IResolutionService): void {
    this.resolutionService = resolutionService;
  }
}

// In ResolutionService.ts
@injectable()
export class ResolutionService implements IResolutionService {
  private parserService: IParserService;
  
  constructor(
    @inject('IStateService') stateService?: IStateService,
    @inject('IFileSystemService') fileSystemService?: IFileSystemService,
    @inject('IParserService') parserService?: IParserService | null,
    @inject('IPathService') pathService?: IPathService
  ) {
    // Allow null parser service
    this.parserService = parserService || {} as IParserService;
  }
  
  /**
   * Set the parser service - used to avoid circular dependencies
   */
  setParserService(parserService: IParserService): void {
    this.parserService = parserService;
    // Update any internal components that need the parser
  }
}
```

## Next Steps for Test Fixes

1. Apply the circular dependency fix pattern to remaining tests
2. Enable DI-only mode testing for all tests
3. Fix path validation failures consistently using $PROJECTPATH
4. Create lightweight mocks to avoid memory issues
5. Add explicit cleanup in all tests to prevent memory leaks
6. Use the container.clearInstances() properly in afterEach hooks