import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MockCommandExecutor, createCommonCommandMappings } from '@tests/utils/fs/MockCommandExecutor';
import { setupCommandMocking } from '@tests/utils/fs/commandMockingHelper';

describe('MockCommandExecutor', () => {
  let commandExecutor: MockCommandExecutor;

  beforeEach(() => {
    commandExecutor = new MockCommandExecutor();
  });

  it('should handle exact command matches', async () => {
    // Set up command response
    commandExecutor.addCommandResponse('git status', {
      stdout: 'On branch main\nNothing to commit',
      stderr: '',
      exitCode: 0
    });

    // Execute the command
    const result = await commandExecutor.executeCommand('git status');

    // Verify the result
    expect(result.stdout).toBe('On branch main\nNothing to commit');
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });

  it('should handle pattern matches with capture groups', async () => {
    // Set up command pattern response
    commandExecutor.addCommandPattern(/npm run (.*)/, {
      stdout: 'Running $1 script...\nDone!',
      stderr: '',
      exitCode: 0
    });

    // Execute the command
    const result = await commandExecutor.executeCommand('npm run test');

    // Verify the result
    expect(result.stdout).toBe('Running test script...\nDone!');
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });

  it('should use default response for unmatched commands', async () => {
    // Set default response
    commandExecutor.setDefaultResponse({
      stdout: '',
      stderr: 'Command not recognized',
      exitCode: 127
    });

    // Execute an unmatched command
    const result = await commandExecutor.executeCommand('unknown-command');

    // Verify the result
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('Command not recognized');
    expect(result.exitCode).toBe(127);
  });

  it('should properly reset mapping configuration', async () => {
    // Set up command response
    commandExecutor.addCommandResponse('git status', {
      stdout: 'On branch main\nNothing to commit',
      stderr: '',
      exitCode: 0
    });

    // Reset the configuration
    commandExecutor.reset();

    // Execute the command (should now use default response)
    const result = await commandExecutor.executeCommand('git status');

    // Verify the result
    expect(result.stderr).toContain('Command not found or not supported');
    expect(result.exitCode).toBe(127);
  });

  it('should initialize with common command mappings', async () => {
    // Create executor with common mappings
    const commandExecutor = new MockCommandExecutor(createCommonCommandMappings());

    // Test echo command
    const echoResult = await commandExecutor.executeCommand('echo Hello World');
    expect(echoResult.stdout).toBe('Hello World');

    // Test npm command
    const npmResult = await commandExecutor.executeCommand('npm run test');
    expect(npmResult.stdout).toContain('Running script test');
  });
});

describe('commandMockingHelper', () => {
  it('should provide a convenient interface for command mocking', async () => {
    // Set up mocking with helper
    const { 
      mockCommand, 
      mockCommandPattern, 
      fs,
      restore 
    } = setupCommandMocking();

    try {
      // Configure mock responses
      mockCommand('git status', {
        stdout: 'On branch main\nNothing to commit',
        stderr: '',
        exitCode: 0
      });

      mockCommandPattern(/npm run (.*)/, {
        stdout: 'Running $1 script...\nDone!',
        stderr: '',
        exitCode: 0
      });

      // Execute commands
      const gitResult = await fs.executeCommand('git status');
      const npmResult = await fs.executeCommand('npm run build');

      // Verify results
      expect(gitResult.stdout).toBe('On branch main\nNothing to commit');
      expect(npmResult.stdout).toBe('Running script build...\nDone!');
    } finally {
      restore();
    }
  });

  it('should inject the mock file system into a service', async () => {
    // Create mock service
    const mockFileSystemService = {
      setFileSystem: vi.fn()
    };

    // Set up mocking with helper
    const { fs } = setupCommandMocking({
      fileSystemService: mockFileSystemService
    });

    // Verify the service received the mock file system
    expect(mockFileSystemService.setFileSystem).toHaveBeenCalledWith(fs);
  });
});