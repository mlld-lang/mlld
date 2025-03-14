/**
 * Utility for simplifying command execution mocking in tests
 */

import { vi } from 'vitest';
import type { CommandResponse, CommandMapping } from '@tests/utils/fs/MockCommandExecutor.js';
import { MockCommandExecutor, createCommonCommandMappings } from '@tests/utils/fs/MockCommandExecutor.js';
import { CommandMockableFileSystem } from '@tests/utils/fs/CommandMockableFileSystem.js';

/**
 * Options for setupCommandMocking
 */
export interface CommandMockingOptions {
  /** Initial command mapping */
  initialMapping?: CommandMapping;
  /** Reference to a FileSystemService to inject the mock into */
  fileSystemService?: { setFileSystem: (fs: any) => void };
}

/**
 * Result from setupCommandMocking
 */
export interface CommandMockingResult {
  /** The CommandMockableFileSystem instance */
  fs: CommandMockableFileSystem;
  /** The MockCommandExecutor for easy configuration */
  commandExecutor: MockCommandExecutor;
  /** Helper to add response for exact command */
  mockCommand: (command: string, response: CommandResponse) => void;
  /** Helper to add response for pattern match */
  mockCommandPattern: (pattern: RegExp, response: CommandResponse) => void;
  /** Helper to set default response */
  setDefaultResponse: (response: CommandResponse) => void;
  /** Reset to initial state */
  reset: () => void;
  /** Cleanup function to restore original mocks */
  restore: () => void;
}

/**
 * Set up command execution mocking for tests
 * 
 * @param options Configuration options
 * @returns Object with mock file system and utilities to configure command responses
 */
export function setupCommandMocking(options: CommandMockingOptions = {}): CommandMockingResult {
  // Create a mock file system with command execution mocking
  const mockFs = new CommandMockableFileSystem();
  
  // Initialize with provided or default command mappings
  if (options.initialMapping) {
    mockFs.commandExecutor.setMapping(options.initialMapping);
  } else {
    mockFs.commandExecutor.setMapping(createCommonCommandMappings());
  }
  
  // Inject the mock file system if a service was provided
  if (options.fileSystemService) {
    options.fileSystemService.setFileSystem(mockFs);
  }
  
  // Create utility functions for easier configuration
  const mockCommand = (command: string, response: CommandResponse) => {
    mockFs.commandExecutor.addCommandResponse(command, response);
  };
  
  const mockCommandPattern = (pattern: RegExp, response: CommandResponse) => {
    mockFs.commandExecutor.addCommandPattern(pattern, response);
  };
  
  const setDefaultResponse = (response: CommandResponse) => {
    mockFs.commandExecutor.setDefaultResponse(response);
  };
  
  const reset = () => {
    mockFs.initialize();
  };
  
  // Return result with all the utilities
  return {
    fs: mockFs,
    commandExecutor: mockFs.commandExecutor,
    mockCommand,
    mockCommandPattern,
    setDefaultResponse,
    reset,
    restore: () => {
      // No need to restore anything as we're not overriding global functions
    }
  };
}

/**
 * Example usage:
 * 
 * ```typescript
 * it('should execute commands correctly', async () => {
 *   // Set up the mocking
 *   const { mockCommand, mockCommandPattern, fs, restore } = setupCommandMocking({
 *     fileSystemService: fileSystemService
 *   });
 *   
 *   try {
 *     // Configure mock responses
 *     mockCommand('git status', {
 *       stdout: 'On branch main\nNothing to commit',
 *       stderr: '',
 *       exitCode: 0
 *     });
 *     
 *     mockCommandPattern(/npm run (.*)/, {
 *       stdout: 'Running $1 script...\nDone!',
 *       stderr: '',
 *       exitCode: 0
 *     });
 *     
 *     // Run your test that uses command execution
 *     const result = await handler.execute(directives.run('npm run test'));
 *     
 *     // Assert on the result
 *     expect(result.stdout).toContain('Running test script');
 *   } finally {
 *     restore();
 *   }
 * });
 * ```
 */