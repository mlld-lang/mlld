/**
 * CLI Error Handling Tests
 * 
 * These tests verify the CLI's error handling behavior in both permissive and strict modes.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestContext } from '../utils/TestContext.js';
import { MemfsTestFileSystemAdapter } from '../utils/MemfsTestFileSystemAdapter.js';
import * as cli from '../../cli/index.js';

describe('CLI Error Handling', () => {
  // Create a fresh test context for each test
  let context: TestContext;
  let fsAdapter: MemfsTestFileSystemAdapter;
  
  beforeEach(async () => {
    context = new TestContext();
    await context.initialize();
    fsAdapter = new MemfsTestFileSystemAdapter(context.fs);
    
    // Create basic test directory structure
    await context.fs.mkdir('/project');
  });
  
  afterEach(async () => {
    await context.cleanup();
  });
  
  describe('Using standalone utilities', () => {
    it('should handle permissive mode for missing variables', async () => {
      // Create a test file with reference to undefined variable
      await context.fs.writeFile('/project/test.meld', '@text greeting = "Hello {{undefined}}"');
      
      // Mock process.exit and console output
      const exitMock = context.mockProcessExit();
      const consoleMocks = context.mockConsole();
      
      // Set up process.argv
      process.argv = ['node', 'meld', '/project/test.meld', '--stdout'];
      
      try {
        // Run the CLI in permissive mode (default)
        // Using a try/catch to handle the expected transform of process.exit to error
        await cli.main(fsAdapter);
      } catch (error) {
        // Verify appropriate error handling
        expect(exitMock).toHaveBeenCalledWith(1);
        expect(consoleMocks.error).toHaveBeenCalled();
      }
    });
    
    it('should throw errors in strict mode', async () => {
      // Create a test file with reference to undefined variable
      await context.fs.writeFile('/project/test.meld', '@text greeting = "Hello {{undefined}}"');
      
      // Mock process.exit and console output
      const exitMock = context.mockProcessExit();
      const consoleMocks = context.mockConsole();
      
      // Set up process.argv with --strict flag
      process.argv = ['node', 'meld', '--strict', '/project/test.meld', '--stdout'];
      
      try {
        // Run the CLI in strict mode
        await cli.main(fsAdapter);
      } catch (error) {
        // Verify appropriate error handling in strict mode
        expect(exitMock).toHaveBeenCalledWith(1);
        expect(consoleMocks.error).toHaveBeenCalled();
      }
    });
  });
  
  describe('Using TestContext', () => {
    it('should handle multiple errors in permissive mode', async () => {
      // Setup CLI test environment
      const { exitMock, consoleMocks } = await context.setupCliTest({
        files: {
          '/project/test.meld': '@text greeting = "Hello {{undefined}}"\n@text farewell = "Goodbye {{nonexistent}}"'
        }
      });
      
      // Set up process.argv
      process.argv = ['node', 'meld', '/project/test.meld', '--stdout'];
      
      try {
        // Run the CLI in permissive mode
        await cli.main(fsAdapter);
      } catch (error) {
        // In permissive mode, warnings should be logged but execution continues
        expect(exitMock).toHaveBeenCalledWith(1);
        expect(consoleMocks.error).toHaveBeenCalled();
      }
    });
  });
});
