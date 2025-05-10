# AST Explorer Testing

This directory contains tests for the AST Explorer functionality.

## Using memfs for Testing

The tests in this directory use `memfs` to create an in-memory filesystem for testing. This avoids the need to create and delete real files during tests.

### Key Components

1. **MemfsAdapter**: A class that implements the IFileSystemAdapter interface using memfs.
2. **TracedAdapter**: A wrapper around another adapter that logs all file operations.
3. **fs Monkey Patching**: The tests monkey-patch the Node.js `fs` module to intercept all file operations.

### How it Works

1. The tests create a MemfsAdapter instance backed by memfs.
2. The MemfsAdapter is wrapped in a TracedAdapter to log operations.
3. The TracedAdapter monkey-patches the Node.js `fs` module to intercept any direct fs operations.
4. The Explorer class is instantiated with the adapter.
5. All file operations, whether through the adapter or direct fs calls, are captured by the traced adapter.

### Running the Tests

To run the tests, use:

```sh
npm test core/ast/explorer/tests/explorer.test.ts
```

### Troubleshooting

- If you see "Cannot redefine property" errors, this is likely because multiple test files are trying to monkey-patch the fs module. Run the tests individually or fix the test setup to prevent multiple patches.
- To debug file operations, check the TracedAdapter call logs in the test output.

### Adding New Tests

1. Import TracedAdapter and MemfsAdapter.
2. Create a memfs adapter and a traced adapter.
3. Call `fsAdapter.patchFs()` to monkey patch fs.
4. Create the Explorer instance with the adapter.
5. Use the adapter to verify file operations.

Example:

```typescript
import { TracedAdapter } from './TracedAdapter';
import { MemfsAdapter } from './MemfsAdapter';
import { Explorer } from '../src/explorer';

describe('AST Explorer Test', () => {
  let memfsAdapter: MemfsAdapter;
  let fsAdapter: TracedAdapter;
  let explorer: Explorer;
  
  beforeEach(() => {
    memfsAdapter = new MemfsAdapter();
    fsAdapter = new TracedAdapter(memfsAdapter);
    fsAdapter.patchFs(); // Monkey patch fs
    
    explorer = new Explorer({
      fileSystem: fsAdapter
    });
  });
  
  it('should create files', () => {
    // Test logic here...
    // Verify files using fsAdapter.existsSync() etc.
  });
});
```