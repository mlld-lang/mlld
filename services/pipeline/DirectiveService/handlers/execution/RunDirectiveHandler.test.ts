// Mock the logger before any imports
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

vi.mock('../../../../core/utils/logger', () => ({
  directiveLogger: mockLogger
}));

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RunDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import type { DirectiveNode } from '@core/syntax/types.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { DirectiveContext } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import { exec } from 'child_process';
import { promisify } from 'util';
// Import the centralized syntax examples and helpers but don't use the problematic syntax-test-helpers
import { runDirectiveExamples } from '@core/syntax/index.js';
import { parse } from '@core/ast/index.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import {
  createValidationServiceMock,
  createStateServiceMock,
  createResolutionServiceMock,
  createFileSystemServiceMock,
  createDirectiveErrorMock
} from '@tests/utils/mocks/serviceMocks.js';
import type { InterpolatableValue, TextNode, VariableReferenceNode } from '@core/syntax/types/nodes.js';
import { 
  createRunDirective,
  createTextNode, 
  createVariableReferenceNode, 
  createLocation 
} from '@tests/utils/testFactories.js';
import { VariableType } from '@core/types/variables.js';

// Mock child_process
vi.mock('child_process', () => ({
  exec: vi.fn()
}));

/**
 * RunDirectiveHandler Test Status
 * ----------------------------------------
 * 
 * MIGRATION STATUS: Complete
 * 
 * This test file has been fully migrated to use:
 * - TestContextDI for container management
 * - Standardized mock factories with vitest-mock-extended
 * - Centralized syntax examples
 * 
 * COMPLETED:
 * - Using TestContextDI for test environment setup
 * - Using standardized mock factories for service mocks
 * - Using a hybrid approach with direct handler instantiation
 * - Added proper cleanup for container management
 * - Enhanced with centralized syntax examples
 * - No longer relies on syntax-test-helpers
 */

// Direct usage of meld-ast instead of mock factories
const createRealParserService = () => {
  // Create the parse function
  const parseFunction = async (content: string): Promise<DirectiveNode[]> => {
    // Use the real meld-ast parser with dynamic import 
    try {
      return await parse(content, {
        trackLocations: true,
        validateNodes: true
      });
    } catch (error) {
      console.error('Parser error:', error);
      throw error;
    }
  };

  return {
    parse: parseFunction
  };
};

// Helper to create a DirectiveNode directly from example code
async function createDirectiveNode(code: string): Promise<DirectiveNode> {
  try {
    const result = await parse(code, {
      trackLocations: true,
      validateNodes: true
    });
    
    // The parse function might return an AST property
    const nodes = Array.isArray(result) ? result : (result.ast || []);
    
    if (nodes.length === 0 || nodes[0].type !== 'Directive') {
      throw new Error(`Failed to parse directive from code: ${code}`);
    }
    
    return nodes[0] as DirectiveNode;
  } catch (error) {
    console.error('Error creating directive node:', error);
    throw error;
  }
}

// Helper to create a run directive node directly without parsing
const createRunDirectiveNode = (command: string, outputVar?: string): DirectiveNode => {
  return {
    type: 'Directive',
    directive: {
      kind: 'run',
      command,
      output: outputVar
    }
  } as DirectiveNode;
};

