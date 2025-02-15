import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestContext } from '../../tests/utils';
import { MeldInterpreterError } from '../../core/errors/MeldInterpreterError';
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
      const node = context.factory.createTextDirective('test', 'Hello');
      const nodes = [node];
      const result = await context.services.interpreter.interpret(nodes);
      const value = result.getTextVar('test');
      expect(value).toBe('Hello');
    });

    it('maintains node order in state', async () => {
      const nodes = [
        context.factory.createTextDirective('first', '1'),
        context.factory.createTextDirective('second', '2'),
        context.factory.createTextDirective('third', '3')
      ];
      
      const result = await context.services.interpreter.interpret(nodes);
      const stateNodes = result.getNodes();
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
      const node = context.factory.createTextDirective('test', 'value');
      const nodes = [node];
      const result1 = await context.services.interpreter.interpret(nodes);
      const result2 = await context.services.interpreter.interpret(nodes);
      expect(result1).not.toBe(result2);
      expect(result1.getTextVar('test')).toBe('value');
      expect(result2.getTextVar('test')).toBe('value');
    });

    it('merges child state back to parent', async () => {
      const node = context.factory.createTextDirective('child', 'value');
      const nodes = [node];
      const parentState = context.services.state.createChildState();
      await context.services.interpreter.interpret(nodes, { initialState: parentState, mergeState: true });
      expect(parentState.getTextVar('child')).toBe('value');
    });

    it('maintains isolation with mergeState: false', async () => {
      const node = context.factory.createTextDirective('isolated', 'value');
      const nodes = [node];
      const parentState = context.services.state.createChildState();
      await context.services.interpreter.interpret(nodes, { initialState: parentState, mergeState: false });
      expect(parentState.getTextVar('isolated')).toBeUndefined();
    });

    it('handles state rollback on merge errors', async () => {
      const content = '@text identifier="test" value="\'value\'"';
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
      const content = await context.fs.readFile('project/nested/circular1.meld');
      const nodes = await context.services.parser.parse(content);
      await expect(context.services.interpreter.interpret(nodes, {
        filePath: 'project/nested/circular1.meld'
      })).rejects.toThrow(/circular/i);
    });

    it('provides location information in errors', async () => {
      const content = '@text';
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
      const nodes = [
        context.factory.createTextDirective('valid', 'OK'),
        context.factory.createTextDirective('invalid', '${nonexistent}'),
        context.factory.createTextDirective('after', 'Bad')
      ];
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
      const node = context.factory.createTextDirective('test', '${nonexistent}');
      const nodes = [node];
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
      const nodes = [
        context.factory.createTextDirective('before', 'OK'),
        context.factory.createTextDirective('error', '${nonexistent}'),
        context.factory.createTextDirective('after', 'Bad')
      ];
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
      const content = await context.fs.readFile('project/src/main.meld');
      const nodes = await context.services.parser.parse(content);
      const state = await context.services.interpreter.interpret(nodes);

      expect(state.getTextVar('root')).toBe('Root');     // from main.meld
      expect(state.getTextVar('child')).toBe('Child');   // from child.meld
      expect(state.getTextVar('common')).toBe('Shared'); // from common.meld
      expect(state.getDataVar('nums')).toEqual([1, 2, 3]);
      expect(state.getDataVar('shared')).toEqual({ type: 'common' });
    });

    it('maintains correct file paths during interpretation', async () => {
      const content = await context.fs.readFile('project/src/main.meld');
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
          'a.meld': '@import [b.meld]',
          'b.meld': '@import [a.meld]'
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
            '@text identifier="main" value="main"',
            '@import [sub.meld]',
            '@text identifier="after" value="after"'
          ].join('\n'),
          'sub.meld': '@text identifier="sub" value="sub"'
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
}); 