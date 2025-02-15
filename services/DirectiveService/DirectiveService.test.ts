import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { DirectiveService } from './DirectiveService';
import { TestContext } from '../../tests/utils/TestContext';
import {
  createTextDirective,
  createDataDirective,
  createImportDirective,
  createEmbedDirective,
  createRunDirective,
  createPathDirective,
  createLocation,
  createDirectiveNode,
  createMockValidationService,
  createMockStateService,
  createMockResolutionService,
  createMockFileSystemService,
  createMockCircularityService,
  createMockParserService,
  createMockInterpreterService,
  createMockPathService
} from '../../tests/utils/testFactories';
import { DirectiveError, DirectiveErrorCode } from './errors/DirectiveError';
import type { DirectiveNode, DirectiveKind, MeldNode } from '../../node_modules/meld-spec/dist/types';
import type { IValidationService } from '../ValidationService/IValidationService';
import type { IResolutionService, ResolutionContext } from '../ResolutionService/IResolutionService';
import type { IStateService } from '../StateService/IStateService';
import type { ICircularityService } from '../CircularityService/ICircularityService';
import type { IFileSystemService } from '../FileSystemService/IFileSystemService';
import type { IParserService } from '../ParserService/IParserService';
import type { IInterpreterService, InterpreterOptions } from '../InterpreterService/IInterpreterService';
import type { IPathService, PathOptions } from '../PathService/IPathService';
import type { IDirectiveService } from './IDirectiveService';

