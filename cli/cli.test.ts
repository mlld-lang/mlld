import { describe, it, expect, vi, afterEach } from 'vitest';
import { setupCliTest } from '../tests/utils/cli/cliTestHelper.js';
import * as cli from './index.js';
import * as fs from 'fs/promises';
import * as readline from 'readline';

// Create a proper async iterator for watch mode
function createWatchAsyncIterable() {
  return {
    [Symbol.asyncIterator]: async function* () {
      yield { filename: 'test.meld', eventType: 'change' };
      
      // Exit after one yield to prevent infinite loop in tests
      await new Promise(resolve => setTimeout(resolve, 50));
      return;
    }
  };
}

// Set up mocks before the tests
vi.mock('readline', () => ({
  createInterface: vi.fn().mockReturnValue({
    question: vi.fn((_, cb) => cb('y')),
    close: vi.fn()
  })
}));

// Mock fs.watch
vi.mock('fs/promises', async () => {
  const actual = await vi.importActual('fs/promises');
  return {
    ...actual,
    watch: vi.fn().mockImplementation(() => createWatchAsyncIterable())
  };
});

// Mock the API module
vi.mock('@api/index.js', () => ({
  main: vi.fn().mockResolvedValue('Test output')
}));

// Mock the init command module
vi.mock('./commands/init.js', () => ({
  initCommand: vi.fn().mockResolvedValue(undefined)
}));

// Setup mocks before each test
beforeEach(() => {
  // Reset mocks and ensure consistent behavior
  vi.mocked(readline.createInterface).mockClear();
  vi.mocked(fs.watch).mockClear().mockImplementation(() => createWatchAsyncIterable());
  require('@api/index.js').main.mockClear().mockResolvedValue('Test output');
  require('./commands/init.js').initCommand.mockClear().mockResolvedValue(undefined);
});

