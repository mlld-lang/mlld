# AST Explorer Testing

This directory contains tests for the AST Explorer functionality.

## Using memfs for Testing

The tests in this directory use `memfs` to create an in-memory filesystem for testing. This avoids the need to create and delete real files during tests.

### Key Components

1. **MemfsAdapter**: A class that implements the IFileSystemAdapter interface using memfs.
2. **TracedAdapter**: A wrapper around another adapter that logs all file operations.
3. **FsManager**: A singleton manager for fs monkey patching to prevent conflicts between tests.
4. **PathResolver**: A utility for consistent path resolution between real fs and memfs.

### How it Works

1. Tests use the `setupTestFileSystem()` helper from FsManager to get a TracedAdapter.
2. The FsManager ensures only one fs patch is active at a time and handles cleanup.
3. The MemfsAdapter uses PathResolver for consistent path handling.
4. The Explorer class is instantiated with the adapter.
5. All file operations, whether through the adapter or direct fs calls, are captured.

### Running the Tests

To run all tests:

```sh
npm test core/ast/explorer
```

To run a specific test file:

```sh
npm test core/ast/explorer/tests/explorer.test.ts
```

### Key Improvements

1. **Centralized FS Patching**: The FsManager singleton ensures only one patch is active at a time, preventing conflicts between test files.
2. **Consistent Path Resolution**: The PathResolver provides standardized path conversion between real fs and memfs.
3. **Tracing and Debugging**: All filesystem operations are logged for easy debugging.
4. **Cleanup**: Proper restoration of fs module after tests complete.

### Adding New Tests

1. Import the setupTestFileSystem helper from FsManager.
2. Use the helper to get an adapter and cleanup function.
3. Create the Explorer instance with the adapter.
4. Call the cleanup function in afterEach.

Example:

```typescript
import { describe, it, beforeEach, afterEach } from 'vitest';
import { Explorer } from '../src/explorer';
import { setupTestFileSystem } from './utils/FsManager';
import { TracedAdapter } from './TracedAdapter';

describe('AST Explorer Test', () => {
  let fsAdapter: TracedAdapter;
  let explorer: Explorer;
  let cleanup: () => Promise<void>;

  beforeEach(() => {
    // Use centralized FsManager to handle fs patching
    const setup = setupTestFileSystem();
    fsAdapter = setup.fsAdapter;
    cleanup = setup.cleanup;

    // Create test directories
    fsAdapter.mkdirSync('project/test-output', { recursive: true });

    // Create Explorer instance
    explorer = new Explorer({
      fileSystem: fsAdapter
    });
  });

  afterEach(async () => {
    // Clean up and restore fs
    await cleanup();
  });

  it('should create files', () => {
    // Test logic here...
    // Verify files using fsAdapter.existsSync() etc.
  });
});
```

### Troubleshooting

- If tests fail with filesystem errors, check the TracedAdapter logs for operation details.
- For path resolution issues, confirm that paths are being properly converted by the PathResolver.
- If testing batch operations, ensure you create any necessary files before running the operation.