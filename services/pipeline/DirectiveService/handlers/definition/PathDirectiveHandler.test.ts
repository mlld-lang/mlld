import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PathDirectiveHandler } from './PathDirectiveHandler.js';
import { createPathDirective, createLocation } from '@tests/utils/testFactories.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { DirectiveNode } from '../../../../node_modules/meld-spec/dist/types.js';
import { DirectiveError } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';

describe('PathDirectiveHandler', () => {
  let handler: PathDirectiveHandler;
  let validationService: IValidationService;
  let stateService: IStateService;
  let resolutionService: IResolutionService;
  let clonedState: IStateService;

  beforeEach(() => {
    validationService = {
      validate: vi.fn()
    } as unknown as IValidationService;

    clonedState = {
      setPathVar: vi.fn(),
      clone: vi.fn()
    } as unknown as IStateService;

    stateService = {
      setPathVar: vi.fn(),
      clone: vi.fn().mockReturnValue(clonedState)
    } as unknown as IStateService;

    resolutionService = {
      resolveInContext: vi.fn()
    } as unknown as IResolutionService;

    handler = new PathDirectiveHandler(
      validationService,
      stateService,
      resolutionService
    );
  });

  describe('basic path handling', () => {
    it('should process simple paths', async () => {
      const node = createPathDirective('projectPath', '/path/to/project', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('/path/to/project');

      const result = await handler.execute(node, context);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(stateService.clone).toHaveBeenCalled();
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(
        '/path/to/project',
        expect.any(Object)
      );
      expect(clonedState.setPathVar).toHaveBeenCalledWith('projectPath', '/path/to/project');
      expect(result).toBe(clonedState);
    });

    it('should handle paths with variables', async () => {
      const node = createPathDirective('configPath', '${basePath}/config', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('/base/path/config');

      const result = await handler.execute(node, context);

      expect(stateService.clone).toHaveBeenCalled();
      expect(clonedState.setPathVar).toHaveBeenCalledWith('configPath', '/base/path/config');
      expect(result).toBe(clonedState);
    });

    it('should handle relative paths', async () => {
      const node = createPathDirective('relativePath', './config', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('./config');

      const result = await handler.execute(node, context);

      expect(stateService.clone).toHaveBeenCalled();
      expect(clonedState.setPathVar).toHaveBeenCalledWith('relativePath', './config');
      expect(result).toBe(clonedState);
    });
  });

  describe('error handling', () => {
    it('should handle validation errors', async () => {
      const node = createPathDirective('invalidPath', '', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(validationService.validate).mockImplementationOnce(() => {
        throw new DirectiveError('Invalid path', 'path');
      });

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
    });

    it('should handle resolution errors', async () => {
      const node = createPathDirective('errorPath', '${undefined}', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockRejectedValueOnce(
        new Error('Resolution error')
      );

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
    });

    it('should handle state errors', async () => {
      const node = createPathDirective('errorPath', '/some/path', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('/some/path');
      vi.mocked(stateService.clone).mockReturnValue(clonedState);
      vi.mocked(clonedState.setPathVar).mockImplementation(() => {
        throw new Error('State error');
      });

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
    });
  });
}); 