import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import type { DirectiveNode } from '@core/syntax/types/index.js';
import { IDirectiveService, IDirectiveHandler } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
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
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';

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
  let mockTextHandler: IDirectiveHandler;
  let mockDataHandler: IDirectiveHandler;
  let mockImportHandler: IDirectiveHandler;

  const helpers = TestContextDI.createTestHelpers();

  beforeEach(async () => {
    context = helpers.setupWithStandardMocks({}, { isolatedContainer: true });

    service = await context.resolve<IDirectiveService>('IDirectiveService');
    
    // Keep Handler Mocks
    mockTextHandler = {
        kind: 'text',
        execute: vi.fn().mockImplementation(async (ctx: DirectiveProcessingContext): Promise<DirectiveResult | IStateService> => {
            return ctx.state;
        }),
    };
    mockDataHandler = {
        kind: 'data',
        execute: vi.fn().mockImplementation(async (ctx: DirectiveProcessingContext): Promise<DirectiveResult | IStateService> => {
            return ctx.state;
        }),
    };
    mockImportHandler = {
        kind: 'import',
        execute: vi.fn().mockImplementation(async (ctx: DirectiveProcessingContext): Promise<DirectiveResult | IStateService> => {
             return ctx.state;
        }),
    };

    service.registerHandler(mockTextHandler);
    service.registerHandler(mockDataHandler);
    service.registerHandler(mockImportHandler);
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  describe('Service initialization and Handler Registration', () => {
    it('should initialize correctly via DI and register handlers', async () => {
      expect(service).toBeDefined();
      expect(service.hasHandler('text')).toBe(true);
      expect(service.hasHandler('data')).toBe(true);
      expect(service.hasHandler('import')).toBe(true);
    });

    it('should throw if handler is missing when processing', async () => {
      const freshContext = helpers.setupWithStandardMocks({}, { isolatedContainer: true });
      const freshService = await freshContext.resolve<IDirectiveService>('IDirectiveService');

      const node = createTextDirective('test', 'value');
      const currentFilePath = 'test.meld';
      const freshMockState = await freshContext.resolve<IStateService>('IStateService');
      vi.spyOn(freshMockState, 'getCurrentFilePath').mockReturnValue(currentFilePath);

      const processingContext: DirectiveProcessingContext = {
          state: freshMockState,
          directiveNode: node,
          resolutionContext: ResolutionContextFactory.create(freshMockState, currentFilePath),
          formattingContext: mockFormattingContext,
      };

      await expect(freshService.handleDirective(node, processingContext))
        .rejects.toThrowError(DirectiveError);

      await expect(freshService.handleDirective(node, processingContext))
        .rejects.toHaveProperty('code', DirectiveErrorCode.HANDLER_NOT_FOUND);
    });
  });

  describe('Directive processing', () => {
    describe('Text directives', () => {
      it('should route to text handler and update state', async () => {
        const directiveNode = createTextDirective('greeting', '"Hello Directive"');
        const currentFilePath = 'test.meld';
        
        const mockState = await context.resolve<IStateService>('IStateService');
        const mockValidationService = await context.resolve<IValidationService>('IValidationService');

        const stateStorage: Record<string, any> = {};
        vi.spyOn(mockState, 'getCurrentFilePath').mockReturnValue(currentFilePath);
        vi.spyOn(mockState, 'setTextVar').mockImplementation(async (name, value) => {
            stateStorage[name] = value;
            return { type: VariableType.TEXT, name, value };
        });
        vi.spyOn(mockState, 'getTextVar').mockImplementation((name) => {
           return stateStorage[name] ? { type: VariableType.TEXT, name, value: stateStorage[name] } : undefined;
        });
        vi.spyOn(mockValidationService, 'validate').mockResolvedValue(undefined);

        const processingContext: DirectiveProcessingContext = {
            state: mockState,
            directiveNode: directiveNode,
            resolutionContext: ResolutionContextFactory.create(mockState, currentFilePath),
            formattingContext: mockFormattingContext,
        };
        const result = await service.handleDirective(directiveNode, processingContext);

        expect(mockValidationService.validate).toHaveBeenCalledWith(directiveNode);
        expect(mockTextHandler.execute).toHaveBeenCalledWith(processingContext);
        expect(stateStorage['greeting']).toBe('"Hello Directive"');
        expect(result).toBe(mockState);
      });

      it('should use resolution service for interpolated text value', async () => {
          const directiveNode = createTextDirective('greeting', 'Hello, {{name}}');
          const currentFilePath = 'interpolate.meld';
          const resolvedValue = 'Hello, World';

          const mockState = await context.resolve<IStateService>('IStateService');
          const mockValidationService = await context.resolve<IValidationService>('IValidationService');
          const mockResolutionService = await context.resolve<IResolutionService>('IResolutionService');

          vi.spyOn(mockState, 'getCurrentFilePath').mockReturnValue(currentFilePath);
          vi.spyOn(mockState, 'setTextVar');
          vi.spyOn(mockValidationService, 'validate').mockResolvedValue(undefined);
          vi.spyOn(mockResolutionService, 'resolveInContext').mockResolvedValue(resolvedValue);

          mockTextHandler.execute = vi.fn().mockImplementation(async (ctx: DirectiveProcessingContext): Promise<DirectiveResult | IStateService> => {
              const resolved = await mockResolutionService.resolveInContext(ctx.directiveNode.value as string, ctx.resolutionContext);
              await ctx.state.setTextVar(ctx.directiveNode.name, resolved);
              return ctx.state;
          });
          service.registerHandler(mockTextHandler);

          const processingContext: DirectiveProcessingContext = {
              state: mockState,
              directiveNode: directiveNode,
              resolutionContext: ResolutionContextFactory.create(mockState, currentFilePath),
              formattingContext: mockFormattingContext,
          };
          await service.handleDirective(directiveNode, processingContext);

          expect(mockValidationService.validate).toHaveBeenCalledWith(directiveNode);
          expect(mockTextHandler.execute).toHaveBeenCalledWith(processingContext);
          expect(mockResolutionService.resolveInContext).toHaveBeenCalledWith('Hello, {{name}}', processingContext.resolutionContext);
          expect(mockState.setTextVar).toHaveBeenCalledWith('greeting', resolvedValue);
      });
    });

    describe('Data directives', () => {
      it('should process data directive with object value', async () => {
        const dataValue = { key: 'directive value' };
        const directiveNode = createDataDirective('config', dataValue );
        if (directiveNode?.directive) { directiveNode.directive.source = 'literal'; }
        
        const mockState = await context.resolve<IStateService>('IStateService');

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
      it('should route to import handler', async () => {
        const directiveNode = createImportDirective('other.meld');
        const currentFilePath = 'main.meld';

        const mockState = await context.resolve<IStateService>('IStateService');
        const mockValidationService = await context.resolve<IValidationService>('IValidationService');
        const mockCircularityService = await context.resolve<ICircularityService>('ICircularityService');

        vi.spyOn(mockState, 'getCurrentFilePath').mockReturnValue(currentFilePath);
        vi.spyOn(mockValidationService, 'validate').mockResolvedValue(undefined);
        vi.spyOn(mockCircularityService, 'isFileVisited').mockReturnValue(false);
        vi.spyOn(mockCircularityService, 'markFileVisited');

        const processingContext: DirectiveProcessingContext = {
            state: mockState,
            directiveNode: directiveNode,
            resolutionContext: ResolutionContextFactory.create(mockState, currentFilePath),
            formattingContext: mockFormattingContext,
        };
        await service.handleDirective(directiveNode, processingContext);

        expect(mockValidationService.validate).toHaveBeenCalledWith(directiveNode);
        expect(mockImportHandler.execute).toHaveBeenCalledWith(processingContext);
      });

      it('should handle circular imports detection (mocked)', async () => {
        const node = createImportDirective('circular.meld');
        const currentFilePath = 'main.meld';

        const mockState = await context.resolve<IStateService>('IStateService');
        const mockValidationService = await context.resolve<IValidationService>('IValidationService');
        const mockCircularityService = await context.resolve<ICircularityService>('ICircularityService');

        vi.spyOn(mockState, 'getCurrentFilePath').mockReturnValue(currentFilePath);
        vi.spyOn(mockValidationService, 'validate').mockResolvedValue(undefined);
        vi.spyOn(mockCircularityService, 'isFileVisited').mockReturnValue(true);

        const processingContext: DirectiveProcessingContext = {
            state: mockState,
            directiveNode: node,
            resolutionContext: ResolutionContextFactory.create(mockState, currentFilePath),
            formattingContext: mockFormattingContext,
        };

        await expect(service.handleDirective(node, processingContext))
          .rejects.toThrowError(MeldError);

        expect(mockValidationService.validate).toHaveBeenCalledWith(node);
        expect(mockCircularityService.isFileVisited).toHaveBeenCalledWith('circular.meld', expect.any(Object));
        expect(mockImportHandler.execute).not.toHaveBeenCalled();
      });
    });
  });
}); 