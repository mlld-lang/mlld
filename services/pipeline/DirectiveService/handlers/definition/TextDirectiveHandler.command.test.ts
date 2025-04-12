import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TextDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler.js';
import { DirectiveError } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import type { DirectiveNode, InterpolatableValue, VariableReferenceNode } from '@core/syntax/types/nodes.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import {
  createValidationServiceMock,
  createStateServiceMock,
  createResolutionServiceMock,
  createFileSystemServiceMock
} from '@tests/utils/mocks/serviceMocks.js';
import { createRunDirective, createTextNode, createVariableReferenceNode, createLocation } from '@tests/utils/testFactories.js';
import { VariableType, TextVariable, createTextVariable } from '@core/types/variables.js';
import { parse } from '@core/ast'; // Import the parser
import type { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { StructuredPath as AstStructuredPath } from '@core/syntax/types/nodes.js';
import { isInterpolatableValueArray } from '@core/syntax/types/guards.js';

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
      validateNodes: true
    });
    if (!result.ast || result.ast.length === 0 || result.ast[0].type !== 'Directive') {
      throw new Error(`Could not parse directive from code: ${code}`);
    }
    const node = result.ast[0] as DirectiveNode;
    
    // ** If the original code contained @run, ensure source is set correctly **
    if (code.includes('@run') && node.directive) {
        node.directive.source = 'run';
        // We might also need to ensure the run structure exists if the parser doesn't add it
        if (!node.directive.run) {
            // Attempt to infer basic run structure - This is brittle!
            const commandMatch = code.match(/@run\s*\[(.*?)\]/);
            if (commandMatch && commandMatch[1]) {
                node.directive.run = {
                    subtype: 'runCommand',
                    command: [ { type: 'Text', content: commandMatch[1] } ]
                }
            } else {
                 console.warn(`Could not automatically add run structure for parsed node from: ${code}`);
            }
        }
    } else if (node.directive && !node.directive.source) {
        // Default to literal if not run and source is missing
        node.directive.source = 'literal';
    }

    return node;
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
    vi.mocked(validationService.validate).mockResolvedValue(); // Returns Promise<void>
    
    // Mock getTextVar to return TextVariable or undefined
    vi.mocked(stateService.getTextVar).mockImplementation((name: string): TextVariable | undefined => {
      if (name === 'step1') return createTextVariable('step1', 'Command 1 output');
      // Add other variables used in tests if necessary
      if (name === 'level1') return createTextVariable('level1', 'Level 1 output');
      if (name === 'level2') return createTextVariable('level2', 'Level 2 references Level 1 output');
      return undefined;
    });
    
    stateService.clone.mockReturnValue(clonedState);
    
    // <<< Register the mock FileSystemService with the DI container >>>
    context.registerMock('IFileSystemService', fileSystemService);

    // Mock resolveNodes - ensure it uses the updated getTextVar
    resolutionService.resolveNodes.mockImplementation(async (nodes: InterpolatableValue, context: any): Promise<string> => {
        let commandString = '';
        for (const node of nodes) {
            if (node.type === 'Text') {
                commandString += node.content;
            } else if (node.type === 'VariableReference') {
                // Use the mocked getTextVar which returns TextVariable | undefined
                const varObj = stateService.getTextVar(node.identifier);
                // Log lookup for debugging nested test
                process.stdout.write(`[Mock resolveNodes] Looked up ${node.identifier}, got: ${varObj?.value}\n`);
                commandString += varObj?.value ?? `{{${node.identifier}}}`; // Return tag if not found
            }
        }
        return commandString; 
    });

    // Mock resolveInContext - SIMPLIFIED due to persistent type errors
    resolutionService.resolveInContext.mockImplementation(async (value: any, context: any): Promise<string> => {
        // Very simple mock - return string or basic representation
        if (typeof value === 'string') {
             // Basic variable replacement simulation
            if (value.includes('{{step1}}')) return value.replace('{{' + 'step1' + '}}', 'Command 1 output');
            if (value.includes('{{level1}}')) return value.replace('{{' + 'level1' + '}}', 'Level 1 output');
            if (value.includes('{{level2}}')) return value.replace('{{' + 'level2' + '}}', 'Level 2 references Level 1 output');
            return value;
        } 
        // For non-strings (like StructuredPath or InterpolatableValue), return a placeholder
        return 'mock-resolved-complex-value'; 
    });

    // Mock file system service for command execution
    fileSystemService.executeCommand.mockImplementation(async (command: string) => {
      // Refine mock to handle specific commands for nested test
      if (command === 'echo "Level 1 output"') {
        return { stdout: 'Level 1 output', stderr: '', exitCode: 0 };
      }
      if (command === 'echo "Level 2 references Level 1 output"') {
        return { stdout: 'Level 2 references Level 1 output', stderr: '', exitCode: 0 };
      }
      if (command === 'echo "Level 3 references Level 2 references Level 1 output"') {
        return { stdout: 'Level 3 references Level 2 references Level 1 output', stderr: '', exitCode: 0 };
      }
      // Keep existing mocks
      if (command.includes('echo "test"')) {
        return { stdout: 'test output', stderr: '', exitCode: 0 };
      }
      if (command.includes('echo "Command 1 output"')) {
        return { stdout: 'Command 1 output', stderr: '', exitCode: 0 };
      }
      if (command.includes('echo "Command 1 referenced')) {
        return { stdout: 'Command 1 referenced output', stderr: '', exitCode: 0 };
      }
      if (command.includes('Quotes')) { // Updated for simplified special chars test
        return { stdout: 'Quotes \' \" work?', stderr: '', exitCode: 0 };
      }
      if (command.includes('Line 1')) {
        return { stdout: 'Line 1\nLine 2\nLine 3', stderr: '', exitCode: 0 };
      }
      // Fallback generic output
      process.stdout.write(`[Mock executeCommand] FALLBACK for command: ${command}\n`);
      return { stdout: 'generic output', stderr: '', exitCode: 0 };
    });
    
    fileSystemService.getCwd.mockReturnValue('/Users/adam/dev/meld');
    
    // Create handler instance directly with mocks
    // The container will now inject the mocked fileSystemService due to registerMock above
    handler = new TextDirectiveHandler(
      validationService,
      stateService,
      resolutionService,
      fileSystemService // Pass the mock here as well for local access if needed
    );

    // <<< Add check: Verify injected FS instance matches mock >>>
    expect((handler as any).fileSystemService).toBe(fileSystemService);
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  it('should execute command and store its output', async () => {
    // Arrange
    const node = await createNodeFromString('@text command_output = @run [echo "test"]');
    
    const testContext = {
      state: stateService,
      currentFilePath: 'test.meld'
    };

    // Act
    await handler.execute(node, testContext);
    
    // Assert
    expect(fileSystemService.executeCommand).toHaveBeenCalledWith('echo "test"', expect.any(Object));
    expect(clonedState.setTextVar).toHaveBeenCalledWith('command_output', 'test output', expect.objectContaining({ definedAt: expect.any(Object) }));
  });
  
  it('should handle variable references in command input', async () => {
    // Arrange
    const step1Node = await createNodeFromString('@text step1 = "Command 1 output"'); // Literal node
    const step2Node = await createNodeFromString('@text step2 = @run [echo "Command 1 referenced: {{step1}}"]'); // Run node
    
    const testContext = {
      state: stateService,
      currentFilePath: 'test.meld',
      parentState: stateService // Provide parent state if needed for resolution
    };

    // Act - Set step1 value first
    await handler.execute(step1Node, testContext);
    // Now execute step2 which references step1
    await handler.execute(step2Node, testContext);
    
    // Assert
    // Check executeCommand was called for step2
    expect(fileSystemService.executeCommand).toHaveBeenCalledWith('echo "Command 1 referenced: Command 1 output"', expect.any(Object));
    // Check setTextVar for both
    expect(clonedState.setTextVar).toHaveBeenCalledWith('step1', 'Command 1 output', expect.any(Object));
    expect(clonedState.setTextVar).toHaveBeenCalledWith('step2', 'Command 1 referenced output', expect.any(Object));
  });
  
  it('should handle special characters in command outputs', async () => {
    // Arrange
    // Simplify input to avoid complex quote escaping issues in test setup
    const node = await createNodeFromString('@text special = @run [echo "Quotes \' \" work?"]');
    
    const testContext = {
      state: stateService,
      currentFilePath: 'test.meld'
    };

    // Act
    await handler.execute(node, testContext);
    
    // Assert
    // Expect the command passed to executeCommand to match the simplified input
    expect(fileSystemService.executeCommand).toHaveBeenCalledWith('echo "Quotes \' \" work?"', expect.any(Object));
    // Expect the state to store the output returned by the mock
    expect(clonedState.setTextVar).toHaveBeenCalledWith('special', 'Quotes \' \" work?', expect.any(Object)); 
  });
  
  it('should handle multi-line command outputs', async () => {
    // Arrange
    const node = await createNodeFromString('@text multiline = @run [echo -e "Line 1\\nLine 2\\nLine 3"]');
    
    const testContext = {
      state: stateService,
      currentFilePath: 'test.meld'
    };

    // Act
    await handler.execute(node, testContext);
    
    // Assert
    expect(fileSystemService.executeCommand).toHaveBeenCalledWith('echo -e "Line 1\\nLine 2\\nLine 3"', expect.any(Object));
    expect(clonedState.setTextVar).toHaveBeenCalledWith('multiline', 'Line 1\nLine 2\nLine 3', expect.any(Object));
  });
  
  it('should handle nested variable references across multiple levels', async () => {
    // Arrange - Use helper for all nodes
    const level1Node = await createNodeFromString('@text level1 = @run [echo "Level 1 output"]');
    const level2Node = await createNodeFromString('@text level2 = @run [echo "Level 2 references {{level1}}"]');
    const level3Node = await createNodeFromString('@text level3 = @run [echo "Level 3 references {{level2}}"]');
    
    const testContext = {
      state: stateService,
      currentFilePath: 'test.meld',
      parentState: stateService // Provide parent state
    };
    
    // Mock the file system service (already done in beforeEach)
    // Mock the resolution service (already done in beforeEach for simple cases)
    // Mock state service getTextVar (already done in beforeEach)
    
    // Act - Execute each level in sequence
    await handler.execute(level1Node, testContext);
    await handler.execute(level2Node, testContext);
    await handler.execute(level3Node, testContext);
    
    // Assert
    expect(fileSystemService.executeCommand).toHaveBeenCalledTimes(3);
    expect(clonedState.setTextVar).toHaveBeenCalledWith('level1', 'Level 1 output', expect.any(Object));
    expect(clonedState.setTextVar).toHaveBeenCalledWith('level2', 'Level 2 references Level 1 output', expect.any(Object));
    expect(clonedState.setTextVar).toHaveBeenCalledWith('level3', 'Level 3 references Level 2 references Level 1 output', expect.any(Object));
  });
}); 