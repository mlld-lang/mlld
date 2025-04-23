import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { DirectiveNode, DirectiveContext, TextNode, InterpolatableValue } from '@core/syntax/types';
import { RunDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import { createRunDirective, createLocation, createTextNode, createVariableReferenceNode } from '@tests/utils/testFactories';
import { mock, mockDeep } from 'vitest-mock-extended';
import type { DirectiveProcessingContext, FormattingContext, ResolutionContext } from '@core/types/index';
import { TextVariable, VariableType, MeldVariable } from '@core/types/variables';
import { DirectiveResult } from '@services/pipeline/DirectiveService/types';
import { MeldFileNotFoundError } from '@core/errors/MeldFileNotFoundError';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import { container, DependencyContainer } from 'tsyringe';
import { 
    createStateServiceMock,
    createResolutionServiceMock,
    createFileSystemServiceMock,
    createDirectiveErrorMock,
    createLoggerServiceMock,
} from '@tests/utils/mocks/serviceMocks.ts';
import type { ILogger } from '@core/utils/logger';
import { expectToThrowWithConfig, ErrorTestOptions } from '@tests/utils/ErrorTestUtils';

describe('RunDirectiveHandler Transformation', () => {
  let testContainer: DependencyContainer;
  let handler: RunDirectiveHandler;
  let stateServiceMock: ReturnType<typeof createStateServiceMock>;
  let resolutionServiceMock: ReturnType<typeof createResolutionServiceMock>;
  let fileSystemServiceMock: ReturnType<typeof createFileSystemServiceMock>;
  let loggerMock: ReturnType<typeof createLoggerServiceMock>;

  beforeEach(() => {
    testContainer = container.createChildContainer();

    stateServiceMock = createStateServiceMock();
    resolutionServiceMock = createResolutionServiceMock();
    fileSystemServiceMock = createFileSystemServiceMock();
    loggerMock = createLoggerServiceMock();

    stateServiceMock.isTransformationEnabled.mockReturnValue(true);
    stateServiceMock.getCurrentFilePath.mockReturnValue('/project/run_transform.meld');
    stateServiceMock.setVariable.mockImplementation(async (def: VariableDefinition): Promise<TextVariable> => {
        return { type: VariableType.TEXT, name: def.name, value: def.value as string, origin: def.origin, metadata: def.metadata } as TextVariable;
    });
    fileSystemServiceMock.getCwd.mockReturnValue('/workspace');

    testContainer.registerInstance<IStateService>('IStateService', stateServiceMock);
    testContainer.registerInstance<IResolutionService>('IResolutionService', resolutionServiceMock);
    testContainer.registerInstance<IFileSystemService>('IFileSystemService', fileSystemServiceMock);
    testContainer.registerInstance<ILogger>('MainLogger', loggerMock);
    testContainer.registerInstance<DependencyContainer>('DependencyContainer', testContainer);
    testContainer.register(RunDirectiveHandler, { useClass: RunDirectiveHandler });

    handler = testContainer.resolve(RunDirectiveHandler);
  });

  afterEach(() => {
    testContainer?.dispose();
    vi.clearAllMocks();
  });

  const createMockProcessingContext = (node: DirectiveNode, stateService: IStateService, overrides: Partial<DirectiveProcessingContext> = {}): DirectiveProcessingContext => {
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

  describe('transformation behavior', () => {
    it('should return replacement node with command output when transformation enabled', async () => {
      const commandNodes: InterpolatableValue = [ createTextNode('echo test') ];
      const node = createRunDirective(commandNodes, createLocation(1, 1), 'runCommand');
      const mockProcessingContext = createMockProcessingContext(node, stateServiceMock);
      
      resolutionServiceMock.resolveNodes.mockResolvedValueOnce('echo "output"');
      fileSystemServiceMock.executeCommand.mockResolvedValueOnce({ stdout: 'output', stderr: '' });
      
      const result = await handler.handle(mockProcessingContext as DirectiveProcessingContext);

      expect(result.replacement?.[0]).toMatchObject({ type: 'Text', content: 'output' });
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables?.stdout?.value).toBe('output');
      expect(result.stateChanges?.variables?.stderr?.value).toBe('');
    });

    it('should handle variable interpolation in command during transformation', async () => {
      const commandNodes: InterpolatableValue = [ createTextNode('echo '), createVariableReferenceNode('message', VariableType.TEXT) ];
      const node = createRunDirective(commandNodes, createLocation(1, 1), 'runCommand');
      const mockProcessingContext = createMockProcessingContext(node, stateServiceMock);
      
      resolutionServiceMock.resolveNodes.mockResolvedValueOnce('echo Hello World');
      fileSystemServiceMock.executeCommand.mockResolvedValueOnce({ stdout: 'Hello World', stderr: '' });

      const result = await handler.handle(mockProcessingContext as DirectiveProcessingContext);

      expect(result.replacement?.[0]).toMatchObject({ type: 'Text', content: 'Hello World' });
      expect(result.stateChanges?.variables?.stdout?.value).toBe('Hello World');
    });

    it('should handle stderr output in transformation', async () => {
      const commandNodes: InterpolatableValue = [ createTextNode('echo error >&2') ];
      const node = createRunDirective(commandNodes, createLocation(1, 1), 'runCommand');
      const mockProcessingContext = createMockProcessingContext(node, stateServiceMock);
      
      resolutionServiceMock.resolveNodes.mockResolvedValueOnce('echo Err >&2');
      fileSystemServiceMock.executeCommand.mockResolvedValueOnce({ stdout: '', stderr: 'Error output' });

      const result = await handler.handle(mockProcessingContext as DirectiveProcessingContext) as DirectiveResult;
      expect(result.replacement?.[0]).toMatchObject({ type: 'Text', content: 'Error output' });
      expect(result.stateChanges?.variables).toHaveProperty('stderr');
      const stderrDef = result.stateChanges?.variables?.stderr;
      expect(stderrDef?.type).toBe(VariableType.TEXT);
      expect(stderrDef?.value).toBe('Error output');
      expect(result.stateChanges?.variables).toHaveProperty('stdout');
      expect(result.stateChanges?.variables?.stdout?.value).toBe('');
    });

    it('should handle both stdout and stderr in transformation', async () => {
      const commandNodes: InterpolatableValue = [ createTextNode('echo test && echo error >&2') ];
      const node = createRunDirective(commandNodes, createLocation(1, 1), 'runCommand');
      const mockProcessingContext = createMockProcessingContext(node, stateServiceMock);
      
      resolutionServiceMock.resolveNodes.mockResolvedValueOnce('echo Out && echo Err >&2');
      fileSystemServiceMock.executeCommand.mockResolvedValueOnce({ stdout: 'Out', stderr: 'Err' });

      const result = await handler.handle(mockProcessingContext as DirectiveProcessingContext) as DirectiveResult;
      expect(result.replacement?.[0]).toMatchObject({ type: 'Text', content: 'Out\nErr' });
      expect(result.stateChanges?.variables).toHaveProperty('stdout');
      expect(result.stateChanges?.variables?.stdout?.value).toBe('Out');
      expect(result.stateChanges?.variables).toHaveProperty('stderr');
      expect(result.stateChanges?.variables?.stderr?.value).toBe('Err');
    });

    it('should preserve error handling during transformation', async () => {
      const commandNodes: InterpolatableValue = [ createTextNode('invalid-command') ];
      const node = createRunDirective(commandNodes, createLocation(1, 1), 'runCommand');
      const mockProcessingContext = createMockProcessingContext(node, stateServiceMock);
      const executionError = new Error('Command failed');
      
      resolutionServiceMock.resolveNodes.mockResolvedValueOnce('bad-command');
      fileSystemServiceMock.executeCommand.mockRejectedValue(executionError);

      await expectToThrowWithConfig(
          async () => await handler.handle(mockProcessingContext as DirectiveProcessingContext),
          {
              code: DirectiveErrorCode.EXECUTION_FAILED,
              messageContains: 'Failed to execute command: Command failed',
              cause: executionError
          } as ErrorTestOptions
      );
    });
  });
}); 