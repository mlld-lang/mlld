import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataDirectiveHandler } from './DataDirectiveHandler.js';
import { createDataDirective, createLocation, createDirectiveNode } from '@tests/utils/testFactories.js';
import type { IValidationService } from '@services/ValidationService/IValidationService.js';
import type { IStateService } from '@services/StateService/IStateService.js';
import type { IResolutionService } from '@services/ResolutionService/IResolutionService.js';
import type { DirectiveNode } from 'meld-spec';
import type { ResolutionContext } from '@services/ResolutionService/IResolutionService.js';
import { DirectiveError } from '@services/DirectiveService/errors/DirectiveError.js';

describe('DataDirectiveHandler', () => {
  let handler: DataDirectiveHandler;
  let validationService: IValidationService;
  let stateService: IStateService;
  let resolutionService: IResolutionService;
  let clonedState: IStateService;

  beforeEach(() => {
    validationService = {
      validate: vi.fn()
    } as unknown as IValidationService;

    clonedState = {
      setDataVar: vi.fn(),
      clone: vi.fn()
    } as unknown as IStateService;

    stateService = {
      setDataVar: vi.fn(),
      clone: vi.fn().mockReturnValue(clonedState)
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
    it('should process simple JSON data', async () => {
      const node = createDirectiveNode('data', {
        identifier: 'config',
        value: '{"key": "value"}'
      }, createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('{"key": "value"}');

      const result = await handler.execute(node, context);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(stateService.clone).toHaveBeenCalled();
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(
        '{"key": "value"}',
        expect.any(Object)
      );
      expect(clonedState.setDataVar).toHaveBeenCalledWith('config', { key: 'value' });
      expect(result).toBe(clonedState);
    });

    it('should handle nested JSON objects', async () => {
      const jsonData = '{"nested": {"key": "value"}}';
      const node = createDirectiveNode('data', {
        identifier: 'config',
        value: jsonData
      }, createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce(jsonData);

      const result = await handler.execute(node, context);

      expect(stateService.clone).toHaveBeenCalled();
      expect(clonedState.setDataVar).toHaveBeenCalledWith('config', { nested: { key: 'value' } });
      expect(result).toBe(clonedState);
    });

    it('should handle JSON arrays', async () => {
      const jsonData = '[1, 2, 3]';
      const node = createDirectiveNode('data', {
        identifier: 'numbers',
        value: jsonData
      }, createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce(jsonData);

      const result = await handler.execute(node, context);

      expect(stateService.clone).toHaveBeenCalled();
      expect(clonedState.setDataVar).toHaveBeenCalledWith('numbers', [1, 2, 3]);
      expect(result).toBe(clonedState);
    });
  });

  describe('error handling', () => {
    it('should handle invalid JSON', async () => {
      const node = createDirectiveNode('data', {
        identifier: 'invalid',
        value: '{invalid: json}'
      }, createLocation(1, 1));
      const context = {
        currentFilePath: 'test.meld',
        state: stateService,
        parentState: undefined
      };

      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('{invalid: json}');

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
    });

    it('should handle resolution errors', async () => {
      const node = createDirectiveNode('data', {
        identifier: 'error',
        value: '${missing}'
      }, createLocation(1, 1));
      const context = {
        currentFilePath: 'test.meld',
        state: stateService,
        parentState: undefined
      };

      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockImplementation(() => {
        throw new Error('Resolution failed');
      });

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
    });

    it('should handle state errors', async () => {
      const node = createDirectiveNode('data', {
        identifier: 'error',
        value: '{ "key": "value" }'
      }, createLocation(1, 1));
      const context = {
        currentFilePath: 'test.meld',
        state: stateService,
        parentState: undefined
      };

      const clonedState = {
        ...stateService,
        clone: vi.fn().mockReturnThis(),
        setDataVar: vi.fn().mockImplementation(() => {
          throw new Error('State error');
        })
      };

      vi.mocked(stateService.clone).mockReturnValue(clonedState);
      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('{ "key": "value" }');

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
    });
  });
}); 