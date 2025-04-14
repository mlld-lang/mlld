import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TextDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { 
  createValidationServiceMock, 
  createStateServiceMock, 
  createResolutionServiceMock,
  createFileSystemServiceMock // Correct factory name
} from '@tests/utils/mocks/serviceMocks.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { DirectiveNode, InterpolatableValue, VariableReferenceNode, TextNode } from '@core/syntax/types/nodes.js'; // Import TextNode
// Import factories correctly
import { createRunDirective, createTextNode, createDirectiveNode } from '@tests/utils/testFactories.js'; 
import { mock } from 'vitest-mock-extended';
// Import context types correctly
import type { DirectiveProcessingContext, FormattingContext } from '@core/types/index.js'; 
import type { ResolutionContext } from '@core/types/resolution.js';
// Remove duplicate factory import
// import { createRunDirective, createTextNode, createVariableReferenceNode, createLocation } from '@tests/utils/testFactories.js';
// Remove unused imports if any
// import { VariableType, TextVariable, createTextVariable } from '@core/types/variables.js';
// Add missing imports
import { parse } from '@core/ast'; 
import { VariableType, TextVariable, createTextVariable } from '@core/types/variables.js';

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
  let fileSystemService: ReturnType<typeof createFileSystemServiceMock>; // Use correct type 
  let clonedState: any;
  let context: TestContextDI;
  let mockProcessingContext: DirectiveProcessingContext;

  beforeEach(async () => {
    context = TestContextDI.createIsolated();
    await context.initialize();

    validationService = createValidationServiceMock();
    stateService = createStateServiceMock();
    resolutionService = createResolutionServiceMock();
    fileSystemService = createFileSystemServiceMock(); // Use correct factory name

    stateService.getCurrentFilePath.mockReturnValue('/test.meld');
    fileSystemService.getCwd.mockReturnValue('/test');

    context.registerMock('IValidationService', validationService);
    context.registerMock('IStateService', stateService);
    context.registerMock('IResolutionService', resolutionService);
    context.registerMock('IFileSystemService', fileSystemService); 

    handler = await context.resolve(TextDirectiveHandler);

    resolutionService.resolveNodes.mockImplementation(async (nodes: InterpolatableValue, ctx: ResolutionContext): Promise<string> => {
      // Use TextNode type
      return nodes.map((n: TextNode | VariableReferenceNode) => {
           if (n.type === 'Text') return n.content;
           if (n.type === 'VariableReference') return `{{${n.identifier}}}`;
           return '';
       }).join('');
    });

    const mockResolutionContext = mock<ResolutionContext>();
    const mockFormattingContext = mock<FormattingContext>();
    mockProcessingContext = {
        state: stateService,
        resolutionContext: mockResolutionContext,
        formattingContext: mockFormattingContext,
        directiveNode: undefined as any, 
    };

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
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  it('should execute command and store its output', async () => {
    const command = 'echo "Hello Command"';
    const runDirectiveNodePart = createRunDirective([{ type: 'Text', content: command } as TextNode]); // Use TextNode type
    // Use createDirectiveNode with correct structure
    const node = createDirectiveNode('text', { 
      identifier: 'cmdOutput', 
      source: 'run', 
      run: runDirectiveNodePart.directive 
    });
    mockProcessingContext.directiveNode = node;

    vi.mocked(fileSystemService.executeCommand).mockResolvedValue({ stdout: 'Hello Command\n', stderr: '' }); // Use vi.mocked

    await handler.execute(mockProcessingContext);

    expect(fileSystemService.executeCommand).toHaveBeenCalledWith(command, { cwd: '/test' });
    expect(stateService.setTextVar).toHaveBeenCalledWith('cmdOutput', 'Hello Command');
  });
  
  it('should handle variable references in command input', async () => {
    const commandTemplateNodes: InterpolatableValue = [
      createTextNode('echo "Input: '), 
      { type: 'VariableReference', identifier: 'inputVar' } as VariableReferenceNode,
      createTextNode('"')
    ];
    const resolvedCommand = 'echo "Input: test value"';
    const runDirectiveNodePart = createRunDirective(commandTemplateNodes);
    // Use createDirectiveNode with correct structure
    const node = createDirectiveNode('text', { 
      identifier: 'cmdOutputVar', 
      source: 'run', 
      run: runDirectiveNodePart.directive
    });
    mockProcessingContext.directiveNode = node;

    vi.mocked(resolutionService.resolveNodes).mockResolvedValueOnce(resolvedCommand); // Use vi.mocked
    vi.mocked(fileSystemService.executeCommand).mockResolvedValue({ stdout: 'Input: test value\n', stderr: '' }); // Use vi.mocked

    await handler.execute(mockProcessingContext);

    expect(resolutionService.resolveNodes).toHaveBeenCalledWith(commandTemplateNodes, expect.anything());
    expect(fileSystemService.executeCommand).toHaveBeenCalledWith(resolvedCommand, { cwd: '/test' });
    expect(stateService.setTextVar).toHaveBeenCalledWith('cmdOutputVar', 'Input: test value');
  });
  
  it('should handle special characters in command outputs', async () => {
    const command = 'echo "special chars: \'\"\\`$"';
    const output = 'special chars: \'\"\\`$';
    const runDirectiveNodePart = createRunDirective([{ type: 'Text', content: command } as TextNode]);
    // Use createDirectiveNode with correct structure
    const node = createDirectiveNode('text', { 
      identifier: 'specialOutput', 
      source: 'run', 
      run: runDirectiveNodePart.directive
    });
    mockProcessingContext.directiveNode = node;

    vi.mocked(resolutionService.resolveNodes).mockResolvedValueOnce(command);
    vi.mocked(fileSystemService.executeCommand).mockResolvedValue({ stdout: `${output}\n`, stderr: '' });

    await handler.execute(mockProcessingContext);

    expect(fileSystemService.executeCommand).toHaveBeenCalledWith(command, { cwd: '/test' });
    expect(stateService.setTextVar).toHaveBeenCalledWith('specialOutput', output);
  });
  
  it('should handle multi-line command outputs', async () => {
    const command = 'echo "line1\nline2"';
    const output = 'line1\nline2';
    const runDirectiveNodePart = createRunDirective([{ type: 'Text', content: command } as TextNode]);
    // Use createDirectiveNode with correct structure
    const node = createDirectiveNode('text', { 
      identifier: 'multiLineOutput', 
      source: 'run', 
      run: runDirectiveNodePart.directive
    });
    mockProcessingContext.directiveNode = node;

    vi.mocked(resolutionService.resolveNodes).mockResolvedValueOnce(command);
    vi.mocked(fileSystemService.executeCommand).mockResolvedValue({ stdout: `${output}\n`, stderr: '' });

    await handler.execute(mockProcessingContext);

    expect(fileSystemService.executeCommand).toHaveBeenCalledWith(command, { cwd: '/test' });
    // Note: The handler removes the trailing newline from stdout
    expect(stateService.setTextVar).toHaveBeenCalledWith('multiLineOutput', output);
  });
  
  it('should handle nested variable references across multiple levels', async () => {
    const commandTemplateNodes: InterpolatableValue = [
      createTextNode('echo "Final: '), 
      { type: 'VariableReference', identifier: 'level2' } as VariableReferenceNode,
      createTextNode('"')
    ];
    const resolvedCommand = 'echo "Final: Level One and Level Two"';
    const finalOutput = 'Final: Level One and Level Two';
    const runDirectiveNodePart = createRunDirective(commandTemplateNodes);
    // Use createDirectiveNode with correct structure
    const node = createDirectiveNode('text', { 
      identifier: 'cmdOutputNested', 
      source: 'run', 
      run: runDirectiveNodePart.directive 
    });
    mockProcessingContext.directiveNode = node;

    vi.mocked(resolutionService.resolveNodes).mockResolvedValueOnce(resolvedCommand);
    vi.mocked(fileSystemService.executeCommand).mockResolvedValue({ stdout: `${finalOutput}\n`, stderr: '' });

    await handler.execute(mockProcessingContext);

    expect(resolutionService.resolveNodes).toHaveBeenCalledWith(commandTemplateNodes, expect.anything());
    expect(fileSystemService.executeCommand).toHaveBeenCalledWith(resolvedCommand, { cwd: '/test' });
    expect(stateService.setTextVar).toHaveBeenCalledWith('cmdOutputNested', finalOutput);
  });
}); 