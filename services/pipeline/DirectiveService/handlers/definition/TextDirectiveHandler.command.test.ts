import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TextDirectiveHandler } from './TextDirectiveHandler.js';
import type { DirectiveNode } from '@core/syntax/types';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI';
import {
  createValidationServiceMock,
  createStateServiceMock,
  createResolutionServiceMock,
  createFileSystemServiceMock
} from '@tests/utils/mocks/serviceMocks';

/**
 * TextDirectiveHandler Command Test Status
 * --------------------------------
 * 
 * MIGRATION STATUS: Complete
 * 
 * This test file has been fully migrated to use:
 * - TestContextDI for container management
 * - Standardized mock factories with vitest-mock-extended
 */

/**
 * Helper function to create a directive node specifically with a @run command
 */
const createRunDirectiveNode = (identifier: string, command: string): DirectiveNode => {
  return {
    type: 'Directive',
    directive: {
      kind: 'text',
      identifier,
      value: `@run [${command}]`,
      source: 'run',
      run: {
        command: command
      }
    }
  };
};

/**
 * Helper function to create a standard text directive node
 */
const createTextDirectiveNode = (identifier: string, text: string): DirectiveNode => {
  return {
    type: 'Directive',
    directive: {
      kind: 'text',
      identifier,
      value: text
    }
  };
};

