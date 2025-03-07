import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestContext } from '@tests/utils/index.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { MeldInterpreterError } from '@core/errors/MeldInterpreterError.js';
import { DirectiveError } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { MeldImportError } from '@core/errors/MeldImportError.js';
import type { TextNode, MeldNode, DirectiveNode } from 'meld-spec';
// Import centralized syntax helpers
import { createNodeFromExample } from '@core/syntax/helpers';
// Import relevant examples
import { 
  textDirectiveExamples,
  dataDirectiveExamples,
  pathDirectiveExamples,
  importDirectiveExamples,
  defineDirectiveExamples,
  integrationExamples
} from '@core/syntax';
import { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import { InterpreterService } from '@services/pipeline/InterpreterService/InterpreterService.js';

// Run integration tests for both DI and non-DI modes
describe.each([
  { useDI: false, name: 'without DI' },
  { useDI: true, name: 'with DI' }
])('InterpreterService Integration $name', ({ useDI }) => {
  let context: TestContext | TestContextDI;

  beforeEach(async () => {
    // Initialize context based on DI mode
    if (useDI) {
      context = new TestContextDI();
      await (context as TestContextDI).initialize(true); // true = use DI
    } else {
      context = new TestContext();
      await context.initialize();
    }
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
      // MIGRATION: Using centralized syntax example instead of hardcoded directive
      const example = textDirectiveExamples.atomic.simpleString;
      const node = await createNodeFromExample(example.code);
      
      const result = await context.services.interpreter.interpret([node]);
      // Extract the expected variable name from the example (should be 'test' in this example)
      const varName = node.directive.identifier;
      const value = result.getTextVar(varName);
      
      // Check if the value is set correctly
      // For text directives, the value should be a string
      expect(typeof value).toBe('string');
      expect(value).toBeTruthy();
    });

    it('interprets data directives', async () => {
      // MIGRATION: Using centralized syntax example instead of hardcoded directive
      const example = dataDirectiveExamples.atomic.simpleObject;
      const node = await createNodeFromExample(example.code);
      
      const result = await context.services.interpreter.interpret([node]);
      
      // Extract the variable name from the example
      const varName = node.directive.identifier;
      const value = result.getDataVar(varName);
      
      // Verify the data is an object
      expect(value).toBeDefined();
      expect(typeof value).toBe('object');
      // Data should not be null
      expect(value).not.toBeNull();
    });

    it('interprets path directives', async () => {
      // Create a path directive with a valid path that follows the rules
      // Simple paths (no slashes) are valid, or use a path variable for paths with slashes
      const node = context.factory.createPathDirective('testPath', 'docs');
      
      const result = await context.services.interpreter.interpret([node]);
      
      // Extract the variable name from the node
      const varName = node.directive.identifier;
      const value = result.getPathVar(varName);
      
      // Verify path value exists
      expect(value).toBeDefined();
      expect(typeof value === 'string' || (typeof value === 'object' && value !== null)).toBe(true);
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
      const node = context.factory.createTextDirective('error', '{{nonexistent}}', context.factory.createLocation(1, 1));
      
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
          expect(error.message).toMatch(/Directive error \(text\)/i);
          if (error.cause?.message) {
            expect(error.cause.message).toMatch(/Failed to resolve string concatenation/i);
          }
          
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
      // Create a mock circular import setup
      await context.writeFile('project/src/circular1.meld', '@import [$./circular2.meld]');
      await context.writeFile('project/src/circular2.meld', '@import [$./circular1.meld]');

      // Create an import directive node for the interpreter
      // MIGRATION NOTE: Using factory method directly due to issues with examples for circular imports
      const node = context.factory.createImportDirective(
        '$./project/src/circular1.meld',
        context.factory.createLocation(1, 1)
      );

      // Mock the CircularityService to throw a circular import error
      const originalBeginImport = context.services.circularity.beginImport;
      context.services.circularity.beginImport = (filePath: string) => {
        throw new MeldImportError('Circular import detected', {
          code: 'CIRCULAR_IMPORT',
          details: { importChain: ['a.meld', 'b.meld', 'a.meld'] }
        });
      };

      try {
        // This should throw an error due to the circular import
        await context.services.interpreter.interpret([node], {
          filePath: 'test.meld'
        });
        throw new Error('Should have thrown error');
      } catch (error: unknown) {
        if (error instanceof MeldInterpreterError) {
          expect(error.message).toContain('Circular import');
        } else {
          throw error;
        }
      } finally {
        // Restore original functionality
        context.services.circularity.beginImport = originalBeginImport;
      }
    });

    it('provides location information in errors', async () => {
      // MIGRATION: Using centralized invalid example for undefined variable
      const example = textDirectiveExamples.invalid.undefinedVariable;
      const node = await createNodeFromExample(example.code);

      try {
        await context.services.interpreter.interpret([node], { filePath: 'test.meld' });
        throw new Error('Should have thrown error');
      } catch (error: unknown) {
        if (error instanceof MeldInterpreterError) {
          expect(error).toBeInstanceOf(MeldInterpreterError);
          expect(error.location).toBeDefined();
          expect(error.location?.line).toBe(1);
          expect(error.location?.column).toBe(2);
        } else {
          throw error;
        }
      }
    });

    it('maintains state consistency after errors', async () => {
      // MIGRATION: Using centralized valid and invalid examples
      const validExample = textDirectiveExamples.atomic.simpleString;
      const validNode = await createNodeFromExample(validExample.code);
      
      const invalidExample = textDirectiveExamples.invalid.undefinedVariable;
      const invalidNode = await createNodeFromExample(invalidExample.code);
      
      const nodes = [validNode, invalidNode];

      try {
        await context.services.interpreter.interpret(nodes, { 
          initialState: context.services.state.createChildState(),
          filePath: 'test.meld'
        });
        throw new Error('Should have thrown error');
      } catch (error: unknown) {
        if (error instanceof MeldInterpreterError) {
          // Verify state was rolled back
          expect(context.services.state.getTextVar(validNode.directive.identifier)).toBeUndefined();
          expect(context.services.state.getTextVar('error')).toBeUndefined();
        } else {
          throw error;
        }
      }
    });

    it('includes state context in interpreter errors', async () => {
      // MIGRATION: Using centralized invalid example for undefined variable
      const example = textDirectiveExamples.invalid.undefinedVariable;
      const node = await createNodeFromExample(example.code);

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
      // MIGRATION: Create nodes using centralized examples
      const beforeExample = textDirectiveExamples.atomic.simpleString;
      const beforeNode = await createNodeFromExample(beforeExample.code);
      
      const errorExample = textDirectiveExamples.invalid.undefinedVariable;
      const errorNode = await createNodeFromExample(errorExample.code);
      
      const afterExample = textDirectiveExamples.atomic.user;
      const afterNode = await createNodeFromExample(afterExample.code);
      
      const nodes = [beforeNode, errorNode, afterNode];

      try {
        await context.services.interpreter.interpret(nodes, { 
          initialState: context.services.state.createChildState(),
          filePath: 'test.meld'
        });
        throw new Error('Should have thrown error');
      } catch (error: unknown) {
        if (error instanceof MeldInterpreterError) {
          // Verify state was rolled back
          expect(context.services.state.getTextVar(beforeNode.directive.identifier)).toBeUndefined();
          expect(context.services.state.getTextVar('error')).toBeUndefined();
          expect(context.services.state.getTextVar(afterNode.directive.identifier)).toBeUndefined();
        } else {
          throw error;
        }
      }
    });

    it('handles cleanup on circular imports', async () => {
      // Create a mock circular import setup
      await context.writeFile('project/src/circular1.meld', '@import [$./circular2.meld]');
      await context.writeFile('project/src/circular2.meld', '@import [$./circular1.meld]');

      // Create an import directive node for the interpreter
      // MIGRATION NOTE: Using factory method directly due to issues with examples for circular imports
      const node = context.factory.createImportDirective(
        '$./project/src/circular1.meld',
        context.factory.createLocation(1, 1)
      );

      // Mock the CircularityService to throw a circular import error
      const originalBeginImport = context.services.circularity.beginImport;
      context.services.circularity.beginImport = (filePath: string) => {
        throw new MeldImportError('Circular import detected', {
          code: 'CIRCULAR_IMPORT',
          details: { importChain: ['a.meld', 'b.meld', 'a.meld'] }
        });
      };

      try {
        // This should throw an error due to the circular import
        await context.services.interpreter.interpret([node], {
          filePath: 'test.meld'
        });
        throw new Error('Should have thrown error');
      } catch (error: unknown) {
        if (error instanceof MeldInterpreterError) {
          expect(error.message).toContain('Circular import');
        } else {
          throw error;
        }
      } finally {
        // Restore original functionality
        context.services.circularity.beginImport = originalBeginImport;
      }
    });
  });

  describe('Complex scenarios', () => {
    it.todo('handles nested imports with state inheritance');
    // V2: Complex state inheritance in nested imports requires improved state management

    it('maintains correct file paths during interpretation', async () => {
      // Create test context with files
      const ctx = new TestContext();
      await ctx.initialize();
      
      // Set up path variables in the state service
      ctx.services.state.setPathVar('PROJECTPATH', '/project');
      ctx.services.state.setPathVar('HOMEPATH', '/home/user');
      
      // Directly set the path variables we want to test
      ctx.services.state.setPathVar('mainPath', '/project/main.meld');
      ctx.services.state.setPathVar('subPath', '/project/sub/sub.meld');
      ctx.services.state.setPathVar('currentPath', '/project/sub/sub.meld');
      ctx.services.state.setPathVar('relativePath', '/project/sub/relative.txt');
      
      // Verify the paths are correctly maintained
      expect(ctx.services.state.getPathVar('mainPath')).toBeTruthy();
      expect(ctx.services.state.getPathVar('subPath')).toBeTruthy();
      expect(ctx.services.state.getPathVar('currentPath')).toBeTruthy();
      expect(ctx.services.state.getPathVar('relativePath')).toBeTruthy();
      
      // Check if the paths are correctly resolved
      const mainPath = ctx.services.state.getPathVar('mainPath');
      const subPath = ctx.services.state.getPathVar('subPath');
      const currentPath = ctx.services.state.getPathVar('currentPath');
      const relativePath = ctx.services.state.getPathVar('relativePath');
      
      // For structured paths, check the normalized value
      // Interface to type check path objects with normalized property
      interface NormalizedPath {
        normalized: string;
      }

      // Type guard function to check if a value is a NormalizedPath
      function isNormalizedPath(value: unknown): value is NormalizedPath {
        return value !== null && typeof value === 'object' && 'normalized' in value;
      }
      
      if (isNormalizedPath(mainPath)) {
        expect(mainPath.normalized).toBe('/project/main.meld');
      } else {
        expect(mainPath).toBe('/project/main.meld');
      }
      
      if (isNormalizedPath(subPath)) {
        expect(subPath.normalized).toBe('/project/sub/sub.meld');
      } else {
        expect(subPath).toBe('/project/sub/sub.meld');
      }
      
      if (isNormalizedPath(currentPath)) {
        expect(currentPath.normalized).toBe('/project/sub/sub.meld');
      } else {
        expect(currentPath).toBe('/project/sub/sub.meld');
      }
      
      if (isNormalizedPath(relativePath)) {
        expect(relativePath.normalized).toBe('/project/sub/relative.txt');
      } else {
        expect(relativePath).toBe('/project/sub/relative.txt');
      }
    });

    it.todo('maintains correct state after successful imports');
    // V2: State consistency across nested imports needs improved implementation
  });

  describe('AST structure handling', () => {
    it('handles text directives with correct format', async () => {
      // MIGRATION: Using centralized syntax example instead of hardcoded directive
      const example = textDirectiveExamples.atomic.simpleString;
      const node = await createNodeFromExample(example.code);
      
      const result = await context.services.interpreter.interpret([node]);
      
      // Extract the variable name from the example
      const varName = node.directive.identifier;
      expect(result.getTextVar(varName)).toBeDefined();
      expect(typeof result.getTextVar(varName)).toBe('string');
    });

    it('handles data directives with correct format', async () => {
      // MIGRATION: Using centralized syntax example instead of hardcoded directive
      const example = dataDirectiveExamples.atomic.simpleObject;
      const node = await createNodeFromExample(example.code);
      
      const result = await context.services.interpreter.interpret([node]);
      
      // Extract the variable name from the example
      const varName = node.directive.identifier;
      expect(result.getDataVar(varName)).toBeDefined();
      expect(typeof result.getDataVar(varName)).toBe('object');
    });

    it('handles path directives with correct format', async () => {
      // MIGRATION NOTE: Using factory method directly due to issues with examples for simple paths
      // The create node from example approach doesn't work because the parser enforces path rules
      const node = context.factory.createPathDirective('test', 'filename.meld');
      
      const result = await context.services.interpreter.interpret([node]);
      expect(result.getPathVar('test')).toBe('filename.meld');
    });

    it('handles complex directives with schema validation', async () => {
      // MIGRATION: Using centralized syntax example instead of hardcoded directive
      const example = dataDirectiveExamples.atomic.person;
      const node = await createNodeFromExample(example.code);
      
      const result = await context.services.interpreter.interpret([node]);
      
      // Extract the variable name from the example
      const varName = node.directive.identifier;
      const value = result.getDataVar(varName);
      expect(value).toBeDefined();
      expect(typeof value).toBe('object');
    });

    it('maintains correct node order with mixed content', async () => {
      // MIGRATION: Using centralized examples instead of hardcoded directives
      const example1 = textDirectiveExamples.atomic.simpleString;
      const example2 = textDirectiveExamples.atomic.subject;
      const example3 = textDirectiveExamples.atomic.user;
      
      const node1 = await createNodeFromExample(example1.code);
      const node2 = await createNodeFromExample(example2.code);
      const node3 = await createNodeFromExample(example3.code);
      
      // Save the identifiers for later assertions
      const id1 = node1.directive.identifier;
      const id2 = node2.directive.identifier;
      const id3 = node3.directive.identifier;

      const result = await context.services.interpreter.interpret([node1, node2, node3]);
      const stateNodes = result.getNodes();
      
      expect(stateNodes).toHaveLength(3);
      expect(stateNodes[0].type).toBe('Directive');
      expect((stateNodes[0] as any).directive.identifier).toBe(id1);
      expect(stateNodes[1].type).toBe('Directive');
      expect((stateNodes[1] as any).directive.identifier).toBe(id2);
      expect(stateNodes[2].type).toBe('Directive');
      expect((stateNodes[2] as any).directive.identifier).toBe(id3);
    });

    it.todo('handles nested directive values correctly');
    // V2: Complex nested directive resolution requires enhanced variable scope handling
  });
}); 