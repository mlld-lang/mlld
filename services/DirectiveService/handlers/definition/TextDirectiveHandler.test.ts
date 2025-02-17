import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TextDirectiveHandler } from './TextDirectiveHandler.js';
import { createTextDirective, createLocation } from '@tests/utils/testFactories.js';
import type { IValidationService } from '@services/ValidationService/IValidationService.js';
import type { IStateService } from '@services/StateService/IStateService.js';
import type { IResolutionService } from '@services/ResolutionService/IResolutionService.js';
import type { DirectiveNode } from 'meld-spec';
import { DirectiveError } from '@services/DirectiveService/errors/DirectiveError.js';
import { DirectiveErrorCode } from '@services/DirectiveService/errors/DirectiveError.js';

describe('TextDirectiveHandler', () => {
  let handler: TextDirectiveHandler;
  let validationService: IValidationService;
  let stateService: IStateService;
  let resolutionService: IResolutionService;
  let clonedState: IStateService;

  beforeEach(() => {
    validationService = {
      validate: vi.fn()
    };

    clonedState = {
      setTextVar: vi.fn(),
      clone: vi.fn()
    } as unknown as IStateService;

    stateService = {
      setTextVar: vi.fn(),
      clone: vi.fn().mockReturnValue(clonedState)
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
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('Hello');

      const result = await handler.execute(node, context);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(stateService.clone).toHaveBeenCalled();
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
      expect(clonedState.setTextVar).toHaveBeenCalledWith('greeting', 'Hello');
      expect(result).toBe(clonedState);
      expect(node.location).toEqual(location);
    });

    it('should process double-quoted string', async () => {
      const node = createTextDirective('greeting', 'Hello', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('Hello');

      const result = await handler.execute(node, context);

      expect(stateService.clone).toHaveBeenCalled();
      expect(clonedState.setTextVar).toHaveBeenCalledWith('greeting', 'Hello');
      expect(result).toBe(clonedState);
    });

    it('should process template literal', async () => {
      const node = createTextDirective('greeting', 'Hello', createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('Hello');

      const result = await handler.execute(node, context);

      expect(stateService.clone).toHaveBeenCalled();
      expect(clonedState.setTextVar).toHaveBeenCalledWith('greeting', 'Hello');
      expect(result).toBe(clonedState);
    });

    it('should handle variables in string with location information', async () => {
      const location = createLocation(1, 1, 1, 25);
      const node = createTextDirective('greeting', 'Hello ${name}', location);
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('Hello World');

      const result = await handler.execute(node, context);

      expect(stateService.clone).toHaveBeenCalled();
      expect(clonedState.setTextVar).toHaveBeenCalledWith('greeting', 'Hello World');
      expect(result).toBe(clonedState);
      expect(node.location).toEqual(location);
    });
  });

  describe('directive value handling', () => {
    it('should pass through @embed directive with location information', async () => {
      const location = createLocation(1, 1, 1, 30);
      const embedValue = '@embed [content.md]';
      const node = createTextDirective('content', embedValue, location);
      const context = { currentFilePath: 'test.meld', state: stateService };

      const result = await handler.execute(node, context);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(stateService.clone).toHaveBeenCalled();
      expect(resolutionService.resolveInContext).not.toHaveBeenCalled();
      expect(clonedState.setTextVar).toHaveBeenCalledWith('content', embedValue);
      expect(result).toBe(clonedState);
      expect(node.location).toEqual(location);
    });

    it('should pass through @run directive with location information', async () => {
      const location = createLocation(1, 1, 1, 25);
      const runValue = '@run [command]';
      const node = createTextDirective('result', runValue, location);
      const context = { currentFilePath: 'test.meld', state: stateService };

      const result = await handler.execute(node, context);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(stateService.clone).toHaveBeenCalled();
      expect(resolutionService.resolveInContext).not.toHaveBeenCalled();
      expect(clonedState.setTextVar).toHaveBeenCalledWith('result', runValue);
      expect(result).toBe(clonedState);
      expect(node.location).toEqual(location);
    });

    it('should pass through @call directive with location information', async () => {
      const location = createLocation(1, 1, 1, 35);
      const callValue = '@call api.method [path]';
      const node = createTextDirective('result', callValue, location);
      const context = { currentFilePath: 'test.meld', state: stateService };

      const result = await handler.execute(node, context);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(stateService.clone).toHaveBeenCalled();
      expect(resolutionService.resolveInContext).not.toHaveBeenCalled();
      expect(clonedState.setTextVar).toHaveBeenCalledWith('result', callValue);
      expect(result).toBe(clonedState);
      expect(node.location).toEqual(location);
    });
  });

  describe('error handling', () => {
    it('should propagate validation errors with location information', async () => {
      const node = createTextDirective('invalid', createLocation(1, 1, 1, 15));
      const context = {
        currentFilePath: 'test.meld',
        state: stateService,
        parentState: undefined
      };

      vi.mocked(validationService.validate).mockImplementation(() => {
        throw new DirectiveError('Validation failed', 'text');
      });

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
    });

    it('should handle resolution errors with location information', async () => {
      const node = createTextDirective('${missing}', createLocation(1, 1, 1, 20));
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

    it('should wrap non-DirectiveErrors with location information', async () => {
      const location = createLocation(1, 1, 1, 15);
      const node = createTextDirective('error', location);
      const context = {
        currentFilePath: 'test.meld',
        state: stateService,
        parentState: undefined
      };

      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockImplementation(() => {
        throw new Error('Resolution failed');
      });

      try {
        await handler.execute(node, context);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(DirectiveError);
        expect(error.details.cause).toBeDefined();
        expect(error.location).toEqual({
          start: { line: 1, column: 1 },
          end: { line: 1, column: 15 }
        });
        expect(error.kind).toBe('text');
        expect(error.code).toBe(DirectiveErrorCode.RESOLUTION_FAILED);
      }
    });
  });
}); 