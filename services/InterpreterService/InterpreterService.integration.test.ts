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
    const content = '@text identifier="test" value="Hello"';
    const nodes = await context.services.parser.parse(content);
    const result = await context.services.interpreter.interpret(nodes);
    const value = result.getTextVar('test');
    expect(value).toBe('Hello');
  });

  it('handles nested interpretation', async () => {
    const content = [
      '@text identifier="greeting" value="Hello"',
      '@text identifier="name" value="World"',
      '@text identifier="message" value="${greeting} ${name}!"'
    ].join('\n');
    
    const nodes = await context.services.parser.parse(content);
    const result = await context.services.interpreter.interpret(nodes);
    const value = result.getTextVar('message');
    expect(value).toBe('Hello World!');
  });

  it('rolls back state on error', async () => {
    const content = [
      '@text identifier="test1" value="value1"',
      '@text identifier="test2" value="${invalid}"'
    ].join('\n');
    
    const nodes = await context.services.parser.parse(content);
    
    await expect(context.services.interpreter.interpret(nodes)).rejects.toThrow();
    
    const state = context.services.state.createChildState();
    const value = state.getTextVar('test1');
    expect(value).toBeUndefined();
  });

  it('merges child state back to parent', async () => {
    const content = '@text identifier="child" value="value"';
    const parentState = context.services.state.createChildState();
    const nodes = await context.services.parser.parse(content);
    await context.services.interpreter.interpret(nodes, { initialState: parentState, mergeState: true });
    expect(parentState.getTextVar('child')).toBe('value');
  });

  it('maintains isolation with mergeState: false', async () => {
    const content = '@text identifier="isolated" value="value"';
    const parentState = context.services.state.createChildState();
    const nodes = await context.services.parser.parse(content);
    await context.services.interpreter.interpret(nodes, { initialState: parentState, mergeState: false });
    expect(parentState.getTextVar('isolated')).toBeUndefined();
  });

  describe('Basic interpretation', () => {
    it('interprets a simple document', async () => {
      const content = await context.fs.readFile('project/src/main.meld');
      const nodes = await context.services.parser.parse(content);
      const state = await context.services.interpreter.interpret(nodes);

      expect(state.getTextVar('root')).toBe('Root');
    });

    it('maintains node order in state', async () => {
      const content = await context.fs.readFile('project/src/main.meld');
      const nodes = await context.services.parser.parse(content);
      const state = await context.services.interpreter.interpret(nodes);

      const stateNodes = state.getNodes();
      expect(stateNodes[0].type).toBe('Directive'); // @text directive
      expect(stateNodes[1].type).toBe('Directive'); // @import directive
    });
  });

  describe('Nested imports', () => {
    it('processes nested imports with correct state inheritance', async () => {
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
  });

  describe('Section embedding', () => {
    it('embeds and interprets specific sections', async () => {
      const content = await context.fs.readFile('project/src/complex.meld');
      const nodes = await context.services.parser.parse(content);
      const state = await context.services.interpreter.interpret(nodes);

      expect(state.getTextVar('base')).toBe('Base');
      expect(state.getTextVar('inSection')).toBe('Inside');
      expect(state.getTextVar('skipped')).toBeUndefined();
    });
  });

  describe('Variable resolution', () => {
    it('resolves variables during interpretation', async () => {
      const content = await context.fs.readFile('project/src/variables.meld');
      const nodes = await context.services.parser.parse(content);
      const state = await context.services.interpreter.interpret(nodes);

      expect(state.getTextVar('greeting')).toBe('Hello World!');
      expect(state.getDataVar('user')).toEqual({ name: 'World' });
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
      const content = [
        '@text identifier="valid" value="OK"',
        '@text identifier="invalid" value="Bad"',
        '@text identifier="after" value="Bad"'
      ].join('\n');
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

    it('includes error details in interpreter errors', async () => {
      const content = '@text identifier="test"';
      const nodes = await context.services.parser.parse(content);
      try {
        await context.services.interpreter.interpret(nodes, { filePath: 'test.meld' });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(MeldInterpreterError);
        if (error instanceof MeldInterpreterError) {
          expect(error.nodeType).toBe('Directive');
          expect(error.location).toBeDefined();
        } else {
          throw error;
        }
      }
    });
  });

  describe('State management', () => {
    it('creates isolated states for different interpretations', async () => {
      const content = '@text identifier="test" value="value"';
      const nodes = await context.services.parser.parse(content);
      const result1 = await context.services.interpreter.interpret(nodes);
      const result2 = await context.services.interpreter.interpret(nodes);
      expect(result1).not.toBe(result2);
      expect(result1.getTextVar('test')).toBe('value');
      expect(result2.getTextVar('test')).toBe('value');
    });

    it('merges child states correctly', async () => {
      const content = '@text identifier="child" value="value"';
      const parentState = context.services.state.createChildState();
      const nodes = await context.services.parser.parse(content);
      await context.services.interpreter.interpret(nodes, { initialState: parentState, mergeState: true });
      expect(parentState.getTextVar('child')).toBe('value');
    });

    it('handles state rollback on merge errors', async () => {
      const content = '@text identifier="test" value="value"';
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

    it('maintains node order in merged states', async () => {
      const content = [
        '@text identifier="first" value="1"',
        '@text identifier="second" value="2"',
        '@text identifier="third" value="3"'
      ].join('\n');
      
      const nodes = await context.services.parser.parse(content);
      const result = await context.services.interpreter.interpret(nodes);
      const stateNodes = result.getNodes();
      expect(stateNodes[0].type).toBe('Directive');
      expect((stateNodes[0] as any).directive.identifier).toBe('first');
      expect(stateNodes[1].type).toBe('Directive');
      expect((stateNodes[1] as any).directive.identifier).toBe('second');
    });
  });
}); 