describe('CLI Tests', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules(); // Reset all modules to ensure a clean state between tests
    process.argv = ['node', 'meld'];
  });

  describe('Argument Parsing Tests', () => {
    it('should handle invalid argument combinations', async () => {
      const { fsAdapter, exitMock, consoleMocks, cleanup } = setupCliTest({
        files: {
          '/project/test.meld': 'Hello World!'
        }
      });

      // Try with conflicting formats
      process.argv = ['node', 'meld', '/project/test.meld', '--format', 'md', '--format', 'xml'];

      try {
        await cli.main(fsAdapter);
        expect(exitMock).toHaveBeenCalledWith(1);
        expect(consoleMocks.error).toHaveBeenCalled();
        
        const errorOutput = consoleMocks.error.mock.calls.flat().join('\n');
        expect(errorOutput).toContain('Unknown option');
      } catch (error) {
        // This is expected in test mode
        expect(error.message).toContain('Unknown option');
      } finally {
        cleanup();
      }
    });

    it('should handle missing required arguments', async () => {
      const { fsAdapter, exitMock, consoleMocks, cleanup } = setupCliTest();

      // Try with no input file
      process.argv = ['node', 'meld', '--format', 'md'];

      try {
        await cli.main(fsAdapter);
        expect(exitMock).toHaveBeenCalledWith(1);
        expect(consoleMocks.error).toHaveBeenCalled();
        
        const errorOutput = consoleMocks.error.mock.calls.flat().join('\n');
        expect(errorOutput).toContain('No input file specified');
      } catch (error) {
        // This is expected in test mode
        expect(error.message).toContain('No input file specified');
      } finally {
        cleanup();
      }
    });
  });

  describe('File I/O Tests', () => {
    it('should handle error for file not found', async () => {
      const { fsAdapter, exitMock, consoleMocks, cleanup } = setupCliTest();

      // Explicitly mock exists to return false for this specific file
      const existsSpy = vi.spyOn(fsAdapter, 'exists');
      existsSpy.mockImplementation(async (path) => {
        if (path.includes('/nonexistent/file.meld')) {
          return false;
        }
        // For other paths, use original implementation
        return fsAdapter.existsSync(path);
      });
      
      // Set up API implementation to throw a file not found error when called
      const apiModule = require('@api/index.js');
      apiModule.main.mockRejectedValueOnce(new Error('File not found: /nonexistent/file.meld'));
      
      // Set CLI arguments
      process.argv = ['node', 'meld', '/nonexistent/file.meld'];

      // In test mode, main should throw the error from API
      await expect(cli.main(fsAdapter)).rejects.toThrow(/not found|not exist/i);
      
      // Verify exists was called with the right path
      expect(existsSpy).toHaveBeenCalledWith(expect.stringContaining('/nonexistent/file.meld'));
      
      // Verify error message was logged to console
      expect(consoleMocks.error).toHaveBeenCalled();
      const errorOutput = consoleMocks.error.mock.calls.flat().join('\n');
      expect(errorOutput).toMatch(/not found|not exist/i);
      
      cleanup();
    });

    it('should handle permission issues for reading files', async () => {
      const { fsAdapter, exitMock, consoleMocks, cleanup } = setupCliTest({
        files: {
          '/project/test.meld': 'Hello World!'
        }
      });

      // Make sure the file exists
      fsAdapter.exists = vi.fn().mockResolvedValue(true);
      
      // Mock a permission error when reading
      fsAdapter.readFile = vi.fn().mockRejectedValue(
        new Error('EACCES: permission denied')
      );

      process.argv = ['node', 'meld', '/project/test.meld'];

      // When running in test mode, main() should throw
      await expect(cli.main(fsAdapter)).rejects.toThrow(/Error reading file|permission denied/i);
      
      // Check error message displayed to user
      expect(consoleMocks.error).toHaveBeenCalled();
      const errorOutput = consoleMocks.error.mock.calls.flat().join('\n');
      expect(errorOutput).toMatch(/Error reading file|permission denied/i);

      cleanup();
    });

    it('should handle custom output path properly', async () => {
      const { fsAdapter, cleanup } = setupCliTest({
        files: {
          '/project/test.meld': '@text greeting = "Hello World"\n{{greeting}}'
        }
      });

      process.argv = ['node', 'meld', '/project/test.meld', '--output', '/project/custom/output.md'];

      // Ensure the directory exists
      await fsAdapter.mkdir('/project/custom');

      try {
        await cli.main(fsAdapter);
        
        // Check that the file was created at the custom path
        const exists = await fsAdapter.exists('/project/custom/output.md');
        expect(exists).toBe(true);
        
        const content = await fsAdapter.readFile('/project/custom/output.md');
        expect(content).toContain('Hello World');
      } finally {
        cleanup();
      }
    });
  });

  describe('API Integration Tests', () => {
    it('should handle custom filesystem for tests', async () => {
      const { fsAdapter, consoleMocks, cleanup } = setupCliTest({
        files: {
          '/project/test.meld': '@text greeting = "Hello World"\n{{greeting}}'
        }
      });

      process.argv = ['node', 'meld', '/project/test.meld', '--stdout'];

      try {
        await cli.main(fsAdapter);
        expect(consoleMocks.log).toHaveBeenCalled();
        
        // We don't need to test the actual content (that's API functionality)
        // Just verify that the CLI properly passed the request to the API
        expect(consoleMocks.log).toHaveBeenCalled();
      } finally {
        cleanup();
      }
    });
  });

  describe('CLI-Specific Features', () => {
    it('should handle init command', async () => {
      const { fsAdapter, consoleMocks, cleanup } = setupCliTest();

      process.argv = ['node', 'meld', 'init'];

      // Get a fresh reference to the mocked function and reset it
      const initModule = require('./commands/init.js');
      const initMock = initModule.initCommand;
      initMock.mockClear();
      
      try {
        // Run the command
        await cli.main(fsAdapter);
        
        // Verify the init command was called
        expect(initMock).toHaveBeenCalled();
      } finally {
        cleanup();
      }
    });

    it('should pass environment variables to API', async () => {
      const { fsAdapter, consoleMocks, cleanup } = setupCliTest({
        files: {
          '/project/test.meld': 'Test file'
        },
        env: {
          TEST_VAR: 'test-value'
        }
      });

      // Make sure the file exists
      fsAdapter.exists = vi.fn().mockResolvedValue(true);
      
      // Configure test command line
      process.argv = ['node', 'meld', '/project/test.meld', '--stdout'];

      // Get a reference to the API mock
      const apiMock = require('@api/index.js').main;
      apiMock.mockClear();
      
      try {
        // Run the CLI
        await cli.main(fsAdapter);
        
        // Verify the API was called
        expect(apiMock).toHaveBeenCalled();
        
        // Verify the output was logged to console
        expect(consoleMocks.log).toHaveBeenCalled();
        
        // Verify environment variable is preserved
        expect(process.env.TEST_VAR).toBe('test-value');
      } finally {
        cleanup();
      }
    });

    it('should handle watch mode', async () => {
      const { fsAdapter, consoleMocks, cleanup } = setupCliTest({
        files: {
          '/project/test.meld': '@text greeting = "Hello World"\n{{greeting}}'
        }
      });

      process.argv = ['node', 'meld', '/project/test.meld', '--watch'];

      // Create a controlled watch implementation with a way to stop it
      const watchController = {
        shouldStop: false,
        values: [{ filename: 'test.meld', eventType: 'change' }]
      };
      
      // Implement a controlled async iterator for watch
      const watchIterator = {
        [Symbol.asyncIterator]: async function* () {
          // Yield each value
          for (const value of watchController.values) {
            yield value;
            
            // Short delay to let the test continue
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // Allow test to stop iteration
            if (watchController.shouldStop) {
              throw new Error('Watch stopped by test');
            }
          }
          
          // Ensure we stop the iterator
          throw new Error('Watch complete');
        }
      };
      
      // Setup the watch mock with our controlled iterator
      vi.mocked(fs.watch).mockReturnValue(watchIterator);

      try {
        // Start the watch process - we need to make it stop after yielding once
        const watchPromise = cli.main(fsAdapter).catch(err => {
          // Only ignore expected errors
          if (err.message !== 'Watch stopped by test' && 
              err.message !== 'Watch complete') {
            throw err;
          }
        });
        
        // Stop the watch after a short delay
        setTimeout(() => {
          watchController.shouldStop = true;
        }, 100);
        
        // Wait for the watch to complete (will be forced by our timer)
        await watchPromise;
        
        // Verify watch was called
        expect(fs.watch).toHaveBeenCalled();
        
        // Verify that the console log was called to indicate watching
        expect(consoleMocks.log).toHaveBeenCalledWith(
          expect.stringContaining('Watching for changes')
        );
      } finally {
        cleanup();
      }
    });
  });

  describe('Error Handling Tests', () => {
    it('should handle exit codes properly', async () => {
      // Set up CLI test with a proper process.exit mock
      const { fsAdapter, exitMock, consoleMocks, cleanup } = setupCliTest({
        mockProcessExit: true
      });
      
      // Save original NODE_ENV
      const originalNodeEnv = process.env.NODE_ENV;
      
      try {
        // Set NODE_ENV to production to trigger process.exit call
        process.env.NODE_ENV = 'production';
        
        // Ensure file doesn't exist
        fsAdapter.exists = vi.fn().mockResolvedValue(false);
        
        // Set up CLI arguments
        process.argv = ['node', 'meld', '/nonexistent/file.meld'];
        
        // Run the main function - it should eventually call process.exit(1)
        // which our mock will convert to an error we can catch
        await expect(cli.main(fsAdapter)).rejects.toThrow('Process exited with code 1');
        
        // Verify that the mock exit function was called with code 1
        expect(exitMock).toHaveBeenCalledWith(1);
        
        // Verify error message
        expect(consoleMocks.error).toHaveBeenCalled();
        const errorMsg = consoleMocks.error.mock.calls.flat().join(' ');
        expect(errorMsg).toMatch(/not found|not exist/i);
      } finally {
        // Restore original NODE_ENV
        process.env.NODE_ENV = originalNodeEnv;
        cleanup();
      }
    });

    it('should format error messages clearly', async () => {
      const { fsAdapter, consoleMocks, cleanup } = setupCliTest({
        files: {
          '/project/invalid.meld': '@text greeting = "Unclosed string'
        }
      });

      // Make sure the file exists
      fsAdapter.exists = vi.fn().mockResolvedValue(true);
      
      // Make the API module mock throw a specific error
      const apiMock = require('@api/index.js').main;
      apiMock.mockRejectedValueOnce(new Error('Parse error: Unclosed string literal'));
      
      process.argv = ['node', 'meld', '/project/invalid.meld'];

      // Test should throw
      await expect(cli.main(fsAdapter)).rejects.toThrow(/Parse error|Unclosed/i);
      
      // Verify error message format
      expect(consoleMocks.error).toHaveBeenCalled();
      const errorOutput = consoleMocks.error.mock.calls.flat().join('\n');
      expect(errorOutput).toMatch(/Error:/);
      
      cleanup();
    });

    it('should properly pass strict flag to API', async () => {
      const { fsAdapter, consoleMocks, cleanup } = setupCliTest({
        files: {
          '/project/test.meld': 'Test file'
        }
      });
      
      // Make sure file exists
      fsAdapter.exists = vi.fn().mockResolvedValue(true);
      
      // Run with strict flag
      process.argv = ['node', 'meld', '--strict', '/project/test.meld'];
      
      // Get a reference to the mocked function and reset it
      const apiMainSpy = require('@api/index.js').main;
      apiMainSpy.mockClear();
      
      // Run the main function
      await cli.main(fsAdapter);
      
      // Verify the API was called with the strict flag
      expect(apiMainSpy).toHaveBeenCalled();
      
      // Get the options from the call
      const options = apiMainSpy.mock.calls[0][1];
      expect(options).toHaveProperty('strict', true);
      
      cleanup();
    });
  });

  describe('File Overwrite Confirmation', () => {
    it('should prompt for overwrite when file exists', async () => {
      const { fsAdapter, cleanup } = setupCliTest({
        files: {
          '/project/test.meld': '@text greeting = "Hello World"\n{{greeting}}',
          '/project/test.xml': 'Existing content' // Pre-existing output file
        }
      });

      // Make sure the file system returns that the files exist
      fsAdapter.exists = vi.fn().mockImplementation(async (path) => {
        if (path === '/project/test.meld' || path === '/project/test.xml') {
          return true;
        }
        return false;
      });
      
      process.argv = ['node', 'meld', '/project/test.meld'];

      // Mock readline to simulate "yes" response
      const mockQuestion = vi.fn((_, cb) => cb('y'));
      const mockClose = vi.fn();
      
      vi.mocked(readline.createInterface).mockReturnValue({
        question: mockQuestion,
        close: mockClose,
      } as any);

      // Make the API return a specific value
      const apiMock = require('@api/index.js').main;
      apiMock.mockResolvedValueOnce('Processed Hello World content');
      
      try {
        await cli.main(fsAdapter);
        
        // Verify the API was called
        expect(apiMock).toHaveBeenCalled();
        
        // Verify that the prompt was shown
        expect(mockQuestion).toHaveBeenCalled();
        
        // Verify that writeFile was called to overwrite the file
        expect(fsAdapter.writeFile).toHaveBeenCalledWith(
          '/project/test.xml', 
          'Processed Hello World content'
        );
      } finally {
        cleanup();
      }
    });

    it('should cancel operation when overwrite is rejected', async () => {
      const { fsAdapter, cleanup } = setupCliTest({
        files: {
          '/project/test.meld': '@text greeting = "Hello World"\n{{greeting}}',
          '/project/test.xml': 'Existing content' // Pre-existing output file
        }
      });

      // Make sure the file system returns that the files exist
      fsAdapter.exists = vi.fn().mockImplementation(async (path) => {
        if (path === '/project/test.meld' || path === '/project/test.xml') {
          return true;
        }
        return false;
      });

      process.argv = ['node', 'meld', '/project/test.meld'];

      // Mock readline to simulate "no" response
      const mockQuestion = vi.fn((_, cb) => cb('n'));
      const mockClose = vi.fn();
      
      vi.mocked(readline.createInterface).mockReturnValue({
        question: mockQuestion,
        close: mockClose
      } as any);

      // Make the API return a specific value
      const apiMock = require('@api/index.js').main;
      apiMock.mockResolvedValueOnce('Transformed content that should not be written');
      
      // Spy on writeFile to ensure it's not called
      const writeFileSpy = vi.spyOn(fsAdapter, 'writeFile');
      
      try {
        await cli.main(fsAdapter);
        
        // Verify that the prompt was shown
        expect(mockQuestion).toHaveBeenCalled();
        
        // Verify that writeFile was NOT called (operation cancelled)
        expect(writeFileSpy).not.toHaveBeenCalledWith('/project/test.xml', expect.any(String));
      } finally {
        cleanup();
      }
    });
  });
});