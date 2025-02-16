import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CommandResolver } from './CommandResolver.js';
import { IStateService } from '@services/StateService/IStateService.js';
import { ResolutionContext, ResolutionErrorCode } from '@services/ResolutionService/IResolutionService.js';
import { ResolutionError } from '@services/ResolutionService/errors/ResolutionError.js';
import { TestContext } from '@tests/utils/TestContext.js';
import { MeldNode, DirectiveNode, TextNode } from 'meld-spec';

describe('CommandResolver', () => {
  let resolver: CommandResolver;
  let stateService: IStateService;
  let context: ResolutionContext;
  let testContext: TestContext;

  beforeEach(async () => {
    testContext = new TestContext();
    await testContext.initialize();

    stateService = testContext.factory.createMockStateService();
    resolver = new CommandResolver(stateService);

    context = {
      currentFilePath: 'test.meld',
      allowedVariableTypes: {
        text: true,
        data: true,
        path: true,
        command: true
      }
    };
  });

  afterEach(async () => {
    await testContext.cleanup();
  });

  describe('resolve', () => {
    it('should return content of text node unchanged', async () => {
      const node: TextNode = {
        type: 'Text',
        content: 'no commands here'
      };
      const result = await resolver.resolve(node, context);
      expect(result).toBe('no commands here');
    });

    it('should resolve command without parameters', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'run',
          identifier: 'simple',
          args: []
        }
      };
      vi.mocked(stateService.getCommand).mockReturnValue({
        command: '@run [echo test]'
      });

      const result = await resolver.resolve(node, context);
      expect(result).toBe('echo test');
      expect(stateService.getCommand).toHaveBeenCalledWith('simple');
    });

    it('should resolve command with parameters', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'run',
          identifier: 'echo',
          args: ['hello', 'world']
        }
      };
      vi.mocked(stateService.getCommand).mockReturnValue({
        command: '@run [echo ${param1} ${param2}]'
      });

      const result = await resolver.resolve(node, context);
      expect(result).toBe('echo hello world');
      expect(stateService.getCommand).toHaveBeenCalledWith('echo');
    });

    it('should handle commands with options', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'run',
          identifier: 'echo',
          args: ['test']
        }
      };
      vi.mocked(stateService.getCommand).mockReturnValue({
        command: '@run [echo ${text}]',
        options: { background: true }
      });

      const result = await resolver.resolve(node, context);
      expect(result).toBe('echo test');
    });
  });

  describe('error handling', () => {
    it('should throw when commands are not allowed', async () => {
      context.allowedVariableTypes.command = false;
      const node = {
        type: 'Directive',
        directive: {
          kind: 'run',
          identifier: 'test',
          value: 'value'
        }
      } as DirectiveNode;

      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow('Command references are not allowed in this context');
    });

    it('should throw on undefined command', async () => {
      const node = {
        type: 'Directive',
        directive: {
          kind: 'run',
          identifier: 'missing',
          value: ''
        }
      } as DirectiveNode;
      vi.mocked(stateService.getCommand).mockReturnValue(undefined);
      
      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow('Undefined command: missing');
    });

    it('should throw on invalid command format', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'run',
          identifier: 'invalid',
          args: []
        }
      };
      vi.mocked(stateService.getCommand).mockReturnValue({
        command: 'invalid format'
      });

      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow('Invalid command definition: must start with @run [');
    });

    it('should throw on parameter count mismatch', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'run',
          identifier: 'echo',
          args: ['one']
        }
      };
      vi.mocked(stateService.getCommand).mockReturnValue({
        command: '@run [echo ${one} ${two}]'
      });

      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow('Command echo expects 2 parameters but got 1');
    });

    it('should throw on invalid node type', async () => {
      const node = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'test',
          value: ''
        }
      } as DirectiveNode;
      
      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow('Invalid node type for command resolution');
    });

    it('should throw on missing command identifier', async () => {
      const node = {
        type: 'Directive',
        directive: {
          kind: 'run',
          value: ''
        }
      } as DirectiveNode;
      
      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow('Command identifier is required');
    });
  });

  describe('extractReferences', () => {
    it('should extract command identifier from command directive', async () => {
      const node = {
        type: 'Directive',
        directive: {
          kind: 'run',
          identifier: 'test',
          value: ''
        }
      } as DirectiveNode;
      const refs = resolver.extractReferences(node);
      expect(refs).toEqual(['test']);
    });

    it('should return empty array for non-command directive', async () => {
      const node = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'test',
          value: ''
        }
      } as DirectiveNode;
      const refs = resolver.extractReferences(node);
      expect(refs).toEqual([]);
    });

    it('should return empty array for text node', async () => {
      const node = {
        type: 'Text',
        content: 'no references here'
      } as TextNode;
      const refs = resolver.extractReferences(node);
      expect(refs).toEqual([]);
    });
  });
}); 