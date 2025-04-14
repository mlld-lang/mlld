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
import type { DirectiveProcessingContext, FormattingContext, ResolutionContext } from '@core/types/index.js';

// Define a simple mock FormattingContext
const mockFormattingContext: FormattingContext = {
  isBlock: false,
  preserveLiteralFormatting: false,
  preserveWhitespace: false,
};

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
             const clonedVars = { ...this._vars }; // Shallow copy internal vars
             // Return a new object that explicitly includes the necessary methods
             // and operates on the cloned vars.
             const clonedState: IStateService = {
                // Explicitly include all methods from IStateService, delegating to original mock or providing new impls
                getTextVar: vi.fn().mockImplementation((name) => {
                    const val = clonedVars[name];
                    return val && typeof val !== 'object' ? { type: 'text', value: val, source: 'mock', location: undefined } : undefined;
                }),
                getDataVar: vi.fn().mockImplementation((name) => {
                    const val = clonedVars[name];
                    return val && typeof val === 'object' ? { type: 'data', value: val, source: 'mock', location: undefined } : undefined;
                }),
                getPathVar: vi.fn().mockReturnValue(undefined), // Add missing path methods if needed
                getCommandVar: vi.fn().mockReturnValue(undefined),
                getVariable: vi.fn().mockImplementation((name) => clonedVars[name]), 
                setTextVar: vi.fn().mockImplementation((name, value) => { clonedVars[name] = value; }),
                setDataVar: vi.fn().mockImplementation((name, value) => { clonedVars[name] = value; }),
                setPathVar: vi.fn(),
                setCommandVar: vi.fn(),
                getAllTextVars: vi.fn().mockReturnValue(new Map(Object.entries(clonedVars).filter(([k,v]) => typeof v !== 'object').map(([k,v]) => [k, { type: 'text', value: v, source: 'mock'}]))),
                getAllDataVars: vi.fn().mockReturnValue(new Map(Object.entries(clonedVars).filter(([k,v]) => typeof v === 'object').map(([k,v]) => [k, { type: 'data', value: v, source: 'mock'}]))),
                getAllPathVars: vi.fn().mockReturnValue(new Map()),
                getAllCommandVars: vi.fn().mockReturnValue(new Map()),
                hasVariable: vi.fn().mockImplementation((name) => name in clonedVars),
                setCurrentFilePath: vi.fn(),
                getCurrentFilePath: this.getCurrentFilePath, // Preserve original mock
                getNodes: this.getNodes, // Preserve original mock
                addNode: vi.fn(), // Cloned state might need its own node list or delegate
                getTransformedNodes: this.getTransformedNodes,
                setTransformedNodes: vi.fn(),
                transformNode: vi.fn(),
                isTransformationEnabled: this.isTransformationEnabled,
                setTransformationEnabled: vi.fn(),
                getTransformationOptions: this.getTransformationOptions,
                getParentState: () => this, // Cloned state's parent is the original state
                getStateSnapshot: vi.fn().mockReturnValue({ vars: { ...clonedVars }, nodes: [] }), 
                // Add clone and createChildState to the new object, recursively
                clone: vi.fn().mockImplementation(() => clonedState.clone()), // Recursive call needs to be defined carefully or use the outer one
                createChildState: vi.fn().mockImplementation(() => clonedState.clone()), // Simplification: child is a clone 
             };
             // Fix recursion for clone/createChildState if the above is problematic
             (clonedState as any).clone = () => this.clone.bind(clonedState)(); // Or re-implement clone logic here if needed
             (clonedState as any).createChildState = () => this.clone.bind(clonedState)();
             return clonedState;
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

    // --- BEGIN RESOLUTION SERVICE MOCK SETUP ---
    // 1. Create a manual mock object for IResolutionService
    const mockResolutionService: IResolutionService = {
      resolveText: vi.fn(),
      resolveData: vi.fn(),
      resolvePath: vi.fn(),
      resolveCommand: vi.fn(),
      resolveFile: vi.fn(), // Deprecated but might be needed by mock setup
      resolveContent: vi.fn(), // Deprecated but might be needed by mock setup
      resolveNodes: vi.fn(), // Include for completeness, though we spy on resolveInContext
      resolveInContext: vi.fn(), // THE IMPORTANT ONE TO SPY ON
      resolveFieldAccess: vi.fn(),
      validateResolution: vi.fn(),
      extractSection: vi.fn(),
      detectCircularReferences: vi.fn(), // Deprecated
      convertToFormattedString: vi.fn(),
      enableResolutionTracking: vi.fn(),
      getResolutionTracker: vi.fn(),
      // Add any other methods from IResolutionService if tests require them
    };

    // 2. Register THIS specific mock instance
    context.registerMock<IResolutionService>('IResolutionService', mockResolutionService);

    // 3. Set up the spy on the 'resolveInContext' method of our mock instance
    vi.spyOn(mockResolutionService, 'resolveInContext').mockImplementation(async (value, ctx) => {
        const stateForResolve = ctx.state; 
        if (!stateForResolve) {
            console.warn('[DirectiveService.test mock] resolveInContext received context without state!');
            return '';
        }
        let result = '';
        // Simplified mock logic: Check if input is array (InterpolatableValue)
        if (Array.isArray(value)) {
           for (const node of value) {
              if (node.type === 'Text') {
                  result += node.content;
              } else if (node.type === 'VariableReference') {
                 const identifier = node.identifier;
                 // Use the mockState directly for variable lookup in the mock
                 const variable = mockState.getTextVar(identifier);
                 if (variable?.value !== undefined) {
                    result += variable.value;
                 } else {
                   const dataVar = mockState.getDataVar(identifier); 
                   if (dataVar?.value !== undefined) {
                      try {
                         result += typeof dataVar.value === 'string' ? dataVar.value : JSON.stringify(dataVar.value);
                      } catch { 
                          result += `[Object: ${identifier}]`; 
                      }
                   } else {
                     // Simulate unresolved variable based on original mock logic
                     result += `{{${identifier}}}`; 
                   }
                 }
              }
           }
        } else if (typeof value === 'string') {
            // Basic string handling: return as is for this mock, assuming no vars in plain strings for these tests
            // or implement simple parsing/lookup if needed
            // Simulate basic interpolation for integration tests
            if (value.includes('{{name}}')) {
                result = value.replace('{{name}}', mockState.getTextVar('name')?.value || '{{name}}');
            } else if (value.includes('{{val}}')) {
                result = value.replace('{{val}}', mockState.getTextVar('val')?.value || '{{val}}');
            } else if (value.includes('{{user}}')) {
                result = value.replace('{{user}}', mockState.getTextVar('user')?.value || '{{user}}');
            } else {
                 result = value; 
            }
           
        } else { // Assuming StructuredPath otherwise
            result = (value as any).raw || ''; // Fallback for StructuredPath
        }
        // console.log('[DirectiveService.test mock] resolveInContext value:', value, 'returning:', result);
        return result;
    });
    // --- END RESOLUTION SERVICE MOCK SETUP ---

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
    
    // 4. Initialize the DirectiveService - it will now receive the spied-upon instance
    service = await TestDirectiveHandlerHelper.initializeDirectiveService(context);
    
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
          formattingContext: mockFormattingContext // Use constant mock
      };

      try {
        // Call handleDirective which checks initialization
        await uninitializedService.handleDirective(node, mockProcessingContext); 
        expect.fail('Service did not throw when used before initialization');
      } catch (e) {
        // Expect the specific error thrown by ensureInitialized
        expect(e).toBeInstanceOf(MeldError); 
        expect((e as MeldError).message).toContain('DirectiveService must be initialized before use');
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
          formattingContext: mockFormattingContext, // Use constant mock
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
            formattingContext: mockFormattingContext, // Use constant mock
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
            formattingContext: mockFormattingContext,
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
            formattingContext: mockFormattingContext,
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
            formattingContext: mockFormattingContext,
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
            formattingContext: mockFormattingContext, // Use constant mock
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