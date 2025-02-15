import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataDirectiveHandler } from './DataDirectiveHandler';
import { createDataDirective, createLocation } from '../../../../tests/utils/testFactories';
import type { IValidationService } from '../../../ValidationService/IValidationService';
import type { IStateService } from '../../../StateService/IStateService';
import type { IResolutionService } from '../../../ResolutionService/IResolutionService';
import type { DirectiveNode } from '../../../../node_modules/meld-spec/dist/types';
import type { ResolutionContext } from '../../../ResolutionService/IResolutionService';

describe('DataDirectiveHandler', () => {
  let handler: DataDirectiveHandler;
  let validationService: IValidationService;
  let stateService: IStateService;
  let resolutionService: IResolutionService;

  beforeEach(() => {
    validationService = {
      validate: vi.fn()
    };

    stateService = {
      setDataVar: vi.fn()
    } as unknown as IStateService;

    resolutionService = {
      resolveInContext: vi.fn()
    } as unknown as IResolutionService;

    handler = new DataDirectiveHandler(
      validationService,
      stateService,
      resolutionService
    );
  });

  describe('basic data handling', () => {
    it('should handle simple data values', async () => {
      const node = createDataDirective('test', 'value', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('"value"');

      await handler.execute(node, context);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(
        '"value"',
        expect.any(Object)
      );
      expect(stateService.setDataVar).toHaveBeenCalledWith('test', 'value');
    });

    it('should handle object values', async () => {
      const node = createDataDirective('test', { key: 'value' }, createLocation(1, 1));
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('{"key":"value"}');

      await handler.execute(node, context);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(
        '{"key":"value"}',
        expect.any(Object)
      );
      expect(stateService.setDataVar).toHaveBeenCalledWith('test', { key: 'value' });
    });

    it('should handle array values', async () => {
      const node = createDataDirective('test', [1, 2, 3], createLocation(1, 1));
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('[1,2,3]');

      await handler.execute(node, context);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(
        '[1,2,3]',
        expect.any(Object)
      );
      expect(stateService.setDataVar).toHaveBeenCalledWith('test', [1, 2, 3]);
    });
  });

  describe('error handling', () => {
    it('should propagate validation errors', async () => {
      const node = createDataDirective('test', 'value', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(validationService.validate).mockImplementationOnce(() => {
        throw new Error('Validation error');
      });

      await expect(handler.execute(node, context)).rejects.toThrow('Validation error');
    });

    it('should handle resolution errors', async () => {
      const node = createDataDirective('test', 'value', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(resolutionService.resolveInContext).mockRejectedValueOnce(
        new Error('Resolution error')
      );

      await expect(handler.execute(node, context)).rejects.toThrow('Resolution error');
    });

    it('should handle invalid JSON', async () => {
      const node = createDataDirective('test', 'value', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('invalid json');

      await expect(handler.execute(node, context)).rejects.toThrow(SyntaxError);
    });
  });
}); 