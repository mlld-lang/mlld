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
import { RunDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler';
import { DirectiveError, DirectiveErrorCode, DirectiveErrorSeverity } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import type { DirectiveNode, InterpolatableValue, TextNode, VariableReferenceNode } from '@core/syntax/types/nodes';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import { runDirectiveExamples } from '@core/syntax';
import { parse, ParseResult } from '@core/ast';
import { ErrorSeverity, MeldError } from '@core/errors/MeldError';
import {
  createStateServiceMock,
  createResolutionServiceMock,
  createFileSystemServiceMock,
  createDirectiveErrorMock,
} from '@tests/utils/mocks/serviceMocks';
import type { Location, SourceLocation } from '@core/types/index';
import type { MockedFunction } from 'vitest';
import { 
  createRunDirective,
  createTextNode, 
  createVariableReferenceNode, 
  createLocation 
} from '@tests/utils/testFactories';
import { VariableType, CommandVariable, VariableOrigin, TextVariable, createTextVariable } from '@core/types/variables';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';
import type { DirectiveProcessingContext, FormattingContext } from '@core/types/index';
import type { ResolutionContext } from '@core/types/resolution';
import { JsonValue, Result, success } from '@core/types';
import { isInterpolatableValueArray } from '@core/syntax/types/guards';
import { expectToThrowWithConfig, ErrorTestOptions } from '@tests/utils/ErrorTestUtils';
import { VariableMetadata } from '@core/types/variables';
import { MeldResolutionError, FieldAccessError, PathValidationError } from '@core/errors';
import { MeldPath } from '@core/types';
import type { ValidatedResourcePath } from '@core/types/paths';
import type { Stats } from 'fs-extra';
import { Field as AstField } from '@core/syntax/types/shared-types';
import type { VariableResolutionTracker, ResolutionTrackingConfig } from '@tests/utils/debug/VariableResolutionTracker/index';
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem';
import type { DirectiveResult, StateChanges } from '@core/directives/DirectiveHandler';
import type { VariableDefinition } from '@core/types/variables';
import { container, DependencyContainer } from 'tsyringe';
import { mockDeep, DeepMockProxy } from 'vitest-mock-extended';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory';

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
  let mockStateService: DeepMockProxy<IStateService>;
  let mockResolutionService: DeepMockProxy<IResolutionService>;
  let mockFileSystemService: DeepMockProxy<IFileSystemService>;
  let testContainer: DependencyContainer;

  beforeEach(async () => {
    testContainer = container.createChildContainer();
    
    mockStateService = mockDeep<IStateService>();
    mockResolutionService = mockDeep<IResolutionService>();
    mockFileSystemService = mockDeep<IFileSystemService>();
    
    testContainer.registerInstance<IStateService>('IStateService', mockStateService);
    testContainer.registerInstance<IResolutionService>('IResolutionService', mockResolutionService);
    testContainer.registerInstance<IFileSystemService>('IFileSystemService', mockFileSystemService);
    testContainer.registerInstance('DependencyContainer', testContainer);
    
    testContainer.register(RunDirectiveHandler, { useClass: RunDirectiveHandler });
    
    handler = testContainer.resolve(RunDirectiveHandler); 

    mockStateService.getCurrentFilePath.mockReturnValue('/workspace/test.meld');
    mockStateService.setVariable.mockResolvedValue({} as TextVariable);
    mockStateService.getVariable.mockImplementation((name: string, type?: VariableType): MeldVariable | undefined => {
        if (name === 'greet' && (!type || type === VariableType.COMMAND)) {
            return { type: VariableType.COMMAND, name: 'greet', value: { type:'basic', commandTemplate: 'echo "Hello there!"' } } as CommandVariable;
        }
        return undefined;
    });
    mockStateService.isTransformationEnabled.mockReturnValue(false);
    
    mockFileSystemService.executeCommand.mockResolvedValue({ stdout: 'default stdout', stderr: '' });
    mockFileSystemService.writeFile.mockResolvedValue(undefined);
    mockFileSystemService.deleteFile.mockResolvedValue(undefined);
    mockFileSystemService.getCwd.mockReturnValue('/workspace');

    mockResolutionService.resolveNodes.mockImplementation(async (nodes, ctx) => nodes.map((n: any) => n.content || `{{${n.identifier}}}`).join(''));
    mockResolutionService.resolveInContext.mockImplementation(async (value, ctx) => {
        if (typeof value === 'object' && value?.type === 'VariableReference') {
            if (value.identifier === 'missingVar') throw new MeldResolutionError('Variable not found by mock', { code: 'VAR_NOT_FOUND' });
            return `resolved-var:${value.identifier}`;
        }
        return typeof value === 'string' ? value : JSON.stringify(value)
    });
  });

  afterEach(async () => {
    testContainer?.dispose();
    vi.clearAllMocks();
  });

  const createMockProcessingContext = (node: DirectiveNode, overrides: Partial<DirectiveProcessingContext> = {}): DirectiveProcessingContext => {
      const mockResolutionContext = ResolutionContextFactory.create(
          mockStateService, 
          mockStateService.getCurrentFilePath() ?? undefined
      );
      const mockFormattingContext = { 
        isBlock: false, 
        preserveLiteralFormatting: false, 
        preserveWhitespace: false,
        isOutputLiteral: mockStateService.isTransformationEnabled()
      };
      
      return {
          state: mockStateService,
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
      
      mockFileSystemService.executeCommand.mockResolvedValueOnce({ stdout: 'command output', stderr: '' });
      mockResolutionService.resolveNodes.mockResolvedValueOnce('echo test');
      
      const result = await handler.handle(processingContext) as DirectiveResult;
      
      expect(mockFileSystemService.executeCommand).toHaveBeenCalledWith('echo test', {
        cwd: '/workspace'
      });
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('stdout');
      const stdoutDef = result.stateChanges?.variables?.stdout;
      expect(stdoutDef?.type).toBe(VariableType.TEXT);
      expect(stdoutDef?.value).toBe('command output');
      expect(result.stateChanges?.variables).toHaveProperty('stderr');
      const stderrDef = result.stateChanges?.variables?.stderr;
      expect(stderrDef?.value).toBe('');
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
      
      mockResolutionService.resolveNodes.mockResolvedValueOnce('echo Hello World');
      mockFileSystemService.executeCommand.mockResolvedValueOnce({ stdout: 'Hello World', stderr: '' });
      
      const result = await handler.handle(processingContext) as DirectiveResult;
      
      expect(mockFileSystemService.executeCommand).toHaveBeenCalledWith('echo Hello World', {
        cwd: '/workspace'
      });
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('stdout');
      const stdoutDef = result.stateChanges?.variables?.stdout;
      expect(stdoutDef?.type).toBe(VariableType.TEXT);
      expect(stdoutDef?.value).toBe('Hello World');
    });

    it('should handle custom output variable', async () => {
      const commandNodes: InterpolatableValue = [ createTextNode('echo test') ];
      const node = createRunDirective(commandNodes, createLocation(), 'runCommand', undefined, undefined, 'custom_output');
      const processingContext = createMockProcessingContext(node);
      
      mockResolutionService.resolveNodes.mockResolvedValueOnce('echo test');
      mockFileSystemService.executeCommand.mockResolvedValueOnce({ stdout: 'command output', stderr: '' });
      
      const result = await handler.handle(processingContext) as DirectiveResult;
      
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('custom_output');
      const customOutDef = result.stateChanges?.variables?.custom_output;
      expect(customOutDef?.type).toBe(VariableType.TEXT);
      expect(customOutDef?.value).toBe('command output');
      expect(result.stateChanges?.variables).toHaveProperty('stderr');
    });

    it('should properly expand command references with $', async () => {
       const commandRefObject = { name: 'greet', args: [], raw: '$greet' };
      const node = createRunDirective(commandRefObject, createLocation(), 'runExec');
       const processingContext = createMockProcessingContext(node);
       
       mockFileSystemService.executeCommand.mockResolvedValueOnce({ stdout: 'Hello there!', stderr: '' });
       
       const result = await handler.handle(processingContext) as DirectiveResult;
       
       expect(mockStateService.getVariable).toHaveBeenCalledWith('greet', VariableType.COMMAND);
       expect(mockFileSystemService.executeCommand).toHaveBeenCalledWith(
         'echo "Hello there!"', 
         expect.objectContaining({ cwd: '/workspace' })
       );
       expect(result.stateChanges).toBeDefined();
       expect(result.stateChanges?.variables).toHaveProperty('stdout');
       const stdoutDef = result.stateChanges?.variables?.stdout;
       expect(stdoutDef?.type).toBe(VariableType.TEXT);
       expect(stdoutDef?.value).toBe('Hello there!');
    });
  });

  describe('runCode/runCodeParams execution', () => {
    it('should execute script content without language as shell commands', async () => {
      const location = createLocation();
      const scriptContent: InterpolatableValue = [ createTextNode('echo "Inline script ran"', location) ];
      const node = createRunDirective(scriptContent, location, 'runCode');
      const processingContext = createMockProcessingContext(node);
      
      mockResolutionService.resolveNodes.mockResolvedValueOnce('echo "Inline script ran"');
      mockFileSystemService.executeCommand.mockResolvedValueOnce({ stdout: 'Inline script ran', stderr: '' });
      
      const result = await handler.handle(processingContext) as DirectiveResult;
      
      expect(mockResolutionService.resolveNodes).toHaveBeenCalledWith(scriptContent, processingContext.resolutionContext);
      expect(mockFileSystemService.executeCommand).toHaveBeenCalledWith('echo "Inline script ran"', { cwd: '/workspace' });
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('stdout');
      const stdoutDef = result.stateChanges?.variables?.stdout;
      expect(stdoutDef?.value).toBe('Inline script ran');
    });

    it('should execute script content with specified language using a temp file', async () => {
      const location = createLocation();
      const scriptContent: InterpolatableValue = [ createTextNode('print("Python script ran")', location) ];
      const node = createRunDirective(scriptContent, location, 'runCode', 'python'); 
      const processingContext = createMockProcessingContext(node);
      
      mockResolutionService.resolveNodes.mockResolvedValueOnce('print("Python script ran")');
      mockFileSystemService.executeCommand.mockResolvedValueOnce({ stdout: 'Python script ran', stderr: '' });
      mockFileSystemService.writeFile.mockResolvedValueOnce(undefined);
      
      const result = await handler.handle(processingContext) as DirectiveResult;
      
      expect(mockResolutionService.resolveNodes).toHaveBeenCalledWith(scriptContent, processingContext.resolutionContext);
      expect(mockFileSystemService.writeFile).toHaveBeenCalledWith(expect.stringContaining('.py'), 'print("Python script ran")');
      expect(mockFileSystemService.executeCommand).toHaveBeenCalledWith(
        expect.stringMatching(/^python .*?meld-script-.*?\.py$/),
        { cwd: '/workspace' }
      );
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('stdout');
      const stdoutDef = result.stateChanges?.variables?.stdout;
      expect(stdoutDef?.value).toBe('Python script ran');
      expect(mockFileSystemService.deleteFile).toHaveBeenCalledWith(expect.stringContaining('.py'));
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

      mockResolutionService.resolveNodes.mockResolvedValueOnce('import sys\nprint(f"Input: {sys.argv[1]}")');
      mockResolutionService.resolveInContext.mockImplementationOnce(async (value, ctx) => { 
          if(typeof value === 'object' && value?.type === 'VariableReference' && value?.identifier === 'inputVar') return 'TestParameter'; 
          return 'fallback';
      }); 

      mockFileSystemService.executeCommand.mockResolvedValueOnce({ stdout: 'Input: TestParameter', stderr: '' });
      mockFileSystemService.writeFile.mockResolvedValueOnce(undefined);
      mockFileSystemService.deleteFile.mockResolvedValue(undefined);
      
      const result = await handler.handle(processingContext) as DirectiveResult;
      
      expect(mockResolutionService.resolveInContext).toHaveBeenCalledWith(paramNode, processingContext.resolutionContext); 
      expect(mockFileSystemService.writeFile).toHaveBeenCalledWith(expect.stringContaining('.py'), 'import sys\nprint(f"Input: {sys.argv[1]}")');
      expect(mockFileSystemService.executeCommand).toHaveBeenCalledWith(
        expect.stringMatching(/^python .*?meld-script-.*?\.py "TestParameter"$/),
        { cwd: '/workspace' }
      );
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('stdout');
      const stdoutDef = result.stateChanges?.variables?.stdout;
      expect(stdoutDef?.value).toBe('Input: TestParameter');
      expect(mockFileSystemService.deleteFile).toHaveBeenCalled();
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

        mockResolutionService.resolveNodes.mockResolvedValueOnce('print("hello")');
        const resolutionError = new MeldResolutionError('Variable not found by mock', { code: 'VAR_NOT_FOUND' });
        mockResolutionService.resolveInContext.mockImplementationOnce(async (value, ctx) => {
            if (typeof value === 'object' && value?.type === 'VariableReference' && value?.identifier === 'missingVar') throw resolutionError;
            return 'fallback';
        });

        await expectToThrowWithConfig(
            async () => await handler.handle(processingContext),
            {
                code: DirectiveErrorCode.RESOLUTION_FAILED,
                messageContains: 'Failed to resolve parameter variable: Variable not found by mock', 
                cause: resolutionError
            } as ErrorTestOptions
        );
        expect(mockResolutionService.resolveInContext).toHaveBeenCalledWith(paramNode, processingContext.resolutionContext);
        expect(mockFileSystemService.executeCommand).not.toHaveBeenCalled();
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
      mockResolutionService.resolveNodes.mockRejectedValue(resolutionError);
      
      await expectToThrowWithConfig(
          async () => await handler.handle(processingContext),
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
      
      mockResolutionService.resolveNodes.mockResolvedValue('invalid-command');
      mockFileSystemService.executeCommand.mockRejectedValue(executionError);
      
      await expectToThrowWithConfig(
          async () => await handler.handle(processingContext),
          {
              code: DirectiveErrorCode.EXECUTION_FAILED,
              messageContains: 'Execution failed',
              cause: executionError
          } as ErrorTestOptions 
      );
      expect(mockFileSystemService.executeCommand).toHaveBeenCalledWith('invalid-command', {
        cwd: '/workspace'
      });
    });

    it('should handle undefined command references for runExec', async () => {
      const commandRefObject = { name: 'undefinedCommand', args: [], raw: '$undefinedCommand' };
      const node = createRunDirective(commandRefObject, createLocation(), 'runExec');
      const processingContext = createMockProcessingContext(node);

      mockStateService.getVariable.mockImplementation((name: string, type?: VariableType) => {
        if (name === 'undefinedCommand' && type === VariableType.COMMAND) return undefined;
        return undefined;
      }); 
      
      await expectToThrowWithConfig(
          async () => await handler.handle(processingContext),
          {
              code: DirectiveErrorCode.VARIABLE_NOT_FOUND,
              messageContains: 'Command definition \'undefinedCommand\' not found',
          } as ErrorTestOptions 
      );
      expect(mockStateService.getVariable).toHaveBeenCalledWith('undefinedCommand', VariableType.COMMAND);
    });
  });

  describe('output handling', () => {
    it('should handle stdout and stderr', async () => {
      const commandNodes: InterpolatableValue = [ createTextNode('echo "Out" && >&2 echo "Err"') ];
      const node = createRunDirective(commandNodes, createLocation(), 'runCommand');
      const processingContext = createMockProcessingContext(node);
      
      mockResolutionService.resolveNodes.mockResolvedValueOnce('echo "Out" && >&2 echo "Err"');
      mockFileSystemService.executeCommand.mockResolvedValueOnce({ stdout: 'Out', stderr: 'Err' });
      
      const result = await handler.handle(processingContext) as DirectiveResult;
      
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('stdout');
      expect(result.stateChanges?.variables?.stdout?.value).toBe('Out');
      expect(result.stateChanges?.variables).toHaveProperty('stderr');
      expect(result.stateChanges?.variables?.stderr?.value).toBe('Err');
    });

    it('should handle transformation mode (return replacement node)', async () => {
      const commandNodes: InterpolatableValue = [ createTextNode('echo "Success"') ];
      const node = createRunDirective(commandNodes, createLocation(), 'runCommand');
      const processingContext = createMockProcessingContext(node);
      
      mockResolutionService.resolveNodes.mockResolvedValueOnce('echo Success');
      mockFileSystemService.executeCommand.mockResolvedValueOnce({ stdout: 'transformed output', stderr: '' });
      mockStateService.isTransformationEnabled.mockReturnValue(true);
      
      const result = await handler.handle(processingContext) as DirectiveResult;
      
      expect(result).toHaveProperty('replacement'); 
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('stdout');
      expect(result.stateChanges?.variables?.stdout?.value).toBe('transformed output');
      
      const replacement = result.replacement;
      expect(replacement?.[0]).toMatchObject({
        type: 'Text',
        content: 'transformed output'
      });
    });
  });
});