# Fixing Circular Dependencies in TSyringe Implementation

## Problem Description

When running tests with `npm test`, we experienced several issues:

1. Tests were hanging indefinitely
2. Receiving excessive recursion errors with "Cannot inject the dependency" messages
3. Memory exhaustion errors and timeouts
4. EventEmitter MaxListenersExceededWarning warnings

The error patterns revealed circular dependencies between multiple services:
- `FileSystemService` ↔ `PathService`
- `ParserService` ↔ `ResolutionService`

These circular dependencies caused infinite recursion in the DI container, which led to memory issues and test failures.

## Solution Approach

### 1. Identify Key Circular Dependencies

We identified multiple circular dependencies in the codebase:

- `FileSystemService` requires `PathService` which requires `FileSystemService`
- `ParserService` requires `ResolutionService` which requires `ParserService`
- Other potential circular dependencies in the test setups and DI initialization

### 2. Break Circular Dependencies

Modified `core/di-config.ts` to use manual instantiation and linking of services instead of automatic resolution:

```typescript
// Create instances manually in the right order
const pathOps = container.resolve<PathOperationsService>('PathOperationsService');
const nodeFs = container.resolve<NodeFileSystem>('NodeFileSystem');
const fileSystemService = new FileSystemService(pathOps, nodeFs);

// Register instances instead of classes
container.registerInstance('FileSystemService', fileSystemService);
container.registerInstance('IFileSystemService', fileSystemService);

// Create ParserService without ResolutionService
const parserService = new ParserService();
container.registerInstance('ParserService', parserService);
container.registerInstance('IParserService', parserService);

// Create PathService with existing FileSystemService
const projectPathResolver = container.resolve(ProjectPathResolver);
const pathService = new PathService(fileSystemService, parserService, projectPathResolver);
container.registerInstance('PathService', pathService);
container.registerInstance('IPathService', pathService);

// Link them to manually establish circular references
fileSystemService.setPathService(pathService);

// Create ResolutionService with existing services
const stateService = new StateService();
const resolutionService = new ResolutionService(stateService, fileSystemService, parserService, pathService);
container.registerInstance('ResolutionService', resolutionService);
container.registerInstance('IResolutionService', resolutionService);

// Connect ResolutionService back to ParserService
parserService.setResolutionService(resolutionService);
```

### 3. Modify Service Classes

Updated service classes to accept null values in constructor and use setter methods:

1. **FileSystemService**: 
   - Removed PathService injection from constructor
   - Used setter method `setPathService` instead

2. **ParserService**:
   - Accepted null for ResolutionService in constructor
   - Added setter method `setResolutionService`

### 4. Improve Test Setup and Cleanup

1. Added explicit container cleanup in test setup:
```typescript
// Clear DI container instances between tests
beforeEach(() => {
  container.clearInstances();
});

afterEach(() => {
  // Clear references to reduce memory usage
  context = null;
  service = null;
  container.clearInstances();
});
```

2. Added better cleanup to break circular references:
```typescript
// Force garbage collection if available
if (global.gc) {
  global.gc();
}
```

3. Fixed tests to handle circular dependencies:
   - Added `--expose-gc --max-old-space-size=4096` to NODE_OPTIONS
   - Modified test files to work with the new DI setup

### 5. Updated Vitest Configuration

Updated `vitest.config.mts` to use forks and limit worker count:
```typescript
pool: 'forks', // Use forks instead of threads
poolOptions: {
  forks: {
    singleFork: true // Use a single fork for all tests
  }
},
maxWorkers: 1, // Limit to 1 worker to prevent race conditions with DI
maxThreads: 1  // Limit threads as well
```

## Results

After implementing these changes:
- Tests no longer hang indefinitely
- Fixed many of the circular dependency injection errors
- Tests can now run individually and in smaller batches

## Recent Improvements

We've made additional improvements to our circular dependency solution:

1. **Improved ResolutionService Initialization**:
   - Modified ResolutionService to accept `null` ParserService in initialization
   - Added `setParserService` method to update after construction
   - Fixed variableReferenceResolver recreation when parser is updated

2. **Updated DI Configuration**:
   ```typescript
   // Create with minimal dependencies first
   const resolutionService = new ResolutionService(stateService, fileSystemService, null, pathService);
   
   // Complete the circular dependency setup
   parserService.setResolutionService(resolutionService);
   // Now provide the parser to the resolution service
   resolutionService.setParserService(parserService);
   ```

3. **Enhanced Test Cleanup**:
   - Added explicit DI container cleanup in test lifecycle hooks
   - Improved nullification of service references in teardown
   - Added small delays after cleanup to allow for async operations
   - Enhanced garbage collection hints

4. **Testing Strategy**:
   - Run tests in one DI mode at a time (no DI, DI, or DI-only)
   - Focused on fixing DI-only mode first for future compatibility
   - Added container cleanup in global test setup

## Next Steps

1. Implement these fixes across all failing tests
2. Continue addressing memory usage by optimizing service dependencies
3. Fix remaining test failures (approximately 10-15 failing test files)
4. Consider refactoring the architecture to minimize circular dependencies in the longer term

## Lessons Learned

1. Circular dependencies are a major issue with dependency injection systems
2. Manual instantiation and linking is required for services with circular dependencies
3. Proper cleanup between tests is essential when using DI in tests
4. Testing in smaller batches may be necessary with complex DI setups
5. Setting constructor parameters as optional and using setter methods allows more flexible initialization