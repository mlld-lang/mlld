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
import { mock, mockDeep, type DeepMockProxy } from 'vitest-mock-extended'; // Import mockDeep
import { RunDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.js';
import { DirectiveError, DirectiveErrorCode, DirectiveErrorSeverity } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import type { DirectiveNode, InterpolatableValue, TextNode, VariableReferenceNode } from '@core/syntax/types/nodes.js'; // Added DirectiveNode
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
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
import type { Location, SourceLocation } from '@core/types/index.js';
import type { MockedFunction } from 'vitest';
import { 
  createRunDirective,
  createTextNode, 
  createVariableReferenceNode, 
  createLocation 
} from '@tests/utils/testFactories.js';
import { VariableType, CommandVariable, VariableOrigin, TextVariable } from '@core/types/variables.js'; // Added TextVariable
import { tmpdir } from 'os'; // Import tmpdir
import { join } from 'path';   // Import join
import { randomBytes } from 'crypto'; // Import randomBytes
import type { DirectiveProcessingContext, FormattingContext } from '@core/types/index.js';
import type { ResolutionContext } from '@core/types/resolution.js';
import { JsonValue, Result, success } from '@core/types';
import { isInterpolatableValueArray } from '@core/syntax/types/guards.js';
import { DefineDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/DefineDirectiveHandler.js';
import { expectToThrowWithConfig, ErrorTestOptions } from '@tests/utils/ErrorTestUtils.js'; // Standardized casing
import { VariableMetadata } from '@core/types/variables.js'; // Added VariableMetadata
import { MeldResolutionError, FieldAccessError, PathValidationError } from '@core/errors'; // Added imports
import { MeldPath } from '@core/types'; // Added MeldPath import
import type { ValidatedResourcePath } from '@core/types/paths.js'; // Import ValidatedResourcePath
import type { Stats } from 'fs-extra'; // Import Stats
import { Field as AstField } from '@core/syntax/types/shared-types.js'; // Import AstField
import type { VariableResolutionTracker, ResolutionTrackingConfig } from '@tests/utils/debug/VariableResolutionTracker/index.js'; // Import tracker types
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem.js'; // Import IFileSystem

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

describe('RunDirectiveHandler', () => {
  let handler: RunDirectiveHandler;
  let validationService: ReturnType<typeof createValidationServiceMock>;
  let stateService: ReturnType<typeof createStateServiceMock>;
  let resolutionServiceMock: IResolutionService;
  let fileSystemServiceMock: IFileSystemService;
  let context: TestContextDI;

  beforeEach(async () => {
    context = TestContextDI.createIsolated();
    await context.initialize();
    
    validationService = createValidationServiceMock();
    stateService = createStateServiceMock(); 
    
    // Create complete mock object for IResolutionService manually
    resolutionServiceMock = {
      resolveNodes: vi.fn().mockImplementation(async (nodes, ctx) => nodes.map((n: any) => n.content || `{{${n.identifier}}}`).join('')),
      resolveInContext: vi.fn().mockImplementation(async (value, ctx) => {
          if (typeof value === 'object' && value?.type === 'VariableReference') {
              if (value.identifier === 'missingVar') throw new MeldResolutionError('Variable not found by mock', { code: 'VAR_NOT_FOUND' });
              return `resolved-var:${value.identifier}`;
          }
          return typeof value === 'string' ? value : JSON.stringify(value)
      }),
      resolveText: vi.fn().mockResolvedValue(''),
      resolveData: vi.fn().mockResolvedValue({}),
      resolvePath: vi.fn().mockResolvedValue({} as MeldPath),
      resolveCommand: vi.fn().mockResolvedValue(null),
      extractSection: vi.fn().mockResolvedValue(''),
      validateResolution: vi.fn().mockResolvedValue(undefined),
      resolveFieldAccess: vi.fn().mockImplementation(async (base, path, ctx) => success(base)), 
      getResolutionTracker: vi.fn().mockReturnValue(undefined), 
      resolveFile: vi.fn().mockResolvedValue(''), 
      resolveContent: vi.fn().mockResolvedValue(''), 
      detectCircularReferences: vi.fn().mockResolvedValue(undefined), 
      convertToFormattedString: vi.fn().mockResolvedValue(''), 
      enableResolutionTracking: vi.fn(), 
    };

    // Create complete mock object for IFileSystemService manually
    fileSystemServiceMock = {
      getCwd: vi.fn().mockReturnValue('/workspace'),
      executeCommand: vi.fn().mockResolvedValue({ stdout: 'default stdout', stderr: '' }),
      writeFile: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockResolvedValue(''), 
      exists: vi.fn().mockResolvedValue(true),
      mkdir: vi.fn().mockResolvedValue(undefined),
      ensureDir: vi.fn().mockResolvedValue(undefined),
      setFileSystem: vi.fn(),
      deleteFile: vi.fn().mockResolvedValue(undefined),
      stat: vi.fn().mockResolvedValue({ isFile: () => true, isDirectory: () => false } as Stats),
      isFile: vi.fn().mockResolvedValue(true),
      readDir: vi.fn().mockResolvedValue([]),
      isDirectory: vi.fn().mockResolvedValue(false),
      watch: vi.fn().mockImplementation(async function*() { yield { eventType: '', filename: ''} }),
      dirname: vi.fn().mockReturnValue('.'),
      getFileSystem: vi.fn().mockReturnValue({} as IFileSystem),
      fileExists: vi.fn().mockResolvedValue(true),
      resolvePath: vi.fn().mockImplementation(async (p) => p as string),
    };

    // Mock state methods
    stateService.getCurrentFilePath.mockReturnValue('/workspace/test.meld');
    stateService.setTextVar.mockImplementation(async (name: string, value: string): Promise<TextVariable> => {
        return { type: VariableType.TEXT, name, value } as TextVariable;
    }); 
    stateService.getCommandVar.mockImplementation((name: string): CommandVariable | undefined => {
        if (name === 'greet') {
            return { type: VariableType.COMMAND, name: 'greet', value: { type:'basic', commandTemplate: 'echo "Hello there!"' } } as CommandVariable;
        }
        return undefined;
    });
    stateService.isTransformationEnabled.mockReturnValue(false);

    // Register mocks
    context.registerMock('IValidationService', validationService);
    context.registerMock('IStateService', stateService);
    context.registerMock('IResolutionService', resolutionServiceMock as IResolutionService); 
    context.registerMock('IFileSystemService', fileSystemServiceMock as IFileSystemService); 

    // Resolve handler
    handler = await context.resolve(RunDirectiveHandler);
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  // Helper to create mock DirectiveProcessingContext
  const createMockProcessingContext = (node: DirectiveNode, overrides: Partial<DirectiveProcessingContext> = {}): DirectiveProcessingContext => {
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
          ...overrides 
      };
  };

  describe('basic command execution', () => {
    it('should execute simple commands', async () => {
      const commandNodes: InterpolatableValue = [ createTextNode('echo test') ];
      const node = createRunDirective(commandNodes, createLocation(), 'runCommand');
      const processingContext = createMockProcessingContext(node);
      
      vi.mocked(fileSystemServiceMock.executeCommand).mockImplementationOnce(async () => ({ stdout: 'command output', stderr: '' }));
      vi.mocked(resolutionServiceMock.resolveNodes).mockImplementationOnce(async () => 'echo test');
      
      const result = await handler.execute(processingContext);
      
      expect(fileSystemServiceMock.executeCommand).toHaveBeenCalledWith('echo test', {
        cwd: '/workspace'
      });
      expect(stateService.setTextVar).toHaveBeenCalledWith('stdout', 'command output');
    });

    it('should handle commands with variables', async () => {
      const location = createLocation();
      const commandNodes: InterpolatableValue = [ 
          createTextNode('echo ', location), 
          { type: 'VariableReference', identifier: 'greeting', valueType: VariableType.TEXT, isVariableReference: true, location }, 
          createTextNode(' ', location), 
          { type: 'VariableReference', identifier: 'name', valueType: VariableType.TEXT, isVariableReference: true, location }
      ];
      const node = createRunDirective(commandNodes, location, 'runCommand');
      const processingContext = createMockProcessingContext(node);
      
      vi.mocked(resolutionServiceMock.resolveNodes).mockImplementationOnce(async () => 'echo Hello World');
      vi.mocked(fileSystemServiceMock.executeCommand).mockImplementationOnce(async () => ({ stdout: 'Hello World', stderr: '' }));
      
      const result = await handler.execute(processingContext);
      
      expect(fileSystemServiceMock.executeCommand).toHaveBeenCalledWith('echo Hello World', {
        cwd: '/workspace'
      });
      expect(stateService.setTextVar).toHaveBeenCalledWith('stdout', 'Hello World');
    });

    it('should handle custom output variable', async () => {
      const commandNodes: InterpolatableValue = [ createTextNode('echo test') ];
      const node = createRunDirective(commandNodes, createLocation(), 'runCommand', undefined, undefined, 'custom_output');
      const processingContext = createMockProcessingContext(node);
      
      vi.mocked(resolutionServiceMock.resolveNodes).mockImplementationOnce(async () => 'echo test');
      vi.mocked(fileSystemServiceMock.executeCommand).mockImplementationOnce(async () => ({ stdout: 'command output', stderr: '' }));
      
      const result = await handler.execute(processingContext);
      
      expect(stateService.setTextVar).toHaveBeenCalledWith('custom_output', 'command output');
    });

    it('should properly expand command references with $', async () => {
       const commandRefObject = { name: 'greet', args: [], raw: '$greet' };
       const node = createRunDirective(commandRefObject, createLocation(), 'runDefined');
       const processingContext = createMockProcessingContext(node);
       
       vi.mocked(fileSystemServiceMock.executeCommand).mockImplementationOnce(async () => ({ stdout: 'Hello there!', stderr: '' }));
       
       const result = await handler.execute(processingContext);
       
       expect(stateService.getCommandVar).toHaveBeenCalledWith('greet'); 
       expect(fileSystemServiceMock.executeCommand).toHaveBeenCalledWith(
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
      
      vi.mocked(resolutionServiceMock.resolveNodes).mockImplementationOnce(async () => 'echo "Inline script ran"');
      vi.mocked(fileSystemServiceMock.executeCommand).mockImplementationOnce(async () => ({ stdout: 'Inline script ran', stderr: '' }));
      
      const result = await handler.execute(processingContext);
      
      expect(resolutionServiceMock.resolveNodes).toHaveBeenCalledWith(scriptContent, processingContext.resolutionContext);
      expect(fileSystemServiceMock.executeCommand).toHaveBeenCalledWith('echo "Inline script ran"', { cwd: '/workspace' });
      expect(stateService.setTextVar).toHaveBeenCalledWith('stdout', 'Inline script ran');
    });

    it('should execute script content with specified language using a temp file', async () => {
      const location = createLocation();
      const scriptContent: InterpolatableValue = [ createTextNode('print("Python script ran")', location) ];
      const node = createRunDirective(scriptContent, location, 'runCode', 'python'); 
      const processingContext = createMockProcessingContext(node);
      
      vi.mocked(resolutionServiceMock.resolveNodes).mockImplementationOnce(async () => 'print("Python script ran")');
      vi.mocked(fileSystemServiceMock.executeCommand).mockImplementationOnce(async () => ({ stdout: 'Python script ran', stderr: '' }));
      vi.mocked(fileSystemServiceMock.writeFile).mockImplementationOnce(async () => undefined);
      
      const result = await handler.execute(processingContext);
      
      expect(resolutionServiceMock.resolveNodes).toHaveBeenCalledWith(scriptContent, processingContext.resolutionContext);
      expect(fileSystemServiceMock.writeFile).toHaveBeenCalledWith(expect.stringContaining('.py'), 'print("Python script ran")');
      expect(fileSystemServiceMock.executeCommand).toHaveBeenCalledWith(
        expect.stringMatching(/^python .*?meld-script-.*?\.python$/),
        { cwd: '/workspace' }
      );
      expect(stateService.setTextVar).toHaveBeenCalledWith('stdout', 'Python script ran');
      expect(fileSystemServiceMock.deleteFile).toHaveBeenCalledWith(expect.stringContaining('.py'));
    });

    it('should resolve and pass parameters to a language script', async () => {
      const location = createLocation();
      const scriptContent: InterpolatableValue = [ createTextNode('import sys\nprint(f"Input: {sys.argv[1]}")', location) ];
      const paramNode: VariableReferenceNode = { type: 'VariableReference', identifier: 'inputVar', valueType: VariableType.TEXT, isVariableReference: true, location };
      const params = [ paramNode ];
      const node = createRunDirective(scriptContent, location, 'runCodeParams', 'python', params);
      const processingContext = createMockProcessingContext(node);

      vi.mocked(resolutionServiceMock.resolveNodes).mockImplementationOnce(async () => 'import sys\nprint(f"Input: {sys.argv[1]}")');
      vi.mocked(resolutionServiceMock.resolveInContext).mockImplementationOnce(async (value, ctx) => { 
          if(typeof value === 'object' && value?.identifier === 'inputVar') return 'TestParameter'; 
          return 'fallback';
      }); 

      vi.mocked(fileSystemServiceMock.executeCommand).mockImplementationOnce(async () => ({ stdout: 'Input: TestParameter', stderr: '' }));
      vi.mocked(fileSystemServiceMock.writeFile).mockImplementationOnce(async () => undefined);
      vi.mocked(fileSystemServiceMock.deleteFile).mockResolvedValue(undefined);
      
      const result = await handler.execute(processingContext);
      
      expect(resolutionServiceMock.resolveInContext).toHaveBeenCalledWith(paramNode, processingContext.resolutionContext); 
      expect(fileSystemServiceMock.writeFile).toHaveBeenCalledWith(expect.stringContaining('.py'), 'import sys\nprint(f"Input: {sys.argv[1]}")');
      expect(fileSystemServiceMock.executeCommand).toHaveBeenCalledWith(
        expect.stringMatching(/^python .*?meld-script-.*?\.python \"TestParameter\"$/),
        { cwd: '/workspace' }
      );
      expect(stateService.setTextVar).toHaveBeenCalledWith('stdout', 'Input: TestParameter');
      expect(fileSystemServiceMock.deleteFile).toHaveBeenCalled();
    });
     
    it('should handle parameter resolution failure in strict mode', async () => {
        const location = createLocation();
        const scriptContent: InterpolatableValue = [ createTextNode('print("hello")', location) ];
        const paramNode: VariableReferenceNode = { type: 'VariableReference', identifier: 'missingVar', valueType: VariableType.TEXT, isVariableReference: true, location };
        const params = [ paramNode ];
        const node = createRunDirective(scriptContent, location, 'runCodeParams', 'python', params);
        const baseContext = createMockProcessingContext(node);
        const processingContext: DirectiveProcessingContext = {
            ...baseContext,
            resolutionContext: { 
                ...baseContext.resolutionContext, 
                strict: true 
            }
        };

        vi.mocked(resolutionServiceMock.resolveNodes).mockImplementationOnce(async () => 'print("hello")');
        const resolutionError = new Error('Variable not found by mock');
        vi.mocked(resolutionServiceMock.resolveInContext).mockImplementationOnce(async (value, ctx) => {
            if (typeof value === 'object' && value?.identifier === 'missingVar') throw resolutionError;
            return 'fallback';
        });

        await expectToThrowWithConfig(
            async () => await handler.execute(processingContext),
            {
                type: 'DirectiveError',
                code: DirectiveErrorCode.RESOLUTION_FAILED,
                messageContains: 'Failed to resolve parameter variable \'missingVar\'', 
                cause: resolutionError
            } as ErrorTestOptions
        );
        expect(resolutionServiceMock.resolveInContext).toHaveBeenCalledWith(paramNode, processingContext.resolutionContext);
        expect(fileSystemServiceMock.executeCommand).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle resolution errors for command', async () => {
      const commandNodes: InterpolatableValue = [ 
          { type: 'VariableReference', identifier: 'undefined_var', valueType: VariableType.TEXT, isVariableReference: true, location: createLocation() } 
      ];
      const node = createRunDirective(commandNodes, createLocation(), 'runCommand');
      const processingContext = createMockProcessingContext(node);
      const resolutionError = new Error('Resolution failed');
      vi.mocked(resolutionServiceMock.resolveNodes).mockRejectedValue(resolutionError);
      
      await expectToThrowWithConfig(
          async () => await handler.execute(processingContext),
          {
              type: 'DirectiveError',
              code: DirectiveErrorCode.EXECUTION_FAILED, 
              messageContains: 'Failed to execute command: Resolution failed', 
              cause: resolutionError
          } as ErrorTestOptions 
      );
    });

    it('should handle command execution errors', async () => {
      const commandNodes: InterpolatableValue = [ createTextNode('invalid-command') ];
      const node = createRunDirective(commandNodes, createLocation(), 'runCommand');
      const processingContext = createMockProcessingContext(node);
      const executionError = new Error('Execution failed');
      
      vi.mocked(resolutionServiceMock.resolveNodes).mockResolvedValue('invalid-command');
      vi.mocked(fileSystemServiceMock.executeCommand).mockRejectedValue(executionError);
      
      await expectToThrowWithConfig(
          async () => await handler.execute(processingContext),
          {
              type: 'DirectiveError',
              code: DirectiveErrorCode.EXECUTION_FAILED,
              messageContains: 'Failed to execute command: Execution failed',
              cause: executionError
          } as ErrorTestOptions 
      );
      expect(fileSystemServiceMock.executeCommand).toHaveBeenCalledWith('invalid-command', {
        cwd: '/workspace'
      });
    });

    it('should handle undefined command references', async () => {
      const commandRefObject = { name: 'undefinedCommand', args: [], raw: '$undefinedCommand' };
      const node = createRunDirective(commandRefObject, createLocation(), 'runDefined');
      const processingContext = createMockProcessingContext(node);

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
      
      vi.mocked(resolutionServiceMock.resolveNodes).mockImplementationOnce(async () => 'echo "Out" && >&2 echo "Err"');
      vi.mocked(fileSystemServiceMock.executeCommand).mockImplementationOnce(async () => ({ stdout: 'Out', stderr: 'Err' }));
      
      const result = await handler.execute(processingContext);
      
      expect(stateService.setTextVar).toHaveBeenCalledWith('stdout', 'Out');
      expect(stateService.setTextVar).toHaveBeenCalledWith('stderr', 'Err');
    });

    it('should handle transformation mode', async () => {
      const commandNodes: InterpolatableValue = [ createTextNode('echo "Success"') ];
      const node = createRunDirective(commandNodes, createLocation(), 'runCommand');
      const processingContext = createMockProcessingContext(node);
      
      vi.mocked(resolutionServiceMock.resolveNodes).mockImplementationOnce(async () => 'echo Success');
      vi.mocked(fileSystemServiceMock.executeCommand).mockImplementationOnce(async () => ({ stdout: 'transformed output', stderr: '' }));
      
      stateService.isTransformationEnabled.mockReturnValue(true);
      
      const result = await handler.execute(processingContext);
      
      expect(result.replacement).toEqual(expect.objectContaining({
        type: 'Text',
        content: 'transformed output'
      }));
      expect(stateService.setTextVar).toHaveBeenCalledWith('stdout', 'transformed output');
    });
  });
});