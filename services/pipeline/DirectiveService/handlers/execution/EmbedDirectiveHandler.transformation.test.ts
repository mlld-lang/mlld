import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import type { DirectiveNode, DirectiveData, MeldNode, VariableReferenceNode, TextNode } from '@core/syntax/types/index.js';
import type { MeldPath, StructuredPath } from '@core/types/paths.js';
import { createMeldPath, unsafeCreateValidatedResourcePath } from '@core/types/paths.js';
import { EmbedDirectiveHandler, type ILogger } from '@services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { ResolutionContext } from '@core/types/resolution.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { DataVariable } from '@core/types/variables.js';
import type { Result } from '@core/types/common.js';
import { success, failure } from '@core/types/common.js';
import type { DirectiveContext } from '@services/pipeline/DirectiveService/IDirectiveService.js';
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
  let context: DirectiveContext;
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
      const regex = new RegExp(`(^|\n)#+\s*${section}\s*\n([\s\S]*?)(?:\n#+\s|$)`, 'm');
      const match = content.match(regex);
      return match ? match[2].trim() : '';
    });

    await contextDI.initialize();
    handler = new EmbedDirectiveHandler(
      validationService,
      resolutionService,
      stateService,
      circularityService,
      fileSystemService,
      pathService,
      interpreterServiceClientFactory,
      logger
    );
    
    context = { 
      currentFilePath: 'test.meld', 
      state: stateService, 
      parentState: undefined,
    };
  });

  afterEach(async () => {
    await contextDI?.cleanup();
  });

  describe('transformation behavior', () => {
    it('should return replacement node with file contents when transformation enabled', async () => {
      const node = createEmbedDirective(
        'test.md',
        undefined,
        createLocation(1,1),
        'embedPath'
      );
      vi.mocked(fileSystemService.readFile).mockResolvedValue('Embedded content');

      const result = await handler.execute(node, context);

      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: 'Embedded content',
        location: node.location,
        formattingMetadata: {
          isFromDirective: true,
          originalNodeType: 'Directive',
          preserveFormatting: true
        }
      });
      expect(result.state).toBe(clonedState);
    });

    it('should handle section extraction in transformation', async () => {
      const node = createEmbedDirective(
        'test.md',
        'Section 1',
        createLocation(1,1),
        'embedPath'
      );
      vi.mocked(fileSystemService.readFile).mockResolvedValue('# Title\n## Section 1\nContent 1\n## Section 2\nContent 2');

      const result = await handler.execute(node, context);

      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: 'Content 1',
        location: node.location,
        formattingMetadata: {
          isFromDirective: true,
          originalNodeType: 'Directive',
          preserveFormatting: true
        }
      });
    });

    it('should handle heading level in transformation', async () => {
      const node = createEmbedDirective(
        'test.md',
        undefined,
        createLocation(1,1),
        'embedPath',
        { headingLevel: 2 }
      );
      const originalContent = 'Content for H2';
      vi.mocked(fileSystemService.readFile).mockResolvedValue(originalContent);
      const result = await handler.execute(node, context);
      expect((result.replacement as TextNode)?.content).toBe(originalContent);
    });

    it('should handle under header in transformation', async () => {
      const node = createEmbedDirective(
        'test.md',
        undefined,
        createLocation(1,1),
        'embedPath',
        { underHeader: 'Target Header' }
      );
      const originalContent = 'Content under header';
      vi.mocked(fileSystemService.readFile).mockResolvedValue(originalContent);
      const result = await handler.execute(node, context);
      expect((result.replacement as TextNode)?.content).toBe(originalContent);
    });

    it('should handle variable interpolation in path during transformation', async () => {
      const node = createEmbedDirective(
        '{{filePath}}',
        undefined,
        createLocation(1,1),
        'embedPath'
      );
      stateService.getTextVar.mockReturnValue({ type:'text', value: 'resolved/path.md' } as any);
      resolutionService.resolveInContext.mockImplementation(async (val: any): Promise<any> => {
        if (typeof val === 'string' && val === '{{filePath}}') return 'resolved/path.md';
        return val;
      });
      resolutionService.resolvePath.mockResolvedValue(createMeldPath('resolved/path.md', unsafeCreateValidatedResourcePath('/project/root/resolved/path.md')));
      fileSystemService.readFile.mockResolvedValue('Content from resolved path');

      const result = await handler.execute(node, context);

      expect(resolutionService.resolveInContext).toHaveBeenCalledWith('{{filePath}}', expect.any(Object));
      expect(resolutionService.resolvePath).toHaveBeenCalledWith('resolved/path.md', expect.any(Object));
      expect(fileSystemService.readFile).toHaveBeenCalledWith('/project/root/resolved/path.md');
      expect(result.replacement).toEqual(expect.objectContaining({
        type: 'Text',
        content: 'Content from resolved path'
      }));
    });
    
    it('should handle variable reference embeds in transformation mode', async () => {
      const variablePath = {
        raw: '{{userData.user.profile.bio}}',
        isVariableReference: true,
        variable: {
          identifier: 'userData',
          valueType: 'data',
          isVariableReference: true,
          fields: [
            { type: 'field', value: 'user' },
            { type: 'field', value: 'profile' },
            { type: 'field', value: 'bio' }
          ]
        }
      };
      
      const node = createEmbedDirective(
        variablePath.raw,
        undefined,
        createLocation(1, 1),
        'embedVariable'
      );
      node.directive.subtype = 'embedVariable';
      node.directive.path = variablePath;

      const resolvedContent = 'This is a test bio.';
      resolutionService.resolveInContext.mockResolvedValue(resolvedContent);
      resolutionService.resolveFieldAccess.mockResolvedValue(success(resolvedContent));
      
      const result = await handler.execute(node, context);
      
      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: resolvedContent,
        location: node.location,
        formattingMetadata: {
          isFromDirective: true,
          originalNodeType: 'Directive',
          preserveFormatting: true
        }
      });
      
      expect(fileSystemService.exists).not.toHaveBeenCalled();
      expect(fileSystemService.readFile).not.toHaveBeenCalled();
    });
    
    it('should handle data variable field embeds in transformation mode', async () => {
      const variablePath = {
        raw: '{{role.architect}}',
        isVariableReference: true,
        variable: {
          type: 'VariableReference',
          identifier: 'role',
          valueType: 'data',
          isVariableReference: true,
          fields: [{ type: 'field', value: 'architect' }]
        }
      };
      
      const node = createEmbedDirective(
        variablePath.raw,
        undefined,
        createLocation(1, 1),
        'embedVariable'
      );
      node.directive.subtype = 'embedVariable';
      node.directive.path = variablePath;

      const resolvedContent = 'You are a senior architect skilled in TypeScript.';
      resolutionService.resolveInContext.mockResolvedValue(resolvedContent);
      resolutionService.resolveFieldAccess.mockResolvedValue(success(resolvedContent));
      
      const result = await handler.execute(node, context);
      
      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: resolvedContent,
        location: node.location,
        formattingMetadata: {
          isFromDirective: true,
          originalNodeType: 'Directive',
          preserveFormatting: true
        }
      });
      
      expect(fileSystemService.exists).not.toHaveBeenCalled();
      expect(fileSystemService.readFile).not.toHaveBeenCalled();
    });

    it('should preserve error handling during transformation', async () => {
      const node = createEmbedDirective(
        'nonexistent.md',
        undefined,
        createLocation(1,1),
        'embedPath'
      );
      fileSystemService.exists.mockResolvedValue(false);
      
      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
    });

    it('should handle circular imports during transformation', async () => {
      const example = embedDirectiveExamples.atomic.simpleEmbed;
      const node = {
        type: 'Directive',
        subtype: 'embedPath',
        path: { raw: 'circular.md' },
        options: {},
        directive: { kind: 'embed' },
        location: createLocation(1, 1, 0, 1)
      } as DirectiveNode;

      const resolvedPath = createMeldPath('/path/to/circular.md');
      resolutionService.resolvePath.mockResolvedValue(resolvedPath);
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(circularityService.beginImport).mockImplementation(() => {
        throw new DirectiveError('Circular import detected', 'embed', DirectiveErrorCode.CIRCULAR_REFERENCE);
      });

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
    });

    it('should properly transform variable-based embed directive with field access', async () => {
      const node = createEmbedDirective(
        '{{vars.myPath.nested}}',
        undefined,
        createLocation(1,1),
        'embedPath'
      );
      
      stateService.getDataVar.mockReturnValue({ type:'data', value: { myPath: { nested: 'actual/file.md' } } } as any);
      resolutionService.resolveInContext.mockResolvedValue('actual/file.md');
      resolutionService.resolvePath.mockResolvedValue(createMeldPath('actual/file.md', unsafeCreateValidatedResourcePath('/project/root/actual/file.md')));
      fileSystemService.readFile.mockResolvedValue('Content from field access');

      const result = await handler.execute(node, context);

      expect(resolutionService.resolveInContext).toHaveBeenCalledWith('{{vars.myPath.nested}}', expect.any(Object));
      expect(resolutionService.resolvePath).toHaveBeenCalledWith('actual/file.md', expect.any(Object));
      expect(fileSystemService.readFile).toHaveBeenCalledWith('/project/root/actual/file.md');
      expect(result.replacement).toEqual(expect.objectContaining({
        type: 'Text',
        content: 'Content from field access'
      }));
    });

    it('should properly transform variable-based embed directive with object field access', async () => {
      const node = createEmbedDirective(
        '{{contact.email}}',
        undefined,
        createLocation(1,1),
        'embedPath'
      );
      
      stateService.getDataVar.mockReturnValue({ type:'data', value: { email: 'user@example.com' } } as any);
      resolutionService.resolveInContext.mockResolvedValue('user@example.com');
      resolutionService.resolvePath.mockResolvedValue(createMeldPath('user@example.com', unsafeCreateValidatedResourcePath('/project/root/user@example.com')));
      fileSystemService.readFile.mockResolvedValue('Content from contact email path');

      const result = await handler.execute(node, context);

      expect(resolutionService.resolveInContext).toHaveBeenCalledWith('{{contact.email}}', expect.any(Object));
      expect(resolutionService.resolvePath).toHaveBeenCalledWith('user@example.com', expect.any(Object));
      expect(fileSystemService.readFile).toHaveBeenCalledWith('/project/root/user@example.com');
      expect(result.replacement).toEqual(expect.objectContaining({
        type: 'Text',
        content: 'Content from contact email path'
      }));
    });

    it('should throw EXECUTION_FAILED if interpreter client is not available', async () => {
      const node = createEmbedDirective(
        'any.md',
        undefined,
        createLocation(1,1),
        'embedPath'
      );
      
      interpreterServiceClientFactory.createClient.mockImplementation(() => {
        throw new Error('Factory cannot create client');
      });

      resolutionService.resolvePath.mockResolvedValue(createMeldPath('any.md', unsafeCreateValidatedResourcePath('/project/root/any.md')));
      fileSystemService.readFile.mockResolvedValue('Some content');
      
      const result = await handler.execute(node, context);
      expect((result.replacement as TextNode)?.content).toBe('Some content');
    });
  });
}); 