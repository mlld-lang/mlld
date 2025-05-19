// Define mockLogger outside beforeEach so the same instance is used everywhere
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

import { describe, it, expect, beforeEach, vi, afterEach, type Mock } from 'vitest';
import type { DirectiveNode, DirectiveData, MeldNode, VariableReferenceNode, TextNode, IDirectiveData } from '@core/syntax/types/index';
import type { StructuredPath } from '@core/syntax/types/nodes';
import { createMeldPath, unsafeCreateValidatedResourcePath, PathContentType, unsafeCreateAbsolutePath, MeldPath } from '@core/types/paths';
import { AddDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/AddDirectiveHandler';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import type { ResolutionContext } from '@core/types/resolution';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import { InterpreterServiceClientFactory } from '@services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory';
import type { IInterpreterServiceClient } from '@services/pipeline/InterpreterService/interfaces/IInterpreterServiceClient';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import { createLocation, createAddDirective, createTextNode, createVariableReferenceNode } from '@tests/utils/testFactories';
import { embedDirectiveExamples } from '@core/syntax/index';
import { expectToThrowWithConfig, ErrorTestOptions } from '@tests/utils/ErrorTestUtils';
import { VariableType, TextVariable, DataVariable, VariableOrigin, type IPathVariable, MeldVariable } from '@core/types/variables';
import type { InterpolatableValue } from '@core/syntax/types/nodes';
import type { IPathService } from '@services/fs/PathService/IPathService';
import type { PathValidationContext } from '@core/types/paths';
import type { DirectiveProcessingContext, FormattingContext } from '@core/types/index';
import type { DirectiveResult, StateChanges } from '@core/directives/DirectiveHandler.ts';
import * as path from 'path';
import { MeldFileNotFoundError } from '@core/errors/MeldFileNotFoundError';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService';
import type { AddDirectiveData } from '@core/syntax/types/directives';
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
import { mock } from 'vitest-mock-extended';
import type { ILogger } from '@core/utils/logger';
import { VariableMetadata } from '@core/types/variables';
import { CircularityService } from '@services/resolution/CircularityService/CircularityService';
import { CircularityServiceMock } from '@tests/utils/mocks/serviceMocks.ts';

/**
 * AddDirectiveHandler Test Status
 * --------------------------------
 * 
 * MIGRATION STATUS: Refactored to Manual Child Container
 * 
 * This test file has been refactored to use:
 * - Manual child DI container for test isolation
 * - Standardized mock factories with vitest-mock-extended
 * - Explicit registration of mocks and the real handler
 */

describe('AddDirectiveHandler', () => {
  let testContainer: DependencyContainer;
  let handler: AddDirectiveHandler;
  let resolutionServiceMock: ReturnType<typeof createResolutionServiceMock>;
  let stateServiceMock: ReturnType<typeof createStateServiceMock>;
  let fileSystemServiceMock: ReturnType<typeof createFileSystemServiceMock>;
  let circularityServiceMock: CircularityServiceMock;
  let pathServiceMock: ReturnType<typeof createPathServiceMock>;
  let validationServiceMock: ReturnType<typeof createValidationServiceMock>;
  let loggerMock: ReturnType<typeof createLoggerServiceMock>;
  let interpreterServiceClientFactoryMock: ReturnType<typeof mock<InterpreterServiceClientFactory>>;
  let mockInterpreterClient: ReturnType<typeof mock<IInterpreterServiceClient>>;

  beforeEach(() => {
    vi.clearAllMocks(); 
    
    // Create container
    testContainer = container.createChildContainer();
    
    // Create mocks
    stateServiceMock = createStateServiceMock();
    resolutionServiceMock = createResolutionServiceMock();
    fileSystemServiceMock = createFileSystemServiceMock();
    pathServiceMock = createPathServiceMock();
    circularityServiceMock = mock<ICircularityService>();
    validationServiceMock = createValidationServiceMock(); 
    loggerMock = createLoggerServiceMock();
    interpreterServiceClientFactoryMock = mock<InterpreterServiceClientFactory>();
    mockInterpreterClient = mock<IInterpreterServiceClient>();
    
    // --- Default Mock Behavior Setup ---
    stateServiceMock.getCurrentFilePath.mockReturnValue('/path/to/test.meld');
    stateServiceMock.clone.mockReturnValue(stateServiceMock);
    stateServiceMock.isTransformationEnabled.mockReturnValue(false);
    stateServiceMock.getVariable.mockImplementation((name): MeldVariable | undefined => {
      if (name === 'docsPath') {
          const meldPath = createMeldPath('$docsPath', unsafeCreateValidatedResourcePath('/path/to/docs'));
          return { 
              type: VariableType.PATH, 
              name: 'docsPath', 
              value: meldPath, 
              origin: VariableOrigin.DIRECTIVE, 
              metadata: {} as VariableMetadata 
          } as IPathVariable;
      }
      if (name === 'textVar') return { type: VariableType.TEXT, name: 'textVar', value: 'Resolved Text', origin: VariableOrigin.DIRECTIVE, metadata: {} as VariableMetadata };
      if (name === 'dataVar') return { type: VariableType.DATA, name: 'dataVar', value: { user: { name: 'Alice' } }, origin: VariableOrigin.DIRECTIVE, metadata: {} as VariableMetadata };
      return undefined;
    });
    stateServiceMock.transformNode.mockReturnValue(undefined);

    fileSystemServiceMock.exists.mockImplementation(async (p) => p !== '/path/to/non-existent-file.txt');
    fileSystemServiceMock.readFile.mockImplementation(async (p: string): Promise<string> => {
      if (p === '/path/to/empty.md') return '';
      if (p === '/path/to/content.md') return 'This is the content.';
      if (p === '/path/to/section.md') return '# Section 1\nContent 1\n# Section 2\nContent 2';
      if (p === '/path/to/resolved_path.md') return 'Resolved path content.';
      if (p === '/path/to/docs/file.txt') return 'Docs file content.';
      if (p === '/path/to/some/file.txt') return 'Some file content.';
      throw new MeldFileNotFoundError('File not found by mock', { details: { filePath: p } });
    });

    resolutionServiceMock.resolvePath.mockImplementation(async (p: string | StructuredPath, ctx?: ResolutionContext): Promise<MeldPath> => {
        const inputStr = (typeof p === 'string' ? p : p?.raw) ?? '';
        const resolvedStr = inputStr.startsWith('/') ? inputStr : path.join('/path/to', inputStr);
        return createMeldPath(inputStr, unsafeCreateValidatedResourcePath(resolvedStr));
    });
    resolutionServiceMock.resolveInContext.mockImplementation(async (value: any, context: any): Promise<string> => {
        const inputStr = (typeof value === 'string' ? value : value?.raw) ?? JSON.stringify(value);
        if (inputStr === '{{textVar}}') return 'Resolved Text';
        if (inputStr.startsWith('$docsPath')) return inputStr.replace('$docsPath', '/path/to/docs');
        if (inputStr === './some/file.txt') return '/path/to/some/file.txt';
        if (inputStr === 'non-existent-file.txt') return '/path/to/non-existent-file.txt';
        if (inputStr === './content.md') return '/path/to/content.md';
        if (inputStr === './section.md') return '/path/to/section.md';
        if (inputStr === 'doc.md') return '/path/to/doc.md';
        if (inputStr === 'read_error.txt') return '/path/to/read_error.txt';
        if (inputStr === '{{undefinedVar}}/file.txt') throw new Error('Var not found');
        if (inputStr === '{{errorPath}}') throw new Error('Cannot resolve path var');
        if (inputStr === '{{dataVar.user.name}}') return 'Alice';
        if (value?.type === 'VariableReference' && value.identifier === 'textVar') return 'Resolved Text';
        if (value?.type === 'VariableReference' && value.identifier === 'docsPath') return '/path/to/docs';
        return inputStr;
    });
     resolutionServiceMock.extractSection.mockImplementation(async (content, section) => {
         if (content === '# Section 1\nContent 1\n# Section 2\nContent 2' && section === 'Section 1') return 'Content 1';
         if (content === '# Section 1\nContent 1\n# Section 2\nContent 2' && section === 'Section 2') return 'Content 2';
         throw new Error(`Mock: Section '${section}' not found`);
     });

    circularityServiceMock.isInStack.mockReturnValue(false);
    circularityServiceMock.beginImport.mockReturnValue(undefined);
    circularityServiceMock.endImport.mockReturnValue(undefined);

    mockInterpreterClient.interpret.mockResolvedValue(stateServiceMock);
    mockInterpreterClient.createChildContext.mockResolvedValue(stateServiceMock);
    interpreterServiceClientFactoryMock.createClient.mockReturnValue(mockInterpreterClient);

    validationServiceMock.validate.mockResolvedValue(undefined);

    testContainer.registerInstance<IStateService>('IStateService', stateServiceMock);
    testContainer.registerInstance<IResolutionService>('IResolutionService', resolutionServiceMock);
    testContainer.registerInstance<IFileSystemService>('IFileSystemService', fileSystemServiceMock);
    testContainer.registerInstance<IPathService>('IPathService', pathServiceMock);
    testContainer.registerInstance<ICircularityService>('ICircularityService', circularityServiceMock);
    testContainer.registerInstance<IValidationService>('IValidationService', validationServiceMock);
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
      const mockResolutionContext = { strict: true, state: stateServiceMock } as ResolutionContext;
      const mockFormattingContext: FormattingContext = { isBlock: false, preserveLiteralFormatting: false, preserveWhitespace: false };
      if (!stateServiceMock) throw new Error('stateServiceMock not initialized');
      return {
          state: stateServiceMock, 
          resolutionContext: mockResolutionContext,
          formattingContext: mockFormattingContext,
          directiveNode: node,
          executionContext: { cwd: '/path/to' } 
      };
  };

  describe('basic add functionality', () => {

    it.skip('should handle heading level adjustment', async () => { /* ... */ });
    it.skip('should handle under header extraction', async () => { /* ... */ });
  });

  describe('error handling', () => {
    
    it('should handle section extraction failure gracefully', async () => {
      const node = createAddDirective('doc.md', 'MissingSection', createLocation(1, 1), 'addPath');
      const processingContext = createMockProcessingContext(node);
      const resolvedPath = createMeldPath('doc.md', unsafeCreateValidatedResourcePath('/path/to/doc.md'));
      const extractionError = new Error('Section not found');
      
      resolutionServiceMock.resolvePath.mockResolvedValueOnce(resolvedPath);
      fileSystemServiceMock.exists.mockResolvedValueOnce(true);
      fileSystemServiceMock.readFile.mockResolvedValueOnce('# Some Content');
      resolutionServiceMock.extractSection.mockRejectedValue(extractionError);
      
      await expectToThrowWithConfig(async () => { await handler.handle(processingContext); }, {
          code: DirectiveErrorCode.EXECUTION_FAILED,
          messageContains: "extracting section \"MissingSection\"",
          cause: extractionError
      });
    });

    it('should handle error during path resolution', async () => {
      const node = createAddDirective('{{errorPath}}', undefined, createLocation(1, 1), 'addVariable');
      const processingContext = createMockProcessingContext(node);
      const resolutionError = new Error('Cannot resolve path var');
      resolutionServiceMock.resolveInContext.mockRejectedValueOnce(resolutionError);
      
      await expectToThrowWithConfig(async () => { await handler.handle(processingContext); }, {
          code: DirectiveErrorCode.RESOLUTION_FAILED,
          messageContains: "Cannot resolve path var",
          cause: resolutionError
      });
    });

    it('should handle error during file reading', async () => {
      const node = createAddDirective('read_error.txt', undefined, createLocation(1, 1), 'addPath');
      const processingContext = createMockProcessingContext(node);
      const resolvedPath = createMeldPath('read_error.txt', unsafeCreateValidatedResourcePath('/path/to/read_error.txt'));
      const readError = new Error('Disk read failed');
      
      resolutionServiceMock.resolvePath.mockResolvedValueOnce(resolvedPath);
      fileSystemServiceMock.exists.mockResolvedValueOnce(true);
      fileSystemServiceMock.readFile.mockRejectedValueOnce(readError);
      
      await expectToThrowWithConfig(async () => { await handler.handle(processingContext); }, {
          code: DirectiveErrorCode.FILESYSTEM_ERROR,
          messageContains: "reading add source file: /path/to/read_error.txt: Disk read failed",
          cause: readError
      });
    });

    it('should handle variable resolution failure in path', async () => {
      const node = createAddDirective('{{undefinedVar}}/file.txt', undefined, createLocation(1, 1), 'addVariable');
      const processingContext = createMockProcessingContext(node);
      const resolutionError = new Error('Var not found');
      resolutionServiceMock.resolveInContext.mockRejectedValueOnce(resolutionError);
      
      await expectToThrowWithConfig(async () => { await handler.handle(processingContext); }, {
          code: DirectiveErrorCode.RESOLUTION_FAILED,
          messageContains: "Var not found",
          cause: resolutionError
      });
    });
    
    it('should handle variable resolution failure in template', async () => {
        const nonExistentVarNode: VariableReferenceNode = { type: 'VariableReference', nodeId: 'vr-nonexist', identifier: 'nonExistent', valueType: VariableType.TEXT, isVariableReference: true, location: createLocation(1, 20) };
        const templateNodes: InterpolatableValue = [ createTextNode('Value is: '), nonExistentVarNode ];
        const node = createAddDirective( templateNodes, undefined, createLocation(1, 1), 'addTemplate' );
        const processingContext = createMockProcessingContext(node);
        const resolutionError = new Error('Var not found in template');
        resolutionServiceMock.resolveNodes.mockRejectedValueOnce(resolutionError);
        
        await expectToThrowWithConfig(async () => { await handler.handle(processingContext); }, {
            code: DirectiveErrorCode.RESOLUTION_FAILED,
            messageContains: "Var not found in template",
            cause: resolutionError
        });
     });
  });

  describe('Path variables', () => {
    it('should handle user-defined path variables with $', async () => {
      const node = createAddDirective('$docsPath/file.txt', undefined, createLocation(1, 1), 'addVariable');
      const processingContext = createMockProcessingContext(node);
      const resolvedPathString = '/path/to/docs/file.txt';
      const resolvedPath: MeldPath = createMeldPath(resolvedPathString, unsafeCreateValidatedResourcePath(resolvedPathString));

      resolutionServiceMock.resolveInContext.mockResolvedValueOnce(resolvedPathString);
      const existsSpy = vi.spyOn(fileSystemServiceMock, 'exists');
      const readFileSpy = vi.spyOn(fileSystemServiceMock, 'readFile');

      const result = await handler.handle(processingContext) as DirectiveResult;
      
      expect(resolutionServiceMock.resolveInContext).toHaveBeenCalledWith('$docsPath/file.txt', processingContext.resolutionContext);
      expect(existsSpy).not.toHaveBeenCalled();
      expect(readFileSpy).not.toHaveBeenCalled();
      expect(result).toHaveProperty('replacement');
      expect(result.stateChanges).toBeUndefined();
      const replacement = result.replacement;
      expect(replacement?.[0]).toMatchObject({ type: 'Text', content: resolvedPathString });
    });
  });
  
  describe('Variable reference embeds', () => {

    it('should handle data variable reference embeds (using dot notation)', async () => {
      const node = createAddDirective('{{dataVar.user.name}}', undefined, createLocation(1, 1), 'addVariable');
      const processingContext = createMockProcessingContext(node);
      const resolvedValue = 'Alice';
      resolutionServiceMock.resolveInContext.mockResolvedValueOnce(resolvedValue);
      
      const result = await handler.handle(processingContext) as DirectiveResult;
      
      expect(resolutionServiceMock.resolveInContext).toHaveBeenCalledWith('{{dataVar.user.name}}', processingContext.resolutionContext);
      expect(result).toHaveProperty('replacement');
      expect(result.stateChanges).toBeUndefined();
      const replacement = result.replacement;
      expect(replacement?.[0]).toMatchObject({ type: 'Text', content: resolvedValue });
    });
  });

  describe('Template literal embeds', () => {
  });

  describe('Transformation mode', () => {
      it('should return replacement node when transformation is enabled', async () => {
        const node = createAddDirective('./content.md', undefined, createLocation(), 'addPath');
        const processingContext = createMockProcessingContext(node);
        const resolvedPath = createMeldPath('./content.md', unsafeCreateValidatedResourcePath('/path/to/content.md'));
        const fileContent = 'File content for transform';

        stateServiceMock.isTransformationEnabled.mockReturnValueOnce(true);
        resolutionServiceMock.resolvePath.mockResolvedValueOnce(resolvedPath);
        fileSystemServiceMock.exists.mockResolvedValueOnce(true);
        fileSystemServiceMock.readFile.mockResolvedValueOnce(fileContent);

        const result = await handler.handle(processingContext) as DirectiveResult;

        expect(result).toBeDefined();
        expect(result).not.toBe(stateServiceMock);
        expect(result).toHaveProperty('replacement');
        expect(result.stateChanges).toBeUndefined();
        const replacement = result.replacement;
        expect(replacement?.[0]).toMatchObject({ type: 'Text', content: fileContent });
    });

     it('should still return replacement node even when transformation is disabled', async () => {
        const node = createAddDirective('./content.md', undefined, createLocation(), 'addPath');
        const processingContext = createMockProcessingContext(node);
        const resolvedPath = createMeldPath('./content.md', unsafeCreateValidatedResourcePath('/path/to/content.md'));
        const fileContent = 'File content no transform';

        resolutionServiceMock.resolvePath.mockResolvedValueOnce(resolvedPath);
        fileSystemServiceMock.exists.mockResolvedValueOnce(true);
        fileSystemServiceMock.readFile.mockResolvedValueOnce(fileContent);

        const result = await handler.handle(processingContext) as DirectiveResult;

        expect(result).toBeDefined();
        expect(result.replacement).toBeDefined();
        expect(result.replacement?.[0]).toMatchObject({ type: 'Text', content: fileContent });
        expect(result.stateChanges).toBeUndefined();
     });
  });
}); 