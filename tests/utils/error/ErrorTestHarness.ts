/**
 * Basic Error Test Utilities (Phase 1)
 * 
 * Simple utilities for testing error handling in the Meld language interpreter.
 * This is a minimal implementation for the initial release.
 */

import { MeldError } from '@core/errors/MeldError';
import { ErrorSeverity } from '@core/errors/ErrorSeverity';

/**
 * Options for creating a test environment
 */
export interface ErrorTestOptions {
  strict?: boolean;
  logger?: any;
}

/**
 * Create options for strict mode testing
 */
export function createStrictModeOptions(options: Partial<ErrorTestOptions> = {}): ErrorTestOptions {
  return {
    strict: true,
    ...options
  };
}

/**
 * Create options for permissive mode testing
 */
export function createPermissiveModeOptions(options: Partial<ErrorTestOptions> = {}): ErrorTestOptions {
  return {
    strict: false,
    ...options
  };
}

/**
 * Verify that an error has the expected severity
 */
export function expectErrorSeverity(error: MeldError, expectedSeverity: ErrorSeverity): void {
  if (error.severity !== expectedSeverity) {
    throw new Error(
      `Error severity mismatch. Expected: ${ErrorSeverity[expectedSeverity]}, ` +
      `Actual: ${ErrorSeverity[error.severity]}`
    );
  }
}

/**
 * Verify that a function throws an error with the expected type and severity
 */
export async function expectThrowsWithSeverity<T extends Error>(
  fn: () => Promise<any> | any,
  errorType: new (...args: any[]) => T,
  expectedSeverity: ErrorSeverity
): Promise<void> {
  try {
    await fn();
    throw new Error(`Expected function to throw ${errorType.name} but it did not throw`);
  } catch (error) {
    if (!(error instanceof errorType)) {
      throw new Error(
        `Expected error to be instance of ${errorType.name} but got ${error.constructor.name}`
      );
    }
    
    if (error instanceof MeldError) {
      expectErrorSeverity(error, expectedSeverity);
    } else {
      throw new Error(
        `Expected error to be instance of MeldError but got ${error.constructor.name}`
      );
    }
  }
}

/**
 * Create a mock logger for testing
 */
export function createMockLogger() {
  return {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    reset() {
      this.error.mockReset();
      this.warn.mockReset();
      this.info.mockReset();
      this.debug.mockReset();
    }
  };
}

/**
 * Mock console for CLI testing
 */
export function mockConsole() {
  const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info
  };
  
  const mockFns = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn()
  };
  
  // Replace console methods with mocks
  console.log = mockFns.log;
  console.error = mockFns.error;
  console.warn = mockFns.warn;
  console.info = mockFns.info;
  
  // Return mock functions and a restore function
  return {
    ...mockFns,
    restore() {
      console.log = originalConsole.log;
      console.error = originalConsole.error;
      console.warn = originalConsole.warn;
      console.info = originalConsole.info;
    }
  };
}

/**
 * Mock process.exit for CLI testing
 */
export function mockProcessExit() {
  const originalExit = process.exit;
  const mockExit = jest.fn();
  
  // @ts-ignore - We're intentionally mocking this
  process.exit = mockExit;
  
  // Return the mock function and a restore function
  return Object.assign(mockExit, {
    restore() {
      process.exit = originalExit;
    }
  });
}

/**
 * Example usage:
 * 
 * ```typescript
 * // Test a fatal error
 * it('should throw fatal error for invalid syntax', async () => {
 *   await expectThrowsWithSeverity(
 *     () => service.process('@invalid', createStrictModeOptions()),
 *     MeldSyntaxError,
 *     ErrorSeverity.Fatal
 *   );
 * });
 * 
 * // Test a recoverable error
 * it('should handle recoverable errors differently in strict and permissive modes', async () => {
 *   // Strict mode
 *   await expect(
 *     service.process('@text x = #{undefined}', createStrictModeOptions())
 *   ).rejects.toThrow(MeldResolutionError);
 *   
 *   // Permissive mode
 *   const result = await service.process('@text x = #{undefined}', createPermissiveModeOptions());
 *   expect(result).toBeDefined();
 * });
 * 
 * // Test CLI error handling
 * it('should display error message and exit with code 1', async () => {
 *   const consoleMock = mockConsole();
 *   const exitMock = mockProcessExit();
 *   
 *   try {
 *     await cli.run(['--strict', 'non-existent.meld']);
 *     
 *     expect(consoleMock.error).toHaveBeenCalledWith(
 *       expect.stringContaining('File not found')
 *     );
 *     expect(exitMock).toHaveBeenCalledWith(1);
 *   } finally {
 *     consoleMock.restore();
 *     exitMock.restore();
 *   }
 * });
 * ```
 */ 