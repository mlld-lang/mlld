import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CommandResolver } from './CommandResolver.js';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { ResolutionContext, ResolutionErrorCode } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import { TestContext } from '@tests/utils/TestContext.js';
import { MeldNode, DirectiveNode, TextNode } from 'meld-spec';
import { MeldResolutionError } from '@core/errors/MeldResolutionError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { createMockParserService, createDirectiveNode, createTextNode } from '@tests/utils/testFactories.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import { expectThrowsWithSeverity } from '@tests/utils/ErrorTestUtils.js';

describe('CommandResolver', () => {
  let resolver: CommandResolver;
  let stateService: IStateService;
  let parserService: ReturnType<typeof createMockParserService>;
  let context: ResolutionContext;
  let testContext: TestContext;

  beforeEach(async () => {
    testContext = new TestContext();
    await testContext.initialize();

    stateService = testContext.factory.createMockStateService();
    parserService = createMockParserService();
    resolver = new CommandResolver(stateService, parserService);

    context = {
      currentFilePath: 'test.meld',
      allowedVariableTypes: {
        text: true,
        data: true,
        path: true,
        command: true
      },
      state: stateService
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
      // Create a run directive node directly with the new syntax
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

      // Mock parser to parse the command
      vi.mocked(parserService.parse).mockResolvedValue([
        createDirectiveNode('run', {
          identifier: 'echo',
          value: 'test',
          args: []
        })
      ]);

      const result = await resolver.resolve(node, context);
      expect(result).toBe('echo test');
      expect(stateService.getCommand).toHaveBeenCalledWith('simple');
      expect(parserService.parse).toHaveBeenCalled();
    });

    it('should resolve command with parameters', async () => {
      // Create a run directive node directly with the new syntax
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'run',
          identifier: 'echo',
          args: ['hello', 'world']
        }
      };
      
      vi.mocked(stateService.getCommand).mockReturnValue({
        command: '@run [echo {{param1}} {{param2}}]'
      });

      // Mock parser to parse the command and the parameter template
      vi.mocked(parserService.parse)
        .mockResolvedValueOnce([
          createDirectiveNode('run', {
            identifier: 'echo',
            value: '{{param1}} {{param2}}',
            args: []
          })
        ]);

      const result = await resolver.resolve(node, context);
      expect(result).toBe('echo hello world');
      expect(stateService.getCommand).toHaveBeenCalledWith('echo');
      expect(parserService.parse).toHaveBeenCalled();
    });

    it('should handle commands with options', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'run',
          identifier: 'complex',
          args: []
        }
      };

      vi.mocked(stateService.getCommand).mockReturnValue({
        command: '@run [echo -n "Hello World"]'
      });

      // Mock parser to parse the command
      vi.mocked(parserService.parse).mockResolvedValue([
        createDirectiveNode('run', {
          identifier: 'echo',
          value: '-n "Hello World"',
          args: []
        })
      ]);

      const result = await resolver.resolve(node, context);
      expect(result).toBe('-n "Hello World"');
      expect(stateService.getCommand).toHaveBeenCalledWith('complex');
      expect(parserService.parse).toHaveBeenCalled();
    });

    it('should handle parsing errors gracefully by falling back to regex', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'run',
          identifier: 'fallback',
          args: []
        }
      };

      vi.mocked(stateService.getCommand).mockReturnValue({
        command: '@run [echo test]'
      });

      // Mock parser to throw an error
      vi.mocked(parserService.parse).mockRejectedValue(new Error('Parse error'));

      const result = await resolver.resolve(node, context);
      expect(result).toBe('echo');
      expect(stateService.getCommand).toHaveBeenCalledWith('fallback');
      expect(parserService.parse).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should throw when command not found', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'run',
          identifier: 'missing',
          args: []
        }
      };

      vi.mocked(stateService.getCommand).mockReturnValue(undefined);

      await expectThrowsWithSeverity(
        () => resolver.resolve(node, context),
        MeldResolutionError,
        ErrorSeverity.Recoverable
      );
      expect(stateService.getCommand).toHaveBeenCalledWith('missing');
    });

    it('should throw when command has no command property', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'run',
          identifier: 'invalid',
          args: []
        }
      };

      vi.mocked(stateService.getCommand).mockReturnValue({ command: '' } as any);

      await expectThrowsWithSeverity(
        () => resolver.resolve(node, context),
        MeldResolutionError,
        ErrorSeverity.Fatal
      );
      expect(stateService.getCommand).toHaveBeenCalledWith('invalid');
    });

    it('should throw when command has empty command property', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'run',
          identifier: 'empty',
          args: []
        }
      };

      vi.mocked(stateService.getCommand).mockReturnValue({ command: '' });

      await expectThrowsWithSeverity(
        () => resolver.resolve(node, context),
        MeldResolutionError,
        ErrorSeverity.Fatal
      );
      expect(stateService.getCommand).toHaveBeenCalledWith('empty');
    });

    it('should throw when command has invalid command property', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'run',
          identifier: 'badformat',
          args: []
        }
      };

      vi.mocked(stateService.getCommand).mockReturnValue({ command: 'not a valid command format' });

      await expectThrowsWithSeverity(
        () => resolver.resolve(node, context),
        MeldResolutionError,
        ErrorSeverity.Fatal
      );
      expect(stateService.getCommand).toHaveBeenCalledWith('badformat');
    });
  });

  describe('extractReferences', () => {
    it('should extract command reference from run directive', async () => {
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