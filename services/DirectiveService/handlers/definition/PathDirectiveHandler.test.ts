import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PathDirectiveHandler } from './PathDirectiveHandler.js';
import { createPathDirective, createLocation } from '@tests/utils/testFactories.js';
import type { IValidationService } from '@services/ValidationService/IValidationService.js';
import type { IStateService } from '@services/StateService/IStateService.js';
import type { IResolutionService } from '@services/ResolutionService/IResolutionService.js';
import type { DirectiveNode } from '../../../../node_modules/meld-spec/dist/types.js';
import { DirectiveError } from '@services/DirectiveService/errors/DirectiveError.js';

describe('PathDirectiveHandler', () => {
  let handler: PathDirectiveHandler;
  let validationService: IValidationService;
  let stateService: IStateService;
  let resolutionService: IResolutionService;

  beforeEach(() => {
    validationService = {
      validate: vi.fn()
    };

    stateService = {
      setPathVar: vi.fn()
    } as unknown as IStateService;

    resolutionService = {
      resolvePath: vi.fn()
    } as unknown as IResolutionService;

    handler = new PathDirectiveHandler(
      validationService,
      stateService,
      resolutionService
    );
  });

  describe('path handling', () => {
    it('should handle $HOMEPATH paths', async () => {
      const node = createPathDirective('docs', '$HOMEPATH/docs', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(resolutionService.resolvePath).mockResolvedValueOnce('/home/user/docs');

      await handler.execute(node, context);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(
        '$HOMEPATH/docs',
        expect.objectContaining({
          pathValidation: {
            requireAbsolute: true,
            allowedRoots: ['$PROJECTPATH', '$HOMEPATH', '$~', '$.']
          }
        })
      );
      expect(stateService.setPathVar).toHaveBeenCalledWith('docs', '/home/user/docs');
    });

    it('should handle $PROJECTPATH paths', async () => {
      const node = createPathDirective('src', '$PROJECTPATH/src', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(resolutionService.resolvePath).mockResolvedValueOnce('/project/src');

      await handler.execute(node, context);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(
        '$PROJECTPATH/src',
        expect.objectContaining({
          pathValidation: {
            requireAbsolute: true,
            allowedRoots: ['$PROJECTPATH', '$HOMEPATH', '$~', '$.']
          }
        })
      );
      expect(stateService.setPathVar).toHaveBeenCalledWith('src', '/project/src');
    });

    it('should handle $~ alias for $HOMEPATH', async () => {
      const node = createPathDirective('config', '$~/config', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(resolutionService.resolvePath).mockResolvedValueOnce('/home/user/config');

      await handler.execute(node, context);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(
        '$~/config',
        expect.objectContaining({
          pathValidation: {
            requireAbsolute: true,
            allowedRoots: ['$PROJECTPATH', '$HOMEPATH', '$~', '$.']
          }
        })
      );
      expect(stateService.setPathVar).toHaveBeenCalledWith('config', '/home/user/config');
    });

    it('should handle $. alias for $PROJECTPATH', async () => {
      const node = createPathDirective('test', '$./test', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(resolutionService.resolvePath).mockResolvedValueOnce('/project/test');

      await handler.execute(node, context);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(
        '$./test',
        expect.objectContaining({
          pathValidation: {
            requireAbsolute: true,
            allowedRoots: ['$PROJECTPATH', '$HOMEPATH', '$~', '$.']
          }
        })
      );
      expect(stateService.setPathVar).toHaveBeenCalledWith('test', '/project/test');
    });
  });

  describe('error handling', () => {
    it('should propagate validation errors', async () => {
      const node = createPathDirective('test', '$HOMEPATH/test', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(validationService.validate).mockImplementationOnce(() => {
        throw new DirectiveError('Validation error', 'path');
      });

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
    });

    it('should handle resolution errors', async () => {
      const node = createPathDirective('test', '$HOMEPATH/test', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(resolutionService.resolvePath).mockRejectedValueOnce(
        new Error('Resolution error')
      );

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
    });

    it('should handle state errors', async () => {
      const node = createPathDirective('test', '$HOMEPATH/test', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(resolutionService.resolvePath).mockResolvedValueOnce('/home/user/test');
      vi.mocked(stateService.setPathVar).mockRejectedValueOnce(
        new Error('State error')
      );

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
    });

    it('should wrap non-DirectiveErrors', async () => {
      const node = createPathDirective('test', '$HOMEPATH/test', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(stateService.setPathVar).mockRejectedValueOnce(
        new Error('Unknown error')
      );

      const error = await handler.execute(node, context).catch(e => e);
      expect(error).toBeInstanceOf(DirectiveError);
      expect(error.details.cause).toBeDefined();
    });
  });
}); 