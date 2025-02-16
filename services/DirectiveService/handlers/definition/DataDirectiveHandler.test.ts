import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataDirectiveHandler } from './DataDirectiveHandler.js';
import { createDataDirective, createLocation } from '@tests/utils/testFactories.js';
import type { IValidationService } from '@services/ValidationService/IValidationService.js';
import type { IStateService } from '@services/StateService/IStateService.js';
import type { IResolutionService } from '@services/ResolutionService/IResolutionService.js';
import type { DirectiveNode } from 'meld-spec';
import type { ResolutionContext } from '@services/ResolutionService/IResolutionService.js';

describe('DataDirectiveHandler', () => {
  let handler: DataDirectiveHandler;
  let validationService: IValidationService;
  let stateService: IStateService;
  let resolutionService: IResolutionService;

  beforeEach(() => {
    validationService = {
      validate: vi.fn()
    } as unknown as IValidationService;

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
    it('should handle simple data values with location information', async () => {
      const location = createLocation(1, 1, 1, 20);
      const node = createDataDirective('test', 'value', location);
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('value');

      await handler.execute(node, context);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(
        'value',
        expect.any(Object)
      );
      expect(stateService.setDataVar).toHaveBeenCalledWith('test', 'value');
      expect(node.location).toEqual(location);
    });

    it('should handle object values with location information', async () => {
      const location = createLocation(1, 1, 1, 30);
      const node = createDataDirective('test', { key: 'value' }, location);
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('{"key":"value"}');

      await handler.execute(node, context);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(
        '{"key":"value"}',
        expect.any(Object)
      );
      expect(stateService.setDataVar).toHaveBeenCalledWith('test', { key: 'value' });
      expect(node.location).toEqual(location);
    });

    it('should handle array values with location information', async () => {
      const location = createLocation(1, 1, 1, 25);
      const node = createDataDirective('test', [1, 2, 3], location);
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('[1,2,3]');

      await handler.execute(node, context);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(
        '[1,2,3]',
        expect.any(Object)
      );
      expect(stateService.setDataVar).toHaveBeenCalledWith('test', [1, 2, 3]);
      expect(node.location).toEqual(location);
    });
  });

  describe('error handling', () => {
    it('should propagate validation errors with location information', async () => {
      const location = createLocation(1, 1, 1, 15);
      const node = createDataDirective('test', 'value', location);
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(validationService.validate).mockImplementationOnce(() => {
        throw new Error('Validation error');
      });

      await expect(handler.execute(node, context)).rejects.toThrow('Validation error');
      expect(node.location).toEqual(location);
    });

    it('should handle resolution errors with location information', async () => {
      const location = createLocation(1, 1, 1, 15);
      const node = createDataDirective('test', 'value', location);
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(resolutionService.resolveInContext).mockRejectedValueOnce(
        new Error('Resolution error')
      );

      await expect(handler.execute(node, context)).rejects.toThrow('Resolution error');
      expect(node.location).toEqual(location);
    });

    it('should handle invalid JSON with location information', async () => {
      const location = createLocation(1, 1, 1, 15);
      const node = createDataDirective('test', 'value', location);
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('invalid json');

      await expect(handler.execute(node, context)).rejects.toThrow(SyntaxError);
      expect(node.location).toEqual(location);
    });
  });
}); 