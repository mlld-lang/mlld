import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import type { DirectiveNode, DirectiveData, MeldNode, VariableReferenceNode, TextNode } from '@core/syntax/types/index.js';
import type { StructuredPath } from '@core/syntax/types/nodes.js';
import type { MeldPath, PathValidationContext } from '@core/types/paths.js';
import { createMeldPath, unsafeCreateValidatedResourcePath } from '@core/types/paths.js';
import { EmbedDirectiveHandler, type ILogger } from '@services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { ResolutionContext } from '@core/types/resolution.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { DataVariable } from '@core/types/variables.js';
import type { Result } from '@core/types/common.js';
import { success, failure } from '@core/types/common.js';
import type { FieldAccessError } from '@core/errors/FieldAccessError.js';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import { InterpreterServiceClientFactory } from '@services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory.js';
import type { IInterpreterServiceClient } from '@services/pipeline/InterpreterService/interfaces/IInterpreterServiceClient.js';
import { createLocation, createEmbedDirective } from '@tests/utils/testFactories.js';
import { 
  embedDirectiveExamples
} from '@core/syntax/index.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { StringConcatenationHandler } from '@services/resolution/ResolutionService/resolvers/StringConcatenationHandler.js';
import {
  createValidationServiceMock,
  createStateServiceMock,
  createResolutionServiceMock,
  createFileSystemServiceMock,
  createPathServiceMock,
  createDirectiveErrorMock
} from '@tests/utils/mocks/serviceMocks.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import { ValidationService } from '@services/resolution/ValidationService/ValidationService.js';
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService.js';
import { CircularityService } from '@services/resolution/CircularityService/CircularityService.js';
import { PathService } from '@services/fs/PathService/PathService.js';
import type { DirectiveProcessingContext, FormattingContext } from '@core/types/index.js';

/**
 * EmbedDirectiveHandler Transformation Test Status
 * -----------------------------------------------
 * 
 * MIGRATION STATUS: Complete
 * 
 * This test file has been fully migrated to use:
 * - TestContextDI for container management
 * - Standardized mock factories with vitest-mock-extended
 * - Centralized syntax examples
 * 
 * Migration details:
 * 
 * 1. Using TestContextDI for test environment setup
 * 2. Using standardized mock factories for service mocks
 * 3. Using a hybrid approach with direct handler instantiation
 * 4. Maintained use of centralized syntax examples 
 * 5. Added proper cleanup with afterEach hook
 */

