# TSyringe Migration - DI-Only Mode Test Migration Plan

This document outlines the plan for migrating tests to use DI-only mode as part of Phase 4 of the TSyringe migration. The migration will be done in batches, with each batch focusing on a specific group of related tests.

## Migration Approach

1. Tests will be updated to use the `TestContextDI.withDIOnlyMode()` helper
2. Services will be resolved from the container using interfaces instead of constructing them directly
3. The verification script will be used to track which tests pass in DI-only mode
4. Migration progress will be tracked in the compatibility summary

## Migration Batches

The migration will be done in the following batches, in order of dependency:

### Batch 1: Foundation Services

- [x] services/fs/FileSystemService/*.test.ts
  - [x] services/fs/FileSystemService/PathOperationsService.test.ts
  - [x] services/fs/FileSystemService/FileSystemService.test.ts
  - [x] services/fs/FileSystemService/NodeFileSystem.test.ts
- [x] services/fs/PathService/*.test.ts
  - [x] services/fs/PathService/PathService.test.ts
- [ ] services/fs/ProjectPathResolver.test.ts
- [ ] services/resolution/CircularityService/*.test.ts
- [ ] services/resolution/ValidationService/*.test.ts
- [ ] services/state/StateEventService/*.test.ts
- [ ] services/state/StateService/*.test.ts
- [ ] services/state/StateService/StateFactory.test.ts

### Batch 2: Pipeline Services

- [ ] services/pipeline/ParserService/*.test.ts
- [ ] services/pipeline/InterpreterService/*.test.ts
- [ ] services/pipeline/DirectiveService/*.test.ts
- [ ] services/pipeline/OutputService/*.test.ts
- [ ] services/resolution/ResolutionService/*.test.ts

### Batch 3: Directive Handlers

- [ ] services/pipeline/DirectiveService/handlers/definition/*.test.ts
- [ ] services/pipeline/DirectiveService/handlers/execution/*.test.ts

### Batch 4: Resolution Services

- [ ] services/resolution/ResolutionService/resolvers/*.test.ts
- [ ] services/resolution/ValidationService/validators/*.test.ts

### Batch 5: CLI and Integration Tests

- [ ] services/cli/CLIService/*.test.ts
- [ ] cli/*.test.ts
- [ ] api/*.test.ts

### Batch 6: Utility Services

- [ ] core/utils/*.test.ts
- [ ] services/sourcemap/*.test.ts

### Batch 7: Test Utilities

- [ ] tests/utils/**/*.test.ts

## Verification

The migration progress will be automatically tracked using the verification script. To verify a batch of tests:

```bash
node scripts/verify-di-only-mode.js "services/fs/**/*.test.ts"
```

## Migration Status

The current migration status is tracked in the [DI Compatibility Summary](./di-compatibility-summary.md) file, which is automatically updated by the verification script.

## Example Migration

Here's an example of migrating a test to use DI-only mode:

### Before

```typescript
describe('FileSystemService', () => {
  let context: TestContext;
  let service: FileSystemService;
  let mockPathOps: any;

  beforeEach(() => {
    context = new TestContext();
    mockPathOps = {...};
    service = new FileSystemService(mockPathOps, null, context.fs);
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it('should do something', () => {
    // Test code
  });
});
```

### After

```typescript
describe('FileSystemService', () => {
  let context: TestContextDI;
  let service: IFileSystemService;
  let mockPathOps: any;

  beforeEach(() => {
    // Use withDIOnlyMode to opt into DI-only mode
    context = TestContextDI.withDIOnlyMode();
    
    // Create and register mock dependencies
    mockPathOps = {...};
    context.registerMock('IPathOperationsService', mockPathOps);
    
    // Resolve the service from the container using the interface token
    service = context.resolve<IFileSystemService>('IFileSystemService');
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it('should do something', () => {
    // Test code remains the same
  });
});
```