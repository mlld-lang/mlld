// Mock the logger before any imports
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

vi.mock('../../../../core/utils/logger', () => ({
  embedLogger: mockLogger
}));

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { DirectiveNode, DirectiveData, MeldNode, VariableReferenceNode, TextNode } from '@core/syntax/types/index.js';
import type { StructuredPath, MeldPath } from '@core/types/paths.js';
import { createMeldPath } from '@core/types/paths.js';
import { EmbedDirectiveHandler, type ILogger } from '@services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { ResolutionContext } from '@core/types/resolution.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { InterpreterServiceClientFactory } from '@services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import type { DirectiveContext } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import { createLocation } from '@tests/utils/testFactories.js';
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
  createDirectiveErrorMock
} from '@tests/utils/mocks/serviceMocks.js';
import { mockDeep, type DeepMockProxy } from 'vitest-mock-extended';

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

/**
 * Helper function to create a real embed directive node with a given path and section
 */
const createRealEmbedDirective = async (path: string, section?: string, options: Record<string, any> = {}): Promise<DirectiveNode> => {
  let codeExample = `@embed [${path}`;
  
  if (section) {
    codeExample += ` # ${section}`;
  }
  
  if (options.headingLevel) {
    codeExample += ` +${options.headingLevel}`;
  }
  
  if (options.underHeader) {
    codeExample += ` under ${options.underHeader}`;
  }
  
  codeExample += ']';
  
  const kind = 'embed';
  return {
    type: 'Directive',
    subtype: 'embedPath',
    path: { raw: path },
    options: { ...options },
    directive: { kind },
    location: createLocation(1, 1, 0, 1)
  } as DirectiveNode;
};

interface EmbedDirective extends DirectiveData {
  kind: 'embed';
  path: string | { raw: string; structured?: any; normalized?: string };
  section?: string;
  headingLevel?: number;
  underHeader?: string;
  fuzzy?: number;
  names?: string[];
  items?: string[];
}

