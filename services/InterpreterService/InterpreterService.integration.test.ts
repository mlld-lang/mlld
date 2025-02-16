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
      const node = context.factory.createTextDirective('test', 'Hello');
      const result = await context.services.interpreter.interpret([node]);
      const value = result.getTextVar('test');
      expect(value).toBe('Hello');
    });

    it('interprets data directives', async () => {
      const node = context.factory.createDataDirective('config', { key: 'value' });
      const result = await context.services.interpreter.interpret([node]);
      const value = result.getDataVar('config');
      expect(value).toEqual({ key: 'value' });
    });

    it('interprets path directives', async () => {
      const node = context.factory.createPathDirective('test', 'project/src/main.meld');
      const result = await context.services.interpreter.interpret([node]);
      const value = result.getPathVar('test');
      expect(value).toBe('project/src/main.meld');
    });

    it('maintains node order in state', async () => {
      const nodes = [
        context.factory.createTextDirective('first', '1'),
        context.factory.createTextDirective('second', '2'),
        context.factory.createTextDirective('third', '3')
      ];
      
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
      const node = context.factory.createTextDirective('test', 'value');
      const result1 = await context.services.interpreter.interpret([node]);
      const result2 = await context.services.interpreter.interpret([node]);
      expect(result1).not.toBe(result2);
      expect(result1.getTextVar('test')).toBe('value');
      expect(result2.getTextVar('test')).toBe('value');
    });

    it('merges child state back to parent', async () => {
      const node = context.factory.createTextDirective('child', 'value');
      const parentState = context.services.state.createChildState();
      await context.services.interpreter.interpret([node], { initialState: parentState, mergeState: true });
      expect(parentState.getTextVar('child')).toBe('value');
    });

    it('maintains isolation with mergeState: false', async () => {
      const node = context.factory.createTextDirective('isolated', 'value');
      const parentState = context.services.state.createChildState();
      await context.services.interpreter.interpret([node], { initialState: parentState, mergeState: false });
      expect(parentState.getTextVar('isolated')).toBeUndefined();
    });

    it('handles state rollback on merge errors', async () => {
      const node = context.factory.createTextDirective('test', '${nonexistent}');
      const parentState = context.services.state.createChildState();
      parentState.setTextVar('parent', 'Parent');
      try {
        await context.services.interpreter.interpret([node], { initialState: parentState, mergeState: true });
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
      const node = context.factory.createImportDirective('project/nested/circular1.meld');
      await expect(context.services.interpreter.interpret([node], {
        filePath: 'project/nested/circular1.meld'
      })).rejects.toThrow(/circular/i);
    });

    it('provides location information in errors', async () => {
      const node = context.factory.createTextDirective('test', '${nonexistent}');
      try {
        await context.services.interpreter.interpret([node]);
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
      try {
        await context.services.interpreter.interpret([node], { filePath: 'test.meld' });
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

    it('handles cleanup on circular imports', async () => {
      const content = '@import path = "project/nested/circular1.meld"';
      const nodes = await context.services.parser.parse(content);
      try {
        await context.services.interpreter.interpret(nodes);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(MeldInterpreterError);
        if (error instanceof MeldInterpreterError) {
          expect(error.message).toMatch(/circular/i);
        } else {
          throw error;
        }
      }
    });
  });

  describe('Complex scenarios', () => {
    it('handles nested imports with state inheritance', async () => {
      const node = context.factory.createImportDirective('project/src/main.meld');
      const state = await context.services.interpreter.interpret([node]);

      expect(state.getTextVar('root')).toBe('Root');     // from main.meld
      expect(state.getTextVar('child')).toBe('Child');   // from child.meld
      expect(state.getTextVar('common')).toBe('Shared'); // from common.meld
      expect(state.getDataVar('nums')).toEqual([1, 2, 3]);
      expect(state.getDataVar('shared')).toEqual({ type: 'common' });
    });

    it('maintains correct file paths during interpretation', async () => {
      const node = context.factory.createImportDirective('project/src/main.meld');
      const state = await context.services.interpreter.interpret([node]);
      expect(state.getCurrentFilePath()).toBe('project/src/main.meld');
    });

    it('maintains correct state after successful imports', async () => {
      const node = context.factory.createImportDirective('project/src/main.meld');
      const state = await context.services.interpreter.interpret([node]);
      expect(state.getTextVar('root')).toBe('Root');
      expect(state.getTextVar('child')).toBe('Child');
    });
  });

  describe('AST structure handling', () => {
    it('handles text directives with correct format', async () => {
      const node = context.factory.createTextDirective('greeting', 'Hello');
      const result = await context.services.interpreter.interpret([node]);
      expect(result.getTextVar('greeting')).toBe('Hello');
    });

    it('handles data directives with correct format', async () => {
      const node = context.factory.createDataDirective('config', { key: 'value' });
      const result = await context.services.interpreter.interpret([node]);
      expect(result.getDataVar('config')).toEqual({ key: 'value' });
    });

    it('handles path directives with correct format', async () => {
      const node = context.factory.createPathDirective('test', 'project/src/main.meld');
      const result = await context.services.interpreter.interpret([node]);
      expect(result.getPathVar('test')).toBe('project/src/main.meld');
    });

    it('handles complex directives with schema validation', async () => {
      const node = context.factory.createDataDirective('user', { name: 'Alice', age: 30 });
      const result = await context.services.interpreter.interpret([node]);
      const user = result.getDataVar('user');
      expect(user).toEqual({ name: 'Alice', age: 30 });
    });

    it('maintains correct node order with mixed content', async () => {
      const nodes = [
        context.factory.createTextDirective('first', '1'),
        context.factory.createTextDirective('second', '2'),
        context.factory.createTextDirective('third', '3')
      ];
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

    it('handles nested directive values correctly', async () => {
      const nodes = [
        context.factory.createTextDirective('name', 'Alice'),
        context.factory.createTextDirective('greeting', 'Hello ${name}'),
        context.factory.createDataDirective('config', { user: '${name}' })
      ];
      const result = await context.services.interpreter.interpret(nodes);
      expect(result.getTextVar('greeting')).toBe('Hello Alice');
      expect(result.getDataVar('config')).toEqual({ user: 'Alice' });
    });
  });
}); 