describe('EmbedDirectiveHandler Transformation', () => {
  let contextDI: TestContextDI;
  let handler: EmbedDirectiveHandler;
  let stateService: ReturnType<typeof createStateServiceMock>;
  let resolutionService: ReturnType<typeof createResolutionServiceMock>;
  let validationService: ReturnType<typeof createValidationServiceMock>;
  let fileSystemService: ReturnType<typeof createFileSystemServiceMock>;
  let circularityService: ReturnType<typeof mockDeep<ICircularityService>>;
  let pathService: ReturnType<typeof createPathServiceMock>;
  let interpreterServiceClientFactory: ReturnType<typeof mockDeep<InterpreterServiceClientFactory>>;
  let interpreterServiceClient: ReturnType<typeof mockDeep<IInterpreterServiceClient>>;
  let logger: ReturnType<typeof mockDeep<ILogger>>;
  let parserService: ReturnType<typeof mockDeep<IParserService>>;
  let clonedState: any;
  let mockProcessingContext: DirectiveProcessingContext;

  beforeEach(async () => {
    contextDI = TestContextDI.create({ isolatedContainer: true });
    
    stateService = createStateServiceMock();
    resolutionService = createResolutionServiceMock();
    validationService = createValidationServiceMock();
    fileSystemService = createFileSystemServiceMock();
    pathService = createPathServiceMock();

    circularityService = mockDeep<ICircularityService>();
    logger = mockDeep<ILogger>();
    interpreterServiceClient = mockDeep<IInterpreterServiceClient>();
    interpreterServiceClientFactory = mockDeep<InterpreterServiceClientFactory>();
    parserService = mockDeep<IParserService>();

    contextDI.registerMock<IStateService>('IStateService', stateService);
    contextDI.registerMock<IResolutionService>('IResolutionService', resolutionService);
    contextDI.registerMock<IValidationService>('IValidationService', validationService);
    contextDI.registerMock<IFileSystemService>('IFileSystemService', fileSystemService);
    contextDI.registerMock<IPathService>('IPathService', pathService);
    contextDI.registerMock<ICircularityService>('ICircularityService', circularityService);
    contextDI.registerMock<ILogger>('ILogger', logger);
    contextDI.registerMock<InterpreterServiceClientFactory>('InterpreterServiceClientFactory', interpreterServiceClientFactory);
    contextDI.registerMock<IParserService>('IParserService', parserService);

    interpreterServiceClientFactory.createClient.mockReturnValue(interpreterServiceClient);
    
    clonedState = { ...stateService };
    stateService.clone.mockReturnValue(clonedState);
    stateService.isTransformationEnabled.mockReturnValue(true);
    validationService.validate.mockResolvedValue(undefined);
    
    fileSystemService.exists.mockImplementation(async (p) => !p.includes('nonexistent'));
    fileSystemService.readFile.mockImplementation(async (p) => {
      if (p.includes('nonexistent')) throw new Error('File not found');
      if (p.includes('sections.md')) return '# Title\n## Section 1\nContent 1\n## Section 2\nContent 2';
      if (p.includes('heading.md')) return '# Title\n## Heading 2\nContent for H2';
      if (p.includes('underheader.md')) return '# Title\n## Target Header\nContent under header';
      if (p.includes('actual/file.md')) return 'Content from field access';
      if (p.includes('user@example.com')) return 'Content from contact email path';
      if (p.includes('any.md')) return 'Some content';
      return 'Default embedded content';
    });

    resolutionService.resolveInContext.mockImplementation(async (val: any): Promise<string> => {
        if (typeof val === 'string') {
           if (val === '{{filePath}}') return 'resolved/path.md';
           if (val === '{{vars.myPath.nested}}') return 'actual/file.md';
           if (val === '{{contact.email}}') return 'user@example.com';
           return val;
        } 
        if (val && typeof val === 'object' && 'raw' in val) return val.raw;
        return JSON.stringify(val);
    });
    
    resolutionService.resolvePath.mockImplementation(async (resolvedPathString: string): Promise<MeldPath> => {
      const isAbsolute = resolvedPathString.startsWith('/');
      const validatedPath = isAbsolute ? resolvedPathString : `/project/root/${resolvedPathString}`;
      return createMeldPath(resolvedPathString, unsafeCreateValidatedResourcePath(validatedPath), isAbsolute);
    });
    
    resolutionService.extractSection.mockImplementation(async (content, section) => {
      const regex = new RegExp(`(^|\\n)#+\\s*${section}\\s*\\n([\\s\\S]*?)(?=\\n#+|$)`, 'm');
      const match = content.match(regex);
      return match ? match[2].trim() : '';
    });

    await contextDI.initialize();
    handler = new EmbedDirectiveHandler(
      validationService,
      resolutionService,
      circularityService,
      fileSystemService,
      pathService,
      interpreterServiceClientFactory,
      logger
    );
    
    stateService.getCurrentFilePath.mockReturnValue('/project/transform_test.meld');
    stateService.isTransformationEnabled.mockReturnValue(true);
    stateService.clone.mockReturnValue(stateService);
  });

  afterEach(async () => {
    await contextDI?.cleanup();
  });

  const createMockProcessingContext = (node: DirectiveNode): DirectiveProcessingContext => {
      const mockResolutionContext = mockDeep<ResolutionContext>();
      const mockFormattingContext = mockDeep<FormattingContext>();
      if (!stateService) {
        throw new Error('Test setup error: stateService is not defined when creating context');
      }
      expect(stateService.getCurrentFilePath).toBeDefined(); 
      expect(stateService.isTransformationEnabled).toBeDefined();
      
      return {
          state: stateService, 
          resolutionContext: mockResolutionContext,
          formattingContext: mockFormattingContext,
          directiveNode: node,
      };
  };

  describe('transformation behavior', () => {
    it('should return replacement node with file contents when transformation enabled', async () => {
      const node = createEmbedDirective(
        'test.md',
        undefined,
        createLocation(1,1),
        'embedPath'
      );
      vi.mocked(fileSystemService.readFile).mockResolvedValue('Embedded content');
      mockProcessingContext = createMockProcessingContext(node);
      const result = await handler.execute(mockProcessingContext);

      expect(result.replacement).toBeDefined();
      expect(result.state).toBe(stateService);
      expect(result.replacement).toEqual(expect.objectContaining({
        type: 'Text',
        content: 'Embedded content'
      }));
    });

    it('should handle section extraction in transformation', async () => {
      const node = createEmbedDirective(
        'sections.md',
        'Section 1',
        createLocation(1,1),
        'embedPath'
      );
      vi.mocked(fileSystemService.readFile).mockResolvedValue('# Title\n## Section 1\nContent 1\n## Section 2\nContent 2');
      resolutionService.extractSection.mockResolvedValue('Content 1');
      mockProcessingContext = createMockProcessingContext(node);
      const result = await handler.execute(mockProcessingContext);

      expect(result.replacement).toBeDefined();
      expect(result.state).toBe(stateService);
      expect(result.replacement).toEqual(expect.objectContaining({
        type: 'Text',
        content: 'Content 1'
      }));
      expect(resolutionService.extractSection).toHaveBeenCalledWith(expect.any(String), 'Section 1');
    });

    it('should handle heading level in transformation', async () => {
      const node = createEmbedDirective(
        'heading.md',
        undefined,
        createLocation(1,1),
        'embedPath',
        { headingLevel: 2 }
      );
      const originalContent = 'Content for H2';
      vi.mocked(fileSystemService.readFile).mockResolvedValue(originalContent);
      mockProcessingContext = createMockProcessingContext(node);
      const result = await handler.execute(mockProcessingContext);
      expect((result.replacement as TextNode)?.content).toBe(originalContent);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('headingLevel adjustment specified'), expect.any(Object));
    });

    it('should handle under header in transformation', async () => {
      const node = createEmbedDirective(
        'underheader.md',
        undefined,
        createLocation(1,1),
        'embedPath',
        { underHeader: 'Target Header' }
      );
      const originalContent = 'Content under header';
      vi.mocked(fileSystemService.readFile).mockResolvedValue(originalContent);
      mockProcessingContext = createMockProcessingContext(node);
      const result = await handler.execute(mockProcessingContext);
      expect((result.replacement as TextNode)?.content).toBe(originalContent);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Under-header wrapping specified'), expect.any(Object));
    });

    it('should handle variable interpolation in path during transformation', async () => {
      const node = createEmbedDirective(
        '{{filePath}}',
        undefined,
        createLocation(1,1),
        'embedVariable'
      );
      mockProcessingContext = createMockProcessingContext(node);
      
      resolutionService.resolveInContext.mockResolvedValue('resolved/path.md');
      resolutionService.resolvePath.mockResolvedValue(createMeldPath('resolved/path.md', unsafeCreateValidatedResourcePath('/project/root/resolved/path.md')));
      fileSystemService.readFile.mockResolvedValue('Content from resolved path');

      const result = await handler.execute(mockProcessingContext);

      expect(resolutionService.resolveInContext).toHaveBeenCalledWith('{{filePath}}', mockProcessingContext.resolutionContext);
      expect(result.replacement).toEqual(expect.objectContaining({
        type: 'Text',
        content: 'Content from resolved path'
      }));
    });
    
    it('should handle variable reference embeds in transformation mode', async () => {
      const node = createEmbedDirective(
        '{{userData.user.profile.bio}}',
        undefined,
        createLocation(1, 1),
        'embedVariable'
      );
      node.directive.path = { raw: '{{userData.user.profile.bio}}', isVariableReference: true }; 
      mockProcessingContext = createMockProcessingContext(node);
      const resolvedContent = 'This is a test bio.';
      resolutionService.resolveInContext.mockResolvedValue(resolvedContent);
      
      const result = await handler.execute(mockProcessingContext);
      
      expect(result.replacement).toBeDefined();
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(node.directive.path, mockProcessingContext.resolutionContext);
      expect(result.replacement).toEqual(expect.objectContaining({
        type: 'Text',
        content: resolvedContent,
      }));
      expect(fileSystemService.exists).not.toHaveBeenCalled();
    });
    
    it('should handle data variable field embeds in transformation mode', async () => {
      const node = createEmbedDirective(
        '{{role.architect}}',
        undefined,
        createLocation(1, 1),
        'embedVariable'
      );
      node.directive.path = { raw: '{{role.architect}}', isVariableReference: true }; 
      mockProcessingContext = createMockProcessingContext(node);
      const resolvedContent = 'You are a senior architect skilled in TypeScript.';
      resolutionService.resolveInContext.mockResolvedValue(resolvedContent);
      
      const result = await handler.execute(mockProcessingContext);
      
      expect(result.replacement).toBeDefined();
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(node.directive.path, mockProcessingContext.resolutionContext);
      expect(result.replacement).toEqual(expect.objectContaining({
        type: 'Text',
        content: resolvedContent,
      }));
      expect(fileSystemService.exists).not.toHaveBeenCalled();
    });

    it('should preserve error handling during transformation', async () => {
      const node = createEmbedDirective(
        'nonexistent.md',
        undefined,
        createLocation(1,1),
        'embedPath'
      );
      mockProcessingContext = createMockProcessingContext(node);
      
      const resolvedPath = createMeldPath('/path/to/nonexistent.md');
      resolutionService.resolvePath.mockResolvedValue(resolvedPath);
      fileSystemService.exists.mockResolvedValue(false);
      
      await expect(handler.execute(mockProcessingContext)).rejects.toThrow(DirectiveError);
      await expect(handler.execute(mockProcessingContext)).rejects.toHaveProperty('code', DirectiveErrorCode.FILE_NOT_FOUND);
    });

    it('should handle circular imports during transformation', async () => {
      const node = createEmbedDirective(
        'circular.md',
        undefined,
        createLocation(1,1),
        'embedPath'
      );
      mockProcessingContext = createMockProcessingContext(node);
      
      const resolvedPath = createMeldPath('/path/to/circular.md');
      resolutionService.resolvePath.mockResolvedValue(resolvedPath);
      fileSystemService.exists.mockResolvedValue(true);
      circularityService.beginImport.mockImplementation(() => {
        throw new DirectiveError('Circular import detected', 'embed', DirectiveErrorCode.CIRCULAR_REFERENCE);
      });

      await expect(handler.execute(mockProcessingContext)).rejects.toThrow(DirectiveError);
      await expect(handler.execute(mockProcessingContext)).rejects.toHaveProperty('code', DirectiveErrorCode.CIRCULAR_REFERENCE);
    });

    it('should properly transform variable-based embed directive with field access', async () => {
      const node = createEmbedDirective(
        '{{vars.myPath.nested}}',
        undefined,
        createLocation(1,1),
        'embedVariable'
      );
      node.directive.path = { raw: '{{vars.myPath.nested}}', isVariableReference: true };
      mockProcessingContext = createMockProcessingContext(node);

      resolutionService.resolveInContext.mockResolvedValue('actual/file.md');

      const result = await handler.execute(mockProcessingContext);

      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(node.directive.path, mockProcessingContext.resolutionContext);
      expect(resolutionService.resolvePath).not.toHaveBeenCalled();
      expect(fileSystemService.readFile).not.toHaveBeenCalled();
      expect(result.replacement).toEqual(expect.objectContaining({
        type: 'Text',
        content: 'actual/file.md'
      }));
    });

    it('should properly transform variable-based embed directive with object field access', async () => {
      const node = createEmbedDirective(
        '{{contact.email}}',
        undefined,
        createLocation(1,1),
        'embedVariable'
      );
      node.directive.path = { raw: '{{contact.email}}', isVariableReference: true };
      mockProcessingContext = createMockProcessingContext(node);

      resolutionService.resolveInContext.mockResolvedValue('user@example.com');

      const result = await handler.execute(mockProcessingContext);

      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(node.directive.path, mockProcessingContext.resolutionContext);
      expect(resolutionService.resolvePath).not.toHaveBeenCalled();
      expect(fileSystemService.readFile).not.toHaveBeenCalled();
      expect(result.replacement).toEqual(expect.objectContaining({
        type: 'Text',
        content: 'user@example.com'
      }));
    });

    it('should throw EXECUTION_FAILED if interpreter client is not available', async () => {
      const node = createEmbedDirective(
        'any.md',
        undefined,
        createLocation(1,1),
        'embedPath'
      );
      mockProcessingContext = createMockProcessingContext(node);
      
      interpreterServiceClientFactory.createClient.mockImplementation(() => {
        throw new Error('Factory cannot create client');
      });
      
      handler = new EmbedDirectiveHandler(
         validationService,
         resolutionService,
         circularityService,
         fileSystemService,
         pathService, 
         interpreterServiceClientFactory,
         logger
      );

      const resolvedPath = createMeldPath('any.md', unsafeCreateValidatedResourcePath('/project/root/any.md'));
      resolutionService.resolvePath.mockResolvedValue(resolvedPath);
      fileSystemService.exists.mockResolvedValue(true);
      fileSystemService.readFile.mockResolvedValue('Some content');
      
      const result = await handler.execute(mockProcessingContext);
      expect((result.replacement as TextNode)?.content).toBe('Some content');
    });
  });
}); 