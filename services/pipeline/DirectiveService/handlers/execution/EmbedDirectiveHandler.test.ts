// Define mockLogger outside beforeEach so the same instance is used everywhere
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

vi.mock('@core/utils/logger', () => ({ embedLogger: mockLogger }));

import { describe, it, expect, beforeEach, vi, afterEach, type Mock } from 'vitest';
import type { DirectiveNode, DirectiveData, MeldNode, VariableReferenceNode, TextNode, IDirectiveData } from '@core/syntax/types/index.js';
import type { StructuredPath } from '@core/syntax/types/nodes.js';
import { createMeldPath, unsafeCreateValidatedResourcePath, PathContentType, unsafeCreateAbsolutePath, MeldPath } from '@core/types/paths.js';
import { EmbedDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { ResolutionContext } from '@core/types/resolution.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { InterpreterServiceClientFactory } from '@services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory.js';
import type { IInterpreterServiceClient } from '@services/pipeline/InterpreterService/interfaces/IInterpreterServiceClient.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { createLocation, createEmbedDirective, createTextNode, createVariableReferenceNode } from '@tests/utils/testFactories.js';
import { embedDirectiveExamples } from '@core/syntax/index.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { expectToThrowWithConfig, ErrorTestOptions } from '@tests/utils/ErrorTestUtils.js';
import { VariableType, TextVariable, DataVariable, VariableOrigin, type IPathVariable } from '@core/types/variables.js';
import type { InterpolatableValue } from '@core/syntax/types/nodes.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import type { PathValidationContext } from '@core/types/paths.js';
import type { DirectiveProcessingContext, FormattingContext } from '@core/types/index.js';
import type { DirectiveResult, StateChanges } from '@core/directives/DirectiveHandler.ts';
import * as path from 'path';
import { MeldFileNotFoundError } from '@core/errors/MeldFileNotFoundError.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { EmbedDirectiveData } from '@core/syntax/types/directives.js';
import { ValidationService } from '@services/resolution/ValidationService/ValidationService.js';
import { DirectiveResult } from '@core/directives/DirectiveHandler';

/**
 * EmbedDirectiveHandler Test Status
 * --------------------------------
 * 
 * MIGRATION STATUS: Phase 5 ✅ (Using TestContextDI helpers)
 * 
 * This test file has been migrated to use:
 * - TestContextDI helpers for container management
 * - Standard mocks provided by TestContextDI/MockFactory
 * - vi.spyOn on resolved mocks for test-specific behavior
 */

describe('EmbedDirectiveHandler', () => {
  const helpers = TestContextDI.createTestHelpers();
  let handler: EmbedDirectiveHandler;
  let resolutionService: IResolutionService;
  let stateService: IStateService;
  let fileSystemService: IFileSystemService;
  let circularityService: ICircularityService;
  let pathService: IPathService;
  let interpreterServiceClientFactory: InterpreterServiceClientFactory;
  let validationService: IValidationService;
  let context: TestContextDI;

  beforeEach(async () => {
    vi.clearAllMocks(); 
    context = helpers.setupWithStandardMocks({
        'ILogger': mockLogger 
    });
    await context.resolve('IFileSystemService'); 

    // Resolve ALL dependencies FIRST
    stateService = await context.resolve('IStateService');
    resolutionService = await context.resolve('IResolutionService');
    fileSystemService = await context.resolve('IFileSystemService');
    pathService = await context.resolve('IPathService');
    circularityService = await context.resolve('ICircularityService');
    interpreterServiceClientFactory = await context.resolve('InterpreterServiceClientFactory');
    validationService = await context.resolve('IValidationService'); 
    const loggerInstance = await context.resolve('ILogger');
    
    // --- Manually instantiate the handler with resolved dependencies ---
    handler = new EmbedDirectiveHandler(
        validationService,
        resolutionService,
        circularityService,
        fileSystemService,
        pathService,
        interpreterServiceClientFactory,
        loggerInstance 
    );
    
    // --- Register the INSTANCE in the container ---
    context.container.getContainer().registerInstance(EmbedDirectiveHandler, handler); // Use getContainer()
    // Optionally register for an interface token if one exists/is used
    // context.container.getContainer().registerInstance('IEmbedDirectiveHandler', handler);
    
    // --- Default Mock Behavior Setup ---
    vi.spyOn(stateService, 'getCurrentFilePath').mockReturnValue('/path/to/test.meld');
    vi.spyOn(stateService, 'clone').mockImplementation(() => stateService);
    vi.spyOn(stateService, 'isTransformationEnabled').mockReturnValue(false);
    vi.spyOn(stateService, 'getPathVar').mockImplementation((name): IPathVariable | undefined => {
      if (name === 'docsPath') {
          const meldPath = createMeldPath('$docsPath', unsafeCreateValidatedResourcePath('/path/to/docs'));
          return { 
              type: VariableType.PATH, 
              name: 'docsPath', 
              value: meldPath 
          } as IPathVariable;
      }
      return undefined;
    });
    vi.spyOn(stateService, 'getTextVar').mockImplementation((name: string): TextVariable | undefined => {
      if (name === 'textVar') return { type: VariableType.TEXT, name: 'textVar', value: 'Resolved Text' };
      return undefined;
    });
    vi.spyOn(stateService, 'getDataVar').mockImplementation((name: string): DataVariable | undefined => {
      if (name === 'dataVar') return { type: VariableType.DATA, name: 'dataVar', value: { user: { name: 'Alice' } } };
      return undefined;
    });
    vi.spyOn(stateService, 'transformNode');

    vi.spyOn(fileSystemService, 'exists').mockImplementation(async (p) => p !== '/path/to/non-existent-file.txt');
    vi.spyOn(fileSystemService, 'readFile').mockImplementation(async (p: string): Promise<string> => {
      if (p === '/path/to/empty.md') return '';
      if (p === '/path/to/content.md') return 'This is the content.';
      if (p === '/path/to/section.md') return '# Section 1\nContent 1\n# Section 2\nContent 2';
      if (p === '/path/to/resolved_path.md') return 'Resolved path content.';
      if (p === '/path/to/docs/file.txt') return 'Docs file content.';
      if (p === '/path/to/some/file.txt') return 'Some file content.';
      throw new MeldFileNotFoundError('File not found by mock', { details: { filePath: p } });
    });

    vi.spyOn(resolutionService, 'resolvePath').mockImplementation(async (p: string | StructuredPath, ctx?: ResolutionContext): Promise<MeldPath> => {
        const inputStr = (typeof p === 'string' ? p : p?.raw) ?? '';
        const resolvedStr = inputStr.startsWith('/') ? inputStr : path.join('/path/to', inputStr);
        return createMeldPath(inputStr, unsafeCreateValidatedResourcePath(resolvedStr));
    });
    vi.spyOn(resolutionService, 'resolveInContext').mockImplementation(async (value: any, context: any): Promise<string> => {
        if (typeof value === 'string') {
            if (value === '{{textVar}}') return 'Resolved Text';
            if (value.startsWith('$docsPath')) return value.replace('$docsPath', '/path/to/docs');
            if (value === './some/file.txt') return '/path/to/some/file.txt';
            return value;
        } else if (value?.type === 'VariableReference' && value.identifier === 'textVar') {
             return 'Resolved Text';
        } else if (value?.type === 'VariableReference' && value.identifier === 'docsPath') {
             return '/path/to/docs';
        } else if (value?.raw === '{{dataVar.user.name}}') {
             return 'Alice';
        }
        return JSON.stringify(value);
    });
     vi.spyOn(resolutionService, 'extractSection').mockImplementation(async (content, section) => {
         if (content === '# Section 1\nContent 1\n# Section 2\nContent 2' && section === 'Section 1') return 'Content 1';
         if (content === '# Section 1\nContent 1\n# Section 2\nContent 2' && section === 'Section 2') return 'Content 2';
         throw new Error(`Mock: Section '${section}' not found`);
     });

    vi.spyOn(circularityService, 'isInStack').mockReturnValue(false);
    vi.spyOn(circularityService, 'beginImport');
    vi.spyOn(circularityService, 'endImport');

    const factoryInstanceOnHandler = (handler as any).interpreterServiceClientFactory as InterpreterServiceClientFactory;
    const mockInterpreterClient: IInterpreterServiceClient = { 
        interpret: vi.fn().mockResolvedValue(stateService),
        createChildContext: vi.fn().mockResolvedValue(stateService)
    };
    if (factoryInstanceOnHandler) { 
        vi.spyOn(factoryInstanceOnHandler, 'createClient').mockReturnValue(mockInterpreterClient);
    } else {
        console.warn('Could not find interpreterServiceClientFactory on handler instance to spy on.');
    }

    vi.spyOn(validationService, 'validate').mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  const createMockProcessingContext = (node: DirectiveNode): DirectiveProcessingContext => {
      const mockResolutionContext = { strict: true, state: stateService } as ResolutionContext;
      const mockFormattingContext: FormattingContext = { isBlock: false, preserveLiteralFormatting: false, preserveWhitespace: false };
      if (!stateService) throw new Error('stateService not initialized');
      return {
          state: stateService, 
          resolutionContext: mockResolutionContext,
          formattingContext: mockFormattingContext,
          directiveNode: node,
      };
  };

  describe('basic embed functionality', () => {
    it('should handle basic embed without modifiers (subtype: embedPath)', async () => {
      const node = createEmbedDirective('./some/file.txt', undefined, createLocation(1, 1), 'embedPath');
      const processingContext = createMockProcessingContext(node);
      const resolvedPathString = '/path/to/some/file.txt'; 
      const resolvedPath: MeldPath = createMeldPath(resolvedPathString, unsafeCreateValidatedResourcePath(resolvedPathString));
      
      // Mock resolveInContext first, as it's called before resolvePath in handler
      vi.spyOn(resolutionService, 'resolveInContext').mockResolvedValue(resolvedPathString);
      vi.spyOn(resolutionService, 'resolvePath').mockResolvedValue(resolvedPath);
      vi.spyOn(fileSystemService, 'exists').mockResolvedValue(true);
      vi.spyOn(fileSystemService, 'readFile').mockResolvedValue('Some file content.');

      const result = await handler.handle(processingContext) as DirectiveResult;

      expect(validationService.validate).toHaveBeenCalledWith(node);
      // Expect resolvePath to be called with the string RETURNED BY resolveInContext
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(resolvedPathString, processingContext.resolutionContext);
      // Check resolveInContext was called with the original value
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith('./some/file.txt', processingContext.resolutionContext);
      expect(fileSystemService.exists).toHaveBeenCalledWith(resolvedPath.validatedPath);
      expect(fileSystemService.readFile).toHaveBeenCalledWith(resolvedPath.validatedPath);
      expect(result).toHaveProperty('replacement');
      expect(result.stateChanges).toBeUndefined();
      const replacement = result.replacement;
      expect(replacement?.[0]).toEqual(expect.objectContaining({ type: 'Text', content: 'Some file content.' }));
    });

    it('should handle embed with section (subtype: embedPath)', async () => {
      const node = createEmbedDirective('./section.md', 'Section 1', createLocation(1, 1), 'embedPath');
      const processingContext = createMockProcessingContext(node);
      const resolvedPathString = '/path/to/section.md';
      const resolvedPath: MeldPath = createMeldPath(resolvedPathString, unsafeCreateValidatedResourcePath(resolvedPathString));
      const fullFileContent = '# Section 1\nContent 1\n# Section 2\nContent 2';
      const extractedContent = 'Content 1';

      vi.spyOn(resolutionService, 'resolvePath').mockResolvedValue(resolvedPath);
      vi.spyOn(fileSystemService, 'exists').mockResolvedValue(true);
      vi.spyOn(fileSystemService, 'readFile').mockResolvedValue(fullFileContent);
      vi.spyOn(resolutionService, 'extractSection').mockResolvedValue(extractedContent);

      const result = await handler.handle(processingContext) as DirectiveResult;

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(resolutionService.resolvePath).toHaveBeenCalledWith('./section.md', processingContext.resolutionContext);
      expect(fileSystemService.readFile).toHaveBeenCalledWith(resolvedPath.validatedPath);
      expect(resolutionService.extractSection).toHaveBeenCalledWith(fullFileContent, 'Section 1', undefined);
      expect(result).toHaveProperty('replacement');
      expect(result.stateChanges).toBeUndefined();
      const replacement = result.replacement;
      expect(replacement?.[0]).toEqual(expect.objectContaining({ type: 'Text', content: extractedContent }));
    });
    it.skip('should handle heading level adjustment', async () => { /* ... */ });
    it.skip('should handle under header extraction', async () => { /* ... */ });
  });

  describe('error handling', () => {
    it('should throw error if file not found', async () => {
      const node = createEmbedDirective('non-existent-file.txt', undefined, createLocation(1, 1), 'embedPath');
      const processingContext = createMockProcessingContext(node);
      const resolvedPathString = '/path/to/non-existent-file.txt';
      const resolvedPath: MeldPath = createMeldPath('non-existent-file.txt', unsafeCreateValidatedResourcePath(resolvedPathString));
      
      vi.spyOn(resolutionService, 'resolvePath').mockResolvedValue(resolvedPath);
      vi.spyOn(fileSystemService, 'exists').mockResolvedValue(false);
      
      await expect(handler.handle(processingContext))
        .rejects.toThrow(DirectiveError); 
      // Check the cause and its details
      try {
        await handler.handle(processingContext);
      } catch(e: any) {
        expect(e.cause).toBeInstanceOf(MeldFileNotFoundError);
        // Check details.filePath on the cause
        expect(e.cause.details.filePath).toBe(resolvedPath.validatedPath); 
      }
    });
    
    it('should handle section extraction failure gracefully', async () => {
      const node = createEmbedDirective('doc.md', 'MissingSection', createLocation(1, 1), 'embedPath');
      const processingContext = createMockProcessingContext(node);
      const resolvedPath = createMeldPath('doc.md', unsafeCreateValidatedResourcePath('/path/to/doc.md'));
      
      vi.spyOn(resolutionService, 'resolvePath').mockResolvedValue(resolvedPath);
      vi.spyOn(fileSystemService, 'exists').mockResolvedValue(true);
      vi.spyOn(fileSystemService, 'readFile').mockResolvedValue('# Some Content');
      const extractionError = new Error('Section not found');
      vi.spyOn(resolutionService, 'extractSection').mockRejectedValue(extractionError);
      
      await expectToThrowWithConfig(async () => { await handler.handle(processingContext); }, {
          code: DirectiveErrorCode.EXECUTION_FAILED,
      });
      try { await handler.handle(processingContext); } catch(e: any) { expect(e.cause).toBe(extractionError); }
    });

    it('should handle error during path resolution', async () => {
      const node = createEmbedDirective('{{errorPath}}', undefined, createLocation(1, 1), 'embedVariable');
      const processingContext = createMockProcessingContext(node);
      const resolutionError = new Error('Cannot resolve path var');
      vi.spyOn(resolutionService, 'resolveInContext').mockRejectedValue(resolutionError);
      await expect(handler.handle(processingContext)).rejects.toThrow(DirectiveError);
      await expect(handler.handle(processingContext)).rejects.toHaveProperty('cause', resolutionError);
    });

    it('should handle error during file reading', async () => {
      const node = createEmbedDirective('read_error.txt', undefined, createLocation(1, 1), 'embedPath');
      const processingContext = createMockProcessingContext(node);
      const resolvedPath = createMeldPath('read_error.txt', unsafeCreateValidatedResourcePath('/path/to/read_error.txt'));
      vi.spyOn(resolutionService, 'resolvePath').mockResolvedValue(resolvedPath);
      vi.spyOn(fileSystemService, 'exists').mockResolvedValue(true);
      const readError = new Error('Disk read failed');
      vi.spyOn(fileSystemService, 'readFile').mockRejectedValue(readError);
      await expect(handler.handle(processingContext)).rejects.toThrow(DirectiveError);
      await expect(handler.handle(processingContext)).rejects.toHaveProperty('cause', readError);
    });

    it('should handle variable resolution failure in path', async () => {
      const node = createEmbedDirective('{{undefinedVar}}/file.txt', undefined, createLocation(1, 1), 'embedVariable');
      const processingContext = createMockProcessingContext(node);
      const resolutionError = new Error('Var not found');
      vi.spyOn(resolutionService, 'resolveInContext').mockRejectedValue(resolutionError);
      await expect(handler.handle(processingContext)).rejects.toThrow(DirectiveError);
      await expect(handler.handle(processingContext)).rejects.toHaveProperty('cause', resolutionError);
    });
    
    it('should handle variable resolution failure in template', async () => {
        const nonExistentVarNode: VariableReferenceNode = { type: 'VariableReference', identifier: 'nonExistent', valueType: VariableType.TEXT, isVariableReference: true, location: createLocation(1, 20) };
        const templateNodes: InterpolatableValue = [ createTextNode('Value is: '), nonExistentVarNode ];
        const node = createEmbedDirective( templateNodes, undefined, createLocation(1, 1), 'embedTemplate' );
        const processingContext = createMockProcessingContext(node);
        const resolutionError = new Error('Var not found in template');
        vi.spyOn(resolutionService, 'resolveNodes').mockRejectedValue(resolutionError);
        await expect(handler.handle(processingContext)).rejects.toThrow(DirectiveError);
        await expect(handler.handle(processingContext)).rejects.toHaveProperty('cause', resolutionError);
     });
  });

  describe('Path variables', () => {
    it('should handle user-defined path variables with $', async () => {
      const node = createEmbedDirective('$docsPath/file.txt', undefined, createLocation(1, 1), 'embedVariable');
      const processingContext = createMockProcessingContext(node);
      const resolvedContent = '/path/to/docs/file.txt';
      
      vi.spyOn(resolutionService, 'resolveInContext').mockResolvedValue(resolvedContent);
      const existsSpy = vi.spyOn(fileSystemService, 'exists');
      const readFileSpy = vi.spyOn(fileSystemService, 'readFile');

      const result = await handler.handle(processingContext) as DirectiveResult;
      
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith('$docsPath/file.txt', processingContext.resolutionContext);
      expect(existsSpy).not.toHaveBeenCalled();
      expect(readFileSpy).not.toHaveBeenCalled();
      expect(result).toHaveProperty('replacement');
      expect(result.stateChanges).toBeUndefined();
      const replacement = result.replacement;
      expect(replacement?.[0]).toEqual(expect.objectContaining({ type: 'Text', content: resolvedContent }));
    });
  });
  
  describe('Variable reference embeds', () => {
    it('should handle simple variable reference embeds', async () => {
      const node = createEmbedDirective('{{textVar}}', undefined, createLocation(1, 1), 'embedVariable');
      const processingContext = createMockProcessingContext(node);
      const resolvedValue = 'Resolved Text';
      vi.spyOn(resolutionService, 'resolveInContext').mockResolvedValue(resolvedValue);
      
      const result = await handler.handle(processingContext) as DirectiveResult;
      
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith('{{textVar}}', processingContext.resolutionContext);
      expect(result).toHaveProperty('replacement');
      expect(result.stateChanges).toBeUndefined();
      const replacement = result.replacement;
      expect(replacement?.[0]).toEqual(expect.objectContaining({ type: 'Text', content: resolvedValue }));
    });

    it('should handle data variable reference embeds (using dot notation)', async () => {
      const node = createEmbedDirective('{{dataVar.user.name}}', undefined, createLocation(1, 1), 'embedVariable');
      const processingContext = createMockProcessingContext(node);
      const resolvedValue = 'Alice';
      vi.spyOn(resolutionService, 'resolveInContext').mockResolvedValue(resolvedValue);
      
      const result = await handler.handle(processingContext) as DirectiveResult;
      
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith('{{dataVar.user.name}}', processingContext.resolutionContext);
      expect(result).toHaveProperty('replacement');
      expect(result.stateChanges).toBeUndefined();
      const replacement = result.replacement;
      expect(replacement?.[0]).toEqual(expect.objectContaining({ type: 'Text', content: resolvedValue }));
    });
  });

  describe('Template literal embeds', () => {
      it('should embed resolved template literal content', async () => {
        // Manually create the node to ensure type correctness
        const nameVarNode: VariableReferenceNode = {
            type: 'VariableReference', // Explicit type
            identifier: 'dataVar.user.name',
            valueType: VariableType.DATA, // Correct enum value
          isVariableReference: true, 
            location: createLocation(1,1) // Location object
            // fields: undefined // Optional fields if needed
        };
        const templateNodes: InterpolatableValue = [
            createTextNode('User: '),
            nameVarNode // Use the manually created node
        ];
        const node = createEmbedDirective(templateNodes, undefined, createLocation(1, 1), 'embedTemplate');
        const processingContext = createMockProcessingContext(node);
        const resolvedValue = 'User: Alice'; 
        vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValue(resolvedValue);

        const result = await handler.handle(processingContext) as DirectiveResult;

        expect(resolutionService.resolveNodes).toHaveBeenCalledWith(templateNodes, processingContext.resolutionContext);
        expect(result).toHaveProperty('replacement');
        expect(result.stateChanges).toBeUndefined();
        const replacement = result.replacement;
        expect(replacement?.[0]).toEqual(expect.objectContaining({ type: 'Text', content: resolvedValue }));
     });
  });

  describe('Transformation mode', () => {
      it('should return replacement node when transformation is enabled', async () => {
        const node = createEmbedDirective('./content.md', undefined, createLocation(), 'embedPath');
        const processingContext = createMockProcessingContext(node);
        const resolvedPath = createMeldPath('./content.md', unsafeCreateValidatedResourcePath('/path/to/content.md'));
        const fileContent = 'File content for transform';

        vi.spyOn(stateService, 'isTransformationEnabled').mockReturnValue(true);
        vi.spyOn(resolutionService, 'resolvePath').mockResolvedValue(resolvedPath);
        vi.spyOn(fileSystemService, 'exists').mockResolvedValue(true);
        vi.spyOn(fileSystemService, 'readFile').mockResolvedValue(fileContent);

        const result = await handler.handle(processingContext) as DirectiveResult;

        expect(result).toBeDefined();
        expect(result).not.toBe(stateService);
        expect(result).toHaveProperty('replacement');
        expect(result.stateChanges).toBeUndefined();
        const replacement = result.replacement;
        expect(replacement?.[0]).toEqual(expect.objectContaining({ type: 'Text', content: fileContent }));
    });

     it('should return only state when transformation is disabled', async () => {
        const node = createEmbedDirective('./content.md', undefined, createLocation(), 'embedPath');
        const processingContext = createMockProcessingContext(node);
        const resolvedPath = createMeldPath('./content.md', unsafeCreateValidatedResourcePath('/path/to/content.md'));
        const fileContent = 'File content no transform';

        vi.spyOn(stateService, 'isTransformationEnabled').mockReturnValue(false);
        vi.spyOn(resolutionService, 'resolvePath').mockResolvedValue(resolvedPath);
        vi.spyOn(fileSystemService, 'exists').mockResolvedValue(true);
        vi.spyOn(fileSystemService, 'readFile').mockResolvedValue(fileContent);

        const result = await handler.handle(processingContext) as DirectiveResult;

        expect(result).toBeDefined();
        expect(result).toHaveProperty('replacement');
        expect(result.stateChanges).toBeUndefined();
        const replacement = result.replacement;
        expect(replacement?.[0]).toEqual(expect.objectContaining({ type: 'Text', content: fileContent }));
     });
  });
}); 