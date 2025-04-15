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
import { StringConcatenationHandler } from '@services/resolution/ResolutionService/resolvers/StringConcatenationHandler.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import { ValidationService } from '@services/resolution/ValidationService/ValidationService.js';
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService.js';
import { CircularityService } from '@services/resolution/CircularityService/CircularityService.js';
import { PathService } from '@services/fs/PathService/PathService.js';
import type { DirectiveProcessingContext, FormattingContext } from '@core/types/index.js';
import { DirectiveTestFixture, type DirectiveTestOptions } from '@tests/utils/fixtures/DirectiveTestFixture.js';
import type { IStateTrackingService } from '@tests/utils/debug/StateTrackingService/IStateTrackingService.js';
import { MeldFileNotFoundError } from '@core/errors/MeldFileNotFoundError.js';
import type { ResolutionFlags } from '@core/types/resolution.js';
import { PathPurpose } from '@core/types/paths.js';
import type { PathResolutionContext } from '@core/types/resolution.js';

describe('EmbedDirectiveHandler Transformation', () => {
  let fixture: DirectiveTestFixture;
  let handler: EmbedDirectiveHandler;
  let circularityService: ReturnType<typeof mockDeep<ICircularityService>>;
  let interpreterServiceClientFactory: ReturnType<typeof mockDeep<InterpreterServiceClientFactory>>;
  let interpreterServiceClient: ReturnType<typeof mockDeep<IInterpreterServiceClient>>;
  let logger: ReturnType<typeof mockDeep<ILogger>>;
  let parserService: ReturnType<typeof mockDeep<IParserService>>;
  let mockProcessingContext: Partial<DirectiveProcessingContext>;

  beforeEach(async () => {
    circularityService = mockDeep<ICircularityService>();
    logger = mockDeep<ILogger>();
    interpreterServiceClient = mockDeep<IInterpreterServiceClient>();
    interpreterServiceClientFactory = mockDeep<InterpreterServiceClientFactory>();
    parserService = mockDeep<IParserService>();
    interpreterServiceClientFactory.createClient.mockReturnValue(interpreterServiceClient);

    fixture = await DirectiveTestFixture.create({
      additionalMocks: {
        'ICircularityService': circularityService,
        'ILogger': logger,
        'InterpreterServiceClientFactory': interpreterServiceClientFactory,
      }
    });

    handler = await fixture.context.resolve(EmbedDirectiveHandler);
    fixture.handler = handler;

    vi.spyOn(fixture.stateService, 'clone').mockReturnValue(fixture.stateService);
    vi.spyOn(fixture.stateService, 'isTransformationEnabled').mockReturnValue(true);
    vi.spyOn(fixture.validationService, 'validate').mockResolvedValue(undefined);
    vi.spyOn(fixture.stateService, 'getCurrentFilePath').mockReturnValue('/project/transform_test.meld');

    vi.spyOn(fixture.fileSystemService, 'exists').mockImplementation(async (p) => !p.includes('nonexistent'));
    vi.spyOn(fixture.fileSystemService, 'readFile').mockImplementation(async (p) => {
      if (p.includes('nonexistent')) throw new Error('File not found');
      if (p.includes('sections.md')) return '# Title\n## Section 1\nContent 1\n## Section 2\nContent 2';
      if (p.includes('heading.md')) return '# Title\n## Heading 2\nContent for H2';
      if (p.includes('underheader.md')) return '# Title\n## Target Header\nContent under header';
      if (p.includes('actual/file.md')) return 'Content from field access';
      if (p.includes('user@example.com')) return 'Content from contact email path';
      if (p.includes('any.md')) return 'Some content';
      if (p === '/project/root/resolved/path.md') return 'Content from resolved path';
      return 'Default embedded content';
    });

    vi.spyOn(fixture.resolutionService, 'resolveInContext').mockImplementation(async (value: any, context: any): Promise<string> => { 
      const rawValue = (typeof value === 'object' && value !== null && 'raw' in value && typeof value.raw === 'string') ? value.raw : value;
      
      if (rawValue === '{{filePath}}') return 'resolved/path.md';
      if (rawValue === '{{vars.myPath.nested}}') return 'actual/file.md';
      if (rawValue === '{{contact.email}}') return 'user@example.com';
      
      return typeof rawValue === 'string' ? rawValue : 'mock-fallback';
    });
    
    vi.spyOn(fixture.resolutionService, 'resolvePath').mockImplementation(async (resolvedPathInput: string | StructuredPath, context: ResolutionContext): Promise<MeldPath> => {
      const resolvedPathString = typeof resolvedPathInput === 'string' ? resolvedPathInput : resolvedPathInput.raw ?? 'fallback-path';
      const isAbsolute = resolvedPathString.startsWith('/');
      const validatedPath = isAbsolute ? resolvedPathString : `/project/root/${resolvedPathString}`;
      if (resolvedPathString === 'resolved/path.md') {
        return createMeldPath(resolvedPathString, unsafeCreateValidatedResourcePath('/project/root/resolved/path.md'), false);
      }
      return createMeldPath(resolvedPathString, unsafeCreateValidatedResourcePath(validatedPath), isAbsolute);
    });
    
    vi.spyOn(fixture.resolutionService, 'extractSection').mockImplementation(async (content, section) => {
      const regex = new RegExp(`(^|\\n)#+\\s*${section}\\s*\\n([\\s\\S]*?)(?=\\n#+|$)`, 'm');
      const match = content.match(regex);
      return match ? match[2].trim() : '';
    });
  });

  afterEach(async () => {
    await fixture?.cleanup();
  });

  const createMockProcessingContext = (node: DirectiveNode): Partial<DirectiveProcessingContext> => {
      if (!fixture || !fixture.stateService) {
        throw new Error('Test setup error: fixture or stateService is not defined');
      }
      expect(fixture.stateService.getCurrentFilePath).toBeDefined(); 
      expect(fixture.stateService.isTransformationEnabled).toBeDefined();

      const resolutionContext: ResolutionContext = {
        currentFilePath: fixture.stateService.getCurrentFilePath() ?? undefined,
        state: fixture.stateService,
        strict: true, 
        depth: 0,
        flags: {
            isVariableEmbed: false,
            isTransformation: false,
            allowRawContentResolution: false,
            isDirectiveHandler: false,
            isImportContext: false,
            preserveUnresolved: false,
            processNestedVariables: true, 
        } as ResolutionFlags,
        pathContext: { 
            purpose: PathPurpose.READ,
            baseDir: fixture.stateService.getCurrentFilePath()?.split('/').slice(0, -1).join('/') ?? '/workspace',
            allowTraversal: false
        } as PathResolutionContext,
        withAllowedTypes: vi.fn().mockReturnThis(),
        withFlags: vi.fn().mockReturnThis(),
        withFormattingContext: vi.fn().mockReturnThis(),
        withIncreasedDepth: vi.fn().mockReturnThis(),
        withParserFlags: vi.fn().mockReturnThis(),
        withPathContext: vi.fn().mockReturnThis(),
        withStrictMode: vi.fn().mockReturnThis(),
      };

      return {
          state: fixture.stateService, 
          resolutionContext: resolutionContext,
          directiveNode: node,
          executionContext: { cwd: '/workspace' },
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
      vi.spyOn(fixture.fileSystemService, 'readFile').mockResolvedValue('Embedded content');
      mockProcessingContext = createMockProcessingContext(node);
      const result = await handler.execute(mockProcessingContext as DirectiveProcessingContext);

      expect(result.replacement).toBeDefined();
      expect(result.state).toBe(fixture.stateService);
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
      vi.spyOn(fixture.fileSystemService, 'readFile').mockResolvedValue('# Title\n## Section 1\nContent 1\n## Section 2\nContent 2');
      vi.spyOn(fixture.resolutionService, 'extractSection').mockResolvedValue('Content 1');
      mockProcessingContext = createMockProcessingContext(node);
      const result = await handler.execute(mockProcessingContext as DirectiveProcessingContext);

      expect(result.replacement).toBeDefined();
      expect(result.state).toBe(fixture.stateService);
      expect(result.replacement).toEqual(expect.objectContaining({
        type: 'Text',
        content: 'Content 1'
      }));
      expect(fixture.resolutionService.extractSection).toHaveBeenCalledWith(
        expect.any(String),
        'Section 1',
        undefined
      );
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
      mockProcessingContext = createMockProcessingContext(node);
      
      vi.spyOn(fixture.fileSystemService, 'readFile').mockResolvedValue(originalContent);
      
      const result = await handler.execute(mockProcessingContext as DirectiveProcessingContext);
      expect((result.replacement as TextNode)?.content).toBe(originalContent);
      
      expect(logger.warn).toHaveBeenCalledTimes(2);
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
      vi.spyOn(fixture.fileSystemService, 'readFile').mockResolvedValue(originalContent);
      mockProcessingContext = createMockProcessingContext(node);
      const result = await handler.execute(mockProcessingContext as DirectiveProcessingContext);
      expect((result.replacement as TextNode)?.content).toBe(originalContent);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Under-header wrapping specified'), expect.any(Object));
    });

    it('should handle variable interpolation in path during transformation', async () => {
      const node = createEmbedDirective(
        '{{filePath}}',
        undefined,
        createLocation(1,1),
        'embedPath'
      );
      node.directive.path = { raw: '{{filePath}}', type: 'InterpolatableValue', values: [{type: 'VariableReference', identifier: 'filePath'}] } as any;
      
      mockProcessingContext = createMockProcessingContext(node);
      
      vi.spyOn(fixture.resolutionService, 'resolveInContext').mockResolvedValue('resolved/path.md');
      const resolvedMeldPath = createMeldPath('resolved/path.md', unsafeCreateValidatedResourcePath('/project/root/resolved/path.md'));
      vi.spyOn(fixture.resolutionService, 'resolvePath').mockResolvedValue(resolvedMeldPath);
      vi.spyOn(fixture.fileSystemService, 'exists').mockResolvedValue(true);
      vi.spyOn(fixture.fileSystemService, 'readFile').mockResolvedValue('Content from resolved path');

      const result = await handler.execute(mockProcessingContext as DirectiveProcessingContext);

      expect(fixture.resolutionService.resolveInContext).toHaveBeenCalledWith('{{filePath}}', expect.any(Object));
      expect(fixture.resolutionService.resolvePath).toHaveBeenCalledWith('resolved/path.md', expect.any(Object));
      expect(fixture.fileSystemService.readFile).toHaveBeenCalledWith(resolvedMeldPath.validatedPath);
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
      node.directive.path = { raw: '{{userData.user.profile.bio}}', type: 'InterpolatableValue', values: [{type: 'VariableReference', identifier: 'userData', fields: [{type: 'field', value: 'user'}, {type: 'field', value: 'profile'}, {type: 'field', value: 'bio'}]}] } as any;
      mockProcessingContext = createMockProcessingContext(node);
      const resolvedContent = 'This is a test bio.';
      vi.spyOn(fixture.resolutionService, 'resolveInContext').mockResolvedValue(resolvedContent);
      
      const result = await handler.execute(mockProcessingContext as DirectiveProcessingContext);
      
      expect(result.replacement).toBeDefined();
      expect(fixture.resolutionService.resolveInContext).toHaveBeenCalledWith(
        node.directive.path.raw,
        expect.any(Object)
      );
      expect(result.replacement).toEqual(expect.objectContaining({
        type: 'Text',
        content: resolvedContent,
      }));
      expect(fixture.fileSystemService.exists).not.toHaveBeenCalled();
    });
    
    it('should handle data variable field embeds in transformation mode', async () => {
      const node = createEmbedDirective(
        '{{role.architect}}',
        undefined,
        createLocation(1, 1),
        'embedVariable'
      );
      node.directive.path = { raw: '{{role.architect}}', type: 'InterpolatableValue', values: [{type: 'VariableReference', identifier: 'role', fields: [{type: 'field', value: 'architect'}]}] } as any;
      mockProcessingContext = createMockProcessingContext(node);
      const resolvedContent = 'You are a senior architect skilled in TypeScript.';
      vi.spyOn(fixture.resolutionService, 'resolveInContext').mockResolvedValue(resolvedContent);
      
      const result = await handler.execute(mockProcessingContext as DirectiveProcessingContext);
      
      expect(result.replacement).toBeDefined();
      expect(fixture.resolutionService.resolveInContext).toHaveBeenCalledWith(
        node.directive.path.raw,
        expect.any(Object)
      );
      expect(result.replacement).toEqual(expect.objectContaining({
        type: 'Text',
        content: resolvedContent,
      }));
      expect(fixture.fileSystemService.exists).not.toHaveBeenCalled();
    });

    it('should preserve error handling during transformation', async () => {
      const node = createEmbedDirective(
        'nonexistent.md',
        undefined,
        createLocation(1,1),
        'embedPath'
      );
      node.directive.path = { raw: 'nonexistent.md' };
      mockProcessingContext = createMockProcessingContext(node);
      
      const resolvedPath = createMeldPath('nonexistent.md', unsafeCreateValidatedResourcePath('/project/root/nonexistent.md'));
      vi.spyOn(fixture.resolutionService, 'resolvePath').mockResolvedValue(resolvedPath);
      vi.spyOn(fixture.fileSystemService, 'exists').mockResolvedValue(false);
      
      await expect(handler.execute(mockProcessingContext as DirectiveProcessingContext)).rejects.toThrow(DirectiveError);
      await expect(handler.execute(mockProcessingContext as DirectiveProcessingContext)).rejects.toHaveProperty('code', DirectiveErrorCode.FILE_NOT_FOUND);
    });

    it('should properly transform variable-based embed directive with field access', async () => {
      const node = createEmbedDirective(
        '{{vars.myPath.nested}}',
        undefined,
        createLocation(1,1),
        'embedVariable'
      );
      node.directive.path = { raw: '{{vars.myPath.nested}}', type: 'InterpolatableValue', values: [{type: 'VariableReference', identifier: 'vars', fields: [{type: 'field', value: 'myPath'}, {type: 'field', value: 'nested'}]}] } as any;
      mockProcessingContext = createMockProcessingContext(node);

      vi.spyOn(fixture.resolutionService, 'resolveInContext').mockResolvedValue('actual/file.md');

      const result = await handler.execute(mockProcessingContext as DirectiveProcessingContext);

      expect(fixture.resolutionService.resolveInContext).toHaveBeenCalledWith(
        node.directive.path.raw,
        expect.any(Object)
      );
      expect(fixture.resolutionService.resolvePath).not.toHaveBeenCalled();
      expect(fixture.fileSystemService.readFile).not.toHaveBeenCalled();
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
      node.directive.path = { raw: '{{contact.email}}', type: 'InterpolatableValue', values: [{type: 'VariableReference', identifier: 'contact', fields: [{type: 'field', value: 'email'}]}] } as any;
      mockProcessingContext = createMockProcessingContext(node);

      vi.spyOn(fixture.resolutionService, 'resolveInContext').mockResolvedValue('user@example.com');

      const result = await handler.execute(mockProcessingContext as DirectiveProcessingContext);

      expect(fixture.resolutionService.resolveInContext).toHaveBeenCalledWith(
        node.directive.path.raw,
        expect.any(Object)
      );
      expect(fixture.resolutionService.resolvePath).not.toHaveBeenCalled();
      expect(fixture.fileSystemService.readFile).not.toHaveBeenCalled();
      expect(result.replacement).toEqual(expect.objectContaining({
        type: 'Text',
        content: 'user@example.com'
      }));
    });
  });
}); 