import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DefineDirectiveHandler } from './DefineDirectiveHandler.js';
import { 
  createMockStateService, 
  createMockValidationService, 
  createMockResolutionService,
  createDefineDirective,
  createLocation
} from '@tests/utils/testFactories.js';
import { DirectiveError } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import type { DirectiveNode } from 'meld-spec';
import type { IStateService } from '@services/state/StateService/IStateService.js';

describe('DefineDirectiveHandler', () => {
  let handler: DefineDirectiveHandler;
  let stateService: ReturnType<typeof createMockStateService>;
  let validationService: ReturnType<typeof createMockValidationService>;
  let resolutionService: ReturnType<typeof createMockResolutionService>;
  let clonedState: IStateService;

  beforeEach(() => {
    clonedState = {
      setCommand: vi.fn(),
      getCommand: vi.fn(),
      clone: vi.fn(),
    } as unknown as IStateService;

    stateService = {
      setCommand: vi.fn(),
      getCommand: vi.fn(),
      clone: vi.fn().mockReturnValue(clonedState)
    } as unknown as IStateService;

    validationService = createMockValidationService();
    resolutionService = createMockResolutionService();
    handler = new DefineDirectiveHandler(validationService, stateService, resolutionService);
  });

  describe('value processing', () => {
    it('should handle basic command definition without parameters', async () => {
      const node = createDefineDirective(
        'greet',
        'echo "Hello"',
        [],
        createLocation(1, 1, 1, 20)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      expect(clonedState.setCommand).toHaveBeenCalledWith('greet', {
        parameters: [],
        command: 'echo "Hello"'
      });
    });

    it('should handle command definition with parameters', async () => {
      const node = createDefineDirective(
        'greet',
        'echo "Hello ${name}"',
        ['name'],
        createLocation(1, 1, 1, 30)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      expect(clonedState.setCommand).toHaveBeenCalledWith('greet', {
        parameters: ['name'],
        command: 'echo "Hello ${name}"'
      });
    });

    it('should handle command definition with multiple parameters', async () => {
      const node = createDefineDirective(
        'greet',
        'echo "Hello ${first} ${last}"',
        ['first', 'last'],
        createLocation(1, 1, 1, 40)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      expect(clonedState.setCommand).toHaveBeenCalledWith('greet', {
        parameters: ['first', 'last'],
        command: 'echo "Hello ${first} ${last}"'
      });
    });
  });

  describe('metadata handling', () => {
    it('should handle command risk metadata', async () => {
      const node = createDefineDirective(
        'risky.risk.high',
        'rm -rf /',
        [],
        createLocation(1, 1, 1, 25)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      expect(clonedState.setCommand).toHaveBeenCalledWith('risky', {
        parameters: [],
        command: 'rm -rf /',
        metadata: {
          risk: 'high'
        }
      });
    });

    it('should handle command about metadata', async () => {
      const node = createDefineDirective(
        'cmd.about',
        'echo "test"',
        [],
        createLocation(1, 1, 1, 25)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      expect(clonedState.setCommand).toHaveBeenCalledWith('cmd', {
        parameters: [],
        command: 'echo "test"',
        metadata: {
          about: 'This is a description'
        }
      });
    });
  });

  describe('validation', () => {
    it('should validate command structure through ValidationService', async () => {
      const node = createDefineDirective(
        'cmd',
        'echo "test"',
        [],
        createLocation(1, 1, 1, 20)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      await handler.execute(node, context);
      expect(validationService.validate).toHaveBeenCalledWith(node);
    });

    it('should reject empty commands', async () => {
      const node = createDefineDirective(
        'invalid',
        '',
        [],
        createLocation(1, 1, 1, 20)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(validationService.validate).mockRejectedValueOnce(
        new DirectiveError('Command cannot be empty', 'define')
      );

      await expect(handler.execute(node, context))
        .rejects
        .toThrow(DirectiveError);
    });

    it('should reject missing parameters referenced in command', async () => {
      const node = createDefineDirective(
        'greet',
        'echo "Hello ${name}"',
        [],
        createLocation(1, 1, 1, 30)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(validationService.validate).mockRejectedValueOnce(
        new DirectiveError('Parameter name is referenced in command but not declared', 'define')
      );

      await expect(handler.execute(node, context))
        .rejects
        .toThrow(DirectiveError);
    });

    it('should reject invalid parameter names', async () => {
      const node = createDefineDirective(
        'greet',
        'echo "Hello ${123invalid}"',
        ['123invalid'],
        createLocation(1, 1, 1, 35)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(validationService.validate).mockRejectedValueOnce(
        new DirectiveError('Invalid parameter name: 123invalid', 'define')
      );

      await expect(handler.execute(node, context))
        .rejects
        .toThrow(DirectiveError);
    });

    it('should reject duplicate parameter names', async () => {
      const node = createDefineDirective(
        'greet',
        'echo "Hello ${name}"',
        ['name', 'name'],
        createLocation(1, 1, 1, 30)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(validationService.validate).mockRejectedValueOnce(
        new DirectiveError('Duplicate parameter names are not allowed', 'define')
      );

      await expect(handler.execute(node, context))
        .rejects
        .toThrow(DirectiveError);
    });

    it('should reject invalid metadata fields', async () => {
      const node = createDefineDirective(
        'cmd.invalid',
        'echo "test"',
        [],
        createLocation(1, 1, 1, 25)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(validationService.validate).mockRejectedValueOnce(
        new DirectiveError('Invalid metadata field. Only risk and about are supported', 'define')
      );

      await expect(handler.execute(node, context))
        .rejects
        .toThrow(DirectiveError);
    });
  });

  describe('state management', () => {
    it('should create new state for command storage', async () => {
      const node = createDefineDirective(
        'cmd',
        'echo "test"',
        [],
        createLocation(1, 1, 1, 20)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      await handler.execute(node, context);
      expect(stateService.clone).toHaveBeenCalled();
    });

    it('should store command in new state', async () => {
      const node = createDefineDirective(
        'cmd',
        'echo "test"',
        [],
        createLocation(1, 1, 1, 20)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      await handler.execute(node, context);
      expect(clonedState.setCommand).toHaveBeenCalledWith('cmd', {
        parameters: [],
        command: 'echo "test"'
      });
    });
  });

  describe('error handling', () => {
    it('should handle validation errors', async () => {
      const node = createDefineDirective(
        '',
        'echo "test"',
        [],
        createLocation(1, 1, 1, 20)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(validationService.validate).mockRejectedValueOnce(
        new DirectiveError('Invalid command', 'define')
      );

      const error = await handler.execute(node, context).catch(e => e);
      expect(error).toBeInstanceOf(DirectiveError);
      expect(error.details?.location).toBeDefined();
    });

    it('should handle resolution errors', async () => {
      const node = createDefineDirective(
        'cmd',
        'echo "${undefined}"',
        [],
        createLocation(1, 1, 1, 25)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(validationService.validate).mockRejectedValueOnce(
        new DirectiveError('Resolution error', 'define')
      );

      const error = await handler.execute(node, context).catch(e => e);
      expect(error).toBeInstanceOf(DirectiveError);
      expect(error.details?.location).toBeDefined();
    });

    it('should handle state errors', async () => {
      const node = createDefineDirective(
        'cmd',
        'echo "test"',
        [],
        createLocation(1, 1, 1, 20)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(stateService.clone).mockReturnValue(clonedState);
      vi.mocked(clonedState.setCommand).mockImplementation(() => {
        throw new Error('State error');
      });

      const error = await handler.execute(node, context).catch(e => e);
      expect(error).toBeInstanceOf(DirectiveError);
      expect(error.details?.location).toBeDefined();
    });
  });
});