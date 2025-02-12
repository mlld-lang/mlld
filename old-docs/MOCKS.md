# Path and FS Mocking Architecture

## Running tests that need path/fs mocks

fs/path mock dependencies:
```
npm test \
  src/services/__tests__/path-service.test.ts \
  src/test/__tests__/fs-utils.test.ts 
```

all fs/path mock related tests:
```
npm test \
  src/services/__tests__/path-service.test.ts \
  src/test/__tests__/fs-utils.test.ts \
  src/interpreter/directives/__tests__/import.test.ts \  
  src/interpreter/directives/__tests__/embed.test.ts \
  src/interpreter/directives/__tests__/path.test.ts \
  src/interpreter/directives/__tests__/run.test.ts \
  src/interpreter/directives/__tests__/data.test.ts \
  src/interpreter/directives/__tests__/define.test.ts \
  src/sdk/__tests__/format-conversion.test.ts \
  tests/integration/cli.test.ts \
  tests/integration/sdk.test.ts
```

## Mock Implementation Analysis

### Core Tests
1. **Path Service Tests** (`path-service.test.ts`) ✓
   - Uses centralized path mock correctly
   - Proper test isolation
   - Platform-aware testing
   - Follows all best practices

2. **FS Utils Tests** (`fs-utils.test.ts`) ✓
   - Tests the mock filesystem itself
   - Validates mock behavior
   - Ensures consistent cleanup
   - Core foundation for other tests

### Directive Tests
1. **Path Directive** (`path.test.ts`) ✓
   - Uses TestContext properly
   - Correct path mock initialization
   - Good test isolation
   - Proper variable resolution

2. **Import Directive** (`import.test.ts`) ✓
   - Uses centralized path mock
   - Proper test file setup
   - Consistent error handling
   - Path variable resolution

3. **Embed Directive** (`embed.test.ts`) ❌
   - Inconsistent mock file setup
   - Direct fs mock imports
   - Missing path resolution
   - Needs TestContext alignment

4. **Run Directive** (`run.test.ts`) ⚠️
   - No direct fs/path usage
   - Uses child_process mocks
   - May need path resolution for commands
   - Consider adding TestContext

5. **Data Directive** (`data.test.ts`) ⚠️
   - Limited fs/path interaction
   - May need TestContext for consistency
   - Review path resolution needs

6. **Define Directive** (`define.test.ts`) ⚠️
   - Minimal fs/path usage
   - Consider TestContext for future
   - Review path variable handling

### Integration Tests
1. **CLI Tests** (`cli.test.ts`) ❌
   - Missing fs-promises mock
   - Inconsistent path handling
   - Direct process.cwd() usage
   - Needs complete overhaul

2. **SDK Tests** (`sdk.test.ts`) ✓
   - End-to-end file operations
   - Mock file system usage
   - Path resolution chain
   - Error handling flow

### Format Tests
1. **Format Conversion** (`format-conversion.test.ts`) ⚠️
   - Basic fs mock usage
   - Missing path resolution
   - Uses fixtures directly
   - Consider TestContext integration

## Implementation Status Summary

### ✓ Fully Aligned (4)
- path-service.test.ts (using TestContext)
- fs-utils.test.ts ✨ (moved to __tests__, added validation, snapshots, debugging)
- path.test.ts (using TestContext properly)
- import.test.ts (using TestContext properly)

### 🚧 In Progress
1. **Embed Tests** (`embed.test.ts`)
   - ✅ Already using TestContext
   - ❌ Still has direct fs mock imports
   - ❌ Needs cleanup of mock setup
   - ❌ Update path resolution

2. **Directive Tests**
   - `run.test.ts` (needs TestContext)
   - `data.test.ts` (needs TestContext)
   - `define.test.ts` (needs TestContext)

### ❌ Needs Complete Update
1. **Integration Tests**
   - `cli.test.ts`
     - Missing fs-promises mock
     - Inconsistent path handling
     - Direct process.cwd() usage
   - `sdk.test.ts`
     - Needs TestContext integration
     - Update path resolution
     - Align with new patterns

2. **Format Tests**
   - `format-conversion.test.ts`
     - Basic fs mock usage
     - Missing path resolution
     - Uses fixtures directly

### Next Steps (In Priority Order)
1. Clean up `embed.test.ts`
   - Remove direct fs mock imports
   - Update mock setup
   - Use TestContext properly

2. Update directive tests
   - Add TestContext to run.test.ts
   - Add TestContext to data.test.ts
   - Add TestContext to define.test.ts

3. Overhaul integration tests
   - Update cli.test.ts
   - Update sdk.test.ts

4. Update format tests
   - Add TestContext to format-conversion.test.ts
   - Fix path resolution
   - Update fixture handling