describe('RunDirectiveHandler', () => {
  let handler: RunDirectiveHandler;
  let validationService: ReturnType<typeof createValidationServiceMock>;
  let stateService: ReturnType<typeof createStateServiceMock>;
  let resolutionService: ReturnType<typeof createResolutionServiceMock>;
  let fileSystemService: ReturnType<typeof createFileSystemServiceMock>;
  let clonedState: any;
  let context: TestContextDI;

  beforeEach(async () => {
    // Create context with isolated container
    context = TestContextDI.createIsolated();
    await context.initialize();
    
    // Create mocks using standardized factories
    validationService = createValidationServiceMock();
    stateService = createStateServiceMock();
    resolutionService = createResolutionServiceMock();
    fileSystemService = createFileSystemServiceMock();
    
    // Configure validation service
    validationService.registerValidator = vi.fn();
    validationService.removeValidator = vi.fn();
    validationService.hasValidator = vi.fn();
    validationService.getRegisteredDirectiveKinds = vi.fn();

    clonedState = {
      setTextVar: vi.fn(),
      clone: vi.fn(),
      isTransformationEnabled: vi.fn().mockReturnValue(false),
      transformNode: vi.fn()
    };

    // Configure state service
    stateService.clone.mockReturnValue(clonedState);
    stateService.isTransformationEnabled.mockReturnValue(false);

    // Configure file system service
    fileSystemService.getCwd.mockReturnValue('/workspace');
    fileSystemService.dirname.mockReturnValue('/workspace');
    fileSystemService.join.mockImplementation((...args) => args.join('/'));
    fileSystemService.normalize.mockImplementation(path => path);

    // Mock resolveNodes (keep simplified version for now)
    resolutionService.resolveNodes.mockImplementation(async (nodes: InterpolatableValue, context: any): Promise<string> => {
        let commandString = '';
        for (const node of nodes) {
            if (node.type === 'Text') {
                commandString += node.content;
            } else if (node.type === 'VariableReference') {
                let varValue: string | undefined = undefined;
                if (node.identifier === 'greeting') varValue = 'Hello'; 
                else if (node.identifier === 'name') varValue = 'World';
                commandString += varValue ?? ''; 
            }
        }
        return commandString; 
    });

    // Register mocks (still needed for potential internal DI use within mocks)
    context.registerMock('IValidationService', validationService);
    context.registerMock('IStateService', stateService);
    context.registerMock('IResolutionService', resolutionService);
    context.registerMock('IFileSystemService', fileSystemService);

    // Create handler instance DIRECTLY 
    handler = new RunDirectiveHandler(
      validationService,
      resolutionService,
      stateService,
      fileSystemService
    );
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  describe('basic command execution', () => {
    it('should execute simple commands', async () => {
      const node = createRunDirective('echo test');
      const context = { 
        currentFilePath: 'test.meld', 
        state: stateService,
        workingDirectory: '/workspace'
      };
      
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: 'command output',
        stderr: '',
        exitCode: 0
      });

      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('echo test');
      
      await handler.execute(node, context);
      
      expect(fileSystemService.executeCommand).toHaveBeenCalledWith('echo test', {
        cwd: '/workspace'
      });
    });

    it('should handle commands with variables', async () => {
      const commandNodes: InterpolatableValue = [ createTextNode('echo '), createVariableReferenceNode('greeting', VariableType.TEXT), createTextNode(' '), createVariableReferenceNode('name', VariableType.TEXT) ];
      const node = createRunDirective(commandNodes);
      const context = { 
        currentFilePath: 'test.meld', 
        state: stateService,
        workingDirectory: '/workspace'
      };
      
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('echo Hello World');
      
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: 'Hello World',
        stderr: '',
        exitCode: 0
      });
      
      await handler.execute(node, context);
      
      expect(fileSystemService.executeCommand).toHaveBeenCalledWith('echo Hello World', {
        cwd: '/workspace'
      });
    });

    it('should handle custom output variable', async () => {
      const node = createRunDirective('echo test', undefined, 'runCommand', undefined, undefined, 'custom_output');
      const context = { 
        currentFilePath: 'test.meld', 
        state: stateService,
        workingDirectory: '/workspace'
      };
      
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('echo test');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: 'command output',
        stderr: '',
        exitCode: 0
      });
      
      await handler.execute(node, context);
      
      expect(clonedState.setTextVar).toHaveBeenCalledWith('custom_output', 'command output');
    });

    it('should handle commands with variables', async () => {
      // Create node directly with the correct syntax
      const node = await createDirectiveNode('@run [echo {{greeting}}, {{name}}!]');
      const context = { currentFilePath: 'test.meld', state: stateService };

      const clonedState = {
        ...stateService,
        clone: vi.fn().mockReturnThis(),
        setTextVar: vi.fn(),
        getTextVar: vi.fn(),
        isTransformationEnabled: vi.fn().mockReturnValue(false)
      };

      // Setup mocks to return values for greeting and name
      clonedState.getTextVar.mockImplementation((key) => {
        if (key === 'greeting') return 'Hello';
        if (key === 'name') return 'World';
        return undefined;
      });

      vi.mocked(stateService.clone).mockReturnValue(clonedState);
      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('echo Hello, World!');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: 'test output',
        stderr: ''
      });

      const result = await handler.execute(node, context);

      // Just verify that the command is executed correctly
      expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
        'echo Hello, World!',
        expect.objectContaining({ cwd: '/workspace' })
      );
    });

    it('should handle custom output variable', async () => {
      // Arrange
      const node = createRunDirective('echo test', undefined, 'runCommand', undefined, undefined, 'custom_output');
      const context = { 
        currentFilePath: 'test.meld', 
        state: stateService,
        workingDirectory: '/workspace'
      };
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({ stdout: 'command output', stderr: '' });
      
      // Execute the directive
      await handler.execute(node, context);
      
      // Verify the output was captured in the variable
      expect(clonedState.setTextVar).toHaveBeenCalledWith('custom_output', 'command output');
    });

    it('should properly expand command references with $', async () => {
       const commandRefObject = { name: 'greet', args: [], raw: '$greet' };
       const node = createRunDirective(commandRefObject, undefined, 'runDefined'); 
       const context = { 
         currentFilePath: 'test.meld', 
         state: stateService,
         workingDirectory: '/workspace'
       };
       
       // Mock getCommandVar *directly on stateService*
       const greetCmdDef = { commandTemplate: 'echo "Hello there!"' }; 
       stateService.getCommandVar.mockImplementation((name: string) => name === 'greet' ? { value: greetCmdDef } : undefined);
       
       vi.mocked(fileSystemService.executeCommand).mockResolvedValue({ stdout: 'Hello there!', stderr: '' });
       vi.mocked(validationService.validate).mockResolvedValue(undefined);
       
       await handler.execute(node, context);
       
       // Check getCommandVar on the original stateService mock
       expect(stateService.getCommandVar).toHaveBeenCalledWith('greet'); 
       
       expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
         'echo "Hello there!"', 
         expect.objectContaining({ cwd: '/workspace' })
       );
       
       expect(clonedState.setTextVar).toHaveBeenCalledWith('stdout', 'Hello there!');
    });
  });

  describe('error handling', () => {
    it('should handle validation errors', async () => {
      const node = createRunDirective('');
      const context = { 
        currentFilePath: 'test.meld', 
        state: stateService,
        workingDirectory: '/workspace'
      };
      
      vi.mocked(validationService.validate).mockRejectedValue(
        new DirectiveError(
          'Invalid command',
          DirectiveErrorCode.InvalidCommand,
          ErrorSeverity.Error
        )
      );
      
      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
    });

    it('should handle resolution errors', async () => {
      const commandNodes: InterpolatableValue = [ createVariableReferenceNode('undefined_var', VariableType.TEXT) ];
      const node = createRunDirective(commandNodes);
      const context = { 
        currentFilePath: 'test.meld', 
        state: stateService,
        workingDirectory: '/workspace'
      };
      
      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockRejectedValue(
        new Error('Resolution failed')
      );
      
      await expect(handler.execute(node, context)).rejects.toThrow();
    });

    it('should handle command execution errors', async () => {
      const node = createRunDirective('invalid-command');
      const context = { 
        currentFilePath: 'test.meld', 
        state: stateService,
        workingDirectory: '/workspace'
      };
      
      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('invalid-command');
      vi.mocked(fileSystemService.executeCommand).mockRejectedValue(
        new Error('Execution failed')
      );
      
      await expect(handler.execute(node, context)).rejects.toThrow();
      expect(fileSystemService.executeCommand).toHaveBeenCalledWith('invalid-command', {
        cwd: '/workspace'
      });
    });

    it('should handle undefined command references', async () => {
      const commandRefObject = { name: 'undefinedCommand', args: [], raw: '$undefinedCommand' };
      const node = createRunDirective(commandRefObject, undefined, 'runDefined'); 
      const context = { 
        currentFilePath: 'test.meld', 
        state: stateService,
        workingDirectory: '/workspace'
      };

      // Mock getCommandVar *directly on stateService*
      stateService.getCommandVar.mockReturnValue(undefined); 
      
      // Execute the directive and expect a DirectiveError
      try {
         await handler.execute(node, context);
         throw new Error('Expected execute to throw'); 
      } catch (error) {
          expect(error).toBeInstanceOf(Error); 
          expect(error.constructor.name).toBe('DirectiveError');
          expect((error as Error).message).toContain('Command definition \'undefinedCommand\' not found');
      }
      // Check getCommandVar on the original stateService mock
      expect(stateService.getCommandVar).toHaveBeenCalledWith('undefinedCommand'); 
    });
  });

  describe('output handling', () => {
    it('should handle stdout and stderr', async () => {
      const node = createRunDirective('echo "Out" && >&2 echo "Err"');
      const context = { 
        currentFilePath: 'test.meld', 
        state: stateService,
        workingDirectory: '/workspace'
      };
      
      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('echo Out && >&2 echo Err');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: 'Out',
        stderr: 'Err',
        exitCode: 0
      });
      
      await handler.execute(node, context);
      
      expect(clonedState.setTextVar).toHaveBeenCalledWith('stdout', 'Out');
      expect(clonedState.setTextVar).toHaveBeenCalledWith('stderr', 'Err');
    });

    it('should handle transformation mode', async () => {
      const node = createRunDirective('echo "Success"');
      const context = { 
        currentFilePath: 'test.meld', 
        state: stateService,
        workingDirectory: '/workspace'
      };
      
      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('echo Success');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: 'transformed output',
        stderr: '',
        exitCode: 0
      });
      
      // In transformation mode, the result should contain the output
      vi.mocked(stateService.isTransformationEnabled).mockReturnValue(false);
      vi.mocked(clonedState.isTransformationEnabled).mockReturnValue(true);
      
      const result = await handler.execute(node, context);
      
      expect(result.replacement).toEqual(expect.objectContaining({
        type: 'Text',
        content: 'transformed output'
      }));
    });
  });
});