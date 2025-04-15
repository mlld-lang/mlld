import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { DirectiveNode, DirectiveContext, TextNode } from '@core/syntax/types.js';
import { RunDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { createRunDirective, createLocation } from '@tests/utils/testFactories.js';
import { mock, mockDeep } from 'vitest-mock-extended';
import type { DirectiveProcessingContext, FormattingContext, ResolutionContext } from '@core/types/index.js';
import { DirectiveTestFixture } from '@tests/utils/fixtures/DirectiveTestFixture.js';
import { TextVariable, VariableType } from '@core/types/variables.js';
import { DirectiveResult } from '@services/pipeline/DirectiveService/types.js';
import { MeldFileNotFoundError } from '@core/errors/MeldFileNotFoundError.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';

describe('RunDirectiveHandler Transformation', () => {
  let fixture: DirectiveTestFixture;
  let handler: RunDirectiveHandler;
  let mockProcessingContext: Partial<DirectiveProcessingContext>;

  beforeEach(async () => {
    fixture = await DirectiveTestFixture.create();

    vi.spyOn(fixture.stateService, 'isTransformationEnabled').mockReturnValue(true);
    vi.spyOn(fixture.stateService, 'getCurrentFilePath').mockReturnValue('/project/run_transform.meld');
    vi.spyOn(fixture.stateService, 'setTextVar').mockImplementation(async (name: string, value: string): Promise<TextVariable> => {
        return { type: VariableType.TEXT, name, value } as TextVariable;
    });
    vi.spyOn(fixture.fileSystemService, 'getCwd').mockReturnValue('/workspace');

    handler = await fixture.context.resolve(RunDirectiveHandler);
    fixture.handler = handler;
  });

  afterEach(async () => {
    await fixture?.cleanup();
  });

  const createMockProcessingContext = (node: DirectiveNode): Partial<DirectiveProcessingContext> => {
      const mockResolutionContext = mockDeep<ResolutionContext>();
      if (!fixture || !fixture.stateService) {
        throw new Error('Test setup error: fixture or stateService is not defined');
      }
      expect(fixture.stateService.getCurrentFilePath).toBeDefined(); 
      expect(fixture.stateService.isTransformationEnabled).toBeDefined();
      
      mockResolutionContext.currentFilePath = fixture.stateService.getCurrentFilePath();
      mockResolutionContext.state = fixture.stateService;
      mockResolutionContext.strict = true; 
      mockResolutionContext.depth = 0;
      mockResolutionContext.flags = {}; 
      mockResolutionContext.pathContext = { purpose: 'read' };

      return {
          state: fixture.stateService,
          resolutionContext: mockResolutionContext,
          directiveNode: node,
          executionContext: { cwd: '/workspace' },
      };
  };

  describe('transformation behavior', () => {
    it('should return replacement node with command output when transformation enabled', async () => {
      const node = createRunDirective('echo test', createLocation(1, 1));
      mockProcessingContext = createMockProcessingContext(node);
      vi.spyOn(fixture.resolutionService, 'resolveNodes').mockResolvedValue('echo "output"');
      vi.spyOn(fixture.fileSystemService, 'executeCommand').mockResolvedValue({ stdout: 'output', stderr: '' });
      
      const result = await handler.execute(mockProcessingContext as DirectiveProcessingContext);

      expect(result.replacement).toEqual(expect.objectContaining({
        type: 'Text',
        content: 'output'
      }));
      expect(result.state).toBe(fixture.stateService);
    });

    it('should handle variable interpolation in command during transformation', async () => {
      const node = createRunDirective('echo {{message}}', createLocation(1, 1));
      mockProcessingContext = createMockProcessingContext(node);
      vi.spyOn(fixture.resolutionService, 'resolveNodes').mockResolvedValue('echo Hello World');
      vi.spyOn(fixture.fileSystemService, 'executeCommand').mockResolvedValue({ stdout: 'Hello World', stderr: '' });

      const result = await handler.execute(mockProcessingContext as DirectiveProcessingContext);

      expect(result.replacement).toEqual(expect.objectContaining({
        type: 'Text',
        content: 'Hello World'
      }));
      expect(result.state).toBe(fixture.stateService);
    });

    it('should handle stderr output in transformation', async () => {
      const node = createRunDirective('echo error >&2', createLocation(1, 1));
      mockProcessingContext = createMockProcessingContext(node);
      vi.spyOn(fixture.resolutionService, 'resolveNodes').mockResolvedValue('echo Err >&2');
      vi.spyOn(fixture.fileSystemService, 'executeCommand').mockResolvedValue({ stdout: '', stderr: 'Error output' });

      const result = await handler.execute(mockProcessingContext as DirectiveProcessingContext);

      expect(result.replacement).toEqual(expect.objectContaining({
        type: 'Text',
        content: 'Error output'
      }));
      expect(result.state).toBe(fixture.stateService);
      expect(fixture.stateService.setTextVar).toHaveBeenCalledWith('stderr', 'Error output');
    });

    it('should handle both stdout and stderr in transformation', async () => {
      const node = createRunDirective('echo test && echo error >&2', createLocation(1, 1));
      mockProcessingContext = createMockProcessingContext(node);
      vi.spyOn(fixture.resolutionService, 'resolveNodes').mockResolvedValue('echo Out && echo Err >&2');
      vi.spyOn(fixture.fileSystemService, 'executeCommand').mockResolvedValue({ stdout: 'Out', stderr: 'Err' });

      const result = await handler.execute(mockProcessingContext as DirectiveProcessingContext);

      expect(result.replacement).toEqual(expect.objectContaining({
        type: 'Text',
        content: 'Out\nErr'
      }));
      expect(result.state).toBe(fixture.stateService);
      expect(fixture.stateService.setTextVar).toHaveBeenCalledWith('stdout', 'Out');
      expect(fixture.stateService.setTextVar).toHaveBeenCalledWith('stderr', 'Err');
    });

    it('should preserve error handling during transformation', async () => {
      const node = createRunDirective('invalid-command', createLocation(1, 1));
      mockProcessingContext = createMockProcessingContext(node);
      const executionError = new Error('Command failed');
      vi.spyOn(fixture.resolutionService, 'resolveNodes').mockResolvedValue('bad-command');
      vi.spyOn(fixture.fileSystemService, 'executeCommand').mockRejectedValue(executionError);

      await expect(handler.execute(mockProcessingContext as DirectiveProcessingContext)).rejects.toThrow(DirectiveError);
      await expect(handler.execute(mockProcessingContext as DirectiveProcessingContext)).rejects.toHaveProperty(
          'message', 
          expect.stringContaining('Failed to execute command: Command failed')
      );
    });
  });
}); 