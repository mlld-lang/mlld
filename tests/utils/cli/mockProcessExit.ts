/**
 * Utility for mocking process.exit in CLI tests
 * 
 * This utility allows testing code that calls process.exit() without
 * terminating the test process. It replaces process.exit with a Vitest mock
 * function that can be used to verify exit codes.
 */

import { vi } from 'vitest';

/**
 * Result of mockProcessExit call
 */
export interface MockProcessExitResult {
  /** Mock function for process.exit */
  mockExit: ReturnType<typeof vi.fn>;
  /** Function to restore the original process.exit */
  restore: () => void;
}

/**
 * Mock process.exit for testing
 * @returns Object containing the mock function and a restore function
 */
export function mockProcessExit(): MockProcessExitResult {
  // Store the original process.exit
  const originalExit = process.exit;
  
  // Create a mock implementation
  const mockExitImpl = (code: number) => {
    console.log(`[mockExit] Called with code: ${code}`);
    throw new Error(`Process exited with code ${code}`);
  };
  
  // Create a proper mock function
  const mockExit = vi.fn().mockImplementation(mockExitImpl);
  
  // Replace process.exit with our mock
  process.exit = mockExit as any;
  
  return {
    mockExit,
    restore: () => {
      process.exit = originalExit;
    }
  };
}

/**
 * Example usage:
 * 
 * ```typescript
 * import { mockProcessExit } from '@tests/utils/cli/mockProcessExit';
 * 
 * it('should exit with code 1 on fatal error', async () => {
 *   const { mockExit, restore } = mockProcessExit();
 *   
 *   try {
 *     await cli.run(['--strict', 'non-existent-file.mlld']);
 *     expect(mockExit).toHaveBeenCalledWith(1);
 *   } finally {
 *     restore(); // Always restore original process.exit
 *   }
 * });
 * ```
 */ 