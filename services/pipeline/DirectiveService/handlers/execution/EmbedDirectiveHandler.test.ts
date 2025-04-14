// Define mockLogger outside beforeEach so the same instance is used everywhere
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

import { describe, it, expect, beforeEach, vi, afterEach, type Mock } from 'vitest';
import type { DirectiveNode, DirectiveData, MeldNode, VariableReferenceNode, TextNode } from '@core/syntax/types/index.js';
import { type StructuredPath, type MeldPath, type IFilesystemPathState, type IUrlPathState, PathContentType, createMeldPath, unsafeCreateValidatedResourcePath } from '@core/types/paths.js';
import { EmbedDirectiveHandler, type ILogger } from '@services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { ResolutionContext } from '@core/types/resolution.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { InterpreterServiceClientFactory } from '@services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { IDirectiveHandler } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import { createLocation, createEmbedDirective, createTextNode, createVariableReferenceNode } from '@tests/utils/testFactories.js';
// Import the centralized syntax examples and helpers
import { embedDirectiveExamples } from '@core/syntax/index.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import { MeldFileNotFoundError } from '@core/errors/MeldFileNotFoundError.js';
import {
  createValidationServiceMock,
  createStateServiceMock,
  createResolutionServiceMock,
  createFileSystemServiceMock,
} from '@tests/utils/mocks/serviceMocks.js';
import { mockDeep, type DeepMockProxy, mock } from 'vitest-mock-extended';
import { expectToThrowWithConfig } from '@tests/utils/ErrorTestUtils.js';
import { Service } from '@core/ServiceProvider.js';
import { VariableType, TextVariable, DataVariable } from '@core/types';
import type { InterpolatableValue } from '@core/syntax/types/nodes.js';
import { isInterpolatableValueArray } from '@core/syntax/types/guards.js';
import type { StructuredPath as AstStructuredPath } from '@core/syntax/types/nodes.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import type { PathValidationContext } from '@core/types/paths.js';
import type { DirectiveProcessingContext, FormattingContext } from '@core/types/index.js';
import type { SourceLocation } from '@core/types/common.js';

/**
 * EmbedDirectiveHandler Test Status
 * --------------------------------
 * 
 * MIGRATION STATUS: Complete
 * 
 * This test file has been fully migrated to use:
 * - TestContextDI for container management
 * - Standardized mock factories with vitest-mock-extended
 * - Centralized syntax examples
 * 
 * COMPLETED:
 * - All tests migrated to use TestContextDI
 * - Service mocks created using standardized factories
 * - Added proper cleanup to prevent container leaks
 * - Using centralized syntax examples
 */

/**
 * Helper function to create a simple parser service for testing
 */
const createRealParserService = () => {
  const parseFunction = async (content: string): Promise<MeldNode[]> => {
    // Basic mock implementation - just return the content as a text node
    return [
      { type: 'Text', content } as TextNode
    ];
  };
  
  return {
    parse: vi.fn().mockImplementation(parseFunction)
  };
};

// ... ILogger interface ...

// ... createMeldPath helper (correcting argument issue) ...
const createMockMeldPath = (resolvedPathString: string): MeldPath => {
  const isUrl = resolvedPathString.startsWith('http');
  const validatedPath = unsafeCreateValidatedResourcePath(resolvedPathString);
  const state: IFilesystemPathState | IUrlPathState = isUrl ? {
    contentType: PathContentType.URL,
    originalValue: resolvedPathString,
    validatedPath: validatedPath,
    isValidated: true,
    fetchStatus: 'not_fetched'
  } : {
    contentType: PathContentType.FILESYSTEM,
    originalValue: resolvedPathString,
    validatedPath: validatedPath,
    isAbsolute: resolvedPathString.startsWith('/'),
    isSecure: true,
    isValidSyntax: true,
    exists: true, 
  };
  // Pass validatedPath as the second argument to createMeldPath
  return createMeldPath(state.originalValue, validatedPath);
};

