import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestContext } from '@tests/utils/index.js';
import { MeldInterpreterError } from '@core/errors/MeldInterpreterError.js';
import type { TextNode } from 'meld-spec';

describe('InterpreterService Integration', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = new TestContext();
    await context.initialize();
    await context.fixtures.load('interpreterTestProject');
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('Basic interpretation', () => {
    it('interprets text nodes', async () => {
      const content = 'Hello world';
      const nodes = await context.services.parser.parse(content);
      const result = await context.services.interpreter.interpret(nodes);
      const resultNodes = result.getNodes();
      expect(resultNodes).toHaveLength(1);
      expect(resultNodes[0].type).toBe('Text');
      expect((resultNodes[0] as TextNode).content).toBe('Hello world');
    });

    it('interprets directive nodes', async () => {
      const content = '@text test = "Hello"';
      const nodes = await context.services.parser.parse(content);
      const result = await context.services.interpreter.interpret(nodes);
      const value = result.getTextVar('test');
      expect(value).toBe('Hello');
    });

    it('maintains node order in state', async () => {
      const content = `@text first = "1"
@text second = "2"
@text third = "3"`;
      const nodes = await context.services.parser.parse(content);
      
      const result = await context.services.interpreter.interpret(nodes);
      const stateNodes = result.getNodes();
      expect(stateNodes).toHaveLength(3);
      expect(stateNodes[0].type).toBe('Directive');
      expect((stateNodes[0] as any).directive.identifier).toBe('first');
      expect(stateNodes[1].type).toBe('Directive');
      expect((stateNodes[1] as any).directive.identifier).toBe('second');
      expect(stateNodes[2].type).toBe('Directive');
      expect((stateNodes[2] as any).directive.identifier).toBe('third');
    });
  });

  describe('State management', () => {
    it('creates isolated states for different interpretations', async () => {
      const content = '@text test = "value"';
      const nodes = await context.services.parser.parse(content);
      const result1 = await context.services.interpreter.interpret(nodes);
      const result2 = await context.services.interpreter.interpret(nodes);
      expect(result1).not.toBe(result2);
      expect(result1.getTextVar('test')).toBe('value');
      expect(result2.getTextVar('test')).toBe('value');
    });

    it('merges child state back to parent', async () => {
      const content = '@text child = "value"';
      const nodes = await context.services.parser.parse(content);
      const parentState = context.services.state.createChildState();
      await context.services.interpreter.interpret(nodes, { initialState: parentState, mergeState: true });
      expect(parentState.getTextVar('child')).toBe('value');
    });

    it('maintains isolation with mergeState: false', async () => {
      const content = '@text isolated = "value"';
      const nodes = await context.services.parser.parse(content);
      const parentState = context.services.state.createChildState();
      await context.services.interpreter.interpret(nodes, { initialState: parentState, mergeState: false });
      expect(parentState.getTextVar('isolated')).toBeUndefined();
    });

    it('handles state rollback on merge errors', async () => {
      const content = '@text test = "${nonexistent}"';
      const parentState = context.services.state.createChildState();
      parentState.setTextVar('parent', 'Parent');
      const nodes = await context.services.parser.parse(content);
      try {
        await context.services.interpreter.interpret(nodes, { initialState: parentState, mergeState: true });
        expect.fail('Should have thrown error');
      } catch (error) {
        if (error instanceof MeldInterpreterError) {
          expect(error.nodeType).toBe('Directive');
          expect(parentState.getTextVar('parent')).toBe('Parent');
          expect(parentState.getTextVar('test')).toBeUndefined();
        } else {
          throw error;
        }
      }
    });
  });

  describe('Error handling', () => {
    it('handles circular imports', async () => {
      const content = '@import path = "project/nested/circular1.meld"';
      const nodes = await context.services.parser.parse(content);
      await expect(context.services.interpreter.interpret(nodes, {
        filePath: 'project/nested/circular1.meld'
      })).rejects.toThrow(/circular/i);
    });

    it('provides location information in errors', async () => {
      const content = '@text test';
      const nodes = await context.services.parser.parse(content);
      try {
        await context.services.interpreter.interpret(nodes);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(MeldInterpreterError);
        if (error instanceof MeldInterpreterError) {
          expect(error.location).toBeDefined();
          expect(error.nodeType).toBe('Directive');
        }
      }
    });

    it('maintains state consistency after errors', async () => {
      const content = `@text valid = "OK"
@text invalid = "\${nonexistent}"
@text after = "Bad"`;
      const nodes = await context.services.parser.parse(content);
      try {
        await context.services.interpreter.interpret(nodes);
        expect.fail('Should have thrown error');
      } catch (error) {
        if (error instanceof MeldInterpreterError) {
          const state = context.services.state.createChildState();
          expect(state.getTextVar('valid')).toBeUndefined();
          expect(state.getTextVar('after')).toBeUndefined();
        } else {
          throw error;
        }
      }
    });

    it('includes state context in interpreter errors', async () => {
      const content = '@text test = "${nonexistent}"';
      const nodes = await context.services.parser.parse(content);
      try {
        await context.services.interpreter.interpret(nodes, { filePath: 'test.meld' });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(MeldInterpreterError);
        if (error instanceof MeldInterpreterError && error.context?.state) {
          expect(error.context.state.filePath).toBe('test.meld');
          expect(error.context.state.nodeCount).toBeDefined();
        } else {
          expect.fail('Error should have state context');
        }
      }
    });

    it('rolls back state on directive errors', async () => {
      const content = `@text before = "OK"
@text error = "\${nonexistent}"
@text after = "Bad"`;
      const nodes = await context.services.parser.parse(content);
      const parentState = context.services.state.createChildState();
      
      try {
        await context.services.interpreter.interpret(nodes, {
          initialState: parentState,
          mergeState: true
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(MeldInterpreterError);
        expect(parentState.getTextVar('before')).toBeUndefined();
        expect(parentState.getTextVar('error')).toBeUndefined();
        expect(parentState.getTextVar('after')).toBeUndefined();
      }
    });
  });

  describe('Complex scenarios', () => {
    it('handles nested imports with state inheritance', async () => {
      const content = '@import path = "project/src/main.meld"';
      const nodes = await context.services.parser.parse(content);
      const state = await context.services.interpreter.interpret(nodes);

      expect(state.getTextVar('root')).toBe('Root');     // from main.meld
      expect(state.getTextVar('child')).toBe('Child');   // from child.meld
      expect(state.getTextVar('common')).toBe('Shared'); // from common.meld
      expect(state.getDataVar('nums')).toEqual([1, 2, 3]);
      expect(state.getDataVar('shared')).toEqual({ type: 'common' });
    });

    it('maintains correct file paths during interpretation', async () => {
      const content = '@import path = "project/src/main.meld"';
      const nodes = await context.services.parser.parse(content);
      const state = await context.services.interpreter.interpret(nodes, {
        filePath: 'project/src/main.meld'
      });

      expect(state.getCurrentFilePath()).toBe('project/src/main.meld');
    });

    it('handles cleanup on circular imports', async () => {
      // First create circular import files
      await context.builder.create({
        files: {
          'a.meld': '@import path = "b.meld"',
          'b.meld': '@import path = "a.meld"'
        }
      });

      const content = await context.fs.readFile('a.meld');
      const nodes = await context.services.parser.parse(content);
      
      try {
        await context.services.interpreter.interpret(nodes, {
          filePath: 'a.meld'
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(MeldInterpreterError);
        if (error instanceof MeldInterpreterError) {
          expect(error.message).toMatch(/circular/i);
          // Verify state is cleaned up
          const state = context.services.state.createChildState();
          expect(state.getNodes()).toHaveLength(0);
        }
      }
    });

    it('maintains correct state after successful imports', async () => {
      await context.builder.create({
        files: {
          'main.meld': [
            '@text main = "main"',
            '@import path = "sub.meld"',
            '@text after = "after"'
          ].join('\n'),
          'sub.meld': '@text sub = "sub"'
        }
      });

      const content = await context.fs.readFile('main.meld');
      const nodes = await context.services.parser.parse(content);
      const result = await context.services.interpreter.interpret(nodes, {
        filePath: 'main.meld'
      });

      expect(result.getTextVar('main')).toBe('main');
      expect(result.getTextVar('sub')).toBe('sub');
      expect(result.getTextVar('after')).toBe('after');
      
      // Verify node order is preserved
      const resultNodes = result.getNodes();
      expect(resultNodes[0].type).toBe('Directive'); // main
      expect(resultNodes[1].type).toBe('Directive'); // import
      expect(resultNodes[2].type).toBe('Directive'); // sub (from import)
      expect(resultNodes[3].type).toBe('Directive'); // after
    });
  });

  describe('AST structure handling', () => {
    it('handles text directives with correct format', async () => {
      const content = '@text greeting = "Hello"';
      const nodes = await context.services.parser.parse(content);
      const result = await context.services.interpreter.interpret(nodes);
      expect(result.getTextVar('greeting')).toBe('Hello');
    });

    it('handles data directives with correct format', async () => {
      const content = '@data count = 42';
      const nodes = await context.services.parser.parse(content);
      const result = await context.services.interpreter.interpret(nodes);
      expect(result.getDataVar('count')).toBe(42);
    });

    it('handles path directives with correct format', async () => {
      const content = '@path config = "$HOMEPATH/.config/settings.json"';
      const nodes = await context.services.parser.parse(content);
      const result = await context.services.interpreter.interpret(nodes);
      const configPath = result.getTextVar('config');
      expect(configPath).toContain('.config/settings.json');
    });

    it('handles complex directives with schema validation', async () => {
      const content = '@data user : Person = { "name": "Alice", "age": 30 }';
      const nodes = await context.services.parser.parse(content);
      const result = await context.services.interpreter.interpret(nodes);
      const user = result.getDataVar('user');
      expect(user).toEqual({ name: 'Alice', age: 30 });
    });

    it('maintains correct node order with mixed content', async () => {
      const content = `
# Title
@text greeting = "Hello"
Some text
@data count = 42
\`\`\`
code block
\`\`\`
@path config = "$HOMEPATH/config.json"
`;
      const nodes = await context.services.parser.parse(content);
      const result = await context.services.interpreter.interpret(nodes);
      const resultNodes = result.getNodes();
      
      // Verify node order and types
      expect(resultNodes[0].type).toBe('Text'); // # Title
      expect(resultNodes[1].type).toBe('Directive'); // @text
      expect(resultNodes[2].type).toBe('Text'); // Some text
      expect(resultNodes[3].type).toBe('Directive'); // @data
      expect(resultNodes[4].type).toBe('CodeFence'); // code block
      expect(resultNodes[5].type).toBe('Directive'); // @path
    });

    it('handles nested directive values correctly', async () => {
      const content = `
@text name = "Alice"
@text greeting = "Hello \${name}"
@data config = {
  "user": "\${name}",
  "message": "\${greeting}"
}`;
      const nodes = await context.services.parser.parse(content);
      const result = await context.services.interpreter.interpret(nodes);
      
      expect(result.getTextVar('name')).toBe('Alice');
      expect(result.getTextVar('greeting')).toBe('Hello Alice');
      expect(result.getDataVar('config')).toEqual({
        user: 'Alice',
        message: 'Hello Alice'
      });
    });
  });
}); 