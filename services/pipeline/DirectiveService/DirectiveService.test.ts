import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DirectiveService } from './DirectiveService.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { DirectiveError, DirectiveErrorCode } from './errors/DirectiveError.js';
import type { DirectiveNode } from 'meld-spec';
import { IDirectiveService } from './IDirectiveService.js';
import { createService } from '@core/ServiceProvider.js';

// Main test suite for DirectiveService
describe('DirectiveService', () => {
  // Parameterized tests to check both DI and non-DI modes
  describe.each([
    { useDI: true, name: 'with DI' },
    { useDI: false, name: 'without DI' },
  ])('$name', ({ useDI }) => {
    let context: TestContextDI;
    let service: IDirectiveService;

    beforeEach(async () => {
      // Initialize test context with the right DI mode
      context = useDI
        ? TestContextDI.withDI()
        : TestContextDI.withoutDI();
      
      // Get or create the service using the appropriate method
      if (useDI) {
        // When using DI, resolve the service from the container
        service = context.container.resolve<IDirectiveService>('IDirectiveService');
      } else {
        // When not using DI, create and initialize the service manually
        service = new DirectiveService();
        service.initialize(
          context.services.validation,
          context.services.state,
          context.services.path,
          context.services.filesystem,
          context.services.parser,
          context.services.interpreter,
          context.services.circularity,
          context.services.resolution
        );
      }

      // Load test fixtures (common for both modes)
      await context.fixtures.load('directiveTestProject');
    });

    afterEach(async () => {
      await context.cleanup();
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
          .rejects.toThrow('DirectiveService must be initialized before use');
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
        it('should process basic import', async () => {
          // Create import directive node with value property
          const node = context.factory.createImportDirective('module.meld', context.factory.createLocation(1, 1));
          
          const result = await service.processDirective(node, {
            currentFilePath: 'main.meld',
            state: context.services.state
          });

          expect(result.getTextVar('greeting')).toBe('Hello');
        });

        it('should handle nested imports', async () => {
          // Create import directive node with value property
          const node = context.factory.createImportDirective('inner.meld', context.factory.createLocation(1, 1));
          
          const result = await service.processDirective(node, {
            currentFilePath: 'middle.meld',
            state: context.services.state
          });

          expect(result.getTextVar('greeting')).toBe('Hello');
        });

        it('should detect circular imports', async () => {
          // Create import directive node with value property
          const node = context.factory.createImportDirective('b.meld', context.factory.createLocation(1, 1));
          
          await expect(service.processDirective(node, {
            currentFilePath: 'a.meld',
            state: context.services.state
          })).rejects.toThrow(DirectiveError);
        });
      });

      // ... continue with other directive types and error cases
    });
  });
}); 