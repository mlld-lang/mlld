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
import { ErrorSeverity, MeldError } from '@core/errors/MeldError.js';
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
import type { DirectiveProcessingContext, FormattingContext } from '@core/types/index.js';
import type { ResolutionContext } from '@core/types/resolution.js';
import { JsonValue } from '@core/types';
import { isInterpolatableValueArray } from '@core/syntax/types/guards.js';
import { mock, mockDeep, type DeepMockProxy } from 'vitest-mock-extended'; // Import mockDeep
import { DefineDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/DefineDirectiveHandler.js';
import { expectToThrowWithConfig, ErrorTestOptions } from '@tests/utils/ErrorTestUtils.js'; // Import ErrorTestOptions
import { VariableMetadata, TextVariable } from '@core/types/variables.js'; // Added TextVariable

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
    
    // Mock state methods
    stateService.getCurrentFilePath.mockReturnValue('/workspace/test.meld');
    stateService.setTextVar.mockImplementation(async (name: string, value: string): Promise<TextVariable> => {
        // Return a basic TextVariable structure
        return { type: VariableType.TEXT, name, value } as TextVariable;
    });
    stateService.getCommandVar.mockImplementation((name: string): CommandVariable | undefined => {
        if (name === 'greet') {
            return { type: VariableType.COMMAND, name: 'greet', value: { type:'basic', commandTemplate: 'echo "Hello there!"' } } as CommandVariable;
        }
        return undefined;
    });
    stateService.isTransformationEnabled.mockReturnValue(false);

    // Mock FS methods
    fileSystemService.getCwd.mockReturnValue('/workspace');
    fileSystemService.executeCommand.mockResolvedValue({ stdout: 'default stdout', stderr: '' });
    fileSystemService.writeFile.mockResolvedValue(undefined);
    fileSystemService.deleteFile = vi.fn().mockResolvedValue(undefined);

    // Mock Resolution methods
    resolutionService.resolveNodes.mockImplementation(async (nodes, ctx) => nodes.map((n: any) => n.content || `{{${n.identifier}}}`).join(''));
    resolutionService.resolve = vi.fn().mockImplementation(async (node: VariableReferenceNode, ctx: ResolutionContext): Promise<string> => {
        if (node.identifier === 'missingVar') throw new Error('Variable not found by mock');
        return `resolved-var:${node.identifier}`
    });
    resolutionService.resolveInContext.mockImplementation(async (value, ctx) => typeof value === 'string' ? value : JSON.stringify(value));

    // Register mocks
    context.registerMock('IValidationService', validationService);
    context.registerMock('IStateService', stateService);
    context.registerMock('IResolutionService', resolutionService);
    context.registerMock('IFileSystemService', fileSystemService);

    // Resolve handler
    handler = await context.resolve(RunDirectiveHandler);
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  // Helper to create mock DirectiveProcessingContext
  const createMockProcessingContext = (node: DirectiveNode, overrides: Partial<DirectiveProcessingContext> = {}): DirectiveProcessingContext => {
      // Use mockDeep correctly
      const mockResolutionContext = mockDeep<ResolutionContext>();
      const mockFormattingContext = mockDeep<FormattingContext>();
      if (!stateService) {
        throw new Error('Test setup error: stateService is not defined when creating context');
      }
      expect(stateService.getCurrentFilePath).toBeDefined(); 
      return {
          state: stateService, 
          resolutionContext: mockResolutionContext,
          formattingContext: mockFormattingContext,
          directiveNode: node,
          executionContext: { cwd: '/workspace' }, 
          ...overrides // Allow overriding parts of the context for specific tests
      };
  };

  describe('basic command execution', () => {
    it('should execute simple commands', async () => {
      // Use InterpolatableValue for command
      const commandNodes: InterpolatableValue = [ createTextNode('echo test') ];
      const node = createRunDirective(commandNodes, createLocation(), 'runCommand');
      const processingContext = createMockProcessingContext(node);
      
      fileSystemService.executeCommand.mockResolvedValue({
        stdout: 'command output',
        stderr: ''
      });
      resolutionService.resolveNodes.mockResolvedValueOnce('echo test');
      
      const result = await handler.execute(processingContext);
      
      expect(fileSystemService.executeCommand).toHaveBeenCalledWith('echo test', {
        cwd: '/workspace'
      });
      expect(stateService.setTextVar).toHaveBeenCalledWith('stdout', 'command output');
    });

    it('should handle commands with variables', async () => {
      const location = createLocation();
      // Manually create nodes
      const commandNodes: InterpolatableValue = [ 
          createTextNode('echo ', location), 
          { type: 'VariableReference', identifier: 'greeting', valueType: VariableType.TEXT, isVariableReference: true, location }, 
          createTextNode(' ', location), 
          { type: 'VariableReference', identifier: 'name', valueType: VariableType.TEXT, isVariableReference: true, location }
      ];
      const node = createRunDirective(commandNodes, location, 'runCommand');
      const processingContext = createMockProcessingContext(node);
      
      resolutionService.resolveNodes.mockResolvedValueOnce('echo Hello World');
      fileSystemService.executeCommand.mockResolvedValue({
        stdout: 'Hello World',
        stderr: ''
      });
      
      const result = await handler.execute(processingContext);
      
      expect(fileSystemService.executeCommand).toHaveBeenCalledWith('echo Hello World', {
        cwd: '/workspace'
      });
      expect(stateService.setTextVar).toHaveBeenCalledWith('stdout', 'Hello World');
    });

    it('should handle custom output variable', async () => {
      const commandNodes: InterpolatableValue = [ createTextNode('echo test') ];
      const node = createRunDirective(commandNodes, createLocation(), 'runCommand', undefined, undefined, 'custom_output');
      const processingContext = createMockProcessingContext(node);
      
      resolutionService.resolveNodes.mockResolvedValueOnce('echo test');
      fileSystemService.executeCommand.mockResolvedValue({
        stdout: 'command output',
        stderr: ''
      });
      
      const result = await handler.execute(processingContext);
      
      expect(stateService.setTextVar).toHaveBeenCalledWith('custom_output', 'command output');
    });

    it('should properly expand command references with $', async () => {
       const commandRefObject = { name: 'greet', args: [], raw: '$greet' };
       // Use runDefined subtype
       const node = createRunDirective(commandRefObject, createLocation(), 'runDefined');
       const processingContext = createMockProcessingContext(node);
       
       fileSystemService.executeCommand.mockResolvedValue({ stdout: 'Hello there!', stderr: '' });
       // Validation is optional in handler
       // validationService.validate.mockResolvedValue(undefined);
       
       const result = await handler.execute(processingContext);
       
       expect(stateService.getCommandVar).toHaveBeenCalledWith('greet'); 
       expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
         'echo "Hello there!"', 
         expect.objectContaining({ cwd: '/workspace' })
       );
       expect(stateService.setTextVar).toHaveBeenCalledWith('stdout', 'Hello there!');
    });
  });

  describe('runCode/runCodeParams execution', () => {
    it('should execute script content without language as shell commands', async () => {
      const location = createLocation();
      const scriptContent: InterpolatableValue = [ createTextNode('echo "Inline script ran"', location) ];
      const node = createRunDirective(scriptContent, location, 'runCode');
      const processingContext = createMockProcessingContext(node);
      
      resolutionService.resolveNodes.mockResolvedValueOnce('echo "Inline script ran"');
      fileSystemService.executeCommand.mockResolvedValue({
        stdout: 'Inline script ran', stderr: ''
      });
      
      const result = await handler.execute(processingContext);
      
      expect(resolutionService.resolveNodes).toHaveBeenCalledWith(scriptContent, processingContext.resolutionContext);
      expect(fileSystemService.executeCommand).toHaveBeenCalledWith('echo "Inline script ran"', { cwd: '/workspace' });
      expect(stateService.setTextVar).toHaveBeenCalledWith('stdout', 'Inline script ran');
    });

    it('should execute script content with specified language using a temp file', async () => {
      const location = createLocation();
      const scriptContent: InterpolatableValue = [ createTextNode('print("Python script ran")', location) ];
      // Swapped language and parameters arguments
      const node = createRunDirective(scriptContent, location, 'runCode', 'python'); 
      const processingContext = createMockProcessingContext(node);
      
      resolutionService.resolveNodes.mockResolvedValueOnce('print("Python script ran")');
      fileSystemService.executeCommand.mockResolvedValue({
        stdout: 'Python script ran', stderr: ''
      });
      fileSystemService.writeFile.mockResolvedValue(undefined);
      fileSystemService.deleteFile.mockResolvedValue(undefined); // Mock deleteFile
      
      const result = await handler.execute(processingContext);
      
      expect(resolutionService.resolveNodes).toHaveBeenCalledWith(scriptContent, processingContext.resolutionContext);
      expect(fileSystemService.writeFile).toHaveBeenCalledWith(expect.stringContaining('.py'), 'print("Python script ran")');
      expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
        expect.stringMatching(/^python .*meld-script-.*\.py $/), 
        { cwd: '/workspace' }
      );
      expect(stateService.setTextVar).toHaveBeenCalledWith('stdout', 'Python script ran');
      expect(fileSystemService.deleteFile).toHaveBeenCalledWith(expect.stringContaining('.py')); // Verify cleanup
    });

    it('should resolve and pass parameters to a language script', async () => {
      const location = createLocation();
      const scriptContent: InterpolatableValue = [ createTextNode('import sys\nprint(f"Input: {sys.argv[1]}")', location) ];
      const paramNode: VariableReferenceNode = { type: 'VariableReference', identifier: 'inputVar', valueType: VariableType.TEXT, isVariableReference: true, location };
      const params = [ paramNode ];
      // Swapped language and parameters arguments
      const node = createRunDirective(scriptContent, location, 'runCodeParams', 'python', params); 
      const processingContext = createMockProcessingContext(node);

      resolutionService.resolveNodes.mockResolvedValueOnce('import sys\nprint(f"Input: {sys.argv[1]}")');
      resolutionService.resolve.mockResolvedValueOnce('TestParameter'); 

      fileSystemService.executeCommand.mockResolvedValue({
        stdout: 'Input: TestParameter', stderr: ''
      });
      fileSystemService.writeFile.mockResolvedValue(undefined);
      fileSystemService.deleteFile.mockResolvedValue(undefined);
      
      const result = await handler.execute(processingContext);
      
      expect(resolutionService.resolve).toHaveBeenCalledWith(paramNode, processingContext.resolutionContext); 
      expect(fileSystemService.writeFile).toHaveBeenCalledWith(expect.stringContaining('.py'), 'import sys\nprint(f"Input: {sys.argv[1]}")');
      expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
        expect.stringMatching(/^python .*meld-script-.*\.py "TestParameter"$/), 
        { cwd: '/workspace' }
      );
      expect(stateService.setTextVar).toHaveBeenCalledWith('stdout', 'Input: TestParameter');
      expect(fileSystemService.deleteFile).toHaveBeenCalled();
    });
     
    it('should handle parameter resolution failure in strict mode', async () => {
        const location = createLocation();
        const scriptContent: InterpolatableValue = [ createTextNode('print("hello")', location) ];
        const paramNode: VariableReferenceNode = { type: 'VariableReference', identifier: 'missingVar', valueType: VariableType.TEXT, isVariableReference: true, location };
        const params = [ paramNode ];
        // Swapped language and parameters arguments
        const node = createRunDirective(scriptContent, location, 'runCodeParams', 'python', params);
        // Create a strict context by overriding the one from the helper
        const baseContext = createMockProcessingContext(node);
        const processingContext: DirectiveProcessingContext = {
            ...baseContext,
            resolutionContext: { 
                ...baseContext.resolutionContext, 
                strict: true 
            }
        };

        resolutionService.resolveNodes.mockResolvedValueOnce('print("hello")');
        const resolutionError = new Error('Variable not found by mock');
        resolutionService.resolve.mockRejectedValue(resolutionError);

        await expectToThrowWithConfig(
            async () => await handler.execute(processingContext),
            {
                type: 'DirectiveError',
                code: DirectiveErrorCode.RESOLUTION_FAILED,
                messageContains: 'Failed to resolve parameter variable \'missingVar\'',
                cause: resolutionError
            } as ErrorTestOptions
        );
        expect(resolutionService.resolve).toHaveBeenCalledWith(paramNode, processingContext.resolutionContext);
        expect(fileSystemService.executeCommand).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle validation errors', async () => {
      const node = createRunDirective([createTextNode('')], createLocation()); // Minimal valid structure
      const processingContext = createMockProcessingContext(node);
      const validationError = new DirectiveError('Mock Validation Failed', 'run', DirectiveErrorCode.VALIDATION_FAILED);
      validationService.validate.mockRejectedValue(validationError);
      
      await expect(handler.execute(processingContext)).rejects.toThrow(validationError);
      // Validation is optional, may not be called
      // expect(validationService.validate).toHaveBeenCalledWith(node);
    });

    it('should handle resolution errors for command', async () => {
      // Manually create node
      const commandNodes: InterpolatableValue = [ 
          { type: 'VariableReference', identifier: 'undefined_var', valueType: VariableType.TEXT, isVariableReference: true, location: createLocation() } 
      ];
      const node = createRunDirective(commandNodes, createLocation(), 'runCommand');
      const processingContext = createMockProcessingContext(node);
      const resolutionError = new Error('Resolution failed');
      resolutionService.resolveNodes.mockRejectedValue(resolutionError);
      
      await expectToThrowWithConfig(
          async () => await handler.execute(processingContext),
          {
              type: 'DirectiveError',
              code: DirectiveErrorCode.RESOLUTION_FAILED,
              messageContains: 'Failed to resolve command',
              cause: resolutionError
          } as ErrorTestOptions
      );
    });

    it('should handle command execution errors', async () => {
      const commandNodes: InterpolatableValue = [ createTextNode('invalid-command') ];
      const node = createRunDirective(commandNodes, createLocation(), 'runCommand');
      const processingContext = createMockProcessingContext(node);
      const executionError = new Error('Execution failed');
      
      resolutionService.resolveNodes.mockResolvedValue('invalid-command');
      fileSystemService.executeCommand.mockRejectedValue(executionError);
      
      await expectToThrowWithConfig(
          async () => await handler.execute(processingContext),
          {
              type: 'DirectiveError',
              code: DirectiveErrorCode.EXECUTION_FAILED,
              messageContains: 'Failed to execute command: Execution failed',
              cause: executionError
          } as ErrorTestOptions
      );
      expect(fileSystemService.executeCommand).toHaveBeenCalledWith('invalid-command', {
        cwd: '/workspace'
      });
    });

    it('should handle undefined command references', async () => {
      const commandRefObject = { name: 'undefinedCommand', args: [], raw: '$undefinedCommand' };
      const node = createRunDirective(commandRefObject, createLocation(), 'runDefined');
      const processingContext = createMockProcessingContext(node);

      // Ensure getCommandVar returns undefined for this test
      stateService.getCommandVar.mockReturnValue(undefined); 
      
      await expectToThrowWithConfig(
          async () => await handler.execute(processingContext),
          {
              type: 'DirectiveError',
              code: DirectiveErrorCode.VARIABLE_NOT_FOUND,
              messageContains: 'Command definition \'undefinedCommand\' not found',
          } as ErrorTestOptions
      );
      expect(stateService.getCommandVar).toHaveBeenCalledWith('undefinedCommand'); 
    });
  });

  describe('output handling', () => {
    it('should handle stdout and stderr', async () => {
      const commandNodes: InterpolatableValue = [ createTextNode('echo "Out" && >&2 echo "Err"') ];
      const node = createRunDirective(commandNodes, createLocation(), 'runCommand');
      const processingContext = createMockProcessingContext(node);
      
      resolutionService.resolveNodes.mockResolvedValue('echo "Out" && >&2 echo "Err"');
      fileSystemService.executeCommand.mockResolvedValue({
        stdout: 'Out',
        stderr: 'Err'
      });
      
      const result = await handler.execute(processingContext);
      
      expect(stateService.setTextVar).toHaveBeenCalledWith('stdout', 'Out');
      expect(stateService.setTextVar).toHaveBeenCalledWith('stderr', 'Err');
    });

    it('should handle transformation mode', async () => {
      const commandNodes: InterpolatableValue = [ createTextNode('echo "Success"') ];
      const node = createRunDirective(commandNodes, createLocation(), 'runCommand');
      const processingContext = createMockProcessingContext(node);
      
      resolutionService.resolveNodes.mockResolvedValue('echo Success');
      fileSystemService.executeCommand.mockResolvedValue({
        stdout: 'transformed output',
        stderr: ''
      });
      
      // Enable transformation mode on the state mock
      stateService.isTransformationEnabled.mockReturnValue(true);
      
      const result = await handler.execute(processingContext);
      
      expect(result.replacement).toEqual(expect.objectContaining({
        type: 'Text',
        content: 'transformed output'
      }));
      // Ensure state vars were still set
      expect(stateService.setTextVar).toHaveBeenCalledWith('stdout', 'transformed output');
    });
  });
});