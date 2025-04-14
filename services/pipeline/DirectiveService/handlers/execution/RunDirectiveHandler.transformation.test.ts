import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { DirectiveNode, DirectiveContext } from '@core/syntax/types.js';
import { RunDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { createRunDirective, createLocation } from '@tests/utils/testFactories.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import {
  createValidationServiceMock,
  createStateServiceMock,
  createResolutionServiceMock,
  createFileSystemServiceMock,
  createDirectiveErrorMock
} from '@tests/utils/mocks/serviceMocks.js';
import { mock, mockDeep } from 'vitest-mock-extended';
import type { DirectiveProcessingContext, FormattingContext, ResolutionContext } from '@core/types/index.js';

/**
 * RunDirectiveHandler Transformation Test Status
 * -----------------------------------------------
 * 
 * MIGRATION STATUS: Complete
 * 
 * This test file has been fully migrated to use:
 * - TestContextDI for container management
 * - Standardized mock factories with vitest-mock-extended
 * - Direct constructor injection for handler instantiation
 * - Proper cleanup to prevent container leaks
 */

describe('RunDirectiveHandler Transformation', () => {
  let handler: RunDirectiveHandler;
  let validationService: ReturnType<typeof createValidationServiceMock>;
  let stateService: ReturnType<typeof createStateServiceMock>;
  let resolutionService: ReturnType<typeof createResolutionServiceMock>;
  let fileSystemService: ReturnType<typeof createFileSystemServiceMock>;
  let clonedState: any;
  let context: TestContextDI;
  let mockProcessingContext: DirectiveProcessingContext;

  beforeEach(async () => {
    // Create context with isolated container
    context = TestContextDI.create({ isolatedContainer: true });
    
    // Create mocks using standardized factories
    validationService = createValidationServiceMock();
    stateService = createStateServiceMock();
    resolutionService = createResolutionServiceMock();
    fileSystemService = createFileSystemServiceMock();

    clonedState = {
      setTextVar: vi.fn(),
      clone: vi.fn().mockReturnThis(),
      isTransformationEnabled: vi.fn().mockReturnValue(true),
      transformNode: vi.fn()
    };

    // Configure mock behaviors
    stateService.clone.mockReturnValue(clonedState);
    stateService.isTransformationEnabled.mockReturnValue(true);
    stateService.getCurrentFilePath.mockReturnValue('/project/run_transform.meld');
    stateService.setTextVar.mockImplementation(async (name: string, value: string): Promise<TextVariable> => {
        return { type: VariableType.TEXT, name, value } as TextVariable;
    });
    fileSystemService.getCwd.mockReturnValue('/workspace');

    // Create handler directly with the mocks
    handler = new RunDirectiveHandler(
      resolutionService,
      fileSystemService
    );
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  const createMockProcessingContext = (node: DirectiveNode): DirectiveProcessingContext => {
      const mockResolutionContext = mockDeep<ResolutionContext>();
      const mockFormattingContext = mockDeep<FormattingContext>();
      if (!stateService) {
        throw new Error('Test setup error: stateService is not defined');
      }
      expect(stateService.getCurrentFilePath).toBeDefined(); 
      expect(stateService.isTransformationEnabled).toBeDefined();
      
      return {
          state: stateService, 
          resolutionContext: mockResolutionContext,
          formattingContext: mockFormattingContext,
          directiveNode: node,
          executionContext: { cwd: '/workspace' },
      };
  };

  describe('transformation behavior', () => {
    it('should return replacement node with command output when transformation enabled', async () => {
      const node = createRunDirective('echo test', createLocation(1, 1));
      mockProcessingContext = createMockProcessingContext(node);
      vi.mocked(resolutionService.resolveNodes).mockResolvedValue('echo "output"');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({ stdout: 'output', stderr: '' });
      
      const result = await handler.execute(mockProcessingContext);

      expect(result.replacement).toEqual(expect.objectContaining({
        type: 'Text',
        content: 'output'
      }));
      expect(result.state).toBe(stateService);
    });

    it('should handle variable interpolation in command during transformation', async () => {
      const node = createRunDirective('echo {{message}}', createLocation(1, 1));
      mockProcessingContext = createMockProcessingContext(node);
      vi.mocked(resolutionService.resolveNodes).mockResolvedValue('echo Hello World');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({ stdout: 'Hello World', stderr: '' });

      const result = await handler.execute(mockProcessingContext);

      expect(result.replacement).toEqual(expect.objectContaining({
        type: 'Text',
        content: 'Hello World'
      }));
      expect(result.state).toBe(stateService);
    });

    it('should handle stderr output in transformation', async () => {
      const node = createRunDirective('echo error >&2', createLocation(1, 1));
      mockProcessingContext = createMockProcessingContext(node);
      vi.mocked(resolutionService.resolveNodes).mockResolvedValue('echo Err >&2');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({ stdout: '', stderr: 'Error output' });

      const result = await handler.execute(mockProcessingContext);

      expect(result.replacement).toEqual(expect.objectContaining({
        type: 'Text',
        content: 'Error output'
      }));
      expect(result.state).toBe(stateService);
      expect(stateService.setTextVar).toHaveBeenCalledWith('stderr', 'Error output');
    });

    it('should handle both stdout and stderr in transformation', async () => {
      const node = createRunDirective('echo test && echo error >&2', createLocation(1, 1));
      mockProcessingContext = createMockProcessingContext(node);
      vi.mocked(resolutionService.resolveNodes).mockResolvedValue('echo Out && echo Err >&2');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({ stdout: 'Out', stderr: 'Err' });

      const result = await handler.execute(mockProcessingContext);

      expect(result.replacement).toEqual(expect.objectContaining({
        type: 'Text',
        content: 'Out\nErr'
      }));
      expect(result.state).toBe(stateService);
      expect(stateService.setTextVar).toHaveBeenCalledWith('stdout', 'Out');
      expect(stateService.setTextVar).toHaveBeenCalledWith('stderr', 'Err');
    });

    it('should preserve error handling during transformation', async () => {
      const node = createRunDirective('invalid-command', createLocation(1, 1));
      mockProcessingContext = createMockProcessingContext(node);
      const executionError = new Error('Command failed');
      vi.mocked(resolutionService.resolveNodes).mockResolvedValue('bad-command');
      vi.mocked(fileSystemService.executeCommand).mockRejectedValue(executionError);

      await expect(handler.execute(mockProcessingContext)).rejects.toThrow('Failed to execute command: Command failed');
    });
  });
}); 