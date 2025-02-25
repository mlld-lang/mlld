/**
 * CLI Error Handling Tests
 * 
 * This file contains tests for CLI error handling in both strict and permissive modes.
 * It demonstrates both direct use of standalone utilities and the TestContext approach.
 */

import { describe, it, expect } from 'vitest';
import { TestContext } from '../utils/TestContext';
import { mockProcessExit } from '../utils/cli/mockProcessExit';
import { mockConsole } from '../utils/cli/mockConsole';
import { ErrorSeverity } from '../../src/core/errors/ErrorSeverity';
import { cli } from '../../src/cli/cli';

describe('CLI Error Handling', () => {
  
  // Example of using standalone utilities directly
  describe('Using standalone utilities', () => {
    it('should exit with code 1 on fatal error in strict mode', async () => {
      const { mockExit, restore: restoreExit } = mockProcessExit();
      const { mocks, restore: restoreConsole } = mockConsole();
      
      try {
        await cli.run(['--strict', '--eval', '@text greeting = "Hello #{undefined}"']);
        
        expect(mockExit).toHaveBeenCalledWith(1);
        expect(mocks.error).toHaveBeenCalledWith(
          expect.stringContaining('undefined variable')
        );
      } finally {
        restoreExit();
        restoreConsole();
      }
    });
  });
  
  // Example of using TestContext for more complex tests
  describe('Using TestContext', () => {
    let testContext: TestContext;
    
    beforeEach(() => {
      testContext = new TestContext();
    });
    
    afterEach(() => {
      testContext.cleanup();
    });
    
    it('should handle recoverable errors differently in strict and permissive modes', async () => {
      // Set up test environment
      testContext.useMemoryFileSystem();
      testContext.fs.writeFileSync('/test.meld', '@text greeting = "Hello #{undefined}"');
      testContext.fs.writeFileSync('/output.txt', '');
      
      // Test strict mode
      const strictExitMock = testContext.mockProcessExit();
      const strictConsoleMock = testContext.mockConsole();
      
      await cli.run(['--strict', 'test.meld']);
      
      expect(strictExitMock).toHaveBeenCalledWith(1);
      expect(strictConsoleMock.error).toHaveBeenCalledWith(
        expect.stringContaining('undefined variable')
      );
      
      // Clean up after strict mode test
      testContext.cleanup();
      
      // Set up new context for permissive mode test
      const permissiveContext = new TestContext();
      permissiveContext.useMemoryFileSystem();
      permissiveContext.fs.writeFileSync('/test.meld', '@text greeting = "Hello #{undefined}"');
      permissiveContext.fs.writeFileSync('/output.txt', '');
      
      const permissiveExitMock = permissiveContext.mockProcessExit();
      const permissiveConsoleMock = permissiveContext.mockConsole();
      
      await cli.run(['test.meld', '--output', 'output.txt']);
      
      expect(permissiveExitMock).not.toHaveBeenCalled();
      expect(permissiveConsoleMock.warn).toHaveBeenCalledWith(
        expect.stringContaining('undefined variable')
      );
      expect(permissiveContext.fs.readFileSync('/output.txt', 'utf8')).toBeDefined();
      
      permissiveContext.cleanup();
    });
    
    it('should handle multiple errors appropriately', async () => {
      // Set up test with multiple errors
      const { exitMock, consoleMock } = testContext.setupCliTest({
        files: {
          '/test.meld': '@text greeting = "Hello #{undefined}"\n@text farewell = "Goodbye #{nonexistent}"'
        }
      });
      
      // Test permissive mode (should continue despite errors)
      await cli.run(['test.meld', '--output', 'result.txt']);
      
      expect(exitMock).not.toHaveBeenCalled();
      expect(consoleMock.warn).toHaveBeenCalledTimes(2);
      
      // Test strict mode (should exit on first error)
      testContext.cleanup();
      
      const strictContext = new TestContext();
      const { exitMock: strictExitMock, consoleMock: strictConsoleMock } = strictContext.setupCliTest({
        files: {
          '/test.meld': '@text greeting = "Hello #{undefined}"\n@text farewell = "Goodbye #{nonexistent}"'
        }
      });
      
      await cli.run(['--strict', 'test.meld']);
      
      expect(strictExitMock).toHaveBeenCalledWith(1);
      expect(strictConsoleMock.error).toHaveBeenCalledTimes(1); // Should exit on first error
      
      strictContext.cleanup();
    });
  });
}); 