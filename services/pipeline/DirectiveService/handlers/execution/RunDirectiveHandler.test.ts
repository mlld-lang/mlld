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
import { container, DependencyContainer } from 'tsyringe';
import { RunDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.js';
import { DirectiveError, DirectiveErrorCode, DirectiveErrorSeverity } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import type { DirectiveNode, InterpolatableValue, TextNode, VariableReferenceNode } from '@core/syntax/types/nodes.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { runDirectiveExamples } from '@core/syntax';
import { parse, ParseResult } from '@core/ast';
import { ErrorSeverity, MeldError } from '@core/errors/MeldError.js';
// Removed: import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { 
  createValidationServiceMock,
  createStateServiceMock,
  createResolutionServiceMock,
  createFileSystemServiceMock,
  createDirectiveErrorMock,
  createLoggerServiceMock, // Added for logger
} from '@tests/utils/mocks/serviceMocks.js';
import type { Location, SourceLocation } from '@core/types/index.js';
import type { MockedFunction } from 'vitest';
import { 
  createRunDirective,
  createTextNode, 
  createVariableReferenceNode, 
  createLocation 
} from '@tests/utils/testFactories.js';
import { VariableType, CommandVariable, VariableOrigin, TextVariable, createTextVariable, MeldVariable } from '@core/types/variables.js'; // Added MeldVariable
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
import type { DirectiveResult, StateChanges } from '@core/directives/DirectiveHandler';
import type { VariableDefinition } from '@core/types/variables.js';
import type { ILogger } from '@core/utils/logger.js'; // Added for logger type

/**
 * RunDirectiveHandler Test Status
 * ----------------------------------------
 * 
 * MIGRATION STATUS: Refactored to Manual Child Container
 * 
 * This test file has been fully migrated to use:
 * - Manual child DI container for test isolation
 * - Standardized mock factories with vitest-mock-extended
 * - Centralized syntax examples
 * 
 * COMPLETED:
 * - Using Manual Child Container for test environment setup
 * - Using standardized mock factories for service mocks
 * - Added proper cleanup (`dispose`) for container management
 * - Enhanced with centralized syntax examples
 * - No longer relies on syntax-test-helpers or TestContextDI
 */

