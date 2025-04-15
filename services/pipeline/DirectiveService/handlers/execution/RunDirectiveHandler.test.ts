// Remove the logger mock
/*
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};
vi.mock('../../../../core/utils/logger', () => ({
  directiveLogger: mockLogger
}));
*/

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RunDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.js';
import { DirectiveError, DirectiveErrorCode, DirectiveErrorSeverity } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import type { DirectiveNode, InterpolatableValue, TextNode, VariableReferenceNode } from '@core/syntax/types/nodes.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
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
import { VariableType, CommandVariable, VariableOrigin, TextVariable } from '@core/types/variables.js';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';
import type { DirectiveProcessingContext, FormattingContext } from '@core/types/index.js';
import type { ResolutionContext } from '@core/types/resolution.js';
import { JsonValue, Result, success } from '@core/types';
import { isInterpolatableValueArray } from '@core/syntax/types/guards.js';
import { DefineDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/DefineDirectiveHandler.js';
import { expectToThrowWithConfig, ErrorTestOptions } from '@tests/utils/ErrorTestUtils.js';
import { VariableMetadata } from '@core/types/variables.js';
import { MeldResolutionError, FieldAccessError, PathValidationError } from '@core/errors';
import { MeldPath } from '@core/types';
import type { ValidatedResourcePath } from '@core/types/paths.js';
import type { Stats } from 'fs-extra';
import { Field as AstField } from '@core/syntax/types/shared-types.js';
import type { VariableResolutionTracker, ResolutionTrackingConfig } from '@tests/utils/debug/VariableResolutionTracker/index.js';
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem.js';
import type { DirectiveResult } from '@services/pipeline/DirectiveService/types.js';

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
  const helpers = TestContextDI.createTestHelpers();
  let handler: RunDirectiveHandler;
  let stateService: IStateService;
  let resolutionService: IResolutionService;
  let fileSystemService: IFileSystemService;
  let context: TestContextDI;

  beforeEach(async () => {
    context = helpers.setupWithStandardMocks();
    await context.resolve('IPathService');
    
    stateService = await context.resolve('IStateService');
    resolutionService = await context.resolve('IResolutionService');
    fileSystemService = await context.resolve('IFileSystemService');
    handler = await context.resolve(RunDirectiveHandler); 

    vi.spyOn(stateService, 'getCurrentFilePath').mockReturnValue('/workspace/test.meld');
    vi.spyOn(stateService, 'setTextVar').mockResolvedValue({} as TextVariable);
    vi.spyOn(stateService, 'getCommandVar').mockImplementation((name: string): CommandVariable | undefined => {
        if (name === 'greet') {
            return { type: VariableType.COMMAND, name: 'greet', value: { type:'basic', commandTemplate: 'echo \"Hello there!\"' } } as CommandVariable;
        }
        return undefined;
    });
    vi.spyOn(stateService, 'isTransformationEnabled').mockReturnValue(false);
    
    vi.spyOn(fileSystemService, 'executeCommand').mockResolvedValue({ stdout: 'default stdout', stderr: '' });
    vi.spyOn(fileSystemService, 'writeFile').mockResolvedValue(undefined);
    vi.spyOn(fileSystemService, 'deleteFile').mockResolvedValue(undefined);
    vi.spyOn(fileSystemService, 'getCwd').mockReturnValue('/workspace');

    vi.spyOn(resolutionService, 'resolveNodes').mockImplementation(async (nodes, ctx) => nodes.map((n: any) => n.content || `{{${n.identifier}}}`).join(''));
    vi.spyOn(resolutionService, 'resolveInContext').mockImplementation(async (value, ctx) => {
        if (typeof value === 'object' && value?.type === 'VariableReference') {
            if (value.identifier === 'missingVar') throw new MeldResolutionError('Variable not found by mock', { code: 'VAR_NOT_FOUND' });
            return `resolved-var:${value.identifier}`;
        }
        return typeof value === 'string' ? value : JSON.stringify(value)
    });
  });

  afterEach(async () => {
    await context?.cleanup();
    vi.clearAllMocks();
  });

  const createMockProcessingContext = (node: DirectiveNode, overrides: Partial<DirectiveProcessingContext> = {}): DirectiveProcessingContext => {
      const mockResolutionContext = { 
          strict: true, 
          state: stateService 
      } as ResolutionContext; 
      const mockFormattingContext: FormattingContext = { isBlock: false, preserveLiteralFormatting: false, preserveWhitespace: false };
      if (!stateService) {
        throw new Error('Test setup error: stateService is not defined when creating context');
      }
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
      
      vi.spyOn(fileSystemService, 'executeCommand').mockResolvedValueOnce({ stdout: 'command output', stderr: '' });
      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce('echo test');
      
      const result = await handler.execute(processingContext);
      
      expect(fileSystemService.executeCommand).toHaveBeenCalledWith('echo test', {
        cwd: '/workspace'
      });
      expect(stateService.setTextVar).toHaveBeenCalledWith('stdout', 'command output');
    });

    it('should handle commands with variables', async () => {
      const location = createLocation();
      const greetingVarNode: VariableReferenceNode = {
          type: 'VariableReference',
          identifier: 'greeting',
          valueType: VariableType.TEXT,
          isVariableReference: true,
          location: location
      };
      const nameVarNode: VariableReferenceNode = {
          type: 'VariableReference',
          identifier: 'name',
          valueType: VariableType.TEXT,
          isVariableReference: true,
          location: location
      };
      const commandNodes: InterpolatableValue = [ 
          createTextNode('echo ', location), 
          greetingVarNode, 
          createTextNode(' ', location), 
          nameVarNode
      ];
      const node = createRunDirective(commandNodes, location, 'runCommand');
      const processingContext = createMockProcessingContext(node);
      
      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce('echo Hello World');
      vi.spyOn(fileSystemService, 'executeCommand').mockResolvedValueOnce({ stdout: 'Hello World', stderr: '' });
      
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
      
      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce('echo test');
      vi.spyOn(fileSystemService, 'executeCommand').mockResolvedValueOnce({ stdout: 'command output', stderr: '' });
      
      const result = await handler.execute(processingContext);
      
      expect(stateService.setTextVar).toHaveBeenCalledWith('custom_output', 'command output');
    });

    it('should properly expand command references with $', async () => {
       const commandRefObject = { name: 'greet', args: [], raw: '$greet' };
       const node = createRunDirective(commandRefObject, createLocation(), 'runDefined');
       const processingContext = createMockProcessingContext(node);
       
       vi.spyOn(fileSystemService, 'executeCommand').mockResolvedValueOnce({ stdout: 'Hello there!', stderr: '' });
       
       const result = await handler.execute(processingContext);
       
       expect(stateService.getCommandVar).toHaveBeenCalledWith('greet'); 
       expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
         'echo \"Hello there!\"', 
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
      
      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce('echo "Inline script ran"');
      vi.spyOn(fileSystemService, 'executeCommand').mockResolvedValueOnce({ stdout: 'Inline script ran', stderr: '' });
      
      const result = await handler.execute(processingContext);
      
      expect(resolutionService.resolveNodes).toHaveBeenCalledWith(scriptContent, processingContext.resolutionContext);
      expect(fileSystemService.executeCommand).toHaveBeenCalledWith('echo "Inline script ran"', { cwd: '/workspace' });
      expect(stateService.setTextVar).toHaveBeenCalledWith('stdout', 'Inline script ran');
    });

    it('should execute script content with specified language using a temp file', async () => {
      const location = createLocation();
      const scriptContent: InterpolatableValue = [ createTextNode('print("Python script ran")', location) ];
      const node = createRunDirective(scriptContent, location, 'runCode', 'python'); 
      const processingContext = createMockProcessingContext(node);
      
      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce('print("Python script ran")');
      vi.spyOn(fileSystemService, 'executeCommand').mockResolvedValueOnce({ stdout: 'Python script ran', stderr: '' });
      vi.spyOn(fileSystemService, 'writeFile').mockResolvedValueOnce(undefined);
      
      const result = await handler.execute(processingContext);
      
      expect(resolutionService.resolveNodes).toHaveBeenCalledWith(scriptContent, processingContext.resolutionContext);
      expect(fileSystemService.writeFile).toHaveBeenCalledWith(expect.stringContaining('.py'), 'print("Python script ran")');
      expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
        expect.stringMatching(/^python .*?meld-script-.*?\.py$/),
        { cwd: '/workspace' }
      );
      expect(stateService.setTextVar).toHaveBeenCalledWith('stdout', 'Python script ran');
      expect(fileSystemService.deleteFile).toHaveBeenCalledWith(expect.stringContaining('.py'));
    });

    it('should resolve and pass parameters to a language script', async () => {
      const location = createLocation();
      const scriptContent: InterpolatableValue = [ createTextNode('import sys\nprint(f"Input: {sys.argv[1]}")', location) ];
      const paramNode: VariableReferenceNode = {
          type: 'VariableReference',
          identifier: 'inputVar',
          valueType: VariableType.TEXT,
          isVariableReference: true,
          location: location
      };
      const params = [ paramNode ];
      const node = createRunDirective(scriptContent, location, 'runCodeParams', 'python', params);
      const processingContext = createMockProcessingContext(node);

      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce('import sys\nprint(f"Input: {sys.argv[1]}")');
      vi.spyOn(resolutionService, 'resolveInContext').mockImplementationOnce(async (value, ctx) => { 
          if(typeof value === 'object' && value?.type === 'VariableReference' && value?.identifier === 'inputVar') return 'TestParameter'; 
          return 'fallback';
      }); 

      vi.spyOn(fileSystemService, 'executeCommand').mockResolvedValueOnce({ stdout: 'Input: TestParameter', stderr: '' });
      vi.spyOn(fileSystemService, 'writeFile').mockResolvedValueOnce(undefined);
      vi.spyOn(fileSystemService, 'deleteFile').mockResolvedValue(undefined);
      
      const result = await handler.execute(processingContext);
      
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(paramNode, processingContext.resolutionContext); 
      expect(fileSystemService.writeFile).toHaveBeenCalledWith(expect.stringContaining('.py'), 'import sys\nprint(f"Input: {sys.argv[1]}")');
      expect(fileSystemService.executeCommand).toHaveBeenCalledWith(
        expect.stringMatching(/^python .*?meld-script-.*?\.py \"TestParameter\"$/),
        { cwd: '/workspace' }
      );
      expect(stateService.setTextVar).toHaveBeenCalledWith('stdout', 'Input: TestParameter');
      expect(fileSystemService.deleteFile).toHaveBeenCalled();
    });
     
    it('should handle parameter resolution failure in strict mode', async () => {
        const location = createLocation();
        const scriptContent: InterpolatableValue = [ createTextNode('print("hello")', location) ];
        const paramNode: VariableReferenceNode = {
            type: 'VariableReference',
            identifier: 'missingVar',
            valueType: VariableType.TEXT,
            isVariableReference: true,
            location: location
        };
        const params = [ paramNode ];
        const node = createRunDirective(scriptContent, location, 'runCodeParams', 'python', params);
        const baseContext = createMockProcessingContext(node);
        const processingContext: DirectiveProcessingContext = {
            ...baseContext,
            resolutionContext: { 
                ...baseContext.resolutionContext,
                ...(baseContext.resolutionContext as object), 
                strict: true 
            } as ResolutionContext
        };

        vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce('print("hello")');
        const resolutionError = new MeldResolutionError('Variable not found by mock', { code: 'VAR_NOT_FOUND' });
        vi.spyOn(resolutionService, 'resolveInContext').mockImplementationOnce(async (value, ctx) => {
            if (typeof value === 'object' && value?.type === 'VariableReference' && value?.identifier === 'missingVar') throw resolutionError;
            return 'fallback';
        });

        await expectToThrowWithConfig(
            async () => await handler.execute(processingContext),
            {
                code: DirectiveErrorCode.RESOLUTION_FAILED,
                messageContains: 'Failed to resolve parameter variable: Variable not found by mock', 
                cause: resolutionError
            } as ErrorTestOptions
        );
        expect(resolutionService.resolveInContext).toHaveBeenCalledWith(paramNode, processingContext.resolutionContext);
        expect(fileSystemService.executeCommand).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle resolution errors for command string', async () => {
      const varNode: VariableReferenceNode = {
          type: 'VariableReference',
          identifier: 'undefined_var',
          valueType: VariableType.TEXT,
          isVariableReference: true,
          location: createLocation()
      };
      const commandNodes: InterpolatableValue = [ varNode ];
      const node = createRunDirective(commandNodes, createLocation(), 'runCommand');
      const processingContext = createMockProcessingContext(node);
      const resolutionError = new Error('Resolution failed');
      vi.spyOn(resolutionService, 'resolveNodes').mockRejectedValue(resolutionError);
      
      await expectToThrowWithConfig(
          async () => await handler.execute(processingContext),
          {
              code: DirectiveErrorCode.RESOLUTION_FAILED,
              messageContains: 'Failed to resolve command string',
              cause: resolutionError
          } as ErrorTestOptions 
      );
    });

    it('should handle command execution errors', async () => {
      const commandNodes: InterpolatableValue = [ createTextNode('invalid-command') ];
      const node = createRunDirective(commandNodes, createLocation(), 'runCommand');
      const processingContext = createMockProcessingContext(node);
      const executionError = new Error('Execution failed');
      
      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValue('invalid-command');
      vi.spyOn(fileSystemService, 'executeCommand').mockRejectedValue(executionError);
      
      await expectToThrowWithConfig(
          async () => await handler.execute(processingContext),
          {
              code: DirectiveErrorCode.EXECUTION_FAILED,
              messageContains: 'Execution failed',
              cause: executionError
          } as ErrorTestOptions 
      );
      expect(fileSystemService.executeCommand).toHaveBeenCalledWith('invalid-command', {
        cwd: '/workspace'
      });
    });

    it('should handle undefined command references for runDefined', async () => {
      const commandRefObject = { name: 'undefinedCommand', args: [], raw: '$undefinedCommand' };
      const node = createRunDirective(commandRefObject, createLocation(), 'runDefined');
      const processingContext = createMockProcessingContext(node);

      vi.spyOn(stateService, 'getCommandVar').mockReturnValue(undefined); 
      
      await expectToThrowWithConfig(
          async () => await handler.execute(processingContext),
          {
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
      
      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce('echo "Out" && >&2 echo "Err"');
      vi.spyOn(fileSystemService, 'executeCommand').mockResolvedValueOnce({ stdout: 'Out', stderr: 'Err' });
      
      const result = await handler.execute(processingContext);
      
      expect(stateService.setTextVar).toHaveBeenCalledWith('stdout', 'Out');
      expect(stateService.setTextVar).toHaveBeenCalledWith('stderr', 'Err');
    });

    it('should handle transformation mode (return replacement node)', async () => {
      const commandNodes: InterpolatableValue = [ createTextNode('echo "Success"') ];
      const node = createRunDirective(commandNodes, createLocation(), 'runCommand');
      const processingContext = createMockProcessingContext(node);
      
      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce('echo Success');
      vi.spyOn(fileSystemService, 'executeCommand').mockResolvedValueOnce({ stdout: 'transformed output', stderr: '' });
      vi.spyOn(stateService, 'isTransformationEnabled').mockReturnValue(true);
      
      const result = await handler.execute(processingContext);
      
      expect(result).toHaveProperty('replacement'); 
      const directiveResult = result as DirectiveResult;
      expect(directiveResult.replacement).toEqual(expect.objectContaining({
        type: 'Text',
        content: 'transformed output'
      }));
      expect(stateService.setTextVar).toHaveBeenCalledWith('stdout', 'transformed output');
    });
  });
});