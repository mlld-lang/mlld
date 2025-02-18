import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { main } from '../../cli/index.js';
import { TestContext } from '@tests/utils/index.js';
import { MemfsTestFileSystemAdapter } from '@tests/utils/MemfsTestFileSystemAdapter.js';
import { PathService } from '@services/PathService/PathService.js';

describe('CLI Integration Tests', () => {
  let context: TestContext;
  let originalArgv: string[];
  let fsAdapter: MemfsTestFileSystemAdapter;
  let pathService: PathService;

  beforeEach(async () => {
    context = new TestContext();
    await context.initialize();
    originalArgv = process.argv;
    fsAdapter = new MemfsTestFileSystemAdapter(context.fs);
    
    // Set up PathService for testing
    pathService = new PathService();
    pathService.enableTestMode();
    pathService.setProjectPath('/project');
    pathService.initialize(fsAdapter);
    
    // Create test files in the mock filesystem
    await context.fs.writeFile('/project/test.meld', '@text greeting = "Hello"');
  });

  afterEach(async () => {
    await context.cleanup();
    process.argv = originalArgv;
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('Basic Functionality', () => {
    it('should process a simple meld file', async () => {
      process.argv = ['node', 'meld', 'test.meld', '--stdout'];
      await expect(main(fsAdapter)).resolves.not.toThrow();
    });

    it('should handle format aliases correctly', async () => {
      process.argv = ['node', 'meld', 'test.meld', '--format', 'md', '--stdout'];
      await expect(main(fsAdapter)).resolves.not.toThrow();
    });

    it('should preserve markdown with md format', async () => {
      await context.fs.writeFile('/project/test.meld', '# Heading\n@text greeting = "Hello"');
      process.argv = ['node', 'meld', 'test.meld', '--format', 'md', '--stdout'];
      await expect(main(fsAdapter)).resolves.not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing input files', async () => {
      process.argv = ['node', 'meld', 'nonexistent.meld', '--stdout'];
      await expect(main(fsAdapter)).rejects.toThrow('File not found');
    });

    it('should handle invalid file extensions', async () => {
      await context.fs.writeFile('/project/test.invalid', '@text greeting = "Hello"');
      process.argv = ['node', 'meld', 'test.invalid', '--stdout'];
      await expect(main(fsAdapter)).rejects.toThrow('Invalid file extension');
    });
  });
}); 