## Core Mock Architecture

### Path Mocking
1. **Factory-Based Creation**
   - Centralized in `tests/__mocks__/path.ts`
   - Uses `createPathMock()` factory function
   - Supports both ESM and CJS module formats
   - Handles platform-specific behavior (win32/posix)

2. **Core Features**
   - Platform-aware path normalization
   - Special variable handling ($HOMEPATH, $PROJECTPATH, etc.)
   - Consistent path separator management
   - Function binding with proper context

3. **Mock Structure**
   - Core path functions (normalize, join, etc.)
   - Platform-specific implementations (win32/posix)
   - Test utilities for mock management
   - Proper function binding and context preservation

### FS Mocking
1. **Implementation Structure**
   - Base mock in `src/__mocks__/fs.ts`
   - Promise-based mock in `src/__mocks__/fs-promises.ts`
   - Shared mock file storage
   - Consistent error handling

2. **Core Features**
   - In-memory file system simulation
   - Path normalization through path mock
   - Synchronous and asynchronous operations
   - Error simulation capabilities

3. **Mock Management**
   - Centralized file storage
   - Test isolation through clearMocks()
   - Error injection support
   - Platform-independent path handling

## Current Implementation Status

### Correctly Implemented
1. **Import Tests**
   - Uses centralized path mock
   - Proper test file setup
   - Consistent error handling
   - Path variable resolution

2. **Path Service Tests**
   - Platform-aware path handling
   - Special variable resolution
   - Mock file system integration
   - Error propagation

3. **SDK Tests**
   - End-to-end file operations
   - Mock file system usage
   - Path resolution chain
   - Error handling flow

### Needs Alignment
1. **Embed Tests**
   - ❌ Inconsistent mock file setup
   - ❌ Direct fs mock imports
   - ❌ Missing path resolution
   - Required Changes:
     - Use TestContext for file setup
     - Import fs-promises mock correctly
     - Align path resolution with import tests

2. **CLI Tests**
   - ❌ Missing fs-promises mock
   - ❌ Inconsistent path handling
   - ❌ Direct process.cwd() usage
   - Required Changes:
     - Update mock imports
     - Use TestContext for paths
     - Mock process.cwd() consistently

## Implementation Guidelines

### File Setup Pattern
```typescript
// Correct pattern:
beforeEach(async () => {
  context = new TestContext();
  await context.initialize();
  await context.writeFile('project/test.txt', 'content');
});

afterEach(async () => {
  await context.cleanup();
  vi.resetAllMocks();
});
```

### Path Resolution Pattern
```typescript
// Correct pattern:
const resolvedPath = context.fs.getPath(
  pathModule.join('project', 'file.txt')
);
```

### Mock Import Pattern
```typescript
// Correct pattern:
vi.mock('path', async () => {
  const { createPathMock } = await import('../../../../tests/__mocks__/path');
  return createPathMock();
});

vi.mock('fs/promises', () => import('../../../__mocks__/fs-promises'));
```

## Success Criteria

### Path Mock Verification
1. ✅ Platform-specific behavior
2. ✅ Special variable resolution
3. ✅ Proper function binding
4. ✅ Context preservation
5. 🚧 Undefined path handling (in progress)

### FS Mock Verification
1. ✅ File operation simulation
2. ✅ Error handling
3. ✅ Path normalization
4. 🚧 Directory structure management (in progress)
5. ❌ Promise rejection consistency (not started)

### Test Integration
1. ✅ Test isolation
2. 🚧 Mock cleanup (in progress)
3. 🚧 Path resolution consistency (in progress)
4. ❌ Error propagation (not started)
5. ❌ Environment variable handling (not started)

## Next Steps

### Current Priority
1. **Complete Directory Structure Management**
   - ✅ Implement getFullPath helper
   - ✅ Add special variable handling
   - 🚧 Add parent directory creation
   - ❌ Add directory validation
   - ❌ Add path existence checks

2. **Finish Mock Initialization**
   - ✅ Fix path mock setup order
   - ✅ Add test path configuration
   - 🚧 Add environment variable handling
   - ❌ Add initialization validation
   - ❌ Add defensive checks

### Next Up
1. **Error Handling Improvements**
   - Add undefined path checks
   - Improve error messages
   - Implement error context
   - Add path validation

2. **Test Pattern Updates**
   - Implement declarative setup
   - Add environment management
   - Create state snapshots

### Future Work
1. **Documentation**
   - Update test patterns
   - Document common issues
   - Add troubleshooting guide

2. **Tooling**
   - Add mock validation helpers
   - Create mock debugging tools
   - Implement state snapshots

## Critical Implementation Guidelines

