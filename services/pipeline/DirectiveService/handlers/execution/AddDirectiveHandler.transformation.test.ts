import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import type { DirectiveNode, DirectiveData, MeldNode, VariableReferenceNode, TextNode } from '@core/syntax/types/index';
import type { StructuredPath } from '@core/syntax/types/nodes';
import type { MeldPath, PathValidationContext } from '@core/types/paths';
import { createMeldPath, unsafeCreateValidatedResourcePath } from '@core/types/paths';
import { AddDirectiveHandler, type ILogger } from '@services/pipeline/DirectiveService/handlers/execution/AddDirectiveHandler';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import type { ResolutionContext } from '@core/types/resolution';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { DataVariable } from '@core/types/variables';
import type { Result } from '@core/types/common';
import { success, failure } from '@core/types/common';
import type { FieldAccessError } from '@core/errors/FieldAccessError';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService';
import { InterpreterServiceClientFactory } from '@services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory';
import type { IInterpreterServiceClient } from '@services/pipeline/InterpreterService/interfaces/IInterpreterServiceClient';
import { createLocation, createAddDirective } from '@tests/utils/testFactories';
import { 
  embedDirectiveExamples
} from '@core/syntax/index';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import type { IParserService } from '@services/pipeline/ParserService/IParserService';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import type { IPathService } from '@services/fs/PathService/IPathService';
import type { DirectiveProcessingContext, FormattingContext } from '@core/types/index';
import type { IStateTrackingService } from '@tests/utils/debug/StateTrackingService/IStateTrackingService';
import { MeldFileNotFoundError } from '@core/errors/MeldFileNotFoundError';
import type { ResolutionFlags } from '@core/types/resolution';
import { PathPurpose } from '@core/types/paths';
import type { PathResolutionContext } from '@core/types/resolution';
import { DirectiveResult } from '@core/directives/DirectiveHandler';
import { container, DependencyContainer } from 'tsyringe';
import { 
    createStateServiceMock,
    createResolutionServiceMock,
    createFileSystemServiceMock,
    createLoggerServiceMock,
    createPathServiceMock,
    createValidationServiceMock,
} from '@tests/utils/mocks/serviceMocks.ts';
import { CircularityServiceMock } from '@tests/utils/mocks/serviceMocks.ts';

