/**
 * Utility for mocking console methods in CLI tests
 * 
 * This utility allows capturing and verifying console output in tests
 * without actually writing to the console. It replaces console methods
 * with Vitest mock functions.
 */

import { vi } from 'vitest';

/**
 * Console methods that will be mocked
 */
export interface ConsoleMocks {
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
}

/**
 * Result of mockConsole call
 */
export interface MockConsoleResult {
  /** Mock functions for console methods */
  mocks: ConsoleMocks;
  /** Function to restore original console methods */
  restore: () => void;
}

/**
 * Mock console methods for testing
 * @returns Object containing mock functions and a restore function
 */
export function mockConsole(): MockConsoleResult {
  // Save original console methods
  const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
    debug: console.debug
  };
  
  // Create mock functions
  const mocks: ConsoleMocks = {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  };
  
  // Replace console methods with mocks
  console.log = mocks.log;
  console.error = mocks.error;
  console.warn = mocks.warn;
  console.info = mocks.info;
  console.debug = mocks.debug;
  
  return {
    mocks,
    restore: () => {
      // Restore original console methods
      console.log = originalConsole.log;
      console.error = originalConsole.error;
      console.warn = originalConsole.warn;
      console.info = originalConsole.info;
      console.debug = originalConsole.debug;
    }
  };
}

/**
 * Example usage:
 * 
 * ```typescript
 * import { mockConsole } from '@tests/utils/cli/mockConsole.js';
 * import { mockProcessExit } from '@tests/utils/cli/mockProcessExit.js';
 * 
 * it('should display error message for missing file', async () => {
 *   const { mocks, restore } = mockConsole();
 *   const { mockExit, restore: restoreExit } = mockProcessExit();
 *   
 *   try {
 *     await cli.run(['non-existent-file.meld']);
 *     expect(mocks.error).toHaveBeenCalledWith(
 *       expect.stringContaining('File not found')
 *     );
 *   } finally {
 *     restore(); // Always restore original console methods
 *     restoreExit();
 *   }
 * });
 * ```
 */ 