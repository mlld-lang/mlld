import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CommandResolver } from './CommandResolver';
import { IStateService } from '../../StateService/IStateService';
import { ResolutionContext } from '../IResolutionService';
import { ResolutionError } from '../errors/ResolutionError';
import { TestContext } from '../../../tests/utils/TestContext';
import type { MeldNode, DirectiveNode, TextNode } from 'meld-spec';

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
          name: 'simple',
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
          name: 'echo',
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
          name: 'echo',
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
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'run',
          name: 'cmd',
          args: []
        }
      };

      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow('Command references are not allowed in this context');
    });

    it('should throw on undefined command', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'run',
          name: 'missing',
          args: []
        }
      };
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
          name: 'invalid',
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
          name: 'echo',
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
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          name: 'test'
        }
      };
      
      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow('Invalid node type for command resolution');
    });

    it('should throw on missing command name', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'run'
        }
      };
      
      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow('Command name is required');
    });
  });

  describe('extractReferences', () => {
    it('should extract command name from command directive', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'run',
          name: 'test',
          args: []
        }
      };
      const refs = resolver.extractReferences(node);
      expect(refs).toEqual(['test']);
    });

    it('should return empty array for non-command directive', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          name: 'test'
        }
      };
      const refs = resolver.extractReferences(node);
      expect(refs).toEqual([]);
    });

    it('should return empty array for text node', () => {
      const node: TextNode = {
        type: 'Text',
        content: 'no references here'
      };
      const refs = resolver.extractReferences(node);
      expect(refs).toEqual([]);
    });
  });
}); 