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
import { IResolutionService } from '@services/pipeline/ResolutionService/IResolutionService.js';
import { IStateService } from '@services/state/IStateService.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';

// Main test suite for DirectiveService
describe('DirectiveService', () => {
  let context: TestContextDI;
  let service: IDirectiveService;
  let mockState: any;

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
            this._vars[name] = value?.value ?? value; // Store primitive value or raw value
        }),
        setDataVar: vi.fn().mockImplementation(function(this: any, name, value) {
            // console.log(`[mockState setDataVar] ${name} =`, value);
            this._vars[name] = value; // Store the whole object/array value
        }),
        // <<< Realistic clone mock >>>
        clone: vi.fn().mockImplementation(function(this: any) {
             const originalVars = this._vars;
             // console.log('[mockState clone] Cloning state. Vars:', originalVars);
             
             // <<< Create clone object with NEW function definitions >>>
             const cloned = { 
                 _vars: { ...originalVars }, // Shallow copy internal vars
                 
                 getTextVar: function(name: string) {
                     const val = this._vars[name];
                     // console.log(`[CLONE getTextVar] ${name}:`, val, 'in', this._vars);
                     return val && typeof val !== 'object' ? { type: 'text', value: val } : undefined;
                 },
                 getDataVar: function(name: string) {
                     const val = this._vars[name];
                      // console.log(`[CLONE getDataVar] ${name}:`, val, 'in', this._vars);
                     return val && typeof val === 'object' ? { type: 'data', value: val } : undefined;
                 },
                 setTextVar: function(name: string, value: any) {
                     // console.log(`[CLONE setTextVar] ${name} =`, value, 'in', this._vars);
                     this._vars[name] = value?.value ?? value; 
                 },
                 setDataVar: function(name: string, value: any) {
                     // console.log(`[CLONE setDataVar] ${name} =`, value, 'in', this._vars);
                     this._vars[name] = value; 
                 },
                 // Define clone method for the clone itself
                 clone: function() { 
                     // console.log('[CLONE clone] Cloning the clone. Vars:', this._vars);
                     const nestedClone = { 
                         ...this, 
                         _vars: { ...this._vars } 
                     };
                     return nestedClone; 
                 },
                 getVariable: function(name: string) { 
                    // console.log(`[CLONE getVariable] ${name} in', this._vars`);
                    return this._vars[name]; 
                 },
                 setCurrentFilePath: vi.fn(),
                 getCurrentFilePath: vi.fn().mockReturnValue('mock/cloned-path.meld'),
                 createChildState: function() { return this.clone(); }, 
                 mergeChildState: vi.fn(),
                 getNodes: vi.fn().mockReturnValue([]), 
                 addNode: vi.fn(), 
                 getTransformedNodes: vi.fn().mockReturnValue([]), 
                 setTransformedNodes: vi.fn(), 
                 transformNode: vi.fn(), 
                 isTransformationEnabled: vi.fn().mockReturnValue(false), 
             };
            
             // console.log('[mockState clone] Cloned state created. Vars:', cloned._vars);
             return cloned;
        }),
         // Add other necessary IStateService methods if handlers call them
         getVariable: vi.fn().mockImplementation(function(this: any, name) {
             return this._vars[name]; // Simple lookup for testing
         }),
         setCurrentFilePath: vi.fn(),
         getCurrentFilePath: vi.fn().mockReturnValue('mock/path.meld'),
         createChildState: vi.fn().mockImplementation(function(this: any) { return this.clone(); }),
         mergeChildState: vi.fn(),
         getNodes: vi.fn().mockReturnValue([]), // Add if needed
         addNode: vi.fn(), // Add if needed
         getTransformedNodes: vi.fn().mockReturnValue([]), // Add if needed
         setTransformedNodes: vi.fn(), // Add if needed
         transformNode: vi.fn(), // Add if needed
         isTransformationEnabled: vi.fn().mockReturnValue(false), // Default unless overridden in test

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
    
    // <<< Add mock for resolveNodes for DirectiveService tests >>>
    const resolutionService = await context.container.resolve<IResolutionService>('IResolutionService');
    resolutionService.resolveNodes = vi.fn().mockImplementation(async (nodes, ctx) => {
        const stateForResolve = ctx.state; 
        if (!stateForResolve) {
            process.stderr.write('[DirectiveService.test mock] resolveNodes received context without state!\n'); // Use stderr for warnings
            return '';
        }
        // <<< Debug Log using process.stdout.write >>>
        process.stdout.write('[DirectiveService.test mock] ctx.state === mockState?: ' + (stateForResolve === mockState) + '\n');
        process.stdout.write('[DirectiveService.test mock] stateForResolve._vars before lookup: ' + JSON.stringify(stateForResolve._vars) + '\n');
        // process.stdout.write(\'[DirectiveService.test mock] resolveNodes input: \' + JSON.stringify(nodes) + \'\\n\');

        if (Array.isArray(nodes)) {
           let result = '';
           for (const node of nodes) {
              if (node.type === 'Text') {
                  result += node.content;
                   // <<< Log text part >>>
                  process.stdout.write(`[DirectiveService.test mock] Appended text: "${node.content}", Current result: "${result}"\n`);
              } else if (node.type === 'VariableReference') {
                 const identifier = node.identifier;
                 // <<< Log variable lookup >>>
                 process.stdout.write(`[DirectiveService.test mock] Looking up variable: ${identifier}\n`);
                 const variable = stateForResolve.getTextVar(identifier);
                 // <<< Log lookup result >>>
                 process.stdout.write(`[DirectiveService.test mock] getTextVar result for ${identifier}: ` + JSON.stringify(variable) + '\n');
                 
                 if (variable && variable.value !== undefined) { // Check value exists
                    result += variable.value;
                    // <<< Log variable append >>>
                   process.stdout.write(`[DirectiveService.test mock] Appended variable ${identifier}: "${variable.value}", Current result: "${result}"\n`);
                 } else {
                   const dataVar = stateForResolve.getDataVar(identifier); 
                   if (dataVar && dataVar.value !== undefined) { // Check value exists
                      try {
                         // <<< Check if dataVar.value is already the desired string >>>
                         if (typeof dataVar.value === 'string') {
                             result += dataVar.value;
                         } else {
                            result += JSON.stringify(dataVar.value);
                         }
                      } catch { 
                          // <<< Add identifier to placeholder >>>
                          result += `[Object: ${identifier}]`; 
                      }
                   } else {
                     // <<< Add identifier to placeholder >>>
                     result += `{{${identifier}}}`; 
                   }
                 }
              }
           }
           // <<< Log final return >>>
           process.stdout.write('[DirectiveService.test mock] resolveNodes returning: ' + result + '\n');
           return result;
        }
        return JSON.stringify(nodes); // Fallback for non-array
    });
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  describe('Service initialization', () => {
    it('should initialize with all required services', () => {
      expect(service.getSupportedDirectives()).toContain('text');
      expect(service.getSupportedDirectives()).toContain('data');
      expect(service.getSupportedDirectives()).toContain('path');
    });

    it('should throw if used before initialization', async () => {
      const uninitializedService = new DirectiveService();
      const node = context.factory.createTextDirective('test', '"value"', context.factory.createLocation(1, 1));
      const execContext = { currentFilePath: 'test.meld', state: context.services.state };
      
      // Check for specific error type and code
      await expect(uninitializedService.processDirective(node, execContext))
        .rejects.toThrowError(expect.any(DirectiveError)); // Check base type

      // Optional: More specific checks if needed
      try {
        await uninitializedService.processDirective(node, execContext);
      } catch (e) {
        const error = e as DirectiveError;
        expect(error.code).toBe(DirectiveErrorCode.HANDLER_NOT_FOUND);
        expect(error.message).toContain(`No handler found for directive: ${node.directive.kind}`);
      }
    });
  });

  describe('Directive processing', () => {
    describe('Text directives', () => {
      it('should process basic text directive', async () => {
        // Verify file exists
        const exists = await context.fs.exists('test.meld');
        console.log('test.meld exists:', exists);

        // Parse the fixture file
        const content = await context.fs.readFile('test.meld');
        console.log('test.meld content:', content);
        
        const nodes = await context.services.parser.parse(content);
        console.log('Parsed nodes:', nodes);
        
        // Ensure the node has the expected structure for TextDirectiveHandler
        const directiveNode = nodes[0] as DirectiveNode;
        if (directiveNode && directiveNode.directive && directiveNode.directive.kind === 'text') {
            if (directiveNode.directive.source === undefined) {
                 // Add source: 'literal' if missing for simple assignments
                 directiveNode.directive.source = 'literal'; 
            }
        } else {
            throw new Error('Test setup error: Parsed node is not a valid @text directive.');
        }
        
        // Create execution context
        const state = await context.container.resolve<IStateService>('IStateService');
        const execContext = { currentFilePath: 'test.meld', state: state };

        // Process the directive
        const result = await service.processDirective(directiveNode, execContext);

        // <<< Assert against the RESULT state >>>
        expect(result.getTextVar('greeting')?.value).toBe('Hello');
      });

      // TODO: Fix mocking issue and re-enable test. See #30.
      it.skip('should process text directive with variable interpolation', async () => {
        const state = await context.container.resolve<IStateService>('IStateService');
        // Set initial var on the state that will be cloned
        state.setTextVar('name', { type: 'text', value: 'World' }); 

        // Parse and process
        const content = await context.fs.readFile('test-interpolation.meld');
        const nodes = await context.services.parser.parse(content);
        const node = nodes[0] as DirectiveNode;
        // Ensure source is set for the handler
        if (node && node.directive) { node.directive.source = 'literal'; }
        
        const result = await service.processDirective(node, {
          currentFilePath: 'test-interpolation.meld',
          state: state
        });

        // <<< Assert against the RESULT state >>>
        expect(result.getTextVar('greeting')?.value).toBe('Hello World');
      });
    });

    describe('Data directives', () => {
      it('should process data directive with object value', async () => {
        const content = await context.fs.readFile('test-data.meld');
        const nodes = await context.services.parser.parse(content);
        const node = nodes[0] as DirectiveNode;
        
        // Ensure source is set for the handler
        if (node && node.directive) { node.directive.source = 'literal'; }
        
        const state = await context.container.resolve<IStateService>('IStateService');
        const execContext = { currentFilePath: 'test-data.meld', state: state };
        const result = await service.processDirective(node, execContext);
         // <<< Assert against the RESULT state >>>
        expect(result.getDataVar('config')?.value).toEqual({ key: 'value' });
      });

      // TODO: Fix mocking issue and re-enable test. See #30.
      it.skip('should process data directive with variable interpolation', async () => {
        const state = await context.container.resolve<IStateService>('IStateService');
        // Set initial var on the state that will be cloned
        state.setTextVar('user', { type: 'text', value: 'Alice' }); 
        // ... arrange ...
        const content = await context.fs.readFile('test-data-interpolation.meld');
        const nodes = await context.services.parser.parse(content);
        const node = nodes[0] as DirectiveNode;
        
        // Ensure source is set for the handler
        if (node && node.directive) { node.directive.source = 'literal'; }
        
        // Add Logging
        console.log('--- Data Interpolation Test ---');
        console.log('Parsed Node:', JSON.stringify(node, null, 2));
        
        const execContext = { currentFilePath: 'test-data-interpolation.meld', state: state }; 
        const result = await service.processDirective(node, execContext);
        
        // <<< Log the result state's internal vars for debugging >>>
        console.log('Data Interpolation Result State Vars:', JSON.stringify((result as any)._vars, null, 2));
        // console.log('Data Interpolation Result:', JSON.stringify(result.getDataVar('config')?.value, null, 2));

        // <<< Assert against the RESULT state >>>
        expect(result.getDataVar('config')?.value).toEqual({ greeting: 'Hello Alice' });
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
          const result = await service.processDirective(node, {
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
          const result = await service.processDirective(node, {
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
        
        const mockReadFile = vi.spyOn(context.fs, 'readFile');
        mockReadFile.mockImplementation(async (path) => {
          if (path === 'b.meld') {
            return '@import [a.meld]';
          } else if (path === 'a.meld') {
            return '@import [b.meld]';
          }
          return '';
        });
        
        await expect(service.processDirective(node, {
          currentFilePath: 'a.meld',
          state: context.services.state
        })).rejects.toThrow(DirectiveError);
        
        // Restore mocks
        mockExists.mockRestore();
        mockReadFile.mockRestore();
      });
    });

    // ... continue with other directive types and error cases
  });
}); 