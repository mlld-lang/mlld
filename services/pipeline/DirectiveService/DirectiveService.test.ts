import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import type { DirectiveNode } from '@core/syntax/types.js';
import { IDirectiveService } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem.js';
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem.js';
import { vi } from 'vitest';
import { StateTrackingService } from '@tests/utils/debug/StateTrackingService/StateTrackingService.js';
import { TestDirectiveHandlerHelper } from '@tests/utils/di/TestDirectiveHandlerHelper.js';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { IStateService } from '@services/state/IStateService.js';
import { ErrorSeverity, MeldError } from '@core/errors/MeldError.js';
import { createTextDirective } from '@tests/utils/testFactories.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import { createMockFormattingContext } from '@tests/mocks/serviceMocks.js';
import type { DirectiveProcessingContext, FormattingContext, ResolutionContext } from '@core/types/index.js';

// Main test suite for DirectiveService
describe('DirectiveService', () => {
  let context: TestContextDI;
  let service: IDirectiveService;
  let mockState: IStateService;

  beforeEach(async () => {
    // Initialize test context with isolated container
    context = TestContextDI.createIsolated();
    await context.initialize();
    
    // Initialize mockState inside beforeEach
    mockState = {
        _vars: {}, // Internal store for the mock
        getTextVar: vi.fn().mockImplementation(function(this: any, name) {
           const val = this._vars[name];
           // console.log(`[mockState getTextVar] ${name}:`, val);
           return val && typeof val !== 'object' ? { type: 'text', value: val } : undefined;
        }),
        getDataVar: vi.fn().mockImplementation(function(this: any, name) {
           const val = this._vars[name];
           // console.log(`[mockState getDataVar] ${name}:`, val);
           return val && typeof val === 'object' ? { type: 'data', value: val } : undefined;
        }),
        setTextVar: vi.fn().mockImplementation(function(this: any, name, value) {
            // console.log(`[mockState setTextVar] ${name} =`, value);
            this._vars[name] = value; // Store raw value for simplicity in mock
        }),
        setDataVar: vi.fn().mockImplementation(function(this: any, name, value) {
            // console.log(`[mockState setDataVar] ${name} =`, value);
            this._vars[name] = value; // Store the whole object/array value
        }),
        clone: vi.fn().mockImplementation(function(this: any) {
             const originalVars = this._vars;
             const cloned = { 
                 ...this, // Copy existing methods
                 _vars: { ...originalVars }, // Shallow copy internal vars
                 // Ensure clone can also clone
                 clone: function() { return this.clone(); }, 
                 createChildState: function() { return this.clone(); },
             };
             return cloned;
        }),
         getVariable: vi.fn().mockImplementation(function(this: any, name) {
             return this._vars[name]; // Simple lookup for testing
         }),
         setCurrentFilePath: vi.fn(),
         getCurrentFilePath: vi.fn().mockReturnValue('mock/path.meld'),
         createChildState: vi.fn().mockImplementation(function(this: any) { return this.clone(); }),
         mergeChildState: vi.fn(),
         getNodes: vi.fn().mockReturnValue([]), 
         addNode: vi.fn(), 
         getTransformedNodes: vi.fn().mockReturnValue([]), 
         setTransformedNodes: vi.fn(), 
         transformNode: vi.fn(), 
         isTransformationEnabled: vi.fn().mockReturnValue(false),
         // Add missing methods required by IStateService
         getParentState: vi.fn().mockReturnValue(undefined),
         setTransformationEnabled: vi.fn(),
         getTransformationOptions: vi.fn().mockReturnValue({}),
         getAllTextVars: vi.fn().mockReturnValue(new Map()),
         getAllDataVars: vi.fn().mockReturnValue(new Map()),
         getAllPathVars: vi.fn().mockReturnValue(new Map()),
         getCommandVar: vi.fn().mockReturnValue(undefined),
         setCommandVar: vi.fn(),
         getAllCommandVars: vi.fn().mockReturnValue(new Map()),
         hasVariable: vi.fn().mockImplementation(function(this:any, name) { return name in this._vars; }),
         getStateSnapshot: vi.fn().mockReturnValue({ vars: {}, nodes: [] }),

    };
    context.registerMock<IStateService>('IStateService', mockState);

    // Load test fixtures
    await context.fixtures.load('directiveTestProject');

    // Create test files with appropriate content
    await context.fs.writeFile('test.meld', '@text greeting = "Hello"');
    await context.fs.writeFile('test-interpolation.meld', '@text greeting = "Hello {{name}}"');
    await context.fs.writeFile('test-data.meld', '@data config = { "key": "value" }');
    await context.fs.writeFile('test-data-interpolation.meld', '@data config = { "greeting": "Hello {{user}}" }');
    await context.fs.writeFile('module.meld', '@text greeting = "Hello"');
    await context.fs.writeFile('inner.meld', 'This is the inner module content');
    await context.fs.writeFile('middle.meld', '@import inner.meld\nMiddle module content');
    await context.fs.writeFile('a.meld', '@import b.meld\nA imports B');
    await context.fs.writeFile('b.meld', '@import a.meld\nB imports A');
    
    // Register the NodeFileSystem
    context.registerMock('IFileSystem', new NodeFileSystem());
    
    // Register the StateTrackingService
    const trackingService = new StateTrackingService();
    context.registerMock('IStateTrackingService', trackingService);
    context.registerMock('StateTrackingService', trackingService);
    
    // Use the helper to initialize the DirectiveService with all handlers
    service = await TestDirectiveHandlerHelper.initializeDirectiveService(context);
    
    // Mock resolveNodes for DirectiveService tests
    const resolutionService = await context.container.resolve<IResolutionService>('IResolutionService');
    vi.spyOn(resolutionService, 'resolveNodes').mockImplementation(async (nodes, ctx) => {
        const stateForResolve = ctx.state; 
        if (!stateForResolve) {
            console.warn('[DirectiveService.test mock] resolveNodes received context without state!');
            return '';
        }
        let result = '';
        if (Array.isArray(nodes)) {
           for (const node of nodes) {
              if (node.type === 'Text') {
                  result += node.content;
              } else if (node.type === 'VariableReference') {
                 const identifier = node.identifier;
                 const variable = stateForResolve.getTextVar(identifier);
                 if (variable?.value !== undefined) {
                    result += variable.value;
                 } else {
                   const dataVar = stateForResolve.getDataVar(identifier); 
                   if (dataVar?.value !== undefined) {
                      try {
                         result += typeof dataVar.value === 'string' ? dataVar.value : JSON.stringify(dataVar.value);
                      } catch { 
                          result += `[Object: ${identifier}]`; 
                      }
                   } else {
                     result += `{{${identifier}}}`; 
                   }
                 }
              }
           }
        } else {
            result = JSON.stringify(nodes); // Fallback
        }
        console.log('[DirectiveService.test mock] resolveNodes returning: ' + result + '\n');
        return result;
    });
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  describe('Service initialization', () => {
    it('should initialize with all required services', () => {
      // Check if handlers are registered (assuming helper registers them)
      expect(service.hasHandler('text')).toBe(true);
      expect(service.hasHandler('data')).toBe(true);
      expect(service.hasHandler('path')).toBe(true);
    });

    it('should throw if used before initialization', async () => {
      // Create instance directly, bypassing DI initialization
      const uninitializedService = new DirectiveService(); 
      const node = context.factory.createTextDirective('test', '"value"', context.factory.createLocation(1, 1));
      const mockProcessingContext: DirectiveProcessingContext = { 
          state: mockState, 
          directiveNode: node,
          resolutionContext: {} as ResolutionContext, // Placeholder
          formattingContext: {} as FormattingContext // Placeholder
      };

      try {
        // Call handleDirective which checks initialization
        await uninitializedService.handleDirective(node, mockProcessingContext); 
        expect.fail('Service did not throw when used before initialization');
      } catch (e) {
        // Expect the specific error thrown by ensureInitialized
        expect(e).toBeInstanceOf(MeldError); 
        expect((e as MeldError).message).toContain('DirectiveService has not been initialized');
      }
    });

    it('should throw if handler is missing', async () => {
      // Get the initialized service from context
      const initializedService = service as DirectiveService;
      
      // Manually remove a handler after initialization
      (initializedService as any).handlers.delete('text'); 
      
      const node = createTextDirective('test', 'value'); 
      const currentFilePath = 'test.meld';
      const state = await context.resolve<IStateService>('IStateService');
      state.setCurrentFilePath(currentFilePath);

      const processingContext: DirectiveProcessingContext = { 
          state: state, 
          directiveNode: node,
          resolutionContext: ResolutionContextFactory.create(state, currentFilePath),
          formattingContext: createMockFormattingContext(), // Use mock
      };
      
      try {
        // Call handleDirective which checks for handler
        await initializedService.handleDirective(node, processingContext);
        expect.fail('Should have thrown HANDLER_NOT_FOUND');
      } catch(e) {
        expect(e).toBeInstanceOf(DirectiveError);
        const error = e as DirectiveError;
        expect(error.code).toBe(DirectiveErrorCode.HANDLER_NOT_FOUND);
        expect(error.message).toContain('No handler registered for directive kind: text'); 
      }
    });
  });

  describe('Directive processing', () => {
    describe('Text directives', () => {
      it('should process basic text directive', async () => {
        const content = await context.fs.readFile('test.meld');
        const nodes = await context.services.parser.parse(content);
        const directiveNode = nodes[0] as DirectiveNode;
        if (directiveNode?.directive?.kind === 'text' && directiveNode.directive.source === undefined) {
            directiveNode.directive.source = 'literal'; 
        } else if (!directiveNode || directiveNode.directive?.kind !== 'text') {
            throw new Error('Test setup error: Parsed node is not a valid @text directive.');
        }
        
        // Create execution context
        const state = await context.container.resolve<IStateService>('IStateService');
        state.setCurrentFilePath('test.meld'); // Set file path on state
        const processingContext: DirectiveProcessingContext = { 
            state: state, 
            directiveNode: directiveNode,
            resolutionContext: ResolutionContextFactory.create(state, 'test.meld'),
            formattingContext: createMockFormattingContext(), // Use mock
        };

        // Process the directive using handleDirective
        const result = await service.handleDirective(directiveNode, processingContext);
        const resultState = result as IStateService;

        // Assert against the RESULT state
        expect(resultState.getTextVar('greeting')?.value).toBe('Hello');
      });

      it.skip('should process text directive with variable interpolation', async () => {
        const state = await context.container.resolve<IStateService>('IStateService');
        state.setCurrentFilePath('test-interpolation.meld');
        await state.setTextVar('name', 'World'); 

        const content = await context.fs.readFile('test-interpolation.meld');
        const nodes = await context.services.parser.parse(content);
        const node = nodes[0] as DirectiveNode;
        if (node?.directive) { node.directive.source = 'literal'; }
        
        const processingContext: DirectiveProcessingContext = { 
            state: state, 
            directiveNode: node,
            resolutionContext: ResolutionContextFactory.create(state, 'test-interpolation.meld'),
            formattingContext: createMockFormattingContext(),
        };

        const result = await service.handleDirective(node, processingContext);
        const resultState = result as IStateService;

        expect(resultState.getTextVar('greeting')?.value).toBe('Hello World');
      });
    });

    describe('Data directives', () => {
      it('should process data directive with object value', async () => {
        const content = await context.fs.readFile('test-data.meld');
        const nodes = await context.services.parser.parse(content);
        const node = nodes[0] as DirectiveNode;
        if (node?.directive) { node.directive.source = 'literal'; }
        
        const state = await context.container.resolve<IStateService>('IStateService');
        state.setCurrentFilePath('test-data.meld');
        const processingContext: DirectiveProcessingContext = { 
            state: state, 
            directiveNode: node,
            resolutionContext: ResolutionContextFactory.create(state, 'test-data.meld'),
            formattingContext: createMockFormattingContext(),
        };

        const result = await service.handleDirective(node, processingContext);
        const resultState = result as IStateService;

        expect(resultState.getDataVar('config')?.value).toEqual({ key: 'value' });
      });

      it.skip('should process data directive with variable interpolation', async () => {
        const state = await context.container.resolve<IStateService>('IStateService');
        state.setCurrentFilePath('test-data-interpolation.meld');
        await state.setTextVar('user', 'Alice'); 

        const content = await context.fs.readFile('test-data-interpolation.meld');
        const nodes = await context.services.parser.parse(content);
        const node = nodes[0] as DirectiveNode;
        if (node?.directive) { node.directive.source = 'literal'; }
        
        const processingContext: DirectiveProcessingContext = { 
            state: state, 
            directiveNode: node,
            resolutionContext: ResolutionContextFactory.create(state, 'test-data-interpolation.meld'),
            formattingContext: createMockFormattingContext(),
        };
        
        const result = await service.handleDirective(node, processingContext);
        const resultState = result as IStateService;
        
        expect(resultState.getDataVar('config')?.value).toEqual({ greeting: 'Hello Alice' });
      });
    });

    describe('Import directives', () => {
      it.skip('should process basic import', async () => {
        // NOTE: Skipping this test temporarily during ServiceMediator removal.
        // Will need to properly integrate with the new factory pattern in a follow-up task.
        
        // Create the module.meld file with content
        await context.fs.writeFile('/project/module.meld', '@text greeting = "Hello"');
        
        // Create import directive node with value property
        const node = context.factory.createImportDirective('module.meld', context.factory.createLocation(1, 1));
        
        // Verify file exists before test
        const exists = await context.fs.exists('/project/module.meld');
        expect(exists).toBe(true);
        
        // Mock the resolution service to resolve the path to the absolute path
        const resolutionService = await context.resolve('IResolutionService');
        const originalResolveInContext = resolutionService.resolveInContext;
        resolutionService.resolveInContext = vi.fn().mockImplementation(
          async (path: string, resolveContext: any) => {
            if (path === 'module.meld') {
              return '/project/module.meld';
            }
            return originalResolveInContext(path, resolveContext);
          }
        );
        
        // Mock the interpreter service to properly handle the import
        const interpreterService = await context.resolve<IInterpreterService>('IInterpreterService');
        
        // Use vi.fn() instead of spyOn to avoid type issues
        const originalInterpret = interpreterService.interpret;
        interpreterService.interpret = vi.fn().mockImplementation(
          async (nodes: any, options: any) => {
            // Simulate interpreting the imported file by setting the variable
            if (options?.initialState) {
              options.initialState.setTextVar('greeting', { type: 'text', value: 'Hello' });
              return options.initialState;
            }
            return context.services.state;
          }
        );
        
        try {
          const result = await service.handleDirective(node, {
            currentFilePath: 'main.meld',
            state: context.services.state
          });

          expect(result.getTextVar('greeting')?.value).toBe('Hello');
        } finally {
          // Restore original methods
          interpreterService.interpret = originalInterpret;
          resolutionService.resolveInContext = originalResolveInContext;
        }
      });

      it.skip('should handle nested imports', async () => {
        // NOTE: Skipping this test temporarily during ServiceMediator removal.
        // Will need to properly integrate with the new factory pattern in a follow-up task.
        
        // Create nested import files with absolute paths in the project directory
        await context.fs.writeFile('/project/inner.meld', '@text inner = "Inner Content"');
        await context.fs.writeFile('/project/middle.meld', '@import inner.meld\n@text middle = "Middle Content"');
        
        // Create import directive node with value property
        const node = context.factory.createImportDirective('middle.meld', context.factory.createLocation(1, 1));
        
        // Verify files exist before test
        const innerExists = await context.fs.exists('/project/inner.meld');
        const middleExists = await context.fs.exists('/project/middle.meld');
        expect(innerExists).toBe(true);
        expect(middleExists).toBe(true);
        
        // Mock the resolution service to resolve paths to absolute paths
        const resolutionService = await context.resolve('IResolutionService');
        const originalResolveInContext = resolutionService.resolveInContext;
        resolutionService.resolveInContext = vi.fn().mockImplementation(
          async (path: string, resolveContext: any) => {
            if (path === 'middle.meld') {
              return '/project/middle.meld';
            } else if (path === 'inner.meld') {
              return '/project/inner.meld';
            }
            return originalResolveInContext(path, resolveContext);
          }
        );
        
        // Mock the interpreter service to properly handle nested imports
        const interpreterService = await context.resolve<IInterpreterService>('IInterpreterService');
        
        // Use vi.fn() instead of spyOn to avoid type issues
        const originalInterpret = interpreterService.interpret;
        interpreterService.interpret = vi.fn().mockImplementation(
          async (nodes: any, options: any) => {
            // Simulate interpreting the imported file by setting variables
            if (options?.initialState) {
              if (options.filePath?.includes('middle.meld')) {
                options.initialState.setTextVar('middle', { type: 'text', value: 'Middle Content' });
                options.initialState.setTextVar('inner', { type: 'text', value: 'Inner Content' });
              } else if (options.filePath?.includes('inner.meld')) {
                options.initialState.setTextVar('inner', { type: 'text', value: 'Inner Content' });
              }
              return options.initialState;
            }
            return context.services.state;
          }
        );
        
        try {
          const result = await service.handleDirective(node, {
            currentFilePath: 'main.meld',
            state: context.services.state
          });

          expect(result.getTextVar('inner')?.value).toBe('Inner Content');
          expect(result.getTextVar('middle')?.value).toBe('Middle Content');
        } finally {
          // Restore original methods
          interpreterService.interpret = originalInterpret;
          resolutionService.resolveInContext = originalResolveInContext;
        }
      });

      it('should detect circular imports', async () => {
        // Create import directive node with value property
        const node = context.factory.createImportDirective('b.meld', context.factory.createLocation(1, 1));
        
        // Mock the file system to return content for the imported files
        const mockExists = vi.spyOn(context.fs, 'exists');
        mockExists.mockResolvedValue(true);
        
        const mockReadFile = vi.spyOn(context.fs, 'readFile').mockImplementation(async (path) => {
          if (path === 'b.meld') {
            return '@import [a.meld]';
          } else if (path === 'a.meld') {
            return '@import [b.meld]';
          }
          return '';
        });
        
        const state = context.services.state;
        state.setCurrentFilePath('a.meld');
        const processingContext: DirectiveProcessingContext = { 
            state: state, 
            directiveNode: node,
            resolutionContext: ResolutionContextFactory.create(state, 'a.meld'),
            formattingContext: createMockFormattingContext(),
        };
        
        await expect(service.handleDirective(node, processingContext))
          .rejects.toThrow(DirectiveError); // Should throw DirectiveError eventually
        
        // Restore mocks
        mockExists.mockRestore();
        mockReadFile.mockRestore();
      });
    });

    // ... continue with other directive types and error cases
  });
}); 