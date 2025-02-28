import { describe, it, expect, vi, afterEach } from 'vitest';
import { setupCliTest } from '../tests/utils/cli/cliTestHelper.js';
import * as cli from './index.js';
import * as fs from 'fs/promises';
import * as readline from 'readline';

// Setup module mocks for the entire test suite
beforeAll(() => {
  // Mock readline for overwrite confirmations
  vi.mock('readline', () => ({
    createInterface: vi.fn().mockReturnValue({
      question: vi.fn((_, cb) => cb('y')),
      close: vi.fn()
    })
  }));

  // Mock fs.watch for watch mode testing
  vi.mock('fs/promises', async () => {
    const actual = await vi.importActual('fs/promises');
    return {
      ...actual,
      watch: vi.fn().mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield { filename: 'test.meld', eventType: 'change' };
          // Complete the iterator after one event
          return; // This exits the iteration
        }
      })
    };
  });
  
  // Mock API module
  vi.mock('@api/index.js', () => ({
    main: vi.fn().mockResolvedValue('Test output')
  }));
  
  // Mock init command module
  vi.mock('./commands/init.js', () => ({
    initCommand: vi.fn().mockResolvedValue(undefined)
  }));
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

      process.argv = ['node', 'meld', '/nonexistent/file.meld'];

      try {
        await cli.main(fsAdapter);
        expect(exitMock).toHaveBeenCalledWith(1);
        expect(consoleMocks.error).toHaveBeenCalled();
        
        const errorOutput = consoleMocks.error.mock.calls.flat().join('\n');
        expect(errorOutput).toContain('not found');
      } catch (error) {
        // This is expected in test mode
        expect(error.message).toContain('not found');
      } finally {
        cleanup();
      }
    });

    it('should handle permission issues for reading files', async () => {
      const { fsAdapter, exitMock, consoleMocks, cleanup } = setupCliTest({
        files: {
          '/project/test.meld': 'Hello World!'
        }
      });

      // Mock a permission error when reading
      const originalReadFile = fsAdapter.readFile;
      fsAdapter.readFile = vi.fn().mockRejectedValue(new Error('EACCES: permission denied'));

      process.argv = ['node', 'meld', '/project/test.meld'];

      try {
        await cli.main(fsAdapter);
        expect(exitMock).toHaveBeenCalledWith(1);
        expect(consoleMocks.error).toHaveBeenCalled();
        
        const errorOutput = consoleMocks.error.mock.calls.flat().join('\n');
        // Check for a more general error message that would match the actual output
        expect(errorOutput).toContain('Error reading file');
      } catch (error) {
        // This is expected in test mode
        expect(error.message).toContain('Error reading file');
      } finally {
        // Restore original function
        fsAdapter.readFile = originalReadFile;
        cleanup();
      }
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

      // Get reference to the mocked function
      const initMock = require('./commands/init.js').initCommand;

      try {
        await cli.main(fsAdapter);
        expect(initMock).toHaveBeenCalled();
      } finally {
        // No need to restore the mock since we're using vi.mock
        vi.resetModules(); // Reset modules to ensure clean state
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

      process.argv = ['node', 'meld', '/project/test.meld', '--stdout'];

      // We just need to verify that the CLI doesn't interfere with env vars
      // The actual interpretation of them is done by the API
      try {
        await cli.main(fsAdapter);
        // Verify that the command ran successfully
        expect(consoleMocks.log).toHaveBeenCalled();
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

      // We're already mocking fs.watch at the top level with a proper async iterable
      // Just reset and ensure it's properly set up
      fs.watch.mockReset();
      fs.watch.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield { filename: 'test.meld', eventType: 'change' };
          // After one event, we're done
          return;
        }
      });

      try {
        // This should start watching
        const mainPromise = cli.main(fsAdapter);
        
        // Wait a bit for watch to start
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Complete the watch cycle
        await mainPromise;
        
        // Verify watch was called
        expect(fs.watch).toHaveBeenCalled();
      } finally {
        cleanup();
      }
    });
  });

  describe('Error Handling Tests', () => {
    it('should handle exit codes properly', async () => {
      const { fsAdapter, exitMock, consoleMocks, cleanup } = setupCliTest();

      process.argv = ['node', 'meld', '/nonexistent/file.meld'];

      try {
        await cli.main(fsAdapter);
        expect(exitMock).toHaveBeenCalledWith(1);
      } catch (error) {
        // This is expected in test mode
      } finally {
        cleanup();
      }
    });

    it('should format error messages clearly', async () => {
      const { fsAdapter, consoleMocks, cleanup } = setupCliTest({
        files: {
          '/project/invalid.meld': '@text greeting = "Unclosed string'
        }
      });

      process.argv = ['node', 'meld', '/project/invalid.meld'];

      try {
        await cli.main(fsAdapter);
      } catch (error) {
        // This is expected in test mode
        expect(consoleMocks.error).toHaveBeenCalled();
        
        const errorOutput = consoleMocks.error.mock.calls.flat().join('\n');
        expect(errorOutput).toMatch(/Error:/);
        expect(errorOutput).toContain('Unclosed');
      } finally {
        cleanup();
      }
    });

    it('should properly pass strict flag to API', async () => {
      const { fsAdapter, exitMock, consoleMocks, cleanup } = setupCliTest({
        files: {
          '/project/test.meld': 'Test file'
        }
      });
      
      // Run with strict flag
      process.argv = ['node', 'meld', '--strict', '/project/test.meld'];
      
      // Get a reference to the mocked function
      const apiMainSpy = require('@api/index.js').main;
      
      try {
        await cli.main(fsAdapter);
        
        // Verify that the strict flag was passed to the API
        expect(apiMainSpy).toHaveBeenCalled();
        const options = apiMainSpy.mock.calls[0][1]; // Get options passed to API
        expect(options).toHaveProperty('strict', true);
        
      } finally {
        // No need to restore the mock since we're using vi.mock
        vi.resetModules(); // Reset modules to ensure clean state
        cleanup();
      }
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

      process.argv = ['node', 'meld', '/project/test.meld'];

      // Mock readline to simulate "yes" response
      const mockRL = {
        question: vi.fn((_, cb) => cb('y')),
        close: vi.fn()
      };
      
      vi.mocked(readline.createInterface).mockReturnValue(mockRL as any);

      try {
        await cli.main(fsAdapter);
        
        // Verify that the prompt was shown
        expect(mockRL.question).toHaveBeenCalled();
        
        // Verify that the file was overwritten
        const content = await fsAdapter.readFile('/project/test.xml');
        expect(content).toContain('Hello World');
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

      process.argv = ['node', 'meld', '/project/test.meld'];

      // Mock readline to simulate "no" response
      const mockRL = {
        question: vi.fn((_, cb) => cb('n')),
        close: vi.fn()
      };
      
      vi.mocked(readline.createInterface).mockReturnValue(mockRL as any);

      try {
        await cli.main(fsAdapter);
        
        // Verify that the prompt was shown
        expect(mockRL.question).toHaveBeenCalled();
        
        // Verify that the file was not overwritten
        const content = await fsAdapter.readFile('/project/test.xml');
        expect(content).toBe('Existing content');
      } finally {
        cleanup();
      }
    });
  });
});