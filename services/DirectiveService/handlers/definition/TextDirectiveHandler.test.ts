import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TextDirectiveHandler } from './TextDirectiveHandler.js';
import { createTextDirective, createLocation } from '@tests/utils/testFactories.js';
import type { IValidationService } from '@services/ValidationService/IValidationService.js';
import type { IStateService } from '@services/StateService/IStateService.js';
import type { IResolutionService } from '@services/ResolutionService/IResolutionService.js';
import type { DirectiveNode } from 'meld-spec';
import { DirectiveError } from '@services/DirectiveService/errors/DirectiveError.js';

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
    it('should process string literals with location information', async () => {
      const location = createLocation(1, 1, 1, 20);
      const node = createTextDirective('greeting', 'Hello', location);
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('Hello');

      await handler.execute(node, context);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(
        'Hello',
        expect.objectContaining({
          allowNested: true,
          allowedVariableTypes: {
            command: true,
            data: true,
            path: true,
            text: true
          },
          currentFilePath: 'test.meld'
        })
      );
      expect(stateService.setTextVar).toHaveBeenCalledWith('greeting', 'Hello');
      expect(node.location).toEqual(location);
    });

    it('should process double-quoted string', async () => {
      const node = createTextDirective('greeting', 'Hello', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('Hello');

      await handler.execute(node, context);
      expect(stateService.setTextVar).toHaveBeenCalledWith('greeting', 'Hello');
    });

    it('should process template literal', async () => {
      const node = createTextDirective('greeting', 'Hello', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('Hello');

      await handler.execute(node, context);
      expect(stateService.setTextVar).toHaveBeenCalledWith('greeting', 'Hello');
    });

    it('should handle variables in string with location information', async () => {
      const location = createLocation(1, 1, 1, 25);
      const node = createTextDirective('greeting', 'Hello ${name}', location);
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('Hello World');

      await handler.execute(node, context);
      expect(stateService.setTextVar).toHaveBeenCalledWith('greeting', 'Hello World');
      expect(node.location).toEqual(location);
    });
  });

  describe('directive value handling', () => {
    it('should pass through @embed directive with location information', async () => {
      const location = createLocation(1, 1, 1, 30);
      const embedValue = '@embed [content.md]';
      const node = createTextDirective('content', embedValue, location);
      const context = { currentFilePath: 'test.meld' };

      await handler.execute(node, context);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(resolutionService.resolveInContext).not.toHaveBeenCalled();
      expect(stateService.setTextVar).toHaveBeenCalledWith('content', embedValue);
      expect(node.location).toEqual(location);
    });

    it('should pass through @run directive with location information', async () => {
      const location = createLocation(1, 1, 1, 25);
      const runValue = '@run [command]';
      const node = createTextDirective('result', runValue, location);
      const context = { currentFilePath: 'test.meld' };

      await handler.execute(node, context);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(resolutionService.resolveInContext).not.toHaveBeenCalled();
      expect(stateService.setTextVar).toHaveBeenCalledWith('result', runValue);
      expect(node.location).toEqual(location);
    });

    it('should pass through @call directive with location information', async () => {
      const location = createLocation(1, 1, 1, 35);
      const callValue = '@call api.method [path]';
      const node = createTextDirective('result', callValue, location);
      const context = { currentFilePath: 'test.meld' };

      await handler.execute(node, context);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(resolutionService.resolveInContext).not.toHaveBeenCalled();
      expect(stateService.setTextVar).toHaveBeenCalledWith('result', callValue);
      expect(node.location).toEqual(location);
    });
  });

  describe('error handling', () => {
    it('should propagate validation errors with location information', async () => {
      const location = createLocation(1, 1, 1, 15);
      const node = createTextDirective('test', 'value', location);
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(validationService.validate).mockImplementationOnce(() => {
        throw new DirectiveError('Validation error', 'text');
      });

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
      expect(node.location).toEqual(location);
    });

    it('should handle resolution errors with location information', async () => {
      const location = createLocation(1, 1, 1, 20);
      const node = createTextDirective('test', '${undefined}', location);
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(resolutionService.resolveInContext).mockRejectedValueOnce(
        new Error('Resolution error')
      );

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
      expect(node.location).toEqual(location);
    });

    it('should wrap non-DirectiveErrors with location information', async () => {
      const location = createLocation(1, 1, 1, 15);
      const node = createTextDirective('test', 'value', location);
      const context = { currentFilePath: 'test.meld' };

      vi.mocked(stateService.setTextVar).mockRejectedValueOnce(
        new Error('Unknown error')
      );

      const error = await handler.execute(node, context).catch(e => e);
      expect(error).toBeInstanceOf(DirectiveError);
      expect(error.details.cause).toBeDefined();
      expect(node.location).toEqual(location);
    });
  });
}); 