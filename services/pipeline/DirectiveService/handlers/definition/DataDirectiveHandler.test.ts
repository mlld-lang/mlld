import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DataDirectiveHandler } from './DataDirectiveHandler.js';
import { createDataDirective, createLocation, createDirectiveNode } from '@tests/utils/testFactories.js';
import { TestContext } from '@tests/utils/TestContext.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { DirectiveNode } from 'meld-spec';
import type { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import { DirectiveError } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';

describe('DataDirectiveHandler', () => {
  let context: TestContext;
  let handler: DataDirectiveHandler;
  let validationService: IValidationService;
  let stateService: IStateService;
  let resolutionService: IResolutionService;
  let clonedState: IStateService;

  beforeEach(async () => {
    // Initialize test context with memfs
    context = new TestContext();
    await context.initialize();

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

  afterEach(async () => {
    await context.cleanup();
  });

  describe('basic data handling', () => {
    it('should process simple JSON data', async () => {
      const node = createDirectiveNode('data', {
        identifier: 'config',
        value: '{"key": "value"}'
      }, createLocation(1, 1, 1, 20, '/test.meld'));

      const directiveContext = { 
        currentFilePath: '/test.meld', 
        state: stateService 
      };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce('{"key": "value"}');

      const result = await handler.execute(node, directiveContext);

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
      }, createLocation(1, 1, 1, 35, '/test.meld'));

      const directiveContext = { 
        currentFilePath: '/test.meld', 
        state: stateService 
      };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce(jsonData);

      const result = await handler.execute(node, directiveContext);

      expect(stateService.clone).toHaveBeenCalled();
      expect(clonedState.setDataVar).toHaveBeenCalledWith('config', { nested: { key: 'value' } });
      expect(result).toBe(clonedState);
    });

    it('should handle JSON arrays', async () => {
      const jsonData = '[1, 2, 3]';
      const node = createDirectiveNode('data', {
        identifier: 'numbers',
        value: jsonData
      }, createLocation(1, 1, 1, 15, '/test.meld'));

      const directiveContext = { 
        currentFilePath: '/test.meld', 
        state: stateService 
      };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce(jsonData);

      const result = await handler.execute(node, directiveContext);

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
      }, createLocation(1, 1, 1, 20, '/test.meld'));

      const directiveContext = {
        currentFilePath: '/test.meld',
        state: stateService,
        parentState: undefined
      };

      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('{invalid: json}');

      await expect(handler.execute(node, directiveContext)).rejects.toThrow(DirectiveError);
    });

    it('should handle resolution errors', async () => {
      const node = createDirectiveNode('data', {
        identifier: 'error',
        value: '{{missing}}'
      }, createLocation(1, 1, 1, 15, '/test.meld'));

      const directiveContext = {
        currentFilePath: '/test.meld',
        state: stateService,
        parentState: undefined
      };

      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockImplementation(() => {
        throw new Error('Resolution failed');
      });

      await expect(handler.execute(node, directiveContext)).rejects.toThrow(DirectiveError);
    });

    it('should handle state errors', async () => {
      const node = createDirectiveNode('data', {
        identifier: 'error',
        value: '{ "key": "value" }'
      }, createLocation(1, 1, 1, 25, '/test.meld'));

      const directiveContext = {
        currentFilePath: '/test.meld',
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

      await expect(handler.execute(node, directiveContext)).rejects.toThrow(DirectiveError);
    });
  });

  describe('variable resolution', () => {
    it('should resolve variables in nested JSON structures', async () => {
      const node = createDirectiveNode('data', {
        identifier: 'config',
        value: JSON.stringify({
          user: {
            name: '{{userName}}',
            role: '{{userRole}}',
            settings: {
              theme: '{{theme}}',
              items: ['{{item1}}', '{{item2}}']
            }
          }
        })
      }, createLocation(1, 1, 1, 50, '/test.meld'));

      const directiveContext = {
        currentFilePath: '/test.meld',
        state: stateService
      };

      // Mock resolveInContext to handle variables within strings
      vi.mocked(resolutionService.resolveInContext)
        .mockImplementation(async (value: string) => {
          return value.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
            const vars: Record<string, string> = {
              userName: 'Alice',
              userRole: 'admin',
              theme: 'dark',
              item1: 'first',
              item2: 'second'
            };
            return vars[varName] || match;
          });
        });

      const result = await handler.execute(node, directiveContext);

      expect(clonedState.setDataVar).toHaveBeenCalledWith('config', {
        user: {
          name: 'Alice',
          role: 'admin',
          settings: {
            theme: 'dark',
            items: ['first', 'second']
          }
        }
      });
    });

    it('should handle JSON strings containing variable references', async () => {
      const node = createDirectiveNode('data', {
        identifier: 'message',
        value: '{"text": "Hello {{user}}!"}'
      }, createLocation(1, 1, 1, 30, '/test.meld'));

      const directiveContext = {
        currentFilePath: '/test.meld',
        state: stateService
      };

      // Mock resolveInContext to handle variables within strings
      vi.mocked(resolutionService.resolveInContext)
        .mockImplementation(async (value: string) => {
          return value.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
            const vars: Record<string, string> = {
              user: 'Alice'
            };
            return vars[varName] || match;
          });
        });

      const result = await handler.execute(node, directiveContext);

      expect(clonedState.setDataVar).toHaveBeenCalledWith('message', {
        text: 'Hello Alice!'
      });
    });

    it('should preserve JSON structure when resolving variables', async () => {
      const node = createDirectiveNode('data', {
        identifier: 'data',
        value: '{"array": [1, "{{var}}", 3], "object": {"key": "{{var}}"}}'
      }, createLocation(1, 1, 1, 40, '/test.meld'));

      const directiveContext = {
        currentFilePath: '/test.meld',
        state: stateService
      };

      vi.mocked(resolutionService.resolveInContext)
        .mockImplementation(async (value: string) => {
          return value.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
            const vars: Record<string, string> = {
              var: '2'
            };
            return vars[varName] || match;
          });
        });

      const result = await handler.execute(node, directiveContext);

      expect(clonedState.setDataVar).toHaveBeenCalledWith('data', {
        array: [1, '2', 3],
        object: { key: '2' }
      });
    });
  });
}); 