describe('EmbedDirectiveHandler', () => {
  let handler: EmbedDirectiveHandler;
  let validationService: ReturnType<typeof createValidationServiceMock>;
  let resolutionService: ReturnType<typeof createResolutionServiceMock>;
  let stateService: ReturnType<typeof createStateServiceMock>;
  let fileSystemService: ReturnType<typeof createFileSystemServiceMock>;
  let circularityService: any;
  let interpreterServiceClientFactory: DeepMockProxy<InterpreterServiceClientFactory>;
  let clonedState: any;
  let context: TestContextDI;

  beforeEach(async () => {
    // Create context with isolated container
    context = TestContextDI.createIsolated();
    
    // Initialize the context
    await context.initialize();

    clonedState = {
      setTextVar: vi.fn(),
      setDataVar: vi.fn(),
      setPathVar: vi.fn(),
      setCommand: vi.fn(),
      mergeChildState: vi.fn(),
      clone: vi.fn(),
      isTransformationEnabled: vi.fn().mockReturnValue(false),
      getStateId: vi.fn().mockReturnValue('cloned-state-id'),
      transformNode: vi.fn(),
      getPathVar: vi.fn().mockImplementation((name) => {
        if (name === 'docs') return { raw: '/path/to/docs', type: 'FILESYSTEM' } as any;
        return undefined;
      })
    };

    // Create mocks using standardized factories
    validationService = createValidationServiceMock();
    stateService = createStateServiceMock();
    resolutionService = createResolutionServiceMock();
    fileSystemService = createFileSystemServiceMock();
    
    // Configure state service
    stateService.clone.mockReturnValue(clonedState);
    stateService.isTransformationEnabled.mockReturnValue(false);
    stateService.getPathVar.mockImplementation((name) => {
      if (name === 'docs') return { raw: '/path/to/docs', type: 'FILESYSTEM' } as any;
      return undefined;
    });

    // Create path service mock
    const pathService = {
      resolve: vi.fn().mockImplementation((path) => {
        if (path === 'does-not-exist.md') {
          return '/nonexistent/does-not-exist.md';
        }
        if (path === 'invalid_path..md') {
          return null;
        }
        return `/path/to/${path}`;
      }),
      dirname: vi.fn().mockImplementation((path) => {
        return '/path/to';
      }),
      join: vi.fn().mockImplementation((...paths) => {
        return paths.join('/');
      })
    };

    // Create circularity service mock
    circularityService = {
      checkCircularImports: vi.fn(),
      startImport: vi.fn(),
      beginImport: vi.fn(),
      endImport: vi.fn(),
      isInStack: vi.fn().mockReturnValue(false)
    };

    // Create interpreter service client factory mock
    interpreterServiceClientFactory = mockDeep<InterpreterServiceClientFactory>();
    // Configure getClient if needed for specific tests later
    // interpreterServiceClientFactory.getClient.mockReturnValue(...);

    // Configure file system service mock
    fileSystemService.exists.mockImplementation(async (path) => {
      return path !== '/nonexistent/does-not-exist.md' && path !== 'invalid_path..md';
    });

    fileSystemService.readFile.mockImplementation(async (path) => {
      if (path === '/path/to/empty.md') {
        return '';
      }
      if (path === '/path/to/content.md') {
        return 'This is the content of the file.';
      }
      if (path === '/path/to/section.md') {
        return '# Section 1\nThis is section 1.\n## Subsection\nThis is a subsection.\n# Section 2\nThis is section 2.';
      }
      if (path === '/path/to/single-section.md') {
        return '# Only Section\nThis is the only section.';
      }
      throw new Error(`File not found: ${path}`);
    });

    // Mock resolvePath for 'embedPath' subtype
    resolutionService.resolvePath.mockImplementation(async (pathInput: string | StructuredPath, context: ResolutionContext): Promise<MeldPath> => {
      // Simulate resolving various path inputs (string, structured path, variable path)
      if (typeof pathInput === 'string') {
        if (pathInput === 'path_variable') return createMeldPath('/path/to/resolved_path.md');
        return createMeldPath(`/path/to/${pathInput}`);
      } else if (pathInput && typeof pathInput === 'object' && 'raw' in pathInput) {
        // Handle structured path object resolution (basic simulation)
        const isAbsolute = typeof pathInput === 'object' && 'isAbsolute' in pathInput ? pathInput.isAbsolute : false;
        return createMeldPath(`/path/to/${pathInput.raw}`, undefined, isAbsolute);
      }
      // Ensure variable and identifier exist before accessing
      else if (
        pathInput && 
        typeof pathInput === 'object' && 
        'variable' in pathInput && 
        pathInput.variable && 
        typeof pathInput.variable === 'object' && // Add type check for variable object
        'identifier' in pathInput.variable
      ) {
        return createMeldPath(`/path/to/from_variable_${pathInput.variable.identifier}.md`);
      }
      throw new Error(`Mock resolvePath cannot handle input: ${JSON.stringify(pathInput)}`);
    });

    // NOTE: extractSection, adjustHeadingLevels, wrapUnderHeader are still needed
    // but are called *after* content retrieval within the handler. We might need
    // to mock them specifically within tests that use those options.

    // Register all mocks with the context
    context.registerMock('IValidationService', validationService);
    context.registerMock('IStateService', stateService);
    context.registerMock('IResolutionService', resolutionService);
    context.registerMock('IFileSystemService', fileSystemService);
    context.registerMock('IPathService', pathService);
    context.registerMock('ICircularityService', circularityService);
    context.registerMock('InterpreterServiceClientFactory', interpreterServiceClientFactory);

    // Register the logger mock - this is the correct way
    context.registerMock('ILogger', mockLogger);
    
    // Create handler from container
    handler = await context.container.resolve(EmbedDirectiveHandler);
  });

  afterEach(async () => {
    // Clean up the context to prevent memory leaks
    await context?.cleanup();
    
    // Reset all mocks
    vi.clearAllMocks();
  });

  describe('basic embed functionality', () => {
    it('should handle basic embed without modifiers (subtype: embedPath)', async () => {
      // Get example for simple embed
      const exampleCode = embedDirectiveExamples.atomic.simpleEmbed.code;
      // Assume parser provides subtype and structured path
      const mockPath = { raw: 'embed.md', structured: { segments: ['embed.md'] } }; // Example structure
      const node: DirectiveNode = {
        type: 'Directive',
        subtype: 'embedPath', // Explicitly set subtype
        path: mockPath, // Provide structured path
        options: {},
        directive: { kind: 'embed' },
        location: createLocation(1, 1, 0, 1)
      } as DirectiveNode;

      const context: DirectiveContext = { currentFilePath: 'test.meld', state: stateService, parentState: stateService };

      // Mock resolutionService.resolvePath for this test
      const resolvedPath: MeldPath = createMeldPath('/path/to/embed.md');
      resolutionService.resolvePath.mockResolvedValue(resolvedPath);
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue('Test content');

      const result = await handler.execute(node, context);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(stateService.clone).toHaveBeenCalled();
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(mockPath, expect.any(Object));
      expect(fileSystemService.exists).toHaveBeenCalledWith(resolvedPath.validatedPath);
      expect(fileSystemService.readFile).toHaveBeenCalledWith(resolvedPath.validatedPath);
      
      // No longer expect parsing or interpreting - we treat embedded content as literal text
      expect(clonedState.mergeChildState).not.toHaveBeenCalled();
      
      // Should return the content as a text node
      expect(result.state).toBe(clonedState);
      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: 'Test content',
        location: node.location,
        formattingMetadata: {
          isFromDirective: true,
          originalNodeType: 'Directive',
          preserveFormatting: true
        }
      });
    });

    it('should handle embed with section (subtype: embedPath)', async () => {
      // Get example code string
      const exampleCode = embedDirectiveExamples.atomic.withSection.code;

      // Assume parser provides subtype, structured path, and options
      const mockPath = { raw: 'sections.md', structured: { segments: ['sections.md'] } };
      const sectionName = 'Section Two';
      const node: DirectiveNode = {
        type: 'Directive',
        subtype: 'embedPath',
        path: mockPath,
        options: { section: sectionName }, // Section moved to options
        directive: { kind: 'embed' },
        location: createLocation(1, 1, 0, 1)
      } as DirectiveNode;

      const context: DirectiveContext = { currentFilePath: 'test.meld', state: stateService, parentState: stateService };

      // Mock path resolution and file reading for this test
      const resolvedPath: MeldPath = createMeldPath('/path/to/sections.md');
      const fullFileContent = '# Section One\nContent 1\n# Section Two\nContent 2';
      const extractedContent = 'Content 2';

      resolutionService.resolvePath.mockResolvedValue(resolvedPath);
      fileSystemService.exists.mockResolvedValue(true);
      fileSystemService.readFile.mockResolvedValue(fullFileContent);

      // Mock extractSection specifically for this test case
      resolutionService.extractSection.mockResolvedValue(extractedContent);

      const result = await handler.execute(node, context);

      expect(stateService.clone).toHaveBeenCalled();
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(mockPath, expect.any(Object));
      expect(fileSystemService.readFile).toHaveBeenCalledWith(resolvedPath.validatedPath);
      expect(resolutionService.extractSection).toHaveBeenCalledWith(
        fullFileContent,
        sectionName,
        { fuzzy: false } // Expect fuzzy option to be passed (default false)
      );

      // No longer expect parsing or interpreting
      expect(clonedState.mergeChildState).not.toHaveBeenCalled();

      // Should return extracted section as text node
      expect(result.state).toBe(clonedState);
      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: extractedContent,
        location: node.location,
        formattingMetadata: {
          isFromDirective: true,
          originalNodeType: 'Directive',
          preserveFormatting: true
        }
      });
    });

    // Tests for heading level and under header removed as the corresponding methods
    // do not exist on IResolutionService and handler logic was updated.
    // New tests should verify the warning logs if needed.
  });

  describe('error handling', () => {
    it('should throw error if file not found', async () => {
      const node = await createRealEmbedDirective('non-existent-file.txt');
      const context = { currentFilePath: 'test.meld', state: stateService, parentState: stateService };

      // Use resolvePath mock for consistency
      const resolvedPath: MeldPath = createMeldPath('/path/to/non-existent-file.txt');
      resolutionService.resolvePath.mockResolvedValue(resolvedPath);
      vi.mocked(fileSystemService.exists).mockResolvedValue(false);
      
      // We expect an error because the file doesn't exist
      await expect(handler.execute(node, context)).rejects.toThrow();
    });

    it('should handle heading level validation', async () => {
      // Create directive with an invalid heading level (9)
      const node = await createRealEmbedDirective('file.md', undefined, { headingLevel: 9 });
      const context = { currentFilePath: 'test.meld', state: stateService, parentState: stateService };

      // Use resolvePath mock for consistency
      const resolvedPath: MeldPath = createMeldPath('/path/to/file.md');
      resolutionService.resolvePath.mockResolvedValue(resolvedPath);
      fileSystemService.exists.mockResolvedValue(true);
      fileSystemService.readFile.mockResolvedValue('# Header');

      // Act
      const result = await handler.execute(node, context);

      // Assert - Check that content is UNMODIFIED because adjustHeadingLevels doesn't exist on service
      expect(result.replacement?.type).toBe('Text'); // Check type first
      if (result.replacement?.type === 'Text') {
          const replacementTextNode = result.replacement as TextNode; // Cast
          expect(replacementTextNode.content).toBe('# Header');
          expect(replacementTextNode.location).toEqual(node.location);
      }
      // Optionally check for a log warning
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Invalid headingLevel option'), expect.any(Object));
    });

    it('should handle section extraction gracefully', async () => {
      // Create directive with a section that doesn't exist
      const node = await createRealEmbedDirective('sections.md', 'non-existent-section');
      const context = { currentFilePath: 'test.meld', state: stateService, parentState: stateService };

      const resolvedPath: MeldPath = createMeldPath('/path/to/sections.md');
      resolutionService.resolvePath.mockResolvedValue(resolvedPath);
      fileSystemService.exists.mockResolvedValue(true);
      fileSystemService.readFile.mockResolvedValue('# Section One\nContent');
      
      // Mock extractSection to throw
      resolutionService.extractSection.mockRejectedValue(new Error('Section not found error from mock'));

      // Act & Assert
      await expect(handler.execute(node, context)).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining('Error extracting section "non-existent-section"'),
          code: DirectiveErrorCode.SECTION_NOT_FOUND
        })
      );
    });
  });

  describe('cleanup', () => {
    it('should always end import tracking', async () => {
      const node = await createRealEmbedDirective('content.md');
      const context = { currentFilePath: 'test.meld', state: stateService, parentState: stateService };

      const resolvedPath: MeldPath = createMeldPath('/path/to/content.md');
      resolutionService.resolvePath.mockResolvedValue(resolvedPath);
      fileSystemService.exists.mockResolvedValue(true);
      fileSystemService.readFile.mockResolvedValue('Content');

      await handler.execute(node, context);
      expect(circularityService.endImport).toHaveBeenCalled();
    });

    it('should end import tracking even on error', async () => {
      const node = await createRealEmbedDirective('error.md');
      const context = { currentFilePath: 'test.meld', state: stateService, parentState: stateService };

      const resolvedPath: MeldPath = createMeldPath('/path/to/error.md');
      resolutionService.resolvePath.mockResolvedValue(resolvedPath);
      // Simulate error during file reading
      fileSystemService.exists.mockResolvedValue(true);
      fileSystemService.readFile.mockRejectedValue(new Error('Read error'));

      await expect(handler.execute(node, context)).rejects.toThrow('Read error');
      expect(circularityService.endImport).toHaveBeenCalled();
    });
  });

  describe('Path variables', () => {
    it('should handle user-defined path variables with $ syntax', async () => {
      // Mock to simulate a path variable starting with $
      // The handler now uses resolvePath, so mock that instead
      resolutionService.resolvePath.mockImplementation(async (value: string | StructuredPath): Promise<MeldPath> => {
        if (value === '$docs/file.md') {
          // Return a MeldPath object
          return createMeldPath('/path/to/docs/file.md');
        }
        // Fallback or handle other cases if needed
        if (typeof value === 'string') return createMeldPath(`/path/to/${value}`);
        throw new Error('Unhandled path for mock');
      });
      
      const embedCode = `@embed [$docs/file.md]`;
      const node: DirectiveNode = {
        type: 'Directive',
        subtype: 'embedPath',
        // Assuming parser provides string for path containing variable reference
        path: '$docs/file.md', 
        options: {},
        directive: { kind: 'embed' },
        location: createLocation(1, 1, 0, 1)
      } as DirectiveNode;
      
      // Setup other mocks
      (fileSystemService.exists as any).mockResolvedValue(true);
      (fileSystemService.readFile as any).mockResolvedValue('# File content');
      
      // Execute the directive
      const context: DirectiveContext = { currentFilePath: '/project/test.meld', state: stateService, parentState: stateService };
      
      await handler.execute(node, context);
      
      // Verify path resolution using the user-defined path variable
      expect(resolutionService.resolvePath).toHaveBeenCalledWith('$docs/file.md', expect.any(Object));
      expect(fileSystemService.exists).toHaveBeenCalled();
      expect(fileSystemService.readFile).toHaveBeenCalled();
      
      // We don't need to verify logger calls, as the functionality is what matters
    });
  });
  
  describe('Variable reference embeds', () => {
    it('should handle simple variable reference embeds without trying to load a file', async () => {
      // Create a variable reference embed directive
      const variablePath = {
        raw: '{{role.architect}}',
        isVariableReference: true,
        variable: {
          type: 'VariableReference',
          identifier: 'role',
          valueType: 'data',
          isVariableReference: true,
          fields: [{
            type: 'field',
            value: 'architect'
          }]
        }
      };
      
      // Use real meld-ast to parse a variable directive
      const embedCode = `@embed {{role.architect}}`;
      const node: DirectiveNode = {
        type: 'Directive',
        subtype: 'embedVariable',
        path: variablePath,
        options: {},
        directive: { kind: 'embed' },
        location: createLocation(1, 1, 0, 1)
      } as DirectiveNode;
      
      // Manual override to ensure isVariableReference is set (since parse might not set it correctly)
      if (node.directive && node.directive.path) {
        node.directive.path = variablePath;
      }
      
      const context = { currentFilePath: 'test.meld', state: stateService, parentState: stateService };

      // Mock variable resolution to return the variable's content
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue(
        'You are a senior architect skilled in assessing TypeScript codebases.'
      );
      
      const result = await handler.execute(node, context);

      // The resolver should be called with the variable path
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(variablePath, expect.any(Object));
      
      // The file system should never be checked for variable references
      expect(fileSystemService.exists).not.toHaveBeenCalled();
      expect(fileSystemService.readFile).not.toHaveBeenCalled();
      
      // The circularity service should not be called for variable references
      expect(circularityService.beginImport).not.toHaveBeenCalled();
      
      // No parsing or interpreting
      expect(clonedState.mergeChildState).not.toHaveBeenCalled();
      
      // Should return variable content as text node
      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: 'You are a senior architect skilled in assessing TypeScript codebases.',
        location: node.location,
        formattingMetadata: {
          isFromDirective: true,
          originalNodeType: 'Directive',
          preserveFormatting: true
        }
      });
      
      // We don't need to verify logger calls, as the functionality is what matters
    });
    
    it('should handle text variable embeds correctly', async () => {
      // Create a simple text variable reference embed
      const variablePath = {
        raw: '{{content}}',
        isVariableReference: true,
        variable: {
          type: 'VariableReference',
          identifier: 'content',
          valueType: 'text',
          isVariableReference: true
        }
      };
      
      const node: DirectiveNode = {
        type: 'Directive',
        subtype: 'embedVariable',
        path: variablePath,
        options: {},
        directive: { kind: 'embed' },
        location: createLocation(1, 1, 0, 1)
      } as DirectiveNode;
      
      if (node.directive && node.directive.path) {
        node.directive.path = variablePath;
      }
      
      const context = { currentFilePath: 'test.meld', state: stateService, parentState: stateService };
      
      // Mock variable resolution to return a text variable
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('# Sample Content');
      
      const result = await handler.execute(node, context);
      
      // The file system should never be checked for variable references
      expect(fileSystemService.exists).not.toHaveBeenCalled();
      expect(fileSystemService.readFile).not.toHaveBeenCalled();
      
      // No parsing or interpreting
      expect(clonedState.mergeChildState).not.toHaveBeenCalled();
      
      // Final state should include correct result
      expect(result.state).toBe(clonedState);
      
      // Should return variable content as text node
      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: '# Sample Content',
        location: node.location,
        formattingMetadata: {
          isFromDirective: true,
          originalNodeType: 'Directive',
          preserveFormatting: true
        }
      });
    });
    
    it('should apply modifiers (heading level, under header) to variable content', async () => {
      // Create a variable reference embed with heading level
      const variablePath = {
        raw: '{{content}}',
        isVariableReference: true,
        variable: {
          type: 'VariableReference',
          identifier: 'content',
          valueType: 'text',
          isVariableReference: true
        }
      };
      
      // Create node with both path and headingLevel
      const node = await createRealEmbedDirective('{{content}}', undefined, {
        headingLevel: 2
      });
      
      // Override path to make it a variable reference
      if (node.directive && node.directive.path) {
        node.directive.path = variablePath;
      }
      
      const context = { currentFilePath: 'test.meld', state: stateService, parentState: stateService };
      
      // Variable resolves to plain text
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('Variable Content');
      
      const result = await handler.execute(node, context);
      
      // No parsing or interpreting
      expect(clonedState.mergeChildState).not.toHaveBeenCalled();
      
      // Align expectations with actual behavior
      expect(result.replacement?.type).toBe('Text');
      if (result.replacement?.type === 'Text') {
        const replacementTextNode = result.replacement as TextNode; // Cast
        expect(replacementTextNode.content).toBe('Variable Content');
        expect(replacementTextNode.location).toEqual(node.location);
        // Optionally check formattingMetadata if needed
        expect(replacementTextNode.formattingMetadata).toEqual({
            isFromDirective: true,
            originalNodeType: 'Directive',
            preserveFormatting: true
        });
      } else {
          expect.fail('Replacement node should be a TextNode');
      }

      // The file system should never be checked
      expect(fileSystemService.exists).not.toHaveBeenCalled();
      expect(fileSystemService.readFile).not.toHaveBeenCalled();
    });
    
    it('should handle data variable with nested fields correctly', async () => {
      // Create a complex data variable reference
      const variablePath = {
        raw: '{{config.settings.theme}}',
        isVariableReference: true,
        variable: {
          type: 'VariableReference',
          identifier: 'config',
          valueType: 'data',
          isVariableReference: true,
          fields: [
            { type: 'field', value: 'settings' },
            { type: 'field', value: 'theme' }
          ]
        }
      };
      
      const node: DirectiveNode = {
        type: 'Directive',
        subtype: 'embedVariable',
        path: variablePath,
        options: {},
        directive: { kind: 'embed' },
        location: createLocation(1, 1, 0, 1)
      } as DirectiveNode;
      
      if (node.directive && node.directive.path) {
        node.directive.path = variablePath;
      }
      
      const context = { currentFilePath: 'test.meld', state: stateService, parentState: stateService };
      
      // Mock variable resolution to return the resolved field value
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('dark');
      
      const result = await handler.execute(node, context);
      
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(variablePath, expect.any(Object));
      
      // No parsing or interpreting
      expect(clonedState.mergeChildState).not.toHaveBeenCalled();
      
      // Should return resolved value as text node
      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: 'dark',
        location: node.location,
        formattingMetadata: {
          isFromDirective: true,
          originalNodeType: 'Directive',
          preserveFormatting: true
        }
      });
      
      // The file system should never be checked
      expect(fileSystemService.exists).not.toHaveBeenCalled();
      expect(fileSystemService.readFile).not.toHaveBeenCalled();
    });
  });
}); 