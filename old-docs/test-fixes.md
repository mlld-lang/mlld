# Test Suite Modernization Checklist

## Framework Migration Decisions

### 1. Test Framework Methods
- [ ] Replace all `jest.spyOn()` with `vi.spyOn()`
- [ ] Replace all `jest.mock()` with `vi.mock()`
- [ ] Replace `fail()` calls with `expect().toThrow()` or `throw new Error()`
- [ ] Update any other Jest-specific assertions to Vitest equivalents

### 2. DirectiveRegistry Changes
Decision: Implement `.clear()` method rather than removing calls
Rationale: 
- Maintaining test isolation is important
- Implementing clear() is cleaner than updating many tests
- [ ] Add `clear()` method to DirectiveRegistry
- [ ] Verify it properly resets registry state between tests

### 3. Error Handling Alignment
Decision: Update tests to match new error messages
Rationale:
- New error messages are clearer and more consistent
- Changing implementation to match old messages would be regression
- [ ] Update "Run directive requires a command parameter" → "Run directive requires a command"
- [ ] Update error type expectations (MeldInterpretError → MeldDirectiveError/MeldImportError)
- [ ] Document new error types and messages for future reference

### 4. Process Exit Handling
Decision: Refactor CLI to return exit codes instead of calling process.exit
Rationale:
- Makes CLI code more testable and reusable
- Cleaner separation of concerns
- Real process.exit only happens at the edge (bin/meld.ts)
Tasks:
- [ ] Refactor CLI functions to return exit codes (0 for success, non-zero for errors)
- [ ] Update bin/meld.ts to handle process exit at the edge
- [ ] Update CLI tests to verify returned exit codes
- [ ] Add types for possible exit codes
Example pattern:
```typescript
// CLI implementation
async function runCli(): Promise<number> {
  try {
    // ... CLI logic ...
    return 0;
  } catch (error) {
    console.error(error);
    return 1;
  }
}

// Only in bin/meld.ts
runCli().then(process.exit);

// In tests
const exitCode = await runCli();
expect(exitCode).toBe(1); // or 0 for success
```

### 5. File System Mocking
Decision: Use real temp directories with fs-extra and a rooted filesystem adapter
Rationale:
- More realistic testing of CLI behavior
- Pattern proven in llmail codebase
- Better isolation and cleanup
- Supports both relative and absolute paths properly
Tasks:
- [ ] Create RootedFileSystemAdapter (like llmail) for path isolation
- [ ] Set up TEST_ROOT in test/_tmp
- [ ] Add fs-extra for reliable cleanup
- [ ] Create test context with helper functions
Example pattern:
```typescript
import fs from 'fs-extra';
import path from 'path';

const TEST_ROOT = path.resolve(process.cwd(), 'test', '_tmp');

interface TestContext {
  rootedFs: RootedFileSystemAdapter;
  runCommand(...args: string[]): Promise<{ success: boolean; data?: any }>;
  cleanup(): Promise<void>;
}

describe('CLI Tests', () => {
  let ctx: TestContext;
  
  beforeEach(async () => {
    // Clean and create test directory
    await fs.emptyDir(TEST_ROOT);
    
    // Set up rooted filesystem
    ctx = await createTestContext(TEST_ROOT);
    
    // Initialize test environment
    await ctx.rootedFs.writeFile('meld.yaml', initialConfig);
  });
  
  afterEach(async () => {
    await fs.emptyDir(TEST_ROOT);
    await fs.remove(TEST_ROOT);
  });
  
  it('processes meld file', async () => {
    const result = await ctx.runCommand(
      'process',
      '--input', 'test.meld',
      '--output', 'out.md'
    );
    expect(result.success).toBe(true);
    
    const output = await ctx.rootedFs.readFile('out.md');
    expect(output).toContain('expected content');
  });
});
```

Key Features:
1. Uses fs-extra for reliable directory cleanup
2. RootedFileSystemAdapter for path isolation
3. Consistent TEST_ROOT location
4. Helper for running CLI commands
5. Proper cleanup in afterEach
6. Debug utilities for filesystem state

### 6. Directive Registration
Decision: Create standard directive registration helper
Tasks:
- [ ] Create test utility for registering all standard directives
- [ ] Add helper for registering subset of directives when needed
- [ ] Update tests to use new registration helpers
- [ ] Add proper cleanup between tests

### 7. Child Process Mocking
Decision: Create proper execAsync mock
Tasks:
- [ ] Create utility for mocking child_process correctly
- [ ] Ensure promisify(exec) returns proper function
- [ ] Add mock command execution helpers
- [ ] Document mock command patterns

## Implementation Order

1. Framework Migration
   - Start with basic Jest → Vitest syntax updates
   - These changes are mechanical and low-risk

2. Test Utilities
   - Create helpers for common operations
   - This will make subsequent changes easier

3. DirectiveRegistry
   - Implement clear() method
   - Update registration patterns

4. Mocking Infrastructure
   - File system mocks
   - Process mocks
   - Child process mocks

5. Error Handling
   - Update error expectations
   - Document new patterns

## Notes
- Keep track of any patterns that emerge during fixes
- Document new test utilities as they're created
- Consider adding test documentation to prevent future drift
- Run tests frequently during updates to catch any regressions

## Questions to Resolve
- Do we need any special handling for async directive tests?
- Should we add more extensive directive registration logging?
- Do we want to add test categories (unit/integration/e2e)? 