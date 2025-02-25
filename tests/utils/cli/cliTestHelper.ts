/**
 * Integrated helper for CLI testing
 * 
 * This utility combines all the individual test utilities into a single helper
 * for comprehensive CLI testing.
 */

import { mockProcessExit } from './mockProcessExit';
import { mockConsole } from './mockConsole';
import { mockFileSystem } from '../fs/mockFileSystem';
import { mockEnv } from '../env/mockEnv';
import { ReturnType } from 'vitest';

/**
 * Options for setting up a CLI test
 */
interface CliTestOptions {
  /** Files to create in the mock file system */
  files?: Record<string, string>;
  /** Environment variables to set */
  env?: Record<string, string>;
  /** Whether to mock process.exit */
  mockExit?: boolean;
  /** Whether to mock console output */
  mockConsoleOutput?: boolean;
}

/**
 * Result of setupCliTest call
 */
interface CliTestResult {
  /** Mock function for process.exit */
  exitMock?: ReturnType<typeof mockProcessExit>['mockExit'];
  /** Mock functions for console methods */
  consoleMock?: ReturnType<typeof mockConsole>['mocks'];
  /** The memfs volume for direct manipulation */
  vol?: ReturnType<typeof mockFileSystem>['vol'];
  /** Function to clean up all mocks */
  cleanup: () => void;
}

/**
 * Set up a CLI test environment with all necessary mocks
 * @param options - Options for setting up the test
 * @returns Object containing mock functions and a cleanup function
 */
export function setupCliTest(options: CliTestOptions = {}): CliTestResult {
  const {
    files = {},
    env = {},
    mockExit = true,
    mockConsoleOutput = true
  } = options;
  
  const cleanups: Array<() => void> = [];
  const result: CliTestResult = {
    cleanup: () => {
      cleanups.forEach(cleanup => cleanup());
    }
  };
  
  if (mockExit) {
    const exitMock = mockProcessExit();
    result.exitMock = exitMock.mockExit;
    cleanups.push(exitMock.restore);
  }
  
  if (mockConsoleOutput) {
    const consoleMock = mockConsole();
    result.consoleMock = consoleMock.mocks;
    cleanups.push(consoleMock.restore);
  }
  
  if (Object.keys(files).length > 0) {
    const fsMock = mockFileSystem(files);
    result.vol = fsMock.vol;
    cleanups.push(fsMock.restore);
  }
  
  if (Object.keys(env).length > 0) {
    const envMock = mockEnv(env);
    cleanups.push(envMock.restore);
  }
  
  return result;
}

/**
 * Example usage:
 * 
 * ```typescript
 * describe('CLI', () => {
 *   it('should process template with environment variables', async () => {
 *     const { exitMock, consoleMock, vol, cleanup } = setupCliTest({
 *       files: {
 *         '/template.meld': '@text greeting = "Hello #{env.USER}"'
 *       },
 *       env: {
 *         'USER': 'TestUser'
 *       }
 *     });
 *     
 *     try {
 *       await cli.run(['template.meld', '--output', 'result.txt']);
 *       expect(exitMock).not.toHaveBeenCalled();
 *       expect(vol.existsSync('/result.txt')).toBe(true);
 *       expect(vol.readFileSync('/result.txt', 'utf8')).toBe('Hello TestUser');
 *     } finally {
 *       cleanup();
 *     }
 *   });
 *   
 *   it('should handle errors in strict mode', async () => {
 *     const { exitMock, consoleMock, cleanup } = setupCliTest();
 *     
 *     try {
 *       await cli.run(['--strict', '--eval', '@text greeting = "Hello #{undefined}"']);
 *       expect(exitMock).toHaveBeenCalledWith(1);
 *       expect(consoleMock.error).toHaveBeenCalledWith(
 *         expect.stringContaining('undefined variable')
 *       );
 *     } finally {
 *       cleanup();
 *     }
 *   });
 * });
 * ```
 */ 