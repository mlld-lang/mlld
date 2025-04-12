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
import { DirectiveError, DirectiveErrorCode, DirectiveErrorSeverity } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import type { DirectiveNode } from '@core/syntax/types/nodes.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { DirectiveContext } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import { exec } from 'child_process';
import { promisify } from 'util';
// Import the centralized syntax examples and helpers but don't use the problematic syntax-test-helpers
import { runDirectiveExamples } from '@core/syntax/index.js';
import { parse, ParseResult } from '@core/ast/index.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import {
  createValidationServiceMock,
  createStateServiceMock,
  createResolutionServiceMock,
  createFileSystemServiceMock,
  createDirectiveErrorMock,
} from '@tests/utils/mocks/serviceMocks.js';
import type { InterpolatableValue, TextNode, VariableReferenceNode } from '@core/syntax/types/nodes.js';
import type { Location, SourceLocation } from '@core/types/index.js';
import type { MockedFunction } from 'vitest';
import { 
  createRunDirective,
  createTextNode, 
  createVariableReferenceNode, 
  createLocation 
} from '@tests/utils/testFactories.js';
import { VariableType, CommandVariable, VariableOrigin } from '@core/types/variables.js';
import { tmpdir } from 'os'; // Import tmpdir
import { join } from 'path';   // Import join
import { randomBytes } from 'crypto'; // Import randomBytes

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
      const { parse } = await import('@core/ast'); // Corrected import
      const result: ParseResult = await parse(content, {
        trackLocations: true,
        validateNodes: true
      });
      if (!Array.isArray(result.ast)) {
        throw new Error('Parser did not return an array of nodes');
      }
      return result.ast as DirectiveNode[];
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
    const { parse } = await import('@core/ast'); // Corrected import
    const result = await parse(code, {
      trackLocations: true,
      validateNodes: true
    });
    
    const nodes = Array.isArray(result.ast) ? result.ast : [];
    
    if (nodes.length === 0 || nodes[0].type !== 'Directive') {
      throw new Error(`Failed to parse directive from code: ${code}`);
    }
    
    return nodes[0] as DirectiveNode;
  } catch (error) {
    console.error('Error creating directive node:', error);
    throw error;
  }
}

