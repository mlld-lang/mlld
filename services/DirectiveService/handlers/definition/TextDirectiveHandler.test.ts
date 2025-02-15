import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TextDirectiveHandler } from './TextDirectiveHandler';
import { createTextDirective, createLocation } from '../../../../tests/utils/testFactories';
import type { IValidationService } from '../../../ValidationService/IValidationService';
import type { IStateService } from '../../../StateService/IStateService';
import type { IResolutionService } from '../../../ResolutionService/IResolutionService';
import type { DirectiveNode } from 'meld-spec';
import { DirectiveError } from '../../errors/DirectiveError';

describe('TextDirectiveHandler', () => {
  let handler: TextDirectiveHandler;
  let validationService: IValidationService;
  let stateService: IStateService;
  let resolutionService: IResolutionService;

  beforeEach(() => {
    validationService = {
      validate: vi.fn()
    };

    stateService = {
      setTextVar: vi.fn()
    } as unknown as IStateService;

    resolutionService = {
      resolveInContext: vi.fn()
    } as unknown as IResolutionService;

    handler = new TextDirectiveHandler(
      validationService,
      stateService,
      resolutionService
    );
  });

  describe('string literal handling', () => {
    it('should process single-quoted string', async () => {
      const node = createTextDirective('greeting', "'Hello'", createLocation(1, 1));
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('Hello');

      await handler.execute(node, context);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(
        'Hello',
        expect.objectContaining({
          currentFilePath: 'test.meld',
          allowedVariableTypes: {
            text: true,
            data: true,
            path: true,
            command: true
          }
        })
      );
      expect(stateService.setTextVar).toHaveBeenCalledWith('greeting', 'Hello');
    });

    it('should process double-quoted string', async () => {
      const node = createTextDirective('greeting', '"Hello"', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('Hello');

      await handler.execute(node, context);
      expect(stateService.setTextVar).toHaveBeenCalledWith('greeting', 'Hello');
    });

    it('should process template literal', async () => {
      const node = createTextDirective('greeting', '`Hello`', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('Hello');

      await handler.execute(node, context);
      expect(stateService.setTextVar).toHaveBeenCalledWith('greeting', 'Hello');
    });

    it('should handle variables in string', async () => {
      const node = createTextDirective('greeting', '`Hello ${name}`', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('Hello World');

      await handler.execute(node, context);
      expect(stateService.setTextVar).toHaveBeenCalledWith('greeting', 'Hello World');
    });
  });

  describe('directive value handling', () => {
    it('should pass through @embed directive', async () => {
      const embedValue = '@embed [content.md]';
      const node = createTextDirective('content', embedValue, createLocation(1, 1));
      const context = { currentFilePath: 'test.meld' };

      await handler.execute(node, context);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(resolutionService.resolveInContext).not.toHaveBeenCalled();
      expect(stateService.setTextVar).toHaveBeenCalledWith('content', embedValue);
    });

    it('should pass through @run directive', async () => {
      const runValue = '@run [command]';
      const node = createTextDirective('result', runValue, createLocation(1, 1));
      const context = { currentFilePath: 'test.meld' };

      await handler.execute(node, context);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(resolutionService.resolveInContext).not.toHaveBeenCalled();
      expect(stateService.setTextVar).toHaveBeenCalledWith('result', runValue);
    });

    it('should pass through @call directive', async () => {
      const callValue = '@call api.method [path]';
      const node = createTextDirective('result', callValue, createLocation(1, 1));
      const context = { currentFilePath: 'test.meld' };

      await handler.execute(node, context);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(resolutionService.resolveInContext).not.toHaveBeenCalled();
      expect(stateService.setTextVar).toHaveBeenCalledWith('result', callValue);
    });
  });

  describe('error handling', () => {
    it('should propagate validation errors', async () => {
      const node = createTextDirective('test', "'value'", createLocation(1, 1));
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(validationService.validate).mockImplementationOnce(() => {
        throw new DirectiveError('Validation error', 'text');
      });

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
    });

    it('should handle resolution errors', async () => {
      const node = createTextDirective('test', "'${undefined}'", createLocation(1, 1));
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(resolutionService.resolveInContext).mockRejectedValueOnce(
        new Error('Resolution error')
      );

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
    });

    it('should wrap non-DirectiveErrors', async () => {
      const node = createTextDirective('test', "'value'", createLocation(1, 1));
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(stateService.setTextVar).mockRejectedValueOnce(
        new Error('Unknown error')
      );

      const error = await handler.execute(node, context).catch(e => e);
      expect(error).toBeInstanceOf(DirectiveError);
      expect(error.details.cause).toBeDefined();
    });
  });
}); 