describe('AddDirectiveHandler Transformation', () => {
  let testContainer: DependencyContainer;
  let handler: AddDirectiveHandler;
  let stateServiceMock: ReturnType<typeof createStateServiceMock>;
  let resolutionServiceMock: ReturnType<typeof createResolutionServiceMock>;
  let fileSystemServiceMock: ReturnType<typeof createFileSystemServiceMock>;
  let pathServiceMock: ReturnType<typeof createPathServiceMock>;
  let validationServiceMock: ReturnType<typeof createValidationServiceMock>;
  let circularityServiceMock: CircularityServiceMock;
  let interpreterServiceClientFactoryMock: ReturnType<typeof mockDeep<InterpreterServiceClientFactory>>;
  let interpreterServiceClientMock: ReturnType<typeof mockDeep<IInterpreterServiceClient>>;
  let loggerMock: ReturnType<typeof createLoggerServiceMock>;

  beforeEach(() => {
    vi.clearAllMocks();

    testContainer = container.createChildContainer();

    stateServiceMock = createStateServiceMock();
    resolutionServiceMock = createResolutionServiceMock();
    fileSystemServiceMock = createFileSystemServiceMock();
    pathServiceMock = createPathServiceMock();
    validationServiceMock = createValidationServiceMock();
    circularityServiceMock = mock<ICircularityService>();
    loggerMock = createLoggerServiceMock();
    interpreterServiceClientFactoryMock = mockDeep<InterpreterServiceClientFactory>();
    interpreterServiceClientMock = mockDeep<IInterpreterServiceClient>();

    interpreterServiceClientFactoryMock.createClient.mockReturnValue(interpreterServiceClientMock);

    stateServiceMock.clone.mockReturnValue(stateServiceMock);
    stateServiceMock.isTransformationEnabled.mockReturnValue(true);
    validationServiceMock.validate.mockResolvedValue(undefined);
    stateServiceMock.getCurrentFilePath.mockReturnValue('/project/transform_test.meld');

    fileSystemServiceMock.exists.mockImplementation(async (p) => !p.includes('nonexistent'));
    fileSystemServiceMock.readFile.mockImplementation(async (p) => {
      if (p.includes('nonexistent')) throw new MeldFileNotFoundError('File not found', { details: {filePath: p} });
      if (p.includes('sections.md')) return '# Title\n## Section 1\nContent 1\n## Section 2\nContent 2';
      if (p.includes('heading.md')) return '# Title\n## Heading 2\nContent for H2';
      if (p.includes('underheader.md')) return '# Title\n## Target Header\nContent under header';
      if (p.includes('actual/file.md')) return 'Content from field access';
      if (p.includes('user@example.com')) return 'Content from contact email path';
      if (p.includes('any.md')) return 'Some content';
      if (p === '/project/root/resolved/path.md') return 'Content from resolved path';
      return 'Default embedded content';
    });

    resolutionServiceMock.resolveInContext.mockImplementation(async (value: any, context: any): Promise<string> => { 
      const rawValue = (typeof value === 'object' && value !== null && 'raw' in value && typeof value.raw === 'string') ? value.raw : value;
      const inputStr = typeof rawValue === 'string' ? rawValue : 'mock-fallback';
      
      if (inputStr === '{{filePath}}') return 'resolved/path.md';
      if (inputStr === '{{vars.myPath.nested}}') return 'actual/file.md';
      if (inputStr === '{{contact.email}}') return 'user@example.com';
      if (inputStr === '{{userData.user.profile.bio}}') return 'This is a test bio.';
      if (inputStr === '{{role.architect}}') return 'You are a senior architect skilled in TypeScript.';
      
      return inputStr;
    });
    
    resolutionServiceMock.resolvePath.mockImplementation(async (resolvedPathInput: string | StructuredPath, context: ResolutionContext): Promise<MeldPath> => {
      const resolvedPathString = typeof resolvedPathInput === 'string' ? resolvedPathInput : resolvedPathInput.raw ?? 'fallback-path';
      const isAbsolute = resolvedPathString.startsWith('/');
      const validatedPath = isAbsolute ? resolvedPathString : `/project/root/${resolvedPathString}`;
      if (resolvedPathString === 'resolved/path.md') {
        return createMeldPath(resolvedPathString, unsafeCreateValidatedResourcePath('/project/root/resolved/path.md'), false);
      }
       if (resolvedPathString === 'actual/file.md') {
        return createMeldPath(resolvedPathString, unsafeCreateValidatedResourcePath('/project/root/actual/file.md'), false);
      }
       if (resolvedPathString === 'user@example.com') {
        return createMeldPath(resolvedPathString, unsafeCreateValidatedResourcePath('/project/root/user@example.com'), false); 
      }
       if (resolvedPathString === 'test.md') {
        return createMeldPath(resolvedPathString, unsafeCreateValidatedResourcePath('/project/root/test.md'), false); 
      }
        if (resolvedPathString === 'sections.md') {
        return createMeldPath(resolvedPathString, unsafeCreateValidatedResourcePath('/project/root/sections.md'), false); 
      }
       if (resolvedPathString === 'heading.md') {
        return createMeldPath(resolvedPathString, unsafeCreateValidatedResourcePath('/project/root/heading.md'), false); 
      }
      if (resolvedPathString === 'underheader.md') {
        return createMeldPath(resolvedPathString, unsafeCreateValidatedResourcePath('/project/root/underheader.md'), false); 
      }
       if (resolvedPathString === 'nonexistent.md') {
        return createMeldPath(resolvedPathString, unsafeCreateValidatedResourcePath('/project/root/nonexistent.md'), false); 
      }
      return createMeldPath(resolvedPathString, unsafeCreateValidatedResourcePath(validatedPath), isAbsolute);
    });
    
    resolutionServiceMock.extractSection.mockImplementation(async (content, section) => {
      const regex = new RegExp(`(^|\\n)#+\\s*${section}\\s*\\n([\\s\\S]*?)(?=\\n#+|$)`, 'm');
      const match = content.match(regex);
      return match ? match[2].trim() : '';
    });

    testContainer.registerInstance<IStateService>('IStateService', stateServiceMock);
    testContainer.registerInstance<IResolutionService>('IResolutionService', resolutionServiceMock);
    testContainer.registerInstance<IFileSystemService>('IFileSystemService', fileSystemServiceMock);
    testContainer.registerInstance<IPathService>('IPathService', pathServiceMock);
    testContainer.registerInstance<IValidationService>('IValidationService', validationServiceMock);
    testContainer.registerInstance<ICircularityService>('ICircularityService', circularityServiceMock);
    testContainer.registerInstance<ILogger>('ILogger', loggerMock);
    testContainer.registerInstance<InterpreterServiceClientFactory>('InterpreterServiceClientFactory', interpreterServiceClientFactoryMock);
    testContainer.registerInstance<DependencyContainer>('DependencyContainer', testContainer);

    testContainer.register(AddDirectiveHandler, { useClass: AddDirectiveHandler });

    handler = testContainer.resolve(AddDirectiveHandler);
  });

  afterEach(() => {
    testContainer?.dispose();
  });

  const createMockProcessingContext = (node: DirectiveNode): DirectiveProcessingContext => {
      if (!stateServiceMock) {
        throw new Error('Test setup error: stateServiceMock is not defined');
      }

      const resolutionContext: ResolutionContext = {
        currentFilePath: stateServiceMock.getCurrentFilePath() ?? undefined,
        state: stateServiceMock,
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
            baseDir: stateServiceMock.getCurrentFilePath()?.split('/').slice(0, -1).join('/') ?? '/workspace',
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
      const formattingContext: FormattingContext = { isBlock: false, preserveLiteralFormatting: false, preserveWhitespace: false };

      return {
          state: stateServiceMock, 
          resolutionContext: resolutionContext,
          formattingContext: formattingContext,
          directiveNode: node,
          executionContext: { cwd: '/workspace' },
      };
  };

  describe('transformation behavior', () => {
    it('should return replacement node with file contents when transformation enabled', async () => {
      const node = createAddDirective(
        'test.md',
        undefined,
        createLocation(1,1),
        'embedPath'
      );
      const mockProcessingContext = createMockProcessingContext(node);
      const result = await handler.handle(mockProcessingContext as DirectiveProcessingContext);

      expect(result.replacement).toBeDefined();
      expect(result.stateChanges).toBeUndefined();
      expect(result.replacement?.[0]).toMatchObject({ type: 'Text', content: 'Default embedded content' });
    });

    it('should handle section extraction in transformation', async () => {
      const node = createAddDirective(
        'sections.md',
        'Section 1',
        createLocation(1,1),
        'embedPath'
      );
      resolutionServiceMock.extractSection.mockResolvedValueOnce('Content 1');
      const mockProcessingContext = createMockProcessingContext(node);
      const result = await handler.handle(mockProcessingContext as DirectiveProcessingContext);

      expect(result.replacement).toBeDefined();
      expect(result.stateChanges).toBeUndefined();
      expect(result.replacement?.[0]).toMatchObject({ type: 'Text', content: 'Content 1' });
      expect(resolutionServiceMock.extractSection).toHaveBeenCalledWith(
        expect.any(String),
        'Section 1',
        undefined
      );
    });

    it('should handle heading level in transformation', async () => {
      const node = createAddDirective(
        'heading.md',
        undefined,
        createLocation(1,1),
        'embedPath',
        { headingLevel: 2 }
      );
      const originalContent = 'Content for H2';
      fileSystemServiceMock.readFile.mockResolvedValueOnce(originalContent);
      const mockProcessingContext = createMockProcessingContext(node);
      
      const result = await handler.handle(mockProcessingContext as DirectiveProcessingContext);
      expect(result.replacement?.[0]?.content).toBe(originalContent);
      
      expect(loggerMock.warn).toHaveBeenCalledTimes(2);
    });

    it('should handle under header in transformation', async () => {
      const node = createAddDirective(
        'underheader.md',
        undefined,
        createLocation(1,1),
        'embedPath',
        { underHeader: 'Target Header' }
      );
      const originalContent = 'Content under header';
      fileSystemServiceMock.readFile.mockResolvedValueOnce(originalContent);
      const mockProcessingContext = createMockProcessingContext(node);
      const result = await handler.handle(mockProcessingContext as DirectiveProcessingContext);
      expect(result.replacement?.[0]?.content).toBe(originalContent);
      expect(loggerMock.warn).toHaveBeenCalledWith(expect.stringContaining('Under-header wrapping specified'), expect.any(Object));
    });

    it('should handle variable interpolation in path during transformation', async () => {
      const node = createAddDirective(
        '{{filePath}}',
        undefined,
        createLocation(1,1),
        'embedPath'
      );
      node.directive.path = { raw: '{{filePath}}' }; 
      
      const mockProcessingContext = createMockProcessingContext(node);
      
      const resolvedPathString = 'resolved/path.md';
      const resolvedMeldPath = createMeldPath(resolvedPathString, unsafeCreateValidatedResourcePath('/project/root/resolved/path.md'));
      resolutionServiceMock.resolveInContext.mockResolvedValueOnce(resolvedPathString);
      resolutionServiceMock.resolvePath.mockResolvedValueOnce(resolvedMeldPath);
      fileSystemServiceMock.exists.mockResolvedValueOnce(true);
      fileSystemServiceMock.readFile.mockResolvedValueOnce('Content from resolved path');

      const result = await handler.handle(mockProcessingContext as DirectiveProcessingContext);

      expect(resolutionServiceMock.resolveInContext).toHaveBeenCalledWith('{{filePath}}', expect.any(Object));
      expect(resolutionServiceMock.resolvePath).toHaveBeenCalledWith(resolvedPathString, expect.any(Object));
      expect(fileSystemServiceMock.readFile).toHaveBeenCalledWith(resolvedMeldPath.validatedPath);
      expect(result.replacement).toBeDefined();
      expect(result.stateChanges).toBeUndefined();
      expect(result.replacement?.[0]).toMatchObject({ type: 'Text', content: 'Content from resolved path' });
    });
    
    it('should handle variable reference embeds in transformation mode', async () => {
      const node = createAddDirective(
        '{{userData.user.profile.bio}}',
        undefined,
        createLocation(1, 1),
        'embedVariable'
      );
      node.directive.path = { raw: '{{userData.user.profile.bio}}' };
      const mockProcessingContext = createMockProcessingContext(node);
      const resolvedContent = 'This is a test bio.';
      resolutionServiceMock.resolveInContext.mockResolvedValueOnce(resolvedContent);
      
      const result = await handler.handle(mockProcessingContext as DirectiveProcessingContext);
      
      expect(result.replacement).toBeDefined();
      expect(result.stateChanges).toBeUndefined();
      expect(result.replacement?.[0]).toMatchObject({ type: 'Text', content: resolvedContent });
      expect(fileSystemServiceMock.exists).not.toHaveBeenCalled();
    });
    
    it('should handle data variable field embeds in transformation mode', async () => {
      const node = createAddDirective(
        '{{role.architect}}',
        undefined,
        createLocation(1, 1),
        'embedVariable'
      );
      node.directive.path = { raw: '{{role.architect}}' }; 
      const mockProcessingContext = createMockProcessingContext(node);
      const resolvedContent = 'You are a senior architect skilled in TypeScript.';
      resolutionServiceMock.resolveInContext.mockResolvedValueOnce(resolvedContent);
      
      const result = await handler.handle(mockProcessingContext as DirectiveProcessingContext);
      
      expect(result.replacement).toBeDefined();
      expect(result.stateChanges).toBeUndefined();
      expect(result.replacement?.[0]).toMatchObject({ type: 'Text', content: resolvedContent });
      expect(fileSystemServiceMock.exists).not.toHaveBeenCalled();
    });

    it('should preserve error handling during transformation', async () => {
      const node = createAddDirective(
        'nonexistent.md',
        undefined,
        createLocation(1,1),
        'embedPath'
      );
      node.directive.path = { raw: 'nonexistent.md' };
      const mockProcessingContext = createMockProcessingContext(node);
      
      const resolvedPath = createMeldPath('nonexistent.md', unsafeCreateValidatedResourcePath('/project/root/nonexistent.md'));
      resolutionServiceMock.resolvePath.mockResolvedValueOnce(resolvedPath);
      fileSystemServiceMock.exists.mockResolvedValueOnce(false);
      
      await expect(handler.handle(mockProcessingContext as DirectiveProcessingContext)).rejects.toThrow(DirectiveError);
      try {
        await handler.handle(mockProcessingContext as DirectiveProcessingContext);
      } catch (e: any) {
         expect(e.code).toEqual(DirectiveErrorCode.FILE_NOT_FOUND);
      }
    });

    it('should properly transform variable-based embed directive with field access', async () => {
      const node = createAddDirective(
        '{{vars.myPath.nested}}',
        undefined,
        createLocation(1,1),
        'embedVariable'
      );
      node.directive.path = { raw: '{{vars.myPath.nested}}' }; 
      const mockProcessingContext = createMockProcessingContext(node);
      const resolvedPathString = 'actual/file.md';

      resolutionServiceMock.resolveInContext.mockResolvedValueOnce(resolvedPathString);

      const result = await handler.handle(mockProcessingContext as DirectiveProcessingContext);

      expect(resolutionServiceMock.resolveInContext).toHaveBeenCalledWith(
        '{{vars.myPath.nested}}',
        expect.any(Object)
      );
      expect(resolutionServiceMock.resolvePath).not.toHaveBeenCalled();
      expect(fileSystemServiceMock.readFile).not.toHaveBeenCalled();
      expect(result.replacement).toBeDefined();
      expect(result.stateChanges).toBeUndefined();
      expect(result.replacement?.[0]).toMatchObject({ type: 'Text', content: resolvedPathString });
    });

    it('should properly transform variable-based embed directive with object field access', async () => {
      const node = createAddDirective(
        '{{contact.email}}',
        undefined,
        createLocation(1,1),
        'embedVariable'
      );
      node.directive.path = { raw: '{{contact.email}}' };
      const mockProcessingContext = createMockProcessingContext(node);
      const resolvedEmail = 'user@example.com';

      resolutionServiceMock.resolveInContext.mockResolvedValueOnce(resolvedEmail);

      const result = await handler.handle(mockProcessingContext as DirectiveProcessingContext);

      expect(resolutionServiceMock.resolveInContext).toHaveBeenCalledWith(
        '{{contact.email}}',
        expect.any(Object)
      );
      expect(resolutionServiceMock.resolvePath).not.toHaveBeenCalled();
      expect(fileSystemServiceMock.readFile).not.toHaveBeenCalled();
      expect(result.replacement).toBeDefined();
      expect(result.stateChanges).toBeUndefined();
      expect(result.replacement?.[0]).toMatchObject({ type: 'Text', content: resolvedEmail });
    });
  });
}); 