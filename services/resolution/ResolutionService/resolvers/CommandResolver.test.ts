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
import { getExample, getInvalidExample, createNodeFromExample } from '@tests/utils/syntax-test-helpers.js';
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
      // ORIGINAL IMPLEMENTATION:
      // Keeping original node structure since we understand what CommandResolver expects
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'run',
          identifier: 'simple',
          args: []
        }
      };
      
      // MIGRATION NOTE: The centralized examples create nodes with a different structure
      // than what CommandResolver expects. For now, we'll keep using the manually created node.
      // In the future, we would update either the createNodeFromExample helper or the CommandResolver
      // to align on the expected node structure.
      
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
        ])
        .mockResolvedValueOnce([
          createTextNode('Some text {{var}} echo '),
          createDirectiveNode('text', { identifier: 'param1' }),
          createTextNode(' '),
          createDirectiveNode('text', { identifier: 'param2' }),
          createTextNode(' more text')
        ]);

      const result = await resolver.resolve(node, context);
      expect(result).toBe('echo hello world');
      expect(stateService.getCommand).toHaveBeenCalledWith('echo');
      expect(parserService.parse).toHaveBeenCalledTimes(2);
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
        command: '@run [echo {{text}}]',
        options: { background: true }
      });

      // Mock parser for both command parsing and parameter extraction
      vi.mocked(parserService.parse)
        .mockResolvedValueOnce([
          createDirectiveNode('run', {
            identifier: 'echo',
            value: '{{text}}',
            args: []
          })
        ])
        .mockResolvedValueOnce([
          createTextNode('Some text {{var}} echo '),
          createDirectiveNode('text', { identifier: 'text' }),
          createTextNode(' more text')
        ]);

      const result = await resolver.resolve(node, context);
      expect(result).toBe('echo test');
      expect(parserService.parse).toHaveBeenCalledTimes(2);
    });

    it('should handle parsing errors gracefully by falling back to regex', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'run',
          identifier: 'echo',
          args: ['test']
        }
      };
      vi.mocked(stateService.getCommand).mockReturnValue({
        command: '@run [echo {{text}}]'
      });

      // Make parser throw an error to test fallback
      vi.mocked(parserService.parse).mockRejectedValue(new Error('Parsing failed'));

      const result = await resolver.resolve(node, context);
      expect(result).toBe('echo test');
    });

    // Add this temporary test to see the difference between the two node structures
    it.only('TEMP: compare node structures', async () => {
      // Create a node using the manual approach
      const manualNode: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'run',
          identifier: 'simple',
          args: []
        }
      };
      
      // Create a node using the createNodeFromExample approach
      const example = getExample('run', 'atomic', 'simple');
      const parsedNode = await createNodeFromExample(example.code);
      
      // Instead of console.log, let's use assertions
      expect(parsedNode.type).toBe(manualNode.type);
      expect(parsedNode.directive.kind).toBe(manualNode.directive.kind);
      
      // These are the likely differences
      expect(parsedNode.directive.identifier).toBe(manualNode.directive.identifier);
      expect(parsedNode.directive.args).toEqual(manualNode.directive.args);
      
      // Convert to strings to help see differences
      const manualStr = JSON.stringify(manualNode, null, 2);
      const parsedStr = JSON.stringify(parsedNode, null, 2);
      expect(parsedStr).toBe(manualStr);
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

    it('should handle undefined commands appropriately', async () => {
      vi.mocked(stateService.getCommand).mockReturnValue(undefined);
      
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'run',
          identifier: 'undefined',
          args: []
        }
      };
      
      try {
        await resolver.resolve(node, context);
        expect.fail('Expected to throw but did not');
      } catch (error) {
        expect(error).toBeInstanceOf(MeldResolutionError);
        expect((error as MeldResolutionError).severity).toBe(ErrorSeverity.Recoverable);
        expect((error as MeldResolutionError).message).toContain('Undefined command');
      }
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

      // Mock parser to throw an error for invalid command
      vi.mocked(parserService.parse).mockRejectedValue(new Error('Parse error'));

      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow('Invalid command format');
    });

    it('should handle parameter count mismatches appropriately', async () => {
      // Arrange
      const command = {
        command: '@run [echo {{param1}} {{param2}}]'
      };
      vi.mocked(stateService.getCommand).mockReturnValue(command);
      
      // Mock parser to properly handle parameter count
      vi.mocked(parserService.parse)
        .mockResolvedValueOnce([
          createDirectiveNode('run', {
            identifier: 'echo',
            value: '{{param1}} {{param2}}',
            args: []
          })
        ])
        .mockResolvedValueOnce([
          createTextNode('Some text '),
          createDirectiveNode('text', { identifier: 'param1' }),
          createTextNode(' '),
          createDirectiveNode('text', { identifier: 'param2' }),
          createTextNode(' more text')
        ]);
      
      // Act & Assert
      // Test too few parameters
      const tooFewNode: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'run',
          identifier: 'command',
          args: ['param1']
        }
      };
      
      try {
        await resolver.resolve(tooFewNode, context);
        expect.fail('Expected to throw but did not');
      } catch (error) {
        expect(error).toBeInstanceOf(MeldResolutionError);
        expect((error as MeldResolutionError).severity).toBe(ErrorSeverity.Fatal);
        expect((error as MeldResolutionError).message).toContain('expects 2 parameters but got 1');
      }
      
      // Test too many parameters
      const tooManyNode: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'run',
          identifier: 'command',
          args: ['param1', 'param2', 'param3']
        }
      };
      
      try {
        await resolver.resolve(tooManyNode, context);
        expect.fail('Expected to throw but did not');
      } catch (error) {
        expect(error).toBeInstanceOf(MeldResolutionError);
        expect((error as MeldResolutionError).severity).toBe(ErrorSeverity.Fatal);
        expect((error as MeldResolutionError).message).toContain('expects 2 parameters but got 3');
      }
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