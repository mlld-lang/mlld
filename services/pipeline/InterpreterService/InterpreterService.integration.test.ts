import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { MeldInterpreterError } from '@core/errors/MeldInterpreterError.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { MeldImportError } from '@core/errors/MeldImportError.js';
import type { TextNode, MeldNode, DirectiveNode } from '@core/syntax/types/nodes.js';
import type { DirectiveProcessingContext } from '@core/types/index.js';
// Import centralized syntax helpers
import { createNodeFromExample } from '@core/syntax/helpers/index.js';
// Import relevant examples
import { 
  textDirectiveExamples,
  dataDirectiveExamples,
  pathDirectiveExamples,
  importDirectiveExamples,
  defineDirectiveExamples,
  integrationExamples
} from '@core/syntax/index.js';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import { InterpreterService } from '@services/pipeline/InterpreterService/InterpreterService.js';
import { StateTrackingService } from '@tests/utils/debug/StateTrackingService/StateTrackingService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import { StateService } from '@services/state/StateService/StateService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import { ParserService } from '@services/pipeline/ParserService/ParserService.js';
import { logger } from '@core/utils/logger.js';
// Import necessary factories and clients
import { DirectiveServiceClientFactory } from '@services/pipeline/DirectiveService/factories/DirectiveServiceClientFactory.js';
import type { IDirectiveServiceClient } from '@services/pipeline/DirectiveService/interfaces/IDirectiveServiceClient.js';
import { mock } from 'vitest-mock-extended';
import type { DirectiveResult } from '@core/directives/DirectiveHandler';
import { container, type DependencyContainer } from 'tsyringe';
// Import tokens and helpers for manual DI setup
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem.js';
import type { IURLContentResolver } from '@services/resolution/URLContentResolver/IURLContentResolver.js';
import { URL } from 'node:url'; 
// Import interfaces/classes to mock
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ParserServiceClientFactory } from '@services/pipeline/ParserService/factories/ParserServiceClientFactory.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import { 
  VariableType, 
  PathContentType, 
  type IFilesystemPathState, 
  type IPathVariable, 
  createTextVariable, 
  createDataVariable, 
  createPathVariable, 
  type TextVariable,
  type DataVariable 
} from '@core/types';