### Mock Initialization Order
1. **Early Mock Setup**
   - Mock modules must be initialized before any code that uses them
   - Use vi.mock() at the top of test files or in global setup
   - Ensure mocks are in place before requiring tested modules

2. **Path/FS Consistency**
   - Either mock both path and fs thoroughly
   - Or use real path with mocked fs
   - Never mix real and mocked calls
   - Ensure path.normalize never returns undefined

3. **Environment Variables**
   - Set required variables (e.g., $PROJECTPATH) before mock logic runs
   - Validate environment variables in tests
   - Use explicit values in test setup
   - Handle undefined/empty variables gracefully

### File System Setup Pattern
```typescript
// Correct pattern:
beforeEach(async () => {
  // 1. Set environment variables first
  process.env.PROJECTPATH = '/Users/adam/dev/meld/test/_tmp/project';
  
  // 2. Initialize test context
  context = new TestContext();
  await context.initialize();
  
  // 3. Create parent directories first
  await context.writeFile('project', '');
  await context.writeFile('project/subdir', '');
  
  // 4. Then add files
  await context.writeFile('project/subdir/test.txt', 'content');
});

afterEach(async () => {
  await context.cleanup();
  vi.resetAllMocks();
  // Clean up environment
  delete process.env.PROJECTPATH;
});
```

### Path Resolution Pattern
```typescript
// Correct pattern with defensive checks
const resolvedPath = context.fs.getPath(
  pathModule.join('project', 'file.txt')
);
if (!resolvedPath) {
  throw new Error('Failed to resolve path');
}
```

### Mock Import Pattern
```typescript
// Correct pattern - mock before imports
vi.mock('path', async () => {
  const { createPathMock } = await import('../../../../tests/__mocks__/path');
  return createPathMock({
    testRoot: '/Users/adam/dev/meld/test/_tmp',
    testHome: '/Users/adam/dev/meld/test/_tmp/home',
    testProject: '/Users/adam/dev/meld/test/_tmp/project'
  });
});

vi.mock('fs/promises', () => import('../../../__mocks__/fs-promises'));

// Then import modules that use path/fs
import { someModule } from './some-module';
```

## Success Criteria

### Path Mock Verification
1. ✅ Platform-specific behavior
2. ✅ Special variable resolution
3. ✅ Proper function binding
4. ✅ Context preservation
5. 🚧 Undefined path handling (in progress)

### FS Mock Verification
1. ✅ File operation simulation
2. ✅ Error handling
3. ✅ Path normalization
4. 🚧 Directory structure management (in progress)
5. ❌ Promise rejection consistency (not started)

### Test Integration
1. ✅ Test isolation
2. 🚧 Mock cleanup (in progress)
3. 🚧 Path resolution consistency (in progress)
4. ❌ Error propagation (not started)
5. ❌ Environment variable handling (not started)

## Common Issues and Solutions

### Undefined Path Errors
1. **Symptoms**
   - "path argument must be string/Buffer/URL"
   - Undefined paths in normalizePath
   - ENOENT for existing files

2. **Common Causes**
   - Unset environment variables
   - Missing parent directories
   - Inconsistent path resolution
   - Mock initialization timing

3. **Solutions**
   - Set environment variables early
   - Create parent directories first
   - Use defensive path checks
   - Initialize mocks before imports

### ENOENT Errors
1. **Symptoms**
   - "no such file or directory"
   - Missing files that should exist
   - Directory structure issues

2. **Common Causes**
   - Parent directories not created
   - Test sequence timing issues
   - Inconsistent path resolution

3. **Solutions**
   - Create complete directory structure
   - Use declarative filesystem setup
   - Ensure proper test sequencing

## Best Practices

1. **Avoid Over-Mocking**
   - Only mock what's necessary
   - Consider using real path module
   - Focus on filesystem control

2. **Declarative Setup**
   - Define filesystem structure upfront
   - Use consistent setup patterns
   - Centralize mock configuration

3. **Environment Management**
   - Set variables explicitly
   - Clean up after tests
   - Use configuration objects

4. **Error Handling**
   - Fail fast on undefined paths
   - Add descriptive error messages
   - Include error context

## Next Steps

1. **Mock Initialization**
   - Review and fix mock setup order
   - Ensure consistent initialization
   - Add defensive checks

2. **Directory Structure**
   - Implement parent directory creation
   - Use declarative setup
   - Add structure validation

3. **Environment Variables**
   - Add explicit variable management
   - Implement validation
   - Update test patterns

4. **Error Handling**
   - Add undefined path checks
   - Improve error messages
   - Implement error context

5. **Documentation**
   - Update test patterns
   - Document common issues
   - Add troubleshooting guide 