// Helper function to generate a temporary file path (moved from handler for test use)
function getTempFilePath(language?: string): string {
  const tempDir = tmpdir();
  const randomName = randomBytes(8).toString('hex');
  const extension = language ? `.${language}` : '.sh'; // Default to .sh if no language
  return join(tempDir, `meld-script-${randomName}${extension}`);
}

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
    
    // --- Configure Mocks Explicitly --- 
    vi.mocked(validationService.validate).mockResolvedValue(undefined);

    clonedState = {
      setTextVar: vi.fn(),
      clone: vi.fn(),
      isTransformationEnabled: vi.fn().mockReturnValue(false),
      transformNode: vi.fn()
    };
    vi.mocked(stateService.clone).mockReturnValue(clonedState);
    vi.mocked(stateService.isTransformationEnabled).mockReturnValue(false);
    // Mock getCommandVar needed for runDefined tests
    vi.mocked(stateService.getCommandVar).mockImplementation(
        (name: string): CommandVariable | undefined => {
            if (name === 'greet') {
                // Construct SourceLocation correctly - filePath, line, column required
                const definedAtLocation: SourceLocation = { 
                    filePath: 'mock.meld', line: 1, column: 1 
                };
                return {
                    type: VariableType.COMMAND,
                    name: 'greet',
                    value: {
                        type: 'basic',
                        commandTemplate: 'echo "Hello there!"',
                        name: 'greet',
                        parameters: [],
                        isMultiline: false
                    },
                    // Use valid SourceLocation for definedAt
                    metadata: {
                        definedAt: definedAtLocation, 
                        createdAt: Date.now(), 
                        modifiedAt: Date.now(), 
                        origin: VariableOrigin.DIRECT_DEFINITION
                    }
                };
            }
            return undefined;
        }
    );

    vi.mocked(fileSystemService.getCwd).mockReturnValue('/workspace');
    // Ensure executeCommand, writeFile, and ensureDir are mocked
    vi.mocked(fileSystemService.executeCommand).mockResolvedValue({ stdout: 'default stdout', stderr: '' });
    vi.mocked(fileSystemService.writeFile).mockResolvedValue(undefined);
    // Note: deleteFile is not on IFileSystemService, handler should manage temp file lifecycle
    // If the handler uses ensureDir, mock it:
    // vi.mocked(fileSystemService.ensureDir).mockResolvedValue(undefined);

    // Mock primary resolution methods used by the handler
    vi.mocked(resolutionService.resolveNodes).mockImplementation(async (nodes: InterpolatableValue, context: any): Promise<string> => {
        let commandString = '';
        for (const node of nodes) {
            // Use type guards for safer access
            if (node.type === 'Text') {
                commandString += node.content;
            } else if (node.type === 'VariableReference') {
                // Simple mock for basic tests
                let varValue = node.identifier === 'inputVar' ? 'ResolvedParamValue' : `resolved_${node.identifier}`; 
                if (node.identifier === 'missingVar') throw new Error('Variable not found by mock');
                commandString += varValue ?? ''; 
            }
        }
        return commandString; 
    });
    // Mock resolveInContext as the general fallback/entry point
    vi.mocked(resolutionService.resolveInContext).mockImplementation(async (value: any, context: any): Promise<string> => {
        if (typeof value === 'string') {
            if (value.includes('{{inputVar}}')) return 'ResolvedParamValue'; 
            if (value.includes('{{missingVar}}')) throw new Error('Variable not found by mock');
            // Simple fallback for other strings
            return value.replace(/{{(.*?)}}/g, (match, p1) => `resolved_${p1}`);
        } else if (Array.isArray(value)) { // Handle InterpolatableValue directly if passed
            return await resolutionService.resolveNodes(value as InterpolatableValue, context);
        } else if (value && typeof value === 'object' && value.type === 'VariableReference') {
            // Refined check for VariableReference node
            const varNode = value as VariableReferenceNode;
            if (varNode.identifier === 'inputVar') return 'ResolvedParamValue';
            if (varNode.identifier === 'missingVar') throw new Error('Variable not found by mock');
            return `resolved_${varNode.identifier}`;
        }
        // Handle StructuredPath if needed, basic mock for now
        return typeof value === 'string' ? value : (value as any).raw || 'resolved-structured-path';
    });
    // Remove outdated mock for resolve
    // vi.mocked(resolutionService.resolve).mockImplementation(...);

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
      const node = createRunDirective('echo test', createLocation());
      const context = { 
        currentFilePath: 'test.meld', 
        state: stateService,
        workingDirectory: '/workspace'
      };
      
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: 'command output',
        stderr: ''
      });

      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('echo test');
      
      await handler.execute(node, context);
      
      expect(fileSystemService.executeCommand).toHaveBeenCalledWith('echo test', {
        cwd: '/workspace'
      });
    });

    it('should handle commands with variables', async () => {
      const location = createLocation();
      const commandNodes: InterpolatableValue = [ 
          createTextNode('echo ', location), 
          createVariableReferenceNode('greeting', VariableType.TEXT, undefined, location), 
          createTextNode(' ', location), 
          createVariableReferenceNode('name', VariableType.TEXT, undefined, location)
      ];
      const node = createRunDirective(commandNodes, location);
      const context = { 
        currentFilePath: 'test.meld', 
        state: stateService,
        workingDirectory: '/workspace'
      };
      
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('echo Hello World');
      
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: 'Hello World',
        stderr: ''
      });
      
      await handler.execute(node, context);
      
      expect(fileSystemService.executeCommand).toHaveBeenCalledWith('echo Hello World', {
        cwd: '/workspace'
      });
    });

    it('should handle custom output variable', async () => {
      const node = createRunDirective('echo test', createLocation(), 'runCommand', undefined, undefined, 'custom_output');
      const context = { 
        currentFilePath: 'test.meld', 
        state: stateService,
        workingDirectory: '/workspace'
      };
      
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('echo test');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: 'command output',
        stderr: ''
      });
      
      await handler.execute(node, context);
      
      expect(clonedState.setTextVar).toHaveBeenCalledWith('custom_output', 'command output');
    });

    it.skip('should handle commands with variables', async () => {
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
      
      expect(resolutionService.resolveNodes).toHaveBeenCalled(); 

      // Just verify that the command is executed correctly
      expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
        'echo Hello, World!',
        expect.objectContaining({ cwd: '/workspace' })
      );
    });

    it('should handle custom output variable', async () => {
      // Arrange
      const node = createRunDirective('echo test', createLocation(), 'runCommand', undefined, undefined, 'custom_output');
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
       const node = createRunDirective(commandRefObject, createLocation(), 'runDefined');
       const context = { 
         currentFilePath: 'test.meld', 
         state: stateService,
         workingDirectory: '/workspace'
       };
       
       // Fix: Mock getCommandVar *directly on stateService* - ensure mock returns CommandVariable structure
       const greetCmdDef: CommandVariable = {
         type: VariableType.COMMAND,
         name: 'greet',
         value: {
           type: 'basic',
           commandTemplate: 'echo "Hello there!"',
           name: 'greet',
           parameters: [],
           isMultiline: false
         }
       };
       // Fix: Ensure mock implementation returns the correct type and cast it
       (stateService.getCommandVar as MockedFunction<any>).mockImplementation(
         (name: string): CommandVariable | undefined => name === 'greet' ? greetCmdDef : undefined
       );
       
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

  describe('runCode/runCodeParams execution', () => {
    it('should execute script content without language as shell commands', async () => {
      const location = createLocation();
      const scriptContent: InterpolatableValue = [ createTextNode('echo "Inline script ran"', location) ];
      const node = createRunDirective(scriptContent, location, 'runCode');
      const context: DirectiveContext = { 
        currentFilePath: 'test.meld', 
        state: stateService,
        workingDirectory: '/workspace'
      };
      
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: 'Inline script ran', stderr: ''
      });
      
      const result = await handler.execute(node, context);
      
      expect(resolutionService.resolveNodes).toHaveBeenCalledWith(scriptContent, expect.any(Object));
      expect(fileSystemService.executeCommand).toHaveBeenCalledWith('echo "Inline script ran"', { cwd: '/workspace' });
      expect(clonedState.setTextVar).toHaveBeenCalledWith('stdout', 'Inline script ran');
    });

    it('should execute script content with specified language using a temp file', async () => {
      const location = createLocation();
      const scriptContent: InterpolatableValue = [ createTextNode('print("Python script ran")', location) ];
      const node = createRunDirective(scriptContent, location, 'runCode', undefined, 'python');
       const context: DirectiveContext = { 
        currentFilePath: 'test.meld', 
        state: stateService,
        workingDirectory: '/workspace'
      };
      
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: 'Python script ran', stderr: ''
      });
      vi.mocked(fileSystemService.writeFile).mockResolvedValue(undefined);
      
      const result = await handler.execute(node, context);
      
      expect(resolutionService.resolveNodes).toHaveBeenCalledWith(scriptContent, expect.any(Object));
      expect(fileSystemService.writeFile).toHaveBeenCalledWith(expect.stringContaining('.py'), 'print("Python script ran")');
      expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
        expect.stringMatching(/^python .*meld-script-.*\.py $/), // Check command structure
        { cwd: '/workspace' }
      );
      expect(clonedState.setTextVar).toHaveBeenCalledWith('stdout', 'Python script ran');
    });

    it('should resolve and pass parameters to a language script', async () => {
      const location = createLocation();
      const scriptContent: InterpolatableValue = [ createTextNode('import sys\nprint(f"Input: {sys.argv[1]}")', location) ];
      const params: VariableReferenceNode[] = [ createVariableReferenceNode('inputVar', VariableType.TEXT, undefined, location) ];
      const node = createRunDirective(scriptContent, location, 'runCodeParams', params, 'python');
      const context: DirectiveContext = { 
        currentFilePath: 'test.meld', 
        state: stateService,
        workingDirectory: '/workspace'
      };

      // Mock variable resolution for the parameter - use resolveInContext
      vi.mocked(resolutionService.resolveInContext).mockImplementation(async (value, context) => {
          if (value && typeof value === 'object' && value.type === 'VariableReference' && value.identifier === 'inputVar') return 'TestParameter';
          return String(value); // Fallback
      });

      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: 'Input: TestParameter', stderr: ''
      });
      vi.mocked(fileSystemService.writeFile).mockResolvedValue(undefined);
      
      const result = await handler.execute(node, context);
      
      // Assertion might change depending on how parameters are resolved now
      // Expect resolveInContext to be called with the parameter node
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(params[0], expect.any(Object)); 
      expect(fileSystemService.writeFile).toHaveBeenCalledWith(expect.stringContaining('.py'), 'import sys\nprint(f"Input: {sys.argv[1]}")');
      expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
        expect.stringMatching(/^python .*meld-script-.*\.py "TestParameter"$/), // Check command structure with param
        { cwd: '/workspace' }
      );
      expect(clonedState.setTextVar).toHaveBeenCalledWith('stdout', 'Input: TestParameter');
    });
     
    it('should handle parameter resolution failure in strict mode', async () => {
        const location = createLocation();
        const scriptContent: InterpolatableValue = [ createTextNode('print("hello")', location) ];
        const params: VariableReferenceNode[] = [ createVariableReferenceNode('missingVar', VariableType.TEXT, undefined, location) ];
        const node = createRunDirective(scriptContent, location, 'runCodeParams', params, 'python');
        const context: DirectiveContext = { 
            currentFilePath: 'test.meld', 
            state: stateService,
            workingDirectory: '/workspace'
        };

        // Mock appropriate resolution method to throw (resolveInContext)
        vi.mocked(resolutionService.resolveInContext).mockRejectedValue(new Error('Variable not found'));

        // Expect DirectiveError wrapping the resolution error
        await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError); 
        // Assertion might change depending on which resolution method is called
        expect(resolutionService.resolveInContext).toHaveBeenCalledWith(params[0], expect.any(Object));
        expect(fileSystemService.executeCommand).not.toHaveBeenCalled(); // Should not execute if resolution fails
    });
  });

  describe('error handling', () => {
    it('should handle validation errors', async () => {
      const node = createRunDirective('', createLocation());
      const context = { 
        currentFilePath: 'test.meld', 
        state: stateService,
        workingDirectory: '/workspace'
      };
      
      vi.mocked(validationService.validate).mockRejectedValue(
        new DirectiveError(
          'Invalid command',
          'run',
          DirectiveErrorCode.VALIDATION_FAILED
        )
      );
      
      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
    });

    it('should handle resolution errors', async () => {
      const location = createLocation();
      const commandNodes: InterpolatableValue = [ createVariableReferenceNode('undefined_var', VariableType.TEXT, undefined, location) ];
      const node = createRunDirective(commandNodes, location);
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
      const node = createRunDirective('invalid-command', createLocation());
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
      const node = createRunDirective(commandRefObject, createLocation(), 'runDefined');
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
          const err = error as any; 
          expect(err).toBeInstanceOf(Error); 
          expect(err instanceof DirectiveError || err.constructor.name === 'DirectiveError').toBe(true);
          expect(err.message).toContain('Command definition \'undefinedCommand\' not found');
      }
      // Check getCommandVar on the original stateService mock
      expect(stateService.getCommandVar).toHaveBeenCalledWith('undefinedCommand'); 
    });
  });

  describe('output handling', () => {
    it('should handle stdout and stderr', async () => {
      const node = createRunDirective('echo "Out" && >&2 echo "Err"', createLocation());
      const context = { 
        currentFilePath: 'test.meld', 
        state: stateService,
        workingDirectory: '/workspace'
      };
      
      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('echo Out && >&2 echo Err');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: 'Out',
        stderr: 'Err'
      });
      
      await handler.execute(node, context);
      
      expect(clonedState.setTextVar).toHaveBeenCalledWith('stdout', 'Out');
      expect(clonedState.setTextVar).toHaveBeenCalledWith('stderr', 'Err');
    });

    it('should handle transformation mode', async () => {
      const node = createRunDirective('echo "Success"', createLocation());
      const context = { 
        currentFilePath: 'test.meld', 
        state: stateService,
        workingDirectory: '/workspace'
      };
      
      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('echo Success');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: 'transformed output',
        stderr: ''
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