import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TextDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler.js';
import { DirectiveError } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import type { DirectiveNode } from '@core/syntax/types.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import {
  createValidationServiceMock,
  createStateServiceMock,
  createResolutionServiceMock,
  createFileSystemServiceMock
} from '@tests/utils/mocks/serviceMocks.js';
import { createRunDirective, createTextNode, createVariableReferenceNode } from '@tests/utils/testFactories.js';
import type { InterpolatableValue } from '@core/syntax/types/nodes.js';
import { VariableType } from '@core/types/variables.js';
import { StringLiteralHandler } from '@services/resolution/ResolutionService/resolvers/StringLiteralHandler.js';
import { StringConcatenationHandler } from '@services/resolution/ResolutionService/resolvers/StringConcatenationHandler.js';
import { parse } from '@core/ast'; // Import the parser

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

// <<< Add local helper to parse directive strings >>>
const createNodeFromString = async (code: string): Promise<DirectiveNode> => {
  try {
    const result = await parse(code, {
      trackLocations: true,
      validateNodes: true,
      structuredPaths: true // Enable if needed for path resolution within commands
    });
    if (!result.ast || result.ast.length === 0 || result.ast[0].type !== 'Directive') {
      throw new Error(`Could not parse directive from code: ${code}`);
    }
    return result.ast[0] as DirectiveNode;
  } catch (error) {
    console.error(`Error parsing directive string: ${code}`, error);
    throw error;
  }
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
    
    // resolutionService.resolveNodes.mockResolvedValue('echo "test"'); // <<< Remove simplified mock

    // <<< Restore detailed mock for resolveNodes >>>
    resolutionService.resolveNodes.mockImplementation(async (nodes: InterpolatableValue, context: any): Promise<string> => {
        let commandString = '';
        for (const node of nodes) {
            if (node.type === 'Text') {
                commandString += node.content;
            } else if (node.type === 'VariableReference') {
                const varValue = stateService.getTextVar(node.identifier);
                commandString += varValue ?? ''; 
            }
        }
        return commandString; 
    });

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
    // Use the new helper with the full directive string
    const node = await createNodeFromString('@text command_output = @run echo "test"');
    
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
    // Use the new helper for both steps
    const step1Node = await createNodeFromString('@text step1 = @run echo "Command 1 output"');
    const step2Node = await createNodeFromString('@text step2 = @run echo "Command 1 referenced: {{step1}}"');
    
    const testContext = {
      state: stateService,
      currentFilePath: 'test.meld',
      parentState: stateService
    };

    // Act
    await handler.execute(step1Node, testContext);
    
    // Mock the resolutionService to handle the variable reference in the second command
    // This mock might be redundant now if resolveNodes handles it, but keep for safety?
    // resolutionService.resolveInContext.mockImplementation((value) => { // <<< Remove or adjust
    //   if (value === 'echo "Command 1 referenced: {{step1}}"') {
    //     return Promise.resolve('echo "Command 1 referenced: Command 1 output"');
    //   }
    //   return Promise.resolve(value);
    // });
    
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
    // Use the new helper
    const node = await createNodeFromString('@text special = @run echo "Output with \'single\' and \\"double\\" quotes"');
    
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
    // Use the new helper
    const node = await createNodeFromString('@text multiline = @run echo -e "Line 1\\nLine 2\\nLine 3"');
    
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
    // Arrange - Create nodes for each level using the helper
    const level1Node = await createNodeFromString('@text level1 = @run echo "Level 1 output"');
    const level2Node = await createNodeFromString('@text level2 = @run echo "Level 2 references {{level1}}"');
    const level3Node = await createNodeFromString('@text level3 = @run echo "Level 3 references {{level2}}"');
    
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