describe('RunDirectiveHandler', () => {
  // Removed: const helpers = TestContextDI.createTestHelpers();
  let testContainer: DependencyContainer;
  let handler: RunDirectiveHandler;
  let stateServiceMock: ReturnType<typeof createStateServiceMock>;
  let resolutionServiceMock: ReturnType<typeof createResolutionServiceMock>;
  let fileSystemServiceMock: ReturnType<typeof createFileSystemServiceMock>;
  let loggerMock: ReturnType<typeof createLoggerServiceMock>;
  // Removed: let context: TestContextDI;

  beforeEach(() => { // Removed async
    // Create manual child container
    testContainer = container.createChildContainer();

    // Create mocks
    stateServiceMock = createStateServiceMock();
    resolutionServiceMock = createResolutionServiceMock();
    fileSystemServiceMock = createFileSystemServiceMock();
    loggerMock = createLoggerServiceMock();

    // Configure default mock behaviors
    stateServiceMock.getCurrentFilePath.mockReturnValue('/workspace/test.meld');
    stateServiceMock.setVariable.mockResolvedValue({} as TextVariable); // Use mockResolvedValue for async
    stateServiceMock.getVariable.mockImplementation((name: string, type?: VariableType): MeldVariable | undefined => {
        if (name === 'greet' && (!type || type === VariableType.COMMAND)) {
            return { type: VariableType.COMMAND, name: 'greet', value: { type:'basic', commandTemplate: 'echo \"Hello there!\"' }, origin: VariableOrigin.DIRECTIVE, metadata: {} as VariableMetadata } as CommandVariable; // Added origin & metadata
        }
        return undefined;
    });
    stateServiceMock.isTransformationEnabled.mockReturnValue(false);
    
    fileSystemServiceMock.executeCommand.mockResolvedValue({ stdout: 'default stdout', stderr: '' }); // Use mockResolvedValue for async
    fileSystemServiceMock.writeFile.mockResolvedValue(undefined); // Use mockResolvedValue for async
    fileSystemServiceMock.deleteFile.mockResolvedValue(undefined); // Use mockResolvedValue for async
    fileSystemServiceMock.getCwd.mockReturnValue('/workspace');

    resolutionServiceMock.resolveNodes.mockImplementation(async (nodes, ctx) => nodes.map((n: any) => n.content || `{{${n.identifier}}}`).join('')); // Keep async
    resolutionServiceMock.resolveInContext.mockImplementation(async (value, ctx) => { // Keep async
        if (typeof value === 'object' && value?.type === 'VariableReference') {
            if (value.identifier === 'missingVar') throw new MeldResolutionError('Variable not found by mock', { code: 'VAR_NOT_FOUND' });
            return `resolved-var:${value.identifier}`;
        }
        return typeof value === 'string' ? value : JSON.stringify(value)
    });

    // Register mocks and real implementation
    testContainer.registerInstance<IStateService>('IStateService', stateServiceMock);
    testContainer.registerInstance<IResolutionService>('IResolutionService', resolutionServiceMock);
    testContainer.registerInstance<IFileSystemService>('IFileSystemService', fileSystemServiceMock);
    testContainer.registerInstance<ILogger>('MainLogger', loggerMock);
    testContainer.registerInstance<DependencyContainer>('DependencyContainer', testContainer); // Register container itself
    testContainer.register(RunDirectiveHandler, { useClass: RunDirectiveHandler }); // Explicit useClass registration

    // Resolve the handler
    handler = testContainer.resolve(RunDirectiveHandler); 
  });

  afterEach(() => { // Removed async
    // Removed: await context?.cleanup();
    testContainer?.dispose(); // Dispose the container
    vi.clearAllMocks();
  });

  // Updated helper to accept stateService mock
  const createMockProcessingContext = (node: DirectiveNode, stateService: IStateService, overrides: Partial<DirectiveProcessingContext> = {}): DirectiveProcessingContext => {
      const mockResolutionContext = { 
          strict: true, 
          state: stateService // Use passed-in mock
      } as ResolutionContext; 
      const mockFormattingContext: FormattingContext = { isBlock: false, preserveLiteralFormatting: false, preserveWhitespace: false };
      if (!stateService) {
        throw new Error('Test setup error: stateService is not defined when creating context');
      }
      return {
          state: stateService, // Use passed-in mock
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
      const processingContext = createMockProcessingContext(node, stateServiceMock); // Pass mock
      
      // Configure specific mock behavior for this test
      fileSystemServiceMock.executeCommand.mockResolvedValueOnce({ stdout: 'command output', stderr: '' });
      resolutionServiceMock.resolveNodes.mockResolvedValueOnce('echo test');
      
      const result = await handler.handle(processingContext) as DirectiveResult;
      
      expect(fileSystemServiceMock.executeCommand).toHaveBeenCalledWith('echo test', {
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
          location: location,
          nodeId: 'vrn-greet' // Added nodeId
      };
      const nameVarNode: VariableReferenceNode = {
          type: 'VariableReference',
          identifier: 'name',
          valueType: VariableType.TEXT,
          isVariableReference: true,
          location: location,
          nodeId: 'vrn-name' // Added nodeId
      };
      const commandNodes: InterpolatableValue = [ 
          createTextNode('echo ', location), 
          greetingVarNode, 
          createTextNode(' ', location), 
          nameVarNode
      ];
      const node = createRunDirective(commandNodes, location, 'runCommand');
      const processingContext = createMockProcessingContext(node, stateServiceMock); // Pass mock
      
      resolutionServiceMock.resolveNodes.mockResolvedValueOnce('echo Hello World');
      fileSystemServiceMock.executeCommand.mockResolvedValueOnce({ stdout: 'Hello World', stderr: '' });
      
      const result = await handler.handle(processingContext) as DirectiveResult;
      
      expect(fileSystemServiceMock.executeCommand).toHaveBeenCalledWith('echo Hello World', {
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
      const processingContext = createMockProcessingContext(node, stateServiceMock); // Pass mock
      
      resolutionServiceMock.resolveNodes.mockResolvedValueOnce('echo test');
      fileSystemServiceMock.executeCommand.mockResolvedValueOnce({ stdout: 'command output', stderr: '' });
      
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
       const node = createRunDirective(commandRefObject, createLocation(), 'runDefined');
       const processingContext = createMockProcessingContext(node, stateServiceMock); // Pass mock
       
       fileSystemServiceMock.executeCommand.mockResolvedValueOnce({ stdout: 'Hello there!', stderr: '' });
       
       const result = await handler.handle(processingContext) as DirectiveResult;
       
       expect(stateServiceMock.getVariable).toHaveBeenCalledWith('greet', VariableType.COMMAND); // Use mock
       expect(fileSystemServiceMock.executeCommand).toHaveBeenCalledWith( // Use mock
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
      const processingContext = createMockProcessingContext(node, stateServiceMock); // Pass mock
      
      resolutionServiceMock.resolveNodes.mockResolvedValueOnce('echo "Inline script ran"');
      fileSystemServiceMock.executeCommand.mockResolvedValueOnce({ stdout: 'Inline script ran', stderr: '' });
      
      const result = await handler.handle(processingContext) as DirectiveResult;
      
      expect(resolutionServiceMock.resolveNodes).toHaveBeenCalledWith(scriptContent, processingContext.resolutionContext); // Use mock
      expect(fileSystemServiceMock.executeCommand).toHaveBeenCalledWith('echo "Inline script ran"', { cwd: '/workspace' }); // Use mock
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('stdout');
      const stdoutDef = result.stateChanges?.variables?.stdout;
      expect(stdoutDef?.value).toBe('Inline script ran');
    });

    it('should execute script content with specified language using a temp file', async () => {
      const location = createLocation();
      const scriptContent: InterpolatableValue = [ createTextNode('print("Python script ran")', location) ];
      const node = createRunDirective(scriptContent, location, 'runCode', 'python'); 
      const processingContext = createMockProcessingContext(node, stateServiceMock); // Pass mock
      
      resolutionServiceMock.resolveNodes.mockResolvedValueOnce('print("Python script ran")');
      fileSystemServiceMock.executeCommand.mockResolvedValueOnce({ stdout: 'Python script ran', stderr: '' });
      fileSystemServiceMock.writeFile.mockResolvedValueOnce(undefined);
      
      const result = await handler.handle(processingContext) as DirectiveResult;
      
      expect(resolutionServiceMock.resolveNodes).toHaveBeenCalledWith(scriptContent, processingContext.resolutionContext); // Use mock
      expect(fileSystemServiceMock.writeFile).toHaveBeenCalledWith(expect.stringContaining('.py'), 'print("Python script ran")'); // Use mock
      expect(fileSystemServiceMock.executeCommand).toHaveBeenCalledWith( // Use mock
        expect.stringMatching(/^python .*?meld-script-.*?\.py$/),
        { cwd: '/workspace' }
      );
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('stdout');
      const stdoutDef = result.stateChanges?.variables?.stdout;
      expect(stdoutDef?.value).toBe('Python script ran');
      expect(fileSystemServiceMock.deleteFile).toHaveBeenCalledWith(expect.stringContaining('.py')); // Use mock
    });

    it('should resolve and pass parameters to a language script', async () => {
      const location = createLocation();
      const scriptContent: InterpolatableValue = [ createTextNode('import sys\\nprint(f"Input: {sys.argv[1]}")', location) ];
      const paramNode: VariableReferenceNode = {
          type: 'VariableReference',
          identifier: 'inputVar',
          valueType: VariableType.TEXT,
          isVariableReference: true,
          location: location,
          nodeId: 'vrn-input' // Added nodeId
      };
      const params = [ paramNode ];
      const node = createRunDirective(scriptContent, location, 'runCodeParams', 'python', params);
      const processingContext = createMockProcessingContext(node, stateServiceMock); // Pass mock

      resolutionServiceMock.resolveNodes.mockResolvedValueOnce('import sys\\nprint(f"Input: {sys.argv[1]}")');
      // Configure resolveInContext for this specific test
      resolutionServiceMock.resolveInContext.mockImplementationOnce(async (value, ctx) => { 
          if(typeof value === 'object' && value?.type === 'VariableReference' && value?.identifier === 'inputVar') return 'TestParameter'; 
          return 'fallback';
      }); 

      fileSystemServiceMock.executeCommand.mockResolvedValueOnce({ stdout: 'Input: TestParameter', stderr: '' });
      fileSystemServiceMock.writeFile.mockResolvedValueOnce(undefined);
      fileSystemServiceMock.deleteFile.mockResolvedValue(undefined);
      
      const result = await handler.handle(processingContext) as DirectiveResult;
      
      expect(resolutionServiceMock.resolveInContext).toHaveBeenCalledWith(paramNode, processingContext.resolutionContext); // Use mock
      expect(fileSystemServiceMock.writeFile).toHaveBeenCalledWith(expect.stringContaining('.py'), 'import sys\\nprint(f"Input: {sys.argv[1]}")'); // Use mock
      expect(fileSystemServiceMock.executeCommand).toHaveBeenCalledWith( // Use mock
        expect.stringMatching(/^python .*?meld-script-.*?\.py \"TestParameter\"$/),
        { cwd: '/workspace' }
      );
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('stdout');
      const stdoutDef = result.stateChanges?.variables?.stdout;
      expect(stdoutDef?.value).toBe('Input: TestParameter');
      expect(fileSystemServiceMock.deleteFile).toHaveBeenCalled(); // Use mock
    });
     
    it('should handle parameter resolution failure in strict mode', async () => {
        const location = createLocation();
        const scriptContent: InterpolatableValue = [ createTextNode('print("hello")', location) ];
        const paramNode: VariableReferenceNode = {
            type: 'VariableReference',
            identifier: 'missingVar',
            valueType: VariableType.TEXT,
            isVariableReference: true,
            location: location,
            nodeId: 'vrn-missing' // Added nodeId
        };
        const params = [ paramNode ];
        const node = createRunDirective(scriptContent, location, 'runCodeParams', 'python', params);
        // Pass mock state service to helper
        const baseContext = createMockProcessingContext(node, stateServiceMock); 
        const processingContext: DirectiveProcessingContext = {
            ...baseContext,
            resolutionContext: { 
                ...baseContext.resolutionContext,
                ...(baseContext.resolutionContext as object), 
                strict: true 
            } as ResolutionContext
        };

        resolutionServiceMock.resolveNodes.mockResolvedValueOnce('print("hello")');
        const resolutionError = new MeldResolutionError('Variable not found by mock', { code: 'VAR_NOT_FOUND' });
        // Configure resolveInContext to throw for this test
        resolutionServiceMock.resolveInContext.mockImplementationOnce(async (value, ctx) => {
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
        expect(resolutionServiceMock.resolveInContext).toHaveBeenCalledWith(paramNode, processingContext.resolutionContext); // Use mock
        expect(fileSystemServiceMock.executeCommand).not.toHaveBeenCalled(); // Use mock
    });
  });

  describe('error handling', () => {
    it('should handle resolution errors for command string', async () => {
      const varNode: VariableReferenceNode = {
          type: 'VariableReference',
          identifier: 'undefined_var',
          valueType: VariableType.TEXT,
          isVariableReference: true,
          location: createLocation(),
          nodeId: 'vrn-undef' // Added nodeId
      };
      const commandNodes: InterpolatableValue = [ varNode ];
      const node = createRunDirective(commandNodes, createLocation(), 'runCommand');
      const processingContext = createMockProcessingContext(node, stateServiceMock); // Pass mock
      const resolutionError = new Error('Resolution failed');
      resolutionServiceMock.resolveNodes.mockRejectedValue(resolutionError); // Use mock
      
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
      const processingContext = createMockProcessingContext(node, stateServiceMock); // Pass mock
      const executionError = new Error('Execution failed');
      
      resolutionServiceMock.resolveNodes.mockResolvedValue('invalid-command'); // Use mock
      fileSystemServiceMock.executeCommand.mockRejectedValue(executionError); // Use mock
      
      await expectToThrowWithConfig(
          async () => await handler.handle(processingContext),
          {
              code: DirectiveErrorCode.EXECUTION_FAILED,
              messageContains: 'Execution failed',
              cause: executionError
          } as ErrorTestOptions 
      );
      expect(fileSystemServiceMock.executeCommand).toHaveBeenCalledWith('invalid-command', { // Use mock
        cwd: '/workspace'
      });
    });

    it('should handle undefined command references for runDefined', async () => {
      const commandRefObject = { name: 'undefinedCommand', args: [], raw: '$undefinedCommand' };
      const node = createRunDirective(commandRefObject, createLocation(), 'runDefined');
      const processingContext = createMockProcessingContext(node, stateServiceMock); // Pass mock

      // Configure getVariable mock for this test
      stateServiceMock.getVariable.mockImplementation((name: string, type?: VariableType) => { // Use mock
        if (name === 'undefinedCommand' && type === VariableType.COMMAND) return undefined;
        return undefined;
      }); 
      
      await expectToThrowWithConfig(
          async () => await handler.handle(processingContext),
          {
              code: DirectiveErrorCode.VARIABLE_NOT_FOUND,
              messageContains: "Command definition 'undefinedCommand' not found",
          } as ErrorTestOptions 
      );
      expect(stateServiceMock.getVariable).toHaveBeenCalledWith('undefinedCommand', VariableType.COMMAND); // Use mock
    });
  });

  describe('output handling', () => {
    it('should handle stdout and stderr', async () => {
      const commandNodes: InterpolatableValue = [ createTextNode('echo "Out" && >&2 echo "Err"') ];
      const node = createRunDirective(commandNodes, createLocation(), 'runCommand');
      const processingContext = createMockProcessingContext(node, stateServiceMock); // Pass mock
      
      resolutionServiceMock.resolveNodes.mockResolvedValueOnce('echo "Out" && >&2 echo "Err"'); // Use mock
      fileSystemServiceMock.executeCommand.mockResolvedValueOnce({ stdout: 'Out', stderr: 'Err' }); // Use mock
      
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
      const processingContext = createMockProcessingContext(node, stateServiceMock); // Pass mock
      
      resolutionServiceMock.resolveNodes.mockResolvedValueOnce('echo Success'); // Use mock
      fileSystemServiceMock.executeCommand.mockResolvedValueOnce({ stdout: 'transformed output', stderr: '' }); // Use mock
      stateServiceMock.isTransformationEnabled.mockReturnValue(true); // Use mock
      
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