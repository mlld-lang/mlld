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
        context.factory.createTextDirective('first', 'one', context.factory.createLocation(1, 1)),
        context.factory.createTextDirective('second', 'two', context.factory.createLocation(2, 1)),
        context.factory.createTextDirective('third', 'three', context.factory.createLocation(3, 1))
      ];

      // Create a parent state to track nodes
      const parentState = context.services.state.createChildState();
      
      const result = await context.services.interpreter.interpret(nodes, {
        initialState: parentState,
        filePath: 'test.meld',
        mergeState: true
      });

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
      // Create a directive that will cause a resolution error
      const node = context.factory.createTextDirective('error', '${nonexistent}', context.factory.createLocation(1, 1));
      
      // Create parent state with initial value
      const parentState = context.services.state.createChildState();
      parentState.setTextVar('original', 'value');

      try {
        await context.services.interpreter.interpret([node], { 
          initialState: parentState,
          filePath: 'test.meld',
          mergeState: true 
        });
        throw new Error('Should have thrown error');
      } catch (error) {
        if (error instanceof MeldInterpreterError) {
          // Verify error details
          expect(error.nodeType).toBe('Directive');
          expect(error.message).toMatch(/nonexistent/i);
          
          // Verify state was rolled back
          expect(parentState.getTextVar('original')).toBe('value');
          expect(parentState.getTextVar('error')).toBeUndefined();
        } else {
          throw error;
        }
      }
    });
  });

  describe('Error handling', () => {
    it('handles circular imports', async () => {
      // Create two files that import each other
      await context.writeFile('project/src/circular1.meld', '@import [project/src/circular2.meld]');
      await context.writeFile('project/src/circular2.meld', '@import [project/src/circular1.meld]');

      // Create import node for circular1
      const node = context.factory.createImportDirective('project/src/circular1.meld', context.factory.createLocation(1, 1));
      node.directive.path = 'project/src/circular1.meld';
      node.directive.value = '[project/src/circular1.meld]';

      try {
        await context.services.interpreter.interpret([node], {
          filePath: 'test.meld'
        });
        throw new Error('Should have thrown error');
      } catch (error: unknown) {
        if (error instanceof MeldInterpreterError) {
          expect(error).toBeInstanceOf(MeldInterpreterError);
          expect(error.message).toMatch(/circular/i);
        } else {
          throw error;
        }
      }
    });

    it('provides location information in errors', async () => {
      // Create a directive that will cause an error
      const node = context.factory.createTextDirective('error', '${nonexistent}', context.factory.createLocation(1, 1));
      node.directive.value = '${nonexistent}';

      try {
        await context.services.interpreter.interpret([node], { filePath: 'test.meld' });
        throw new Error('Should have thrown error');
      } catch (error: unknown) {
        if (error instanceof MeldInterpreterError) {
          expect(error).toBeInstanceOf(MeldInterpreterError);
          expect(error.location).toBeDefined();
          expect(error.location?.line).toBe(1);
          expect(error.location?.column).toBe(1);
        } else {
          throw error;
        }
      }
    });

    it('maintains state consistency after errors', async () => {
      // Create parent state with initial value
      const parentState = context.services.state.createChildState();
      parentState.setTextVar('original', 'value');

      // Create nodes - one valid, one invalid
      const nodes = [
        context.factory.createTextDirective('valid', 'value', context.factory.createLocation(1, 1)),
        context.factory.createTextDirective('error', '${nonexistent}', context.factory.createLocation(2, 1))
      ];

      try {
        await context.services.interpreter.interpret(nodes, { 
          initialState: parentState,
          filePath: 'test.meld'
        });
        throw new Error('Should have thrown error');
      } catch (error: unknown) {
        if (error instanceof MeldInterpreterError) {
          // Verify state was rolled back
          expect(parentState.getTextVar('original')).toBe('value');
          expect(parentState.getTextVar('valid')).toBeUndefined();
          expect(parentState.getTextVar('error')).toBeUndefined();
        } else {
          throw error;
        }
      }
    });

    it('includes state context in interpreter errors', async () => {
      // Create a directive that will cause an error
      const node = context.factory.createTextDirective('error', '${nonexistent}', context.factory.createLocation(1, 1));
      node.directive.value = '${nonexistent}';

      try {
        await context.services.interpreter.interpret([node], { filePath: 'test.meld' });
        throw new Error('Should have thrown error');
      } catch (error: unknown) {
        if (error instanceof MeldInterpreterError) {
          expect(error).toBeInstanceOf(MeldInterpreterError);
          expect(error.context).toBeDefined();
          if (error.context) {
            expect(error.context.nodeType).toBe('Directive');
            expect(error.context.state?.filePath).toBe('test.meld');
          }
        } else {
          throw error;
        }
      }
    });

    it('rolls back state on directive errors', async () => {
      // Create parent state with initial value
      const parentState = context.services.state.createChildState();
      parentState.setTextVar('original', 'value');

      // Create nodes that will cause an error
      const nodes = [
        context.factory.createTextDirective('before', 'valid', context.factory.createLocation(1, 1)),
        context.factory.createTextDirective('error', '${nonexistent}', context.factory.createLocation(2, 1)),
        context.factory.createTextDirective('after', 'valid', context.factory.createLocation(3, 1))
      ];

      try {
        await context.services.interpreter.interpret(nodes, { 
          initialState: parentState,
          filePath: 'test.meld'
        });
        throw new Error('Should have thrown error');
      } catch (error: unknown) {
        if (error instanceof MeldInterpreterError) {
          // Verify state was rolled back
          expect(parentState.getTextVar('original')).toBe('value');
          expect(parentState.getTextVar('before')).toBeUndefined();
          expect(parentState.getTextVar('error')).toBeUndefined();
          expect(parentState.getTextVar('after')).toBeUndefined();
        } else {
          throw error;
        }
      }
    });

    it('handles cleanup on circular imports', async () => {
      // Create two files that import each other
      await context.writeFile('project/src/circular1.meld', '@import [project/src/circular2.meld]');
      await context.writeFile('project/src/circular2.meld', '@import [project/src/circular1.meld]');

      // Create import node for circular1
      const node = context.factory.createImportDirective('project/src/circular1.meld', context.factory.createLocation(1, 1));
      node.directive.path = 'project/src/circular1.meld';
      node.directive.value = '[project/src/circular1.meld]';

      try {
        await context.services.interpreter.interpret([node], {
          filePath: 'test.meld'
        });
        throw new Error('Should have thrown error');
      } catch (error: unknown) {
        if (error instanceof MeldInterpreterError) {
          expect(error).toBeInstanceOf(MeldInterpreterError);
          expect(error.message).toMatch(/circular/i);
        } else {
          throw error;
        }
      }
    });
  });

  describe('Complex scenarios', () => {
    it('handles nested imports with state inheritance', async () => {
      await context.writeFile('project/src/main.meld', '@text greeting = "Hello"');
      await context.writeFile('project/src/nested/helper.meld', '@text name = "World"');

      const node = context.factory.createImportDirective('project/src/main.meld');
      node.directive.path = 'project/src/main.meld';

      const result = await context.services.interpreter.interpret([node], {
        filePath: 'test.meld'
      });

      expect(result.getTextVar('greeting')).toBe('Hello');
    });

    it('maintains correct file paths during interpretation', async () => {
      await context.writeFile('project/src/main.meld', '@text greeting = "Hello"');
      await context.writeFile('project/src/nested/helper.meld', '@text name = "World"');

      const node = context.factory.createImportDirective('project/src/main.meld');
      node.directive.path = 'project/src/main.meld';

      const result = await context.services.interpreter.interpret([node], {
        filePath: 'test.meld'
      });

      expect(result.getTextVar('greeting')).toBe('Hello');
    });

    it('maintains correct state after successful imports', async () => {
      await context.writeFile('project/src/main.meld', '@text greeting = "Hello"');
      await context.writeFile('project/src/nested/helper.meld', '@text name = "World"');

      const node = context.factory.createImportDirective('project/src/main.meld');
      node.directive.path = 'project/src/main.meld';

      const result = await context.services.interpreter.interpret([node], {
        filePath: 'test.meld'
      });

      expect(result.getTextVar('greeting')).toBe('Hello');
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
        context.factory.createTextDirective('first', context.factory.createLocation(1, 1)),
        context.factory.createTextDirective('second', context.factory.createLocation(2, 1)),
        context.factory.createTextDirective('third', context.factory.createLocation(3, 1))
      ];
      nodes[0].directive.value = 'one';
      nodes[1].directive.value = 'two';
      nodes[2].directive.value = 'three';

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
      // Create parent state to track variables
      const parentState = context.services.state.createChildState();

      // Create config data directive
      const configNode = context.factory.createDataDirective('config', { user: 'Alice' }, context.factory.createLocation(1, 1));
      configNode.directive.value = JSON.stringify({ user: 'Alice' });

      // First interpret the config node
      const configResult = await context.services.interpreter.interpret([configNode], {
        filePath: 'test.meld'
      });

      // Create greeting text directive that references config
      const greetingNode = context.factory.createTextDirective('greeting', 'Hello ${config.user}', context.factory.createLocation(2, 1));

      // Create resolution context for variable interpolation
      const resolutionContext = {
        currentFilePath: 'test.meld',
        state: configResult,
        allowedVariableTypes: {
          text: true,
          data: true,
          path: true,
          command: false
        }
      };

      // Resolve the greeting value
      const resolvedValue = await context.services.resolution.resolveInContext(
        'Hello ${config.user}',
        resolutionContext
      );

      // Update the greeting node with resolved value
      greetingNode.directive.value = resolvedValue;

      // Then interpret the greeting node with the updated state
      const result = await context.services.interpreter.interpret([greetingNode], {
        initialState: configResult,
        filePath: 'test.meld'
      });

      expect(result.getTextVar('greeting')).toBe('Hello Alice');
      expect(result.getDataVar('config')).toEqual({ user: 'Alice' });
    });
  });
}); 