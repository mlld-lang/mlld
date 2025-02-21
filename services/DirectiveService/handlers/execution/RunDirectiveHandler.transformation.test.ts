import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DirectiveNode, DirectiveContext } from 'meld-spec';
import { RunDirectiveHandler } from './RunDirectiveHandler.js';
import type { IValidationService } from '@services/ValidationService/IValidationService.js';
import type { IStateService } from '@services/StateService/IStateService.js';
import type { IResolutionService } from '@services/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/FileSystemService/IFileSystemService.js';
import { createRunDirective, createLocation } from '@tests/utils/testFactories.js';

describe('RunDirectiveHandler Transformation', () => {
  let handler: RunDirectiveHandler;
  let validationService: IValidationService;
  let stateService: IStateService;
  let resolutionService: IResolutionService;
  let fileSystemService: IFileSystemService;
  let clonedState: IStateService;

  beforeEach(() => {
    validationService = {
      validate: vi.fn()
    } as unknown as IValidationService;

    clonedState = {
      setTextVar: vi.fn(),
      clone: vi.fn().mockReturnThis(),
      isTransformationEnabled: vi.fn().mockReturnValue(true)
    } as unknown as IStateService;

    stateService = {
      setTextVar: vi.fn(),
      clone: vi.fn().mockReturnValue(clonedState),
      isTransformationEnabled: vi.fn().mockReturnValue(true)
    } as unknown as IStateService;

    resolutionService = {
      resolveInContext: vi.fn()
    } as unknown as IResolutionService;

    fileSystemService = {
      getCwd: vi.fn().mockReturnValue('/workspace'),
      executeCommand: vi.fn()
    } as unknown as IFileSystemService;

    handler = new RunDirectiveHandler(
      validationService,
      resolutionService,
      stateService,
      fileSystemService
    );

    // Reset mocks
    vi.clearAllMocks();
  });

  describe('transformation behavior', () => {
    it('should return replacement node with command output when transformation enabled', async () => {
      const node = createRunDirective('echo test', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('echo test');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: 'test output',
        stderr: ''
      });

      const result = await handler.execute(node, context);

      expect(result.replacementNode).toBeDefined();
      expect(result.replacementNode).toEqual({
        type: 'Text',
        content: 'test output',
        location: node.location
      });
      expect(result.state).toBe(clonedState);
    });

    it('should handle variable interpolation in command during transformation', async () => {
      const node = createRunDirective('echo ${message}', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('echo Hello World');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: 'Hello World',
        stderr: ''
      });

      const result = await handler.execute(node, context);

      expect(result.replacementNode).toBeDefined();
      expect(result.replacementNode).toEqual({
        type: 'Text',
        content: 'Hello World',
        location: node.location
      });
      expect(result.state).toBe(clonedState);
    });

    it('should handle stderr output in transformation', async () => {
      const node = createRunDirective('echo error >&2', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('echo error >&2');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: '',
        stderr: 'error output'
      });

      const result = await handler.execute(node, context);

      expect(result.replacementNode).toBeDefined();
      expect(result.replacementNode).toEqual({
        type: 'Text',
        content: 'error output',
        location: node.location
      });
      expect(result.state).toBe(clonedState);
    });

    it('should handle both stdout and stderr in transformation', async () => {
      const node = createRunDirective('echo test && echo error >&2', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('echo test && echo error >&2');
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({
        stdout: 'test output',
        stderr: 'error output'
      });

      const result = await handler.execute(node, context);

      expect(result.replacementNode).toBeDefined();
      expect(result.replacementNode).toEqual({
        type: 'Text',
        content: 'test output\nerror output',
        location: node.location
      });
      expect(result.state).toBe(clonedState);
    });

    it('should preserve error handling during transformation', async () => {
      const node = createRunDirective('invalid-command', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('invalid-command');
      vi.mocked(fileSystemService.executeCommand).mockRejectedValue(new Error('Command failed'));

      await expect(handler.execute(node, context)).rejects.toThrow('Failed to execute command: Command failed');
    });
  });
}); 