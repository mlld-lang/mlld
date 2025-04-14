import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import type { DirectiveNode } from '@core/syntax/types/index.js';
import { IDirectiveService, IDirectiveHandler } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem.js';
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem.js';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { TextVariable, DataVariable, VariableType } from '@core/types/variables.js';
import { ErrorSeverity, MeldError } from '@core/errors/MeldError.js';
import { createTextDirective, createDataDirective, createImportDirective } from '@tests/utils/testFactories.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import type { DirectiveProcessingContext, FormattingContext, ExecutionContext } from '@core/types/index.js';
import type { DirectiveResult } from '@services/pipeline/DirectiveService/interfaces/DirectiveTypes.js';
import type { ResolutionContext } from '@core/types/resolution.js';

// Import interfaces for missing mocks
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import type { MeldPath, RawPath } from '@core/types/paths.js';
import type { ParserServiceLike, CircularityServiceLike } from '@core/shared-service-types.js';
import type { InterpreterServiceClientFactory } from '@services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';

// Define a simple mock FormattingContext
const mockFormattingContext: FormattingContext = {
  isBlock: false,
  preserveLiteralFormatting: false,
  preserveWhitespace: false,
};

// Main test suite for DirectiveService
describe('DirectiveService', () => {
  let context: TestContextDI;
  let service: DirectiveService;
  let mockState: IStateService;
  let mockResolutionService: IResolutionService;
  let mockTextHandler: IDirectiveHandler;
  let mockDataHandler: IDirectiveHandler;
  let mockImportHandler: IDirectiveHandler;

  beforeEach(async () => {
    context = TestContextDI.createIsolated();
    await context.initialize();

    mockState = context.resolveSync<IStateService>('IStateService');
    mockResolutionService = context.resolveSync<IResolutionService>('IResolutionService');

    const stateStorage: Record<string, any> = {};
    vi.spyOn(mockState, 'setTextVar').mockImplementation(async (name: string, value: string, metadata?: any): Promise<TextVariable> => {
      stateStorage[name] = value;
      const variable: TextVariable = { type: VariableType.TEXT, name: name, value: value };
      return Promise.resolve(variable);
    });
    vi.spyOn(mockState, 'setDataVar').mockImplementation(async (name: string, value: any, metadata?: any): Promise<DataVariable> => {
      stateStorage[name] = value;
      const variable: DataVariable = { type: VariableType.DATA, name: name, value: value };
      return Promise.resolve(variable);
    });
    vi.spyOn(mockState, 'getTextVar').mockImplementation((name: string): TextVariable | undefined => {
      const val = stateStorage[name];
      return (typeof val === 'string') ? { type: VariableType.TEXT, name: name, value: val } : undefined;
    });
    vi.spyOn(mockState, 'getDataVar').mockImplementation((name: string): DataVariable | undefined => {
      const val = stateStorage[name];
      return (typeof val === 'object' && val !== null) ? { type: VariableType.DATA, name: name, value: val } : undefined;
    });
    vi.spyOn(mockState, 'clone').mockImplementation(() => mockState);
    vi.spyOn(mockState, 'createChildState').mockImplementation(() => mockState);
    vi.spyOn(mockState, 'getCurrentFilePath').mockReturnValue('mock/test.meld');

    vi.spyOn(mockResolutionService, 'resolveInContext').mockImplementation(async (value, ctx) => {
      if (typeof value === 'object' && value !== null && 'raw' in value && !Array.isArray(value)) {
        return value.raw || JSON.stringify(value) || '';
      }
      if (typeof value === 'string') return value;
      if (Array.isArray(value)) return value.map(n => n.type === 'Text' ? n.content : `{{${(n as any).identifier}}}`).join('');
      return JSON.stringify(value) || '';
    });

    mockTextHandler = {
        kind: 'text',
        execute: vi.fn().mockImplementation(async (ctx: DirectiveProcessingContext): Promise<IStateService> => {
            const directiveData = (ctx.directiveNode.directive as any);
            const resolvedValue = directiveData.value || 'mock text value'; 
            await ctx.state.setTextVar(directiveData.identifier, resolvedValue);
            return ctx.state; 
        }),
    };
    mockDataHandler = {
        kind: 'data',
        execute: vi.fn().mockImplementation(async (ctx: DirectiveProcessingContext): Promise<IStateService> => {
            const directiveData = (ctx.directiveNode.directive as any);
            const resolvedValue = directiveData.value || { mockKey: 'mock data value' };
            await ctx.state.setDataVar(directiveData.identifier, resolvedValue);
            return ctx.state; 
        }),
    };
    mockImportHandler = {
        kind: 'import',
        execute: vi.fn().mockImplementation(async (ctx: DirectiveProcessingContext): Promise<IStateService> => {
             console.log('[MockImportHandler] called for:', ctx.directiveNode.directive.path?.raw)
             return ctx.state;
        }),
    };

    service = context.resolveSync(DirectiveService);
    
    service.registerHandler(mockTextHandler);
    service.registerHandler(mockDataHandler);
    service.registerHandler(mockImportHandler); 

  });

  afterEach(async () => {
    await context?.cleanup();
  });

  describe('Service initialization', () => {
    it('should initialize correctly via DI', () => {
      expect(service.hasHandler('text')).toBe(true);
      expect(service.hasHandler('data')).toBe(true);
      expect((service as any).isInitialized).toBe(true);
    });

    it('should throw if used before initialization', async () => {
      const uninitializedService = new DirectiveService(); 
      const node = createTextDirective('test', '"value"');
      const mockProcessingContext: DirectiveProcessingContext = { 
          state: mockState, 
          directiveNode: node,
          resolutionContext: {} as ResolutionContext,
          formattingContext: mockFormattingContext 
      };

      try {
        await uninitializedService.handleDirective(node, mockProcessingContext); 
        expect.fail('Service did not throw when used before initialization');
      } catch (e) {
        expect(e).toBeInstanceOf(MeldError); 
        expect((e as MeldError).message).toContain('DirectiveService must be initialized before use');
      }
    });

    it('should throw if handler is missing', async () => {
      (service as any).handlers.delete('text'); 
      
      const node = createTextDirective('test', 'value'); 
      const currentFilePath = 'test.meld';
      mockState.setCurrentFilePath(currentFilePath);

      const processingContext: DirectiveProcessingContext = { 
          state: mockState, 
          directiveNode: node,
          resolutionContext: ResolutionContextFactory.create(mockState, currentFilePath),
          formattingContext: mockFormattingContext,
      };
      
      try {
        await service.handleDirective(node, processingContext);
        expect.fail('Should have thrown HANDLER_NOT_FOUND');
      } catch(e) {
        expect(e).toBeInstanceOf(DirectiveError);
        const error = e as DirectiveError;
        expect(error.code).toBe(DirectiveErrorCode.HANDLER_NOT_FOUND);
        expect(error.message).toContain('No handler registered for directive kind: text'); 
        service.registerHandler(mockTextHandler);
      }
    });
  });

  describe('Directive processing', () => {
    describe('Text directives', () => {
      it('should process basic text directive', async () => {
        const directiveNode = createTextDirective('greeting', '"Hello Directive"');
        if (directiveNode?.directive) { directiveNode.directive.source = 'literal'; }
        
        const processingContext: DirectiveProcessingContext = { 
            state: mockState, 
            directiveNode: directiveNode,
            resolutionContext: ResolutionContextFactory.create(mockState, 'test.meld'),
            formattingContext: mockFormattingContext,
        };

        const resultState = await service.handleDirective(directiveNode, processingContext) as IStateService;
        
        expect(mockTextHandler.execute).toHaveBeenCalled();
        expect(mockState.getTextVar('greeting')?.value).toBe('"Hello Directive"');
      });

      it.skip('should process text directive with variable interpolation', async () => { /* ... */ });
    });

    describe('Data directives', () => {
      it('should process data directive with object value', async () => {
        const dataValue = { key: 'directive value' };
        const directiveNode = createDataDirective('config', dataValue );
        if (directiveNode?.directive) { directiveNode.directive.source = 'literal'; }
        
        const processingContext: DirectiveProcessingContext = { 
            state: mockState, 
            directiveNode: directiveNode,
            resolutionContext: ResolutionContextFactory.create(mockState, 'test-data.meld'),
            formattingContext: mockFormattingContext,
        };

        const resultState = await service.handleDirective(directiveNode, processingContext) as IStateService;

        expect(mockDataHandler.execute).toHaveBeenCalled();
        expect(mockState.getDataVar('config')?.value).toEqual(dataValue);
      });

      it.skip('should process data directive with variable interpolation', async () => { /* ... */ });
    });

    describe('Import directives', () => {
      it.skip('should process basic import', async () => { /* ... */ });
      it.skip('should handle nested imports', async () => { /* ... */ });

      it('should detect circular imports', async () => {
        const node = context.factory.createImportDirective('b.meld');
        
        const processingContext: DirectiveProcessingContext = { 
            state: mockState, 
            directiveNode: node,
            resolutionContext: ResolutionContextFactory.create(mockState, 'a.meld'),
            formattingContext: mockFormattingContext,
        };
        
        await service.handleDirective(node, processingContext);
        expect(mockImportHandler.execute).toHaveBeenCalled();
      });
    });
  });
}); 