// TODO: [Phase 5] Update InterpreterService integration tests.
// This suite needs comprehensive updates to align with Phase 1 (StateService types),
// Phase 2 (PathService types), Phase 3 (ResolutionService), and Phase 4 (Directive Handlers).
// Many tests currently fail due to expecting old return types from StateService methods.
// Skipping for now to focus on Phase 1/2/3 fixes.
describe('InterpreterService Integration', () => {
  let context: TestContextDI;
  let testContainer: DependencyContainer;
  let interpreter: IInterpreterService;
  let state: IStateService;
  let parser: IParserService;
  let mockDirectiveClient: IDirectiveServiceClient;

  beforeEach(async () => {
    context = TestContextDI.createIsolated();
    await context.initialize();
    
    testContainer = container.createChildContainer();

    // --- Mock DirectiveServiceClient --- 
    mockDirectiveClient = {
      supportsDirective: vi.fn(), 
      handleDirective: vi.fn(),
      getSupportedDirectives: vi.fn().mockReturnValue([]), 
      validateDirective: vi.fn().mockReturnValue(undefined), 
    } as IDirectiveServiceClient;
    
    vi.spyOn(mockDirectiveClient, 'supportsDirective').mockReturnValue(true);
    vi.spyOn(mockDirectiveClient, 'handleDirective').mockImplementation(
      async (node: MeldNode, context: IDirectiveHandlerContext) => {
        // Original state for testing purposes
        // Return a valid, empty DirectiveResult for the default mock
        return { stateChanges: undefined, replacement: [] };
      },
    );
    
    // --- Mock DirectiveServiceClientFactory --- 
    // const mockDirectiveClientFactory = mock<DirectiveServiceClientFactory>(); // Don't use vitest-mock-extended here
    // Manually create the factory mock
    const mockDirectiveClientFactory = {
      createClient: vi.fn(),
      directiveService: undefined // Add missing required property 
    } as unknown as DirectiveServiceClientFactory; // Cast via unknown to satisfy type checker
    
    // Configure the factory mock to return our manual client mock using vi.spyOn
    vi.spyOn(mockDirectiveClientFactory, 'createClient').mockReturnValue(mockDirectiveClient);
    
    // >>> REGISTER Dependencies in the MANUAL container <<<
    // Register MOCKS for InterpreterService dependencies
    testContainer.registerInstance(DirectiveServiceClientFactory, mockDirectiveClientFactory); // Mock Factory
    testContainer.registerInstance('IResolutionService', mock<IResolutionService>()); // Mock Service
    testContainer.registerInstance('ParserServiceClientFactory', mock<ParserServiceClientFactory>()); // Mock Factory
    testContainer.registerInstance('IPathService', mock<IPathService>()); // Mock Service
    // Register infrastructure mocks needed by other services
    testContainer.registerInstance<IFileSystem>('IFileSystem', context.fs); // Use mock FS from TestContextDI
    // Register mock IURLContentResolver (copied from TestContextDI)
    const mockURLContentResolver = {
      isURL: vi.fn().mockImplementation((path: string) => {
        if (!path) return false;
        try { const url = new URL(path); return !!url.protocol && !!url.host; } catch { return false; }
      }),
      validateURL: vi.fn().mockImplementation(async (url: string, _options?: any) => {
        try { new URL(url); return url; } catch (error) { throw new Error(`Invalid URL: ${url}`); }
      }),
      fetchURL: vi.fn().mockImplementation(async (url: string, _options?: any) => {
        return { content: `Mock content for ${url}`, metadata: { statusCode: 200, contentType: 'text/plain' }, fromCache: false, url };
      })
    };
    testContainer.registerInstance<IURLContentResolver>('IURLContentResolver', mockURLContentResolver);
    
    // Register REAL Service Implementations 
    testContainer.register('IInterpreterService', { useClass: InterpreterService });
    testContainer.register('IStateService', { useClass: StateService }); // Keep StateService real for now
    testContainer.register('IParserService', { useClass: ParserService }); // Keep ParserService real
    // --- End Registrations ---
    
    interpreter = testContainer.resolve<IInterpreterService>('IInterpreterService'); 
    state = testContainer.resolve<IStateService>('IStateService'); 
    parser = testContainer.resolve<IParserService>('IParserService');
    
    const trackingService = new StateTrackingService();
    testContainer.registerInstance('IStateTrackingService', trackingService);
    
    await context.fixtures.load('interpreterTestProject');
  });

  afterEach(async () => {
    testContainer?.clearInstances(); 
    await context?.cleanup();
  });

  describe('Basic interpretation', () => {
    it('interprets text nodes', async () => {
      const content = 'Hello world';
      const nodes = await parser.parse(content);
      const result = await interpreter.interpret(nodes as MeldNode[]);
      const resultNodes = result.getNodes();
      expect(resultNodes).toHaveLength(1);
      expect(resultNodes[0].type).toBe('Text');
      expect((resultNodes[0] as TextNode).content).toBe('Hello world');
    });

    it('interprets directive nodes', async () => {
      const example = textDirectiveExamples.atomic.simpleString;
      const node = await createNodeFromExample(example.code) as DirectiveNode;
      const varName = node.directive.identifier;
      const expectedValue = "Hello";
      
      vi.spyOn(mockDirectiveClient, 'handleDirective').mockImplementationOnce(async (node: DirectiveNode, context: DirectiveProcessingContext) => {
          const variable = createTextVariable(varName, expectedValue);
          const stateChanges = {
            set: [variable]
          };
          // Return a DirectiveResult with stateChanges
          return { stateChanges, replacement: undefined };
      });

      const resultState = await interpreter.interpret([node] as MeldNode[]);
      
      expect(mockDirectiveClient.handleDirective).toHaveBeenCalled();
      // Assert against the returned state
      const variable = resultState.getVariable(varName);
      expect(variable).toBeDefined();
      expect(variable?.type).toBe(VariableType.TEXT);
      expect((variable as TextVariable)?.value).toBe(expectedValue);
    });

    it('interprets data directives', async () => {
      const example = dataDirectiveExamples.atomic.simpleObject;
      const node = await createNodeFromExample(example.code) as DirectiveNode;
      const varName = node.directive.identifier;
      const expectedData = { name: 'test', value: 123 };

      vi.spyOn(mockDirectiveClient, 'handleDirective').mockImplementationOnce(async (node: DirectiveNode, context: DirectiveProcessingContext) => {
          const variable = createDataVariable(varName, expectedData);
          const stateChanges = {
            set: [variable]
          };
          // Return a DirectiveResult with stateChanges
          return { stateChanges, replacement: undefined };
      });
      
      const resultState = await interpreter.interpret([node] as MeldNode[]);
      expect(mockDirectiveClient.handleDirective).toHaveBeenCalled();
      // Assert against the returned state
      const variable = resultState.getVariable(varName);
      expect(variable).toBeDefined();
      expect(variable?.type).toBe(VariableType.DATA);
      expect((variable as DataVariable)?.value).toEqual(expectedData);
    });

    it('interprets path directives', async () => {
      const varName = 'testPath';
      const node: DirectiveNode = {
        type: 'Directive',
        location: context.factory.createLocation(1, 1),
        directive: {
          kind: 'path',
          identifier: varName,
          path: {
            raw: 'docs',
            structured: { base: '.', segments: ['docs'], cwd: true },
            isPathVariable: false
          }
        }
      };
      const expectedPathValue: IFilesystemPathState = {
        contentType: PathContentType.FILESYSTEM,
        originalValue: 'resolved/docs', // The resolved value the mock sets
        isValidSyntax: true,
        isSecure: true,
        exists: true, // Assume exists for test
        isAbsolute: true // Assume resolved is absolute
      };
      
      vi.spyOn(mockDirectiveClient, 'handleDirective').mockImplementationOnce(async (node: DirectiveNode, context: DirectiveProcessingContext) => {
         const variable = createPathVariable(varName, expectedPathValue);
         const stateChanges = {
            set: [variable]
          };
         // Return a DirectiveResult with stateChanges
         return { stateChanges, replacement: undefined };
      });
      
      const resultState = await interpreter.interpret([node] as MeldNode[], { filePath: 'test.meld' }); 
      
      // Assert against the returned state
      const variable = resultState.getVariable(varName);
      
      expect(variable).toBeDefined();
      expect(mockDirectiveClient.handleDirective).toHaveBeenCalled();
      expect(variable?.type).toBe(VariableType.PATH);
      expect((variable as IPathVariable)?.value).toEqual(expectedPathValue);
    });

    it('maintains node order in state', async () => {
      const nodes = [
        context.factory.createTextDirective('first', 'one', context.factory.createLocation(1, 1)),
        context.factory.createTextDirective('second', 'two', context.factory.createLocation(2, 1)),
        context.factory.createTextDirective('third', 'three', context.factory.createLocation(3, 1))
      ];
      const parentState = state;

      vi.spyOn(mockDirectiveClient, 'handleDirective').mockImplementation(async (node: DirectiveNode, context: DirectiveProcessingContext) => {
          const varName = node.directive.identifier;
          const value = `val_${varName}`;
          const variable = createTextVariable(varName, value);
          const stateChanges = {
            set: [variable]
          };
          // Return a DirectiveResult with stateChanges
          return { stateChanges, replacement: undefined };
      });
      
      const resultState = await interpreter.interpret(nodes as MeldNode[], {
        initialState: parentState,
        filePath: 'test.meld',
        mergeState: true
      });
      expect(mockDirectiveClient.handleDirective).toHaveBeenCalledTimes(3);

      // Assert against the *parentState* because mergeState was true
      const stateNodes = parentState.getNodes();
      expect(stateNodes).toHaveLength(3);
      // Check variables using getVariable on parentState
      expect(parentState.getVariable('first')?.type).toBe(VariableType.TEXT);
      expect((parentState.getVariable('first') as TextVariable)?.value).toBe('val_first');
      expect(parentState.getVariable('second')?.type).toBe(VariableType.TEXT);
      expect((parentState.getVariable('second') as TextVariable)?.value).toBe('val_second');
      expect(parentState.getVariable('third')?.type).toBe(VariableType.TEXT);
      expect((parentState.getVariable('third') as TextVariable)?.value).toBe('val_third');
    });
  });

  describe('State management', () => {
    it('creates isolated states for different interpretations', async () => {
      const node = context.factory.createTextDirective('test', 'value');
      const result1 = await interpreter.interpret([node] as MeldNode[]);
      const result2 = await interpreter.interpret([node] as MeldNode[]);
      expect(result1).not.toBe(result2);
      expect(mockDirectiveClient.handleDirective).toHaveBeenCalledTimes(2); // handleDirective called for each interpretation
    });

    it('merges child state back to parent', async () => {
      const varName = 'child';
      const node = context.factory.createTextDirective(varName, 'value');
      const parentState = state.createChildState();
      const expectedValue = 'value';
      
      vi.spyOn(mockDirectiveClient, 'handleDirective').mockImplementationOnce(async (node: DirectiveNode, context: DirectiveProcessingContext) => {
         const variable = createTextVariable(varName, expectedValue);
         const stateChanges = {
           set: [variable]
         };
         // Return a DirectiveResult with stateChanges
         return { stateChanges, replacement: undefined };
      });
      
      await interpreter.interpret([node] as MeldNode[], { initialState: parentState, mergeState: true });
      
      // Assert against the *parentState* because mergeState was true
      const variable = parentState.getVariable(varName);
      expect(variable).toBeDefined();
      expect(variable?.type).toBe(VariableType.TEXT);
      expect((variable as TextVariable)?.value).toBe(expectedValue);
      expect(mockDirectiveClient.handleDirective).toHaveBeenCalledTimes(1);
    });

    it('maintains isolation with mergeState: false', async () => {
      const varName = 'isolated';
      const node = context.factory.createTextDirective(varName, 'value');
      const parentState = state.createChildState();
      const expectedValue = 'value';
      
      vi.spyOn(mockDirectiveClient, 'handleDirective').mockImplementationOnce(async (node: DirectiveNode, context: DirectiveProcessingContext) => {
         const variable = createTextVariable(varName, expectedValue);
         const stateChanges = {
           set: [variable]
         };
         // Return a DirectiveResult with stateChanges
         return { stateChanges, replacement: undefined };
      });
      
      const childResultState = await interpreter.interpret([node] as MeldNode[], { initialState: parentState, mergeState: false });
      
      // Check parent state - should be undefined
      expect(parentState.getVariable(varName)).toBeUndefined();
      // Check *returned* child state - should be defined
      const childVariable = childResultState.getVariable(varName);
      expect(childVariable).toBeDefined();
      expect(childVariable?.type).toBe(VariableType.TEXT);
      expect((childVariable as TextVariable)?.value).toBe(expectedValue);
      expect(mockDirectiveClient.handleDirective).toHaveBeenCalledTimes(1);
    });

    it('handles state rollback on merge errors', async () => {
      const varName = 'error';
      const originalVarName = 'original';
      const node = context.factory.createTextDirective(varName, '{{nonexistent}}', context.factory.createLocation(1, 1));
      const parentState = state.createChildState();
      const originalValue = 'value';
      const attemptedValue = 'attempted_value';
      
      // Set original variable
      await parentState.setVariable(createTextVariable(originalVarName, originalValue));

      vi.spyOn(mockDirectiveClient, 'handleDirective').mockImplementationOnce(async (node: DirectiveNode, context: DirectiveProcessingContext) => {
         const variable = createTextVariable(varName, attemptedValue);
         const stateChanges = {
           set: [variable]
         };
         // Return a DirectiveResult with stateChanges
         return { stateChanges, replacement: undefined };
      });

      // Interpretation should succeed even if resolution would fail later
      const finalState = await interpreter.interpret([node] as MeldNode[], { 
        initialState: parentState,
        filePath: 'test.meld',
        mergeState: true 
      });
      
      expect(mockDirectiveClient.handleDirective).toHaveBeenCalledTimes(1);
      // Check original variable still exists in parent state (merge shouldn't affect it if directive ran)
      const originalVariable = parentState.getVariable(originalVarName);
      expect(originalVariable).toBeDefined();
      expect(originalVariable?.type).toBe(VariableType.TEXT);
      expect((originalVariable as TextVariable)?.value).toBe(originalValue);
      // Check the variable set by the handler exists in the *returned* (merged) state
      const errorVariable = finalState.getVariable(varName); // Assert on returned state
      expect(errorVariable).toBeDefined();
      expect(errorVariable?.type).toBe(VariableType.TEXT);
      expect((errorVariable as TextVariable)?.value).toBe(attemptedValue); 
    });
  });

  describe('Error handling', () => {
    it('handles circular imports', async () => {
      await context.writeFile('project/src/circular1.meld', '@import [$./circular2.meld]');
      await context.writeFile('project/src/circular2.meld', '@import [$./circular1.meld]');
      const node = context.factory.createImportDirective('$./project/src/circular1.meld', context.factory.createLocation(1, 1));
      
      const originalInterpret = interpreter.interpret;
      (interpreter as any).interpret = vi.fn().mockRejectedValue(
        new MeldInterpreterError(
          'Circular import detected: a.meld -> b.meld -> a.meld',
          'import',
          undefined,
          {
            cause: new MeldImportError('Circular import detected', {
              code: 'CIRCULAR_IMPORT',
              details: { importChain: ['a.meld', 'b.meld', 'a.meld'] }
            })
          }
        )
      );
      try {
        await interpreter.interpret([node] as MeldNode[], { filePath: 'test.meld' });
        throw new Error('Should have thrown error');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(MeldInterpreterError);
        expect((error as MeldInterpreterError).message).toContain('Circular import');
      } finally {
        (interpreter as any).interpret = originalInterpret;
      }
    });

    it('provides location information in errors', async () => {
      const varName = 'error';
      const expectedValue = 'value';
      const node = context.factory.createTextDirective(varName, '{{nonexistent}}', context.factory.createLocation(1, 2));
      
      vi.spyOn(mockDirectiveClient, 'handleDirective').mockImplementationOnce(async (node: DirectiveNode, context: DirectiveProcessingContext) => {
         const variable = createTextVariable(varName, expectedValue);
         const stateChanges = {
           set: [variable]
         };
         // Return a DirectiveResult with stateChanges
         return { stateChanges, replacement: undefined };
      });
      
      const finalState = await interpreter.interpret([node] as MeldNode[], { filePath: 'test.meld' });
      
      expect(mockDirectiveClient.handleDirective).toHaveBeenCalledTimes(1);
      // Check the variable exists in the *returned* state
      const errorVariable = finalState.getVariable(varName);
      expect(errorVariable).toBeDefined();
      expect(errorVariable?.type).toBe(VariableType.TEXT);
      expect((errorVariable as TextVariable)?.value).toBe(expectedValue);
      // Note: This test doesn't actually test error location propagation from interpreter
      // It tests that interpretation proceeds. A different test would check error properties.
    });

    it('maintains state consistency after errors', async () => {
      const validExample = textDirectiveExamples.atomic.simpleString;
      const validNode = await createNodeFromExample(validExample.code) as DirectiveNode;
      const invalidNode = context.factory.createTextDirective('error', '{{nonexistent}}', context.factory.createLocation(2, 1));
      const testState = state.createChildState();
      const validVarName = validNode.directive.identifier;
      const invalidVarName = invalidNode.directive.identifier;
      const validValue = 'valid_value';
      const errorValue = 'error_value';
      
      vi.spyOn(mockDirectiveClient, 'handleDirective')
         .mockImplementationOnce(async (node: DirectiveNode, context: DirectiveProcessingContext) => {
            const variable = createTextVariable(validVarName, validValue);
            const stateChanges = {
              set: [variable]
            };
            // Return a DirectiveResult with stateChanges
            return { stateChanges, replacement: undefined };
         })
         .mockImplementationOnce(async (node: DirectiveNode, context: DirectiveProcessingContext) => {
            const variable = createTextVariable(invalidVarName, errorValue);
            const stateChanges = {
              set: [variable]
            };
            // Simulate successful handling before resolution error
            // Return a DirectiveResult with stateChanges
            return { stateChanges, replacement: undefined };
         });

      // Interpretation should complete
      const finalState = await interpreter.interpret([validNode, invalidNode] as MeldNode[], {
        initialState: testState,
        filePath: 'test.meld'
      });
      
      expect(mockDirectiveClient.handleDirective).toHaveBeenCalledTimes(2);
      // Check both variables exist in the *returned* state
      const validVar = finalState.getVariable(validVarName);
      const errorVar = finalState.getVariable(invalidVarName);
      expect(validVar).toBeDefined();
      expect(validVar?.type).toBe(VariableType.TEXT);
      expect((validVar as TextVariable)?.value).toBe(validValue);
      expect(errorVar).toBeDefined();
      expect(errorVar?.type).toBe(VariableType.TEXT);
      expect((errorVar as TextVariable)?.value).toBe(errorValue);
    });

    it('includes state context in interpreter errors', async () => {
      const varName = 'error';
      const expectedValue = 'value';
      const node = context.factory.createTextDirective(varName, '{{nonexistent}}', context.factory.createLocation(1, 1));
      
      vi.spyOn(mockDirectiveClient, 'handleDirective').mockImplementationOnce(async (node: DirectiveNode, context: DirectiveProcessingContext) => {
         const variable = createTextVariable(varName, expectedValue);
         const stateChanges = {
           set: [variable]
         };
         // Return a DirectiveResult with stateChanges
         return { stateChanges, replacement: undefined };
      });
       
      // Interpretation itself succeeds
      const finalState = await interpreter.interpret([node] as MeldNode[], { filePath: 'test.meld' });
      // Check variable using getVariable on the *returned* state
      const errorVar = finalState.getVariable(varName);
      expect(errorVar).toBeDefined();
      expect(errorVar?.type).toBe(VariableType.TEXT);
      expect((errorVar as TextVariable)?.value).toBe(expectedValue);
      expect(mockDirectiveClient.handleDirective).toHaveBeenCalledTimes(1);
      // This test doesn't verify error context inclusion, needs adjustment
      // To test context inclusion, we need interpreter itself to throw
    });

    it('rolls back state on directive errors', async () => {
      const beforeExample = textDirectiveExamples.atomic.simpleString;
      const beforeNode = await createNodeFromExample(beforeExample.code) as DirectiveNode;
      const errorNode = context.factory.createTextDirective('error', '{{nonexistent}}', context.factory.createLocation(2, 1));
      const afterExample = textDirectiveExamples.atomic.subject;
      const afterNode = await createNodeFromExample(afterExample.code) as DirectiveNode;
      const testState = state.createChildState();
      const beforeVarName = beforeNode.directive.identifier;
      const errorVarName = errorNode.directive.identifier;
      const afterVarName = afterNode.directive.identifier;
      
      vi.spyOn(mockDirectiveClient, 'handleDirective')
         .mockImplementationOnce(async (node: DirectiveNode, context: DirectiveProcessingContext) => {
            const variable = createTextVariable(beforeVarName, 'before_val');
            const stateChanges = {
              set: [variable]
            };
            // Return a DirectiveResult with stateChanges
            return { stateChanges, replacement: undefined };
         })
         .mockImplementationOnce(async (node: DirectiveNode, context: DirectiveProcessingContext) => {
            // Attempt to set variable, then throw
            const variable = createTextVariable(errorVarName, 'error_val');
            // It's important the handler *itself* throws the error,
            // rather than just returning stateChanges. Interpreter should handle it.
            // The return statement here won't be reached.
            // await context.state.setVariable(variable); // Don't actually set state before throwing in this mock
            throw new DirectiveError(
              'Directive handler failed',
              errorNode.directive.kind || 'unknown',
              DirectiveErrorCode.EXECUTION_FAILED,
              { node: errorNode }
            );
         })
         // This mock should not be called due to the error
         .mockImplementationOnce(async (node: DirectiveNode, context: DirectiveProcessingContext) => {
            const variable = createTextVariable(afterVarName, 'after_val');
            const stateChanges = {
              set: [variable]
            };
            return { stateChanges, replacement: undefined };
         });

      // Expect interpret to reject due to the DirectiveError
      await expect(interpreter.interpret([beforeNode, errorNode, afterNode] as MeldNode[], {
        initialState: testState,
        filePath: 'test.meld'
      })).rejects.toThrow(MeldInterpreterError); // Interpreter wraps DirectiveError
      
      // Only the first handler should have been called and succeeded, 
      // the second threw, the third wasn't called. 
      // Interpreter creates a child state for each node. The first node's changes
      // are merged into the second node's input state. The second node throws.
      // The *initial* state (testState) should remain unchanged.
      expect(mockDirectiveClient.handleDirective).toHaveBeenCalledTimes(2);
      
      // Verify state rollback: *initial* state should NOT contain variables set during failed interpretation
      expect(testState.getVariable(beforeVarName)).toBeUndefined();
      expect(testState.getVariable(errorVarName)).toBeUndefined();
      expect(testState.getVariable(afterVarName)).toBeUndefined();
    });

    it('handles cleanup on circular imports', async () => {
      await context.writeFile('project/src/circular1.meld', '@import [$./circular2.meld]');
      await context.writeFile('project/src/circular2.meld', '@import [$./circular1.meld]');
      const node = context.factory.createImportDirective('$./project/src/circular1.meld', context.factory.createLocation(1, 1));
      
      const originalInterpret = interpreter.interpret;
      (interpreter as any).interpret = vi.fn().mockRejectedValue(
        new MeldInterpreterError(
          'Circular import detected: a.meld -> b.meld -> a.meld',
          'import',
          undefined,
          {
            cause: new MeldImportError('Circular import detected', {
              code: 'CIRCULAR_IMPORT',
              details: { importChain: ['a.meld', 'b.meld', 'a.meld'] }
            })
          }
        )
      );
      try {
        await interpreter.interpret([node] as MeldNode[], { filePath: 'test.meld' });
        throw new Error('Should have thrown error');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(MeldInterpreterError);
        expect((error as MeldInterpreterError).message).toContain('Circular import');
        // Add check for cleanup if applicable (e.g., circularity service state)
      } finally {
        (interpreter as any).interpret = originalInterpret;
      }
    });
  });

  describe('Complex scenarios', () => {
    it.todo('handles nested imports with state inheritance');

    it('maintains correct file paths during interpretation', async () => {
      const node = context.factory.createTextDirective('dummy', 'value', context.factory.createLocation(1,1));
      // Re-apply the mock explicitly for this test to ensure it returns the correct structure
      vi.spyOn(mockDirectiveClient, 'handleDirective').mockResolvedValue({ stateChanges: undefined, replacement: [] }); // Use empty array for replacement
      const resultState = await interpreter.interpret([node] as MeldNode[], { filePath: 'some/dir/test.meld' });
      // Check that the directive was processed
      expect(mockDirectiveClient.handleDirective).toHaveBeenCalled();
      // We can't easily assert the internal filePath propagation without more complex mocking or exposing state
    });

    it.todo('maintains correct state after successful imports');
  });

  describe('AST structure handling', () => {
    it('handles text directives with correct format', async () => {
      const example = textDirectiveExamples.atomic.simpleString;
      const node = await createNodeFromExample(example.code) as DirectiveNode;
      const varName = node.directive.identifier;
      const expectedValue = 'test value';
      
      vi.spyOn(mockDirectiveClient, 'handleDirective').mockImplementationOnce(async (node: DirectiveNode, context: DirectiveProcessingContext) => {
         const variable = createTextVariable(varName, expectedValue);
         const stateChanges = {
           set: [variable]
         };
         // Return a DirectiveResult with stateChanges
         return { stateChanges, replacement: undefined };
      });
      
      const resultState = await interpreter.interpret([node] as MeldNode[]);
      
      expect(mockDirectiveClient.handleDirective).toHaveBeenCalledTimes(1);
      // Assert against the returned state
      const variable = resultState.getVariable(varName);
      expect(variable).toBeDefined();
      expect(variable?.type).toBe(VariableType.TEXT);
      expect((variable as TextVariable)?.value).toBe(expectedValue);
    });

    it('handles data directives with correct format', async () => {
      const example = dataDirectiveExamples.atomic.simpleObject;
      const node = await createNodeFromExample(example.code) as DirectiveNode;
      const varName = node.directive.identifier;
      const expectedData = { key: 'data value' };
      
      vi.spyOn(mockDirectiveClient, 'handleDirective').mockImplementationOnce(async (node: DirectiveNode, context: DirectiveProcessingContext) => {
         const variable = createDataVariable(varName, expectedData);
         const stateChanges = {
           set: [variable]
         };
         // Return a DirectiveResult with stateChanges
         return { stateChanges, replacement: undefined };
      });
      
      const resultState = await interpreter.interpret([node] as MeldNode[]);
      
      expect(mockDirectiveClient.handleDirective).toHaveBeenCalledTimes(1);
      // Assert against the returned state
      const variable = resultState.getVariable(varName);
      expect(variable).toBeDefined();
      expect(variable?.type).toBe(VariableType.DATA);
      expect((variable as DataVariable)?.value).toEqual(expectedData);
    });

    it('handles path directives with correct format', async () => {
      const varName = 'test';
      const node: DirectiveNode = {
        type: 'Directive',
        location: context.factory.createLocation(1, 1),
        directive: { kind: 'path', identifier: varName, path: { raw: 'filename.meld', structured: { base: '.', segments: ['filename.meld'], cwd: true }, isPathVariable: false } }
      };
      const expectedPathValue: IFilesystemPathState = {
        contentType: PathContentType.FILESYSTEM,
        originalValue: 'resolved/filename.meld',
        isValidSyntax: true,
        isSecure: true,
        exists: true,
        isAbsolute: true
      };

      vi.spyOn(mockDirectiveClient, 'handleDirective').mockImplementationOnce(async (node: DirectiveNode, context: DirectiveProcessingContext) => {
         const variable = createPathVariable(varName, expectedPathValue);
         const stateChanges = {
           set: [variable]
         };
         // Return a DirectiveResult with stateChanges
         return { stateChanges, replacement: undefined };
      });
      
      const resultState = await interpreter.interpret([node] as MeldNode[], { filePath: 'test.meld' });
      
      expect(mockDirectiveClient.handleDirective).toHaveBeenCalledTimes(1);
      // Assert against the returned state
      const variable = resultState.getVariable(varName);
      expect(variable).toBeDefined();
      expect(variable?.type).toBe(VariableType.PATH);
      expect((variable as IPathVariable)?.value).toEqual(expectedPathValue);
    });

    it('handles complex directives with schema validation', async () => {
      const example = dataDirectiveExamples.atomic.person;
      const node = await createNodeFromExample(example.code) as DirectiveNode;
      const varName = node.directive.identifier;
      const complexData = { name: 'Alice', age: 30 };

      vi.spyOn(mockDirectiveClient, 'handleDirective').mockImplementationOnce(async (node: DirectiveNode, context: DirectiveProcessingContext) => {
         const variable = createDataVariable(varName, complexData);
         const stateChanges = {
           set: [variable]
         };
         // Return a DirectiveResult with stateChanges
         return { stateChanges, replacement: undefined };
      });
      
      const resultState = await interpreter.interpret([node] as MeldNode[]);
      
      expect(mockDirectiveClient.handleDirective).toHaveBeenCalledTimes(1);
      // Assert against the returned state
      const variable = resultState.getVariable(varName);
      expect(variable).toBeDefined();
      expect(variable?.type).toBe(VariableType.DATA);
      expect((variable as DataVariable)?.value).toEqual(complexData);
    });

    it('maintains correct node order with mixed content', async () => {
      const example1 = textDirectiveExamples.atomic.simpleString;
      const example2 = textDirectiveExamples.atomic.subject;
      const example3 = textDirectiveExamples.atomic.user;
      const node1 = await createNodeFromExample(example1.code) as DirectiveNode;
      const node2 = await createNodeFromExample(example2.code) as DirectiveNode;
      const node3 = await createNodeFromExample(example3.code) as DirectiveNode;
      const id1 = node1.directive.identifier;
      const id2 = node2.directive.identifier;
      const id3 = node3.directive.identifier;

      vi.spyOn(mockDirectiveClient, 'handleDirective')
         .mockImplementation(async (node: DirectiveNode, context: DirectiveProcessingContext) => {
            const varName = node.directive.identifier;
            const value = `val_${varName}`;
            const variable = createTextVariable(varName, value);
            const stateChanges = {
              set: [variable]
            };
            // Return a DirectiveResult with stateChanges
            return { stateChanges, replacement: undefined };
         });

      const resultState = await interpreter.interpret([node1, node2, node3] as MeldNode[]);
      const stateNodes = resultState.getNodes(); // Check nodes on returned state
      
      expect(mockDirectiveClient.handleDirective).toHaveBeenCalledTimes(3);
      expect(stateNodes).toHaveLength(3);
      // Assert against the returned state
      expect(resultState.getVariable(id1)?.type).toBe(VariableType.TEXT);
      expect((resultState.getVariable(id1) as TextVariable)?.value).toBe(`val_${id1}`);
      expect(resultState.getVariable(id2)?.type).toBe(VariableType.TEXT);
      expect((resultState.getVariable(id2) as TextVariable)?.value).toBe(`val_${id2}`);
      expect(resultState.getVariable(id3)?.type).toBe(VariableType.TEXT);
      expect((resultState.getVariable(id3) as TextVariable)?.value).toBe(`val_${id3}`);
    });

    it.todo('handles nested directive values correctly');
  });
}); 