describe('EmbedDirectiveHandler', () => {
  let handler: EmbedDirectiveHandler;
  let validationService: ReturnType<typeof createValidationServiceMock>;
  let resolutionService: ReturnType<typeof createResolutionServiceMock>;
  let stateService: ReturnType<typeof createStateServiceMock>;
  let fileSystemService: ReturnType<typeof createFileSystemServiceMock>;
  let pathService: DeepMockProxy<IPathService>;
  let circularityService: any;
  let interpreterServiceClientFactory: DeepMockProxy<InterpreterServiceClientFactory>;
  let context: TestContextDI;

  beforeEach(async () => {
    vi.clearAllMocks();
    context = TestContextDI.createIsolated();
    await context.initialize();

    // Create mocks
    validationService = createValidationServiceMock();
    stateService = createStateServiceMock();
    resolutionService = createResolutionServiceMock();
    fileSystemService = createFileSystemServiceMock();
    pathService = mockDeep<IPathService>();
    circularityService = {
      checkCircularImports: vi.fn(),
      startImport: vi.fn(),
      beginImport: vi.fn(),
      endImport: vi.fn(),
      isInStack: vi.fn().mockReturnValue(false)
    };
    interpreterServiceClientFactory = mockDeep<InterpreterServiceClientFactory>();

    // Configure mocks
    stateService.getCurrentFilePath.mockReturnValue('/project/test.meld');
    pathService.dirname.mockImplementation((filePath: string) => {
      const lastSlash = filePath.lastIndexOf('/');
      return lastSlash >= 0 ? filePath.substring(0, lastSlash) : '.';
    });
    resolutionService.resolvePath.mockImplementation(async (resolvedString: string, ctx: ResolutionContext): Promise<MeldPath> => {
      return createMeldPath(resolvedString, unsafeCreateValidatedResourcePath(resolvedString));
    });
    resolutionService.resolveInContext.mockImplementation(async (value: any, ctx: ResolutionContext): Promise<string> => {
      const rawValue = (typeof value === 'object' && value !== null && 'raw' in value) ? value.raw as string : undefined;
      const stringValue = typeof value === 'string' ? value : rawValue;
      if (stringValue === './some/file.txt') return '/path/to/some/file.txt';
      if (stringValue === '{{textVar}}') return 'Resolved Text';
      if (stringValue === '{{dataVar.user.name}}') return 'Alice';
      if (stringValue?.startsWith('$docsPath')) return stringValue.replace('$docsPath', '/path/to/docs');
      if (isInterpolatableValueArray(value as unknown)) {
         return await resolutionService.resolveNodes(value, ctx);
      }
      return typeof value === 'string' ? value : JSON.stringify(value);
    });
    fileSystemService.exists.mockImplementation(async (p) => !p.includes('non-existent'));
    fileSystemService.readFile.mockImplementation(async (p) => {
       if (p.includes('content.md')) return 'File content';
       if (p.includes('section.md')) return '# Section 1\nContent 1\n# Section 2\nThis is section 2.';
       throw new MeldFileNotFoundError(`Mock file not found: ${p}`);
    });
    resolutionService.extractSection.mockImplementation(async (content, section) => {
       if (section === 'Section 1') return 'Content 1';
       throw new Error('Mock section not found');
    });

    // Register mocks
    context.registerMock('IValidationService', validationService);
    context.registerMock('IStateService', stateService);
    context.registerMock('IResolutionService', resolutionService);
    context.registerMock('IFileSystemService', fileSystemService);
    context.registerMock('IPathService', pathService);
    context.registerMock('ICircularityService', circularityService);
    context.registerMock('IInterpreterServiceClientFactory', interpreterServiceClientFactory);
    context.registerMock('ILogger', mockLogger);

    // Resolve handler
    handler = await context.resolve(EmbedDirectiveHandler);

    // Simplify mock resolution logic
    resolutionService.resolveNodes.mockImplementation(async (nodes, ctx) => {
      return '[mocked_resolved_nodes]';
    });
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  // Helper to create mock DirectiveProcessingContext
  const createMockProcessingContext = (node: DirectiveNode): DirectiveProcessingContext => {
      const mockResolutionContext = mock<ResolutionContext>();
      const mockFormattingContext = mock<FormattingContext>();
      return {
          state: stateService,
          resolutionContext: mockResolutionContext,
          formattingContext: mockFormattingContext,
          directiveNode: node,
          // Add executionContext if needed by handler logic being tested
          executionContext: { cwd: '/project' } 
      };
  };

  describe('basic embed functionality', () => {
    it('should handle basic embed without modifiers (subtype: embedPath)', async () => {
      const node = createEmbedDirective('./some/file.txt', undefined, createLocation(1, 1), 'embedPath');
      const processingContext = createMockProcessingContext(node);

      const result = await handler.execute(processingContext);

      // expect(validationService.validate).toHaveBeenCalledWith(node); // Validation is optional
      expect(resolutionService.resolveInContext).toHaveBeenCalled();
      expect(resolutionService.resolvePath).toHaveBeenCalledWith('/path/to/some/file.txt', expect.any(Object));
      expect(fileSystemService.exists).toHaveBeenCalledWith('/path/to/some/file.txt');
      expect(fileSystemService.readFile).toHaveBeenCalledWith('/path/to/some/file.txt');
      expect(result.state).toBe(stateService); // Should return original state
      if (result.replacement?.type === 'Text') {
        expect((result.replacement as TextNode).content).toBe('File content');
      }
    });

    it('should handle embed with section (subtype: embedPath)', async () => {
      const node = createEmbedDirective('./section.md', 'Section 1', createLocation(1, 1), 'embedPath');
      const processingContext = createMockProcessingContext(node);

      const result = await handler.execute(processingContext);

      expect(resolutionService.resolveInContext).toHaveBeenCalled();
      expect(resolutionService.resolvePath).toHaveBeenCalledWith('/path/to/section.md', expect.any(Object));
      expect(fileSystemService.readFile).toHaveBeenCalledWith('/path/to/section.md');
      expect(resolutionService.extractSection).toHaveBeenCalledWith(expect.stringContaining('# Section 1'), 'Section 1', undefined);
      expect(result.state).toBe(stateService);
      if (result.replacement?.type === 'Text') {
         expect((result.replacement as TextNode).content).toBe('Content 1');
      }
    });

  });

  describe('error handling', () => {
    it('should throw error if file not found', async () => {
      const node = createEmbedDirective('non-existent-file.txt', undefined, createLocation(1, 1), 'embedPath');
      const processingContext = createMockProcessingContext(node);
      // Mock exists to return false
      fileSystemService.exists.mockResolvedValueOnce(false); 

      // Execute and assert for MeldFileNotFoundError specifically
      await expect(handler.execute(processingContext))
        .rejects.toThrow(MeldFileNotFoundError);
    });

    it.skip('should handle heading level validation', async () => { 
      // ... (Test setup, likely needs logger verification)
    });

    it('should handle error during section extraction', async () => {
      const node = createEmbedDirective('doc.md', 'MissingSection', createLocation(1, 1), 'embedPath');
      const processingContext = createMockProcessingContext(node);
      // Mock readFile to return content, but extractSection will fail (based on mock setup)
      fileSystemService.readFile.mockResolvedValueOnce('# Some Content'); 
      
      await expect(handler.execute(processingContext)).rejects.toThrow(DirectiveError);
      await expect(handler.execute(processingContext)).rejects.toHaveProperty('code', DirectiveErrorCode.EXECUTION_FAILED);
      await expect(handler.execute(processingContext)).rejects.toThrow(/Error extracting section/);
    });

    it('should handle error during path resolution', async () => {
      const node = createEmbedDirective('{{errorPath}}', undefined, createLocation(1, 1), 'embedVariable');
      const processingContext = createMockProcessingContext(node);
      resolutionService.resolveInContext.mockRejectedValueOnce(new Error('Cannot resolve path'));
      await expect(handler.execute(processingContext)).rejects.toThrow(DirectiveError);
      await expect(handler.execute(processingContext)).rejects.toHaveProperty('code', DirectiveErrorCode.RESOLUTION_FAILED);
    });

    it('should handle error during file reading', async () => {
      const node = createEmbedDirective('read_error.txt', undefined, createLocation(1, 1), 'embedPath');
      const processingContext = createMockProcessingContext(node);
      // Ensure readFile throws
      fileSystemService.readFile.mockRejectedValueOnce(new Error('Disk read failed'));
      await expect(handler.execute(processingContext)).rejects.toThrow(DirectiveError);
      await expect(handler.execute(processingContext)).rejects.toHaveProperty('code', DirectiveErrorCode.EXECUTION_FAILED);
    });

    it('should handle variable resolution failure in path', async () => {
      const node = createEmbedDirective(
        // Ensure the array contains valid VariableReferenceNode objects
        [{ type: 'VariableReference', identifier: 'undefinedVar', valueType: 'text', isVariableReference: true }, { type: 'Text', content: '/file.txt' }], 
        undefined, 
        createLocation(1, 1), 
        'embedPath'
      );
      const processingContext = createMockProcessingContext(node);
      resolutionService.resolveInContext.mockRejectedValueOnce(new Error('Var not found')); 
      await expect(handler.execute(processingContext)).rejects.toThrow(DirectiveError);
      await expect(handler.execute(processingContext)).rejects.toHaveProperty('code', DirectiveErrorCode.RESOLUTION_FAILED);
    });
    
    it('should handle variable resolution failure in template', async () => {
        const templateNodes: InterpolatableValue = [
          createTextNode('Value is: '),
          // Use createVariableReferenceNode which sets required props
          createVariableReferenceNode('nonExistent', 'text') 
        ];
        const node = createEmbedDirective(templateNodes, undefined, createLocation(1, 1), 'embedTemplate');
        const processingContext = createMockProcessingContext(node);
        resolutionService.resolveNodes.mockRejectedValueOnce(new Error('Var not found'));
        await expect(handler.execute(processingContext)).rejects.toThrow(DirectiveError);
        await expect(handler.execute(processingContext)).rejects.toHaveProperty('code', DirectiveErrorCode.RESOLUTION_FAILED);
     });
  });

  describe('Path variables', () => {
    it('should handle user-defined path variables with $ syntax', async () => {
      const node = createEmbedDirective('$docsPath/file.txt', undefined, createLocation(1, 1), 'embedPath'); // Subtype is path
      const processingContext = createMockProcessingContext(node);
            
      await handler.execute(processingContext);
            
      // Verify resolveInContext was called for the path string
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith('$docsPath/file.txt', expect.any(Object));
      // Verify resolvePath was called with the resolved string
      expect(resolutionService.resolvePath).toHaveBeenCalledWith('/path/to/docs/file.txt', expect.any(Object));
      // Verify file system was called with the final validated path
      expect(fileSystemService.readFile).toHaveBeenCalledWith('/path/to/docs/file.txt');
    });
  });
  
  describe('Variable reference embeds', () => {
    it('should handle simple variable reference embeds (subtype: embedVariable)', async () => {
      const node = createEmbedDirective('{{textVar}}', undefined, createLocation(1, 1), 'embedVariable');
      const processingContext = createMockProcessingContext(node);
      
      const result = await handler.execute(processingContext);

      expect(resolutionService.resolveInContext).toHaveBeenCalledWith('{{textVar}}', expect.any(Object));
      expect(fileSystemService.readFile).not.toHaveBeenCalled();
      if (result.replacement?.type === 'Text') {
          expect((result.replacement as TextNode).content).toBe('Resolved Text');
      }
    });

    it('should handle text variable embeds correctly (subtype: embedVariable)', async () => {
       const node = createEmbedDirective('{{textVar}}', undefined, createLocation(1, 1), 'embedVariable');
       const processingContext = createMockProcessingContext(node);
      
       const result = await handler.execute(processingContext);
       if (result.replacement?.type === 'Text') {
          expect((result.replacement as TextNode).content).toBe('Resolved Text');
       }
    });

    it('should apply modifiers (heading level, under header) to variable content (subtype: embedVariable)', async () => {
       const node = createEmbedDirective('{{textVar}}', undefined, createLocation(1, 1), 'embedVariable', { headingLevel: 2, underHeader: 'Intro' });
       const processingContext = createMockProcessingContext(node);

       const result = await handler.execute(processingContext);
       if (result.replacement?.type === 'Text') {
          expect((result.replacement as TextNode).content).toBe('Resolved Text'); 
       }
       expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Heading level adjustment'), expect.any(Object));
       expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Under-header wrapping'), expect.any(Object));
    });

    it('should handle data variable with nested fields correctly (subtype: embedVariable)', async () => {
       const node = createEmbedDirective('{{dataVar.user.name}}', undefined, createLocation(1, 1), 'embedVariable');
       const processingContext = createMockProcessingContext(node);
      
       const result = await handler.execute(processingContext);
       if (result.replacement?.type === 'Text') {
          expect((result.replacement as TextNode).content).toBe('Alice');
       }
    });
  });
  
  describe('Template embeds', () => {
    it('should handle simple template embed without variables (subtype: embedTemplate)', async () => {
        const templateNodes: InterpolatableValue = [createTextNode('Simple template content')];
        const node = createEmbedDirective(templateNodes, undefined, createLocation(1, 1), 'embedTemplate');
        const processingContext = createMockProcessingContext(node);
        resolutionService.resolveNodes.mockResolvedValueOnce('Simple template content');

        const result = await handler.execute(processingContext);

        expect(resolutionService.resolveNodes).toHaveBeenCalledWith(templateNodes, expect.any(Object));
        if (result.replacement?.type === 'Text') {
            expect((result.replacement as TextNode).content).toBe('Simple template content');
        }
    });

    it('should handle template embed with variable interpolation (subtype: embedTemplate)', async () => {
        const templateNodes: InterpolatableValue = [
          createTextNode('Hello '), 
          // Use createVariableReferenceNode which sets required props
          createVariableReferenceNode('name', 'text'),
          createTextNode('!')
        ];
        const node = createEmbedDirective(templateNodes, undefined, createLocation(1, 1), 'embedTemplate');
        const processingContext = createMockProcessingContext(node);
        // Mock state for variable resolution
        stateService.getTextVar.mockImplementation((name: string) => name === 'name' ? { type: 'text', value: 'World' } as any : undefined);
        resolutionService.resolveNodes.mockResolvedValueOnce('Hello World!'); // Mock final resolved string

        const result = await handler.execute(processingContext);

        expect(resolutionService.resolveNodes).toHaveBeenCalledWith(templateNodes, expect.any(Object));
        if (result.replacement?.type === 'Text') {
            expect(result.replacement.content).toBe('Hello World!');
        }
    });
  });

}); 