// Mock the logger
vi.mock('@core/utils/logger', () => ({
  directiveLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  },
  embedLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('DirectiveService', () => {
  let testContext: TestContext;
  let mockValidationService: IValidationService;
  let mockResolutionService: IResolutionService;
  let mockStateService: IStateService;
  let mockCircularityService: ICircularityService;
  let mockFileSystemService: IFileSystemService;
  let mockParserService: IParserService;
  let mockInterpreterService: IInterpreterService;
  let mockPathService: IPathService;
  let service: DirectiveService;

  beforeEach(async () => {
    // Initialize test context
    testContext = new TestContext();
    await testContext.initialize();

    // Create fresh instances of mocks using test context factories
    mockValidationService = testContext.factory.createMockValidationService();
    mockResolutionService = testContext.factory.createMockResolutionService();
    mockStateService = testContext.factory.createMockStateService();
    mockCircularityService = testContext.factory.createMockCircularityService();
    mockFileSystemService = testContext.factory.createMockFileSystemService();
    mockParserService = testContext.factory.createMockParserService();
    mockInterpreterService = testContext.factory.createMockInterpreterService();
    mockPathService = testContext.factory.createMockPathService();

    // Create service instance
    service = new DirectiveService();

    // Initialize with mock services
    service.initialize(
      mockValidationService,
      mockStateService,
      mockPathService,
      mockFileSystemService,
      mockParserService,
      mockInterpreterService,
      mockCircularityService,
      mockResolutionService
    );
  });

  afterEach(async () => {
    await testContext.cleanup();
    vi.resetAllMocks();
  });

  describe('Service initialization', () => {
    it('should initialize with all required services', () => {
      expect(service.getSupportedDirectives()).toContain('text');
      expect(service.getSupportedDirectives()).toContain('data');
      expect(service.getSupportedDirectives()).toContain('path');
    });

    it('should throw if used before initialization', async () => {
      const uninitializedService = new DirectiveService();
      const node = testContext.factory.createTextDirective('test', '"value"', testContext.factory.createLocation(1, 1));
      await expect(uninitializedService.processDirective(node)).rejects.toThrow('DirectiveService must be initialized before use');
    });
  });

  describe('Directive processing', () => {
    describe('Text directives', () => {
      it('should process basic text directive', async () => {
        const node = testContext.factory.createTextDirective('greeting', '"Hello"', testContext.factory.createLocation(1, 1));
        (mockResolutionService.resolveInContext as Mock).mockResolvedValue('Hello');

        await service.processDirective(node);

        expect(mockValidationService.validate).toHaveBeenCalledWith(node);
        expect(mockResolutionService.resolveInContext).toHaveBeenCalled();
        expect(mockStateService.setTextVar).toHaveBeenCalledWith('greeting', 'Hello');
      });

      it('should process text directive with variable interpolation', async () => {
        (mockStateService.getTextVar as Mock).mockReturnValue('World');
        (mockResolutionService.resolveInContext as Mock).mockResolvedValue('Hello World');

        const node = testContext.factory.createTextDirective('greeting', '"Hello ${name}"', testContext.factory.createLocation(1, 1));
        await service.processDirective(node);

        expect(mockResolutionService.resolveInContext).toHaveBeenCalled();
        expect(mockStateService.setTextVar).toHaveBeenCalledWith('greeting', 'Hello World');
      });
    });

    describe('Data directives', () => {
      it('should process data directive with object value', async () => {
        const data = { key: 'value' };
        const node = testContext.factory.createDataDirective('config', data, testContext.factory.createLocation(1, 1));
        
        // Mock validation
        (mockValidationService.validate as Mock).mockResolvedValue(undefined);
        
        // Mock resolution - the value should be stringified first
        (mockResolutionService.resolveInContext as Mock).mockResolvedValue(JSON.stringify(data));

        await service.processDirective(node);

        expect(mockValidationService.validate).toHaveBeenCalledWith(node);
        expect(mockResolutionService.resolveInContext).toHaveBeenCalledWith(
          JSON.stringify(data),
          expect.any(Object)
        );
        expect(mockStateService.setDataVar).toHaveBeenCalledWith('config', data);
      });

      it('should process data directive with variable interpolation', async () => {
        const data = { greeting: 'Hello ${name}' };
        const resolvedData = { greeting: 'Hello World' };
        const node = testContext.factory.createDataDirective('config', data, testContext.factory.createLocation(1, 1));
        
        // Mock validation
        (mockValidationService.validate as Mock).mockResolvedValue(undefined);
        
        // Mock resolution - the value should be stringified first
        (mockResolutionService.resolveInContext as Mock).mockResolvedValue(JSON.stringify(resolvedData));

        await service.processDirective(node);

        expect(mockResolutionService.resolveInContext).toHaveBeenCalledWith(
          JSON.stringify(data),
          expect.any(Object)
        );
        expect(mockStateService.setDataVar).toHaveBeenCalledWith('config', resolvedData);
      });
    });

    describe('Import directives', () => {
      it('should process basic import', async () => {
        // Set up test file in the virtual filesystem
        await testContext.writeFile('/project/module.meld', '@text greeting = "Hello"');
        
        const node = testContext.factory.createImportDirective('module.meld', testContext.factory.createLocation(1, 1));
        (mockResolutionService.resolvePath as Mock).mockResolvedValue('/project/module.meld');
        (mockStateService.createChildState as Mock).mockReturnValue(mockStateService);

        await service.processDirective(node);

        expect(mockValidationService.validate).toHaveBeenCalledWith(node);
        expect(mockResolutionService.resolvePath).toHaveBeenCalled();
        expect(mockInterpreterService.interpret).toHaveBeenCalled();
      });

      it('should handle nested imports', async () => {
        // Set up test files in the virtual filesystem
        await testContext.writeFile('/project/middle.meld', '@import [inner.meld]');
        await testContext.writeFile('/project/inner.meld', '@text message = "Inner content"');
        
        const mainNode = testContext.factory.createImportDirective('middle.meld', testContext.factory.createLocation(1, 1));
        (mockResolutionService.resolvePath as Mock)
          .mockResolvedValueOnce('/project/middle.meld')
          .mockResolvedValueOnce('/project/inner.meld');
        (mockStateService.createChildState as Mock).mockReturnValue(mockStateService);

        await service.processDirective(mainNode);

        expect(mockCircularityService.beginImport).toHaveBeenCalled();
        expect(mockCircularityService.endImport).toHaveBeenCalled();
        expect(mockInterpreterService.interpret).toHaveBeenCalled();
      });

      it('should detect circular imports', async () => {
        const node = testContext.factory.createImportDirective('circular.meld', testContext.factory.createLocation(1, 1));
        (mockResolutionService.resolvePath as Mock).mockResolvedValue('/project/circular.meld');
        (mockCircularityService.beginImport as Mock).mockRejectedValue(
          new DirectiveError('Circular import detected', 'import', DirectiveErrorCode.VALIDATION_FAILED)
        );

        await expect(service.processDirective(node)).rejects.toThrow(DirectiveError);
        expect(mockCircularityService.beginImport).toHaveBeenCalled();
      });
    });

    describe('Embed directives', () => {
      it('should process basic embed', async () => {
        // Set up test file in the virtual filesystem
        await testContext.writeFile('/project/content.meld', 'Embedded content');
        
        const node = testContext.factory.createEmbedDirective('content.meld', undefined, testContext.factory.createLocation(1, 1));
        (mockResolutionService.resolvePath as Mock).mockResolvedValue('/project/content.meld');
        (mockResolutionService.resolveContent as Mock).mockResolvedValue('Resolved content');

        await service.processDirective(node);

        expect(mockValidationService.validate).toHaveBeenCalledWith(node);
        expect(mockResolutionService.resolvePath).toHaveBeenCalled();
        expect(mockResolutionService.resolveContent).toHaveBeenCalled();
        expect(mockStateService.appendContent).toHaveBeenCalledWith('Resolved content');
      });

      it('should handle section extraction', async () => {
        // Set up test file in the virtual filesystem
        await testContext.writeFile('/project/content.meld', '# Introduction\nContent');
        
        const node = testContext.factory.createEmbedDirective('content.meld', 'Introduction', testContext.factory.createLocation(1, 1));
        (mockResolutionService.resolvePath as Mock).mockResolvedValue('/project/content.meld');
        (mockResolutionService.extractSection as Mock).mockResolvedValue('Content');
        (mockResolutionService.resolveContent as Mock).mockResolvedValue('Resolved content');

        await service.processDirective(node);

        expect(mockResolutionService.extractSection).toHaveBeenCalled();
        expect(mockStateService.appendContent).toHaveBeenCalledWith('Resolved content');
      });
    });

    describe('Error handling', () => {
      it('should wrap handler execution errors', async () => {
        const node = testContext.factory.createTextDirective('test', '"value"', testContext.factory.createLocation(1, 1));
        (mockValidationService.validate as Mock).mockImplementation(() => {
          throw new Error('Validation failed');
        });

        await expect(service.processDirective(node)).rejects.toThrow(DirectiveError);
      });

      it('should preserve DirectiveError from handlers', async () => {
        const node = testContext.factory.createTextDirective('test', '"value"', testContext.factory.createLocation(1, 1));
        (mockValidationService.validate as Mock).mockImplementation(() => {
          throw new DirectiveError('Test error', 'text', DirectiveErrorCode.VALIDATION_FAILED);
        });

        await expect(service.processDirective(node)).rejects.toThrow(DirectiveError);
      });
    });
  });
}); 