import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TextDirectiveHandler } from './TextDirectiveHandler.js';
import { createMockStateService, createMockValidationService, createMockResolutionService } from '@tests/utils/testFactories.js';
import { DirectiveError } from '@services/DirectiveService/errors/DirectiveError.js';
import type { DirectiveNode } from 'meld-spec';
import type { IStateService } from '@services/StateService/IStateService.js';

describe('TextDirectiveHandler', () => {
  let handler: TextDirectiveHandler;
  let stateService: ReturnType<typeof createMockStateService>;
  let validationService: ReturnType<typeof createMockValidationService>;
  let resolutionService: ReturnType<typeof createMockResolutionService>;
  let clonedState: IStateService;

  beforeEach(() => {
    clonedState = {
      setTextVar: vi.fn(),
      getTextVar: vi.fn(),
      getDataVar: vi.fn(),
      clone: vi.fn(),
    } as unknown as IStateService;

    stateService = {
      setTextVar: vi.fn(),
      getTextVar: vi.fn(),
      getDataVar: vi.fn(),
      clone: vi.fn().mockReturnValue(clonedState)
    } as unknown as IStateService;

    validationService = createMockValidationService();
    resolutionService = createMockResolutionService();
    handler = new TextDirectiveHandler(validationService, stateService, resolutionService);
  });

  describe('execute', () => {
    it('should handle string literals correctly', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'greeting',
          value: "'Hello, world!'"
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('greeting', 'Hello, world!');
    });

    it('should handle string literals with escaped quotes', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'message',
          value: '"Say \\"hello\\" to the world"'
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('message', 'Say "hello" to the world');
    });

    it('should handle multiline string literals with backticks', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'template',
          value: '`line1\nline2`'
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('template', 'line1\nline2');
    });

    it('should reject invalid string literals', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'invalid',
          value: "'unclosed string"
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      await expect(handler.execute(node, context))
        .rejects
        .toThrow(DirectiveError);
    });

    it('should handle variable references', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'message',
          value: 'Hello ${name}!'
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(stateService.getTextVar).mockReturnValue('World');

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('message', 'Hello World!');
    });

    it('should handle data variable references', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'greeting',
          value: 'Hello ${user.name}!'
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(stateService.getDataVar).mockReturnValue({ name: 'Alice' });

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('greeting', 'Hello Alice!');
    });

    it('should handle environment variables', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'path',
          value: '${ENV_HOME}/project'
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      process.env.ENV_HOME = '/home/user';

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('path', '/home/user/project');

      delete process.env.ENV_HOME;
    });

    it('should handle pass-through directives', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'command',
          value: '@run echo "test"'
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('command', '@run echo "test"');
    });

    it('should throw on missing value', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'empty'
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      await expect(handler.execute(node, context))
        .rejects
        .toThrow(DirectiveError);
    });

    it('should throw on undefined variables', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'greeting',
          value: 'Hello ${missing}!'
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(stateService.getTextVar).mockReturnValue(undefined);
      vi.mocked(stateService.getDataVar).mockReturnValue(undefined);

      await expect(handler.execute(node, context))
        .rejects
        .toThrow(DirectiveError);
    });
  });
}); 