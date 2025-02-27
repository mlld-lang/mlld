/**
 * File system and command execution mocking utilities for tests
 */

// Export mock file system utilities
export { mockFileSystem } from './mockFileSystem';

// Export command mocking utilities
export { MockCommandExecutor, createCommonCommandMappings } from './MockCommandExecutor';
export { CommandMockableFileSystem } from './CommandMockableFileSystem';
export { setupCommandMocking } from './commandMockingHelper';

// Export types
export type { CommandResponse, CommandMapping } from './MockCommandExecutor';
export type { CommandMockingOptions, CommandMockingResult } from './commandMockingHelper';