describe('TextDirectiveHandler - Command Execution', () => {
  let handler: TextDirectiveHandler;
  let stateService: ReturnType<typeof createStateServiceMock>;
  let validationService: ReturnType<typeof createValidationServiceMock>;
  let resolutionService: ReturnType<typeof createResolutionServiceMock>;
  let fileSystemService: ReturnType<typeof createFileSystemServiceMock>;
  let clonedState: any;
  let context: TestContextDI;

  beforeEach(() => {
    // Create context with isolated container
    context = TestContextDI.create({ isolatedContainer: true });
    
    // Create basic mock state services
    clonedState = {
      setTextVar: vi.fn(),
      getTextVar: vi.fn().mockImplementation((name: string) => {
        if (name === 'step1') return 'Command 1 output';
        return undefined;
      }),
      getDataVar: vi.fn(),
      clone: vi.fn(),
    };

    // Create mocks using standardized factories
    validationService = createValidationServiceMock();
    stateService = createStateServiceMock();
    resolutionService = createResolutionServiceMock();
    fileSystemService = createFileSystemServiceMock();
    
    // Configure mock implementations
    validationService.validate.mockResolvedValue(true);
    
    stateService.getTextVar.mockImplementation((name: string) => {
      if (name === 'step1') return 'Command 1 output';
      return undefined;
    });
    
    stateService.clone.mockReturnValue(clonedState);
    
    resolutionService.resolveInContext.mockImplementation(value => Promise.resolve(value));

    // Mock file system service for command execution
    fileSystemService.executeCommand.mockImplementation((command: string) => {
      if (command.includes('echo "test"')) {
        return Promise.resolve({ stdout: 'test output', stderr: '', exitCode: 0 });
      }
      if (command.includes('echo "Command 1 output"')) {
        return Promise.resolve({ stdout: 'Command 1 output', stderr: '', exitCode: 0 });
      }
      if (command.includes('echo "Command 1 referenced')) {
        return Promise.resolve({ stdout: 'Command 1 referenced output', stderr: '', exitCode: 0 });
      }
      if (command.includes('Output with')) {
        return Promise.resolve({ stdout: 'Output with \'single\' and "double" quotes', stderr: '', exitCode: 0 });
      }
      if (command.includes('Line 1')) {
        return Promise.resolve({ stdout: 'Line 1\nLine 2\nLine 3', stderr: '', exitCode: 0 });
      }
      return Promise.resolve({ stdout: 'generic output', stderr: '', exitCode: 0 });
    });
    
    fileSystemService.getCwd.mockReturnValue('/Users/adam/dev/meld');
    
    // Create handler instance directly with mocks
    handler = new TextDirectiveHandler(
      validationService,
      stateService,
      resolutionService
    );
    
    // Set the file system service on the handler - this is required for command execution
    handler.setFileSystemService(fileSystemService);
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  it('should execute command and store its output', async () => {
    // Arrange
    const node = createRunDirectiveNode('command_output', 'echo "test"');
    
    const testContext = {
      state: stateService,
      currentFilePath: 'test.meld'
    };

    // Act
    await handler.execute(node, testContext);
    
    // Assert
    expect(fileSystemService.executeCommand).toHaveBeenCalledWith('echo "test"', { cwd: '/Users/adam/dev/meld' });
    expect(clonedState.setTextVar).toHaveBeenCalledWith('command_output', 'test output');
  });
  
  it('should handle variable references in command input', async () => {
    // Arrange
    const step1Node = createRunDirectiveNode('step1', 'echo "Command 1 output"');
    
    // For the second node, we need to simulate the resolution of variables in the command
    const step2Node = createRunDirectiveNode('step2', 'echo "Command 1 referenced: {{step1}}"');
    
    const testContext = {
      state: stateService,
      currentFilePath: 'test.meld',
      parentState: stateService
    };

    // Act
    await handler.execute(step1Node, testContext);
    
    // Mock the resolutionService to handle the variable reference in the second command
    resolutionService.resolveInContext.mockImplementation((value) => {
      if (value === 'echo "Command 1 referenced: {{step1}}"') {
        return Promise.resolve('echo "Command 1 referenced: Command 1 output"');
      }
      return Promise.resolve(value);
    });
    
    await handler.execute(step2Node, testContext);
    
    // Assert
    expect(fileSystemService.executeCommand).toHaveBeenCalledTimes(2);
    expect(fileSystemService.executeCommand).toHaveBeenCalledWith('echo "Command 1 output"', { cwd: '/Users/adam/dev/meld' });
    expect(fileSystemService.executeCommand).toHaveBeenCalledWith('echo "Command 1 referenced: Command 1 output"', { cwd: '/Users/adam/dev/meld' });
    expect(clonedState.setTextVar).toHaveBeenCalledWith('step1', 'Command 1 output');
    expect(clonedState.setTextVar).toHaveBeenCalledWith('step2', 'Command 1 referenced output');
  });
  
  it('should handle special characters in command outputs', async () => {
    // Arrange
    const node = createRunDirectiveNode('special', 'echo "Output with \'single\' and \\"double\\" quotes"');
    
    const testContext = {
      state: stateService,
      currentFilePath: 'test.meld'
    };

    // Act
    await handler.execute(node, testContext);
    
    // Assert
    expect(fileSystemService.executeCommand).toHaveBeenCalled();
    expect(clonedState.setTextVar).toHaveBeenCalled();
  });
  
  it('should handle multi-line command outputs', async () => {
    // Arrange
    const node = createRunDirectiveNode('multiline', 'echo -e "Line 1\\nLine 2\\nLine 3"');
    
    const testContext = {
      state: stateService,
      currentFilePath: 'test.meld'
    };

    // Act
    await handler.execute(node, testContext);
    
    // Assert
    expect(fileSystemService.executeCommand).toHaveBeenCalled();
    expect(clonedState.setTextVar).toHaveBeenCalled();
  });
  
  it('should handle nested variable references across multiple levels', async () => {
    // Arrange - Create nodes for each level
    const level1Node = createRunDirectiveNode('level1', 'echo "Level 1 output"');
    const level2Node = createRunDirectiveNode('level2', 'echo "Level 2 references {{level1}}"');
    const level3Node = createRunDirectiveNode('level3', 'echo "Level 3 references {{level2}}"');
    
    const testContext = {
      state: stateService,
      currentFilePath: 'test.meld',
      parentState: stateService
    };
    
    // Mock the file system service to return appropriate outputs
    fileSystemService.executeCommand
      .mockImplementationOnce(() => Promise.resolve({ stdout: 'Level 1 output', stderr: '', exitCode: 0 }))
      .mockImplementationOnce(() => Promise.resolve({ stdout: 'Level 2 references Level 1 output', stderr: '', exitCode: 0 }))
      .mockImplementationOnce(() => Promise.resolve({ stdout: 'Level 3 references Level 2 references Level 1 output', stderr: '', exitCode: 0 }));
    
    // Mock the resolution service to handle variable resolution for each level
    resolutionService.resolveInContext
      .mockImplementationOnce(value => Promise.resolve(value)) // First command has no variables
      .mockImplementationOnce(value => {
        // For level2, replace {{level1}} with its output
        if (value === 'echo "Level 2 references {{level1}}"') {
          return Promise.resolve('echo "Level 2 references Level 1 output"');
        }
        return Promise.resolve(value);
      })
      .mockImplementationOnce(value => {
        // For level3, replace {{level2}} with its output
        if (value === 'echo "Level 3 references {{level2}}"') {
          return Promise.resolve('echo "Level 3 references Level 2 references Level 1 output"');
        }
        return Promise.resolve(value);
      });
    
    // Update mock state to return values for each level
    stateService.getTextVar = vi.fn().mockImplementation((name: string) => {
      if (name === 'level1') return 'Level 1 output';
      if (name === 'level2') return 'Level 2 references Level 1 output';
      return undefined;
    });
    
    // Act - Execute each level in sequence
    await handler.execute(level1Node, testContext);
    await handler.execute(level2Node, testContext);
    await handler.execute(level3Node, testContext);
    
    // Assert
    expect(fileSystemService.executeCommand).toHaveBeenCalledTimes(3);
    expect(clonedState.setTextVar).toHaveBeenCalledWith('level1', 'Level 1 output');
    expect(clonedState.setTextVar).toHaveBeenCalledWith('level2', 'Level 2 references Level 1 output');
    expect(clonedState.setTextVar).toHaveBeenCalledWith('level3', 'Level 3 references Level 2 references Level 1 output');
  });
}); 