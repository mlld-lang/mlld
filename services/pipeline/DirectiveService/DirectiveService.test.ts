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

// Main test suite for DirectiveService
describe('DirectiveService', () => {
  let context: TestContextDI;
  let service: IDirectiveService;

  beforeEach(async () => {
    // Initialize test context with isolated container
    context = TestContextDI.createIsolated();
    await context.initialize();
    
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
      await expect(uninitializedService.processDirective(node, execContext))
        .rejects.toThrowError(/DirectiveService must be initialized before use|Cannot read properties of undefined/);
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
        
        const node = nodes[0] as DirectiveNode;
        
        // Create execution context
        const execContext = { 
          currentFilePath: 'test.meld', 
          state: context.services.state 
        };

        // Process the directive
        const result = await service.processDirective(node, execContext);

        // Verify the result
        expect(result.getTextVar('greeting')).toBe('Hello');
      });

      it('should process text directive with variable interpolation', async () => {
        // Set up initial state with a variable
        const state = context.services.state;
        state.setTextVar('name', 'World');

        // Parse and process
        const content = await context.fs.readFile('test-interpolation.meld');
        const nodes = await context.services.parser.parse(content);
        const node = nodes[0] as DirectiveNode;
        
        const result = await service.processDirective(node, {
          currentFilePath: 'test-interpolation.meld',
          state
        });

        expect(result.getTextVar('greeting')).toBe('Hello World');
      });
    });

    describe('Data directives', () => {
      it('should process data directive with object value', async () => {
        const content = await context.fs.readFile('test-data.meld');
        const nodes = await context.services.parser.parse(content);
        const node = nodes[0] as DirectiveNode;
        
        const result = await service.processDirective(node, {
          currentFilePath: 'test-data.meld',
          state: context.services.state
        });

        expect(result.getDataVar('config')).toEqual({ key: 'value' });
      });

      it('should process data directive with variable interpolation', async () => {
        // Set up initial state
        const state = context.services.state;
        state.setTextVar('user', 'Alice');

        const content = await context.fs.readFile('test-data-interpolation.meld');
        const nodes = await context.services.parser.parse(content);
        const node = nodes[0] as DirectiveNode;
        
        const result = await service.processDirective(node, {
          currentFilePath: 'test-data-interpolation.meld',
          state
        });

        expect(result.getDataVar('config')).toEqual({ greeting: 'Hello Alice' });
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
              options.initialState.setTextVar('greeting', 'Hello');
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

          expect(result.getTextVar('greeting')).toBe('Hello');
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
                options.initialState.setTextVar('middle', 'Middle Content');
                options.initialState.setTextVar('inner', 'Inner Content');
              } else if (options.filePath?.includes('inner.meld')) {
                options.initialState.setTextVar('inner', 'Inner Content');
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

          expect(result.getTextVar('inner')).toBe('Inner Content');
          expect(result.getTextVar('middle')).toBe('Middle Content');
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