import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { DirectiveNode, DirectiveData, MeldNode } from '@core/syntax/types.js';
import { EmbedDirectiveHandler, type ILogger } from '@services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { createLocation, createEmbedDirective } from '@tests/utils/testFactories.js';
// Import centralized syntax examples and helpers
import { 
  embedDirectiveExamples
} from '@core/syntax/index.js';
import { createNodeFromExample } from '@core/syntax/helpers.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import {
  createValidationServiceMock,
  createStateServiceMock,
  createResolutionServiceMock,
  createFileSystemServiceMock,
  createDirectiveErrorMock
} from '@tests/utils/mocks/serviceMocks.js';

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

/**
 * Creates a DirectiveNode from example code string
 * 
 * @param code - The directive code to parse
 * @returns The parsed DirectiveNode
 */
async function createNodeFromExample(code: string): Promise<DirectiveNode> {
  try {
    const { parse } = await import('@core/ast');
    const result = await parse(code, {
      trackLocations: true,
      validateNodes: true,
      // @ts-expect-error - structuredPaths is used but may be missing from typings
      structuredPaths: true
    });
    
    const nodes = result.ast || [];
    if (!nodes || nodes.length === 0) {
      throw new Error(`Failed to parse example: ${code}`);
    }
    
    // The first node should be our directive
    const directiveNode = nodes[0];
    if (directiveNode.type !== 'Directive') {
      throw new Error(`Example did not produce a directive node: ${code}`);
    }
    
    return directiveNode as DirectiveNode;
  } catch (error) {
    console.error('Error parsing with @core/ast:', error);
    throw error;
  }
}

// Mock the logger
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

vi.mock('../../../../core/utils/logger', () => ({
  embedLogger: mockLogger
}));

describe('EmbedDirectiveHandler Transformation', () => {
  let handler: EmbedDirectiveHandler;
  let validationService: ReturnType<typeof createValidationServiceMock>;
  let resolutionService: ReturnType<typeof createResolutionServiceMock>;
  let stateService: ReturnType<typeof createStateServiceMock>;
  let fileSystemService: ReturnType<typeof createFileSystemServiceMock>;
  let circularityService: any;
  let parserService: any;
  let interpreterService: any;
  let clonedState: any;
  let childState: any;
  let context: TestContextDI;

  beforeEach(() => {
    // Create context with isolated container
    context = TestContextDI.create({ isolatedContainer: true });

    childState = {
      setTextVar: vi.fn(),
      setDataVar: vi.fn(),
      setPathVar: vi.fn(),
      setCommand: vi.fn(),
      clone: vi.fn(),
      mergeChildState: vi.fn(),
      isTransformationEnabled: vi.fn().mockReturnValue(true)
    };

    clonedState = {
      setTextVar: vi.fn(),
      setDataVar: vi.fn(),
      setPathVar: vi.fn(),
      setCommand: vi.fn(),
      createChildState: vi.fn().mockReturnValue(childState),
      mergeChildState: vi.fn(),
      clone: vi.fn(),
      isTransformationEnabled: vi.fn().mockReturnValue(true),
      transformNode: vi.fn()
    };

    // Create mocks using standardized factories
    validationService = createValidationServiceMock();
    stateService = createStateServiceMock();
    resolutionService = createResolutionServiceMock();
    fileSystemService = createFileSystemServiceMock();
    
    // Configure state service
    stateService.clone.mockReturnValue(clonedState);
    stateService.createChildState.mockReturnValue(childState);
    stateService.isTransformationEnabled.mockReturnValue(true);
    stateService.transformNode = vi.fn();

    circularityService = {
      beginImport: vi.fn(),
      endImport: vi.fn()
    };

    // Configure file system service
    fileSystemService.dirname.mockReturnValue('/workspace');
    fileSystemService.join.mockImplementation((...args) => args.join('/'));
    fileSystemService.normalize.mockImplementation(path => path);

    parserService = {
      parse: vi.fn()
    };

    interpreterService = {
      interpret: vi.fn().mockResolvedValue(childState)
    };

    // Create handler directly with the mocks
    handler = new EmbedDirectiveHandler(
      validationService,
      resolutionService,
      stateService,
      circularityService,
      fileSystemService,
      parserService,
      interpreterService,
      mockLogger
    );
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  describe('transformation behavior', () => {
    it('should return replacement node with file contents when transformation enabled', async () => {
      // MIGRATION: Using centralized syntax example
      const example = embedDirectiveExamples.atomic.simpleEmbed;
      const node = await createNodeFromExample(example.code);
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('doc.md');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue('Test content');
      vi.mocked(parserService.parse).mockResolvedValue([]);

      const result = await handler.execute(node, context);

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
      expect(result.state).toBe(clonedState);
    });

    it('should handle section extraction in transformation', async () => {
      // MIGRATION: Using centralized syntax example with section
      const example = embedDirectiveExamples.atomic.withSection;
      const node = await createNodeFromExample(example.code);
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext)
        .mockResolvedValueOnce('sections.md')
        .mockResolvedValueOnce('Section Two');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue('# Content');
      vi.mocked(resolutionService.extractSection).mockResolvedValue('# Introduction\nContent');

      const result = await handler.execute(node, context);

      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: '# Introduction\nContent',
        location: node.location,
        formattingMetadata: {
          isFromDirective: true,
          originalNodeType: 'Directive',
          preserveFormatting: true
        }
      });
    });

    it('should handle heading level in transformation', async () => {
      // MIGRATION: Need to continue using direct node creation for heading level test
      // The complexOptions example doesn't parse correctly in this context
      const node = createEmbedDirective('doc.md', undefined, createLocation(1, 1), {
        headingLevel: 2
      });
      node.directive.path = 'doc.md';
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('doc.md');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue('Test content');

      const result = await handler.execute(node, context);

      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: '## Test content',
        location: node.location,
        formattingMetadata: {
          isFromDirective: true,
          originalNodeType: 'Directive',
          preserveFormatting: true
        }
      });
    });

    it('should handle under header in transformation', async () => {
      // MIGRATION: Need to continue using direct node creation
      const node = {
        type: 'Directive',
        directive: {
          kind: 'embed',
          options: {
            underHeader: 'My Header'
          }
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 1 }
        }
      };
      node.directive.path = 'doc.md';
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('doc.md');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue('Test content');

      const result = await handler.execute(node, context);

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

    it('should handle variable interpolation in path during transformation', async () => {
      // MIGRATION: Need to continue using direct node creation for variable path test
      // The withVariablePath example doesn't parse correctly in this context
      const node = createEmbedDirective('{{filename}}.md', undefined, createLocation(1, 1));
      node.directive.path = '{{filename}}.md';
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('resolved.md');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue('Variable content');

      const result = await handler.execute(node, context);

      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: 'Variable content',
        location: node.location,
        formattingMetadata: {
          isFromDirective: true,
          originalNodeType: 'Directive',
          preserveFormatting: true
        }
      });
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(
        '{{filename}}.md',
        expect.any(Object)
      );
    });
    
    it('should handle variable reference embeds in transformation mode', async () => {
      // Create a variable reference embed
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
      
      // Create the node
      const node = await createNodeFromExample(`@embed {{content}}`);
      if (node.directive && node.directive.path) {
        node.directive.path = variablePath;
      }
      
      const context = { 
        currentFilePath: 'test.meld', 
        state: stateService,
        parentState: stateService
      };
      
      // The variable resolves to text content
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('Variable Content');
      
      const result = await handler.execute(node, context);
      
      // Should directly use variable value as content
      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: 'Variable Content',
        location: node.location,
        formattingMetadata: {
          isFromDirective: true,
          originalNodeType: 'Directive',
          preserveFormatting: true
        }
      });
      
      // No file operations should happen
      expect(fileSystemService.exists).not.toHaveBeenCalled();
      expect(fileSystemService.readFile).not.toHaveBeenCalled();
    });
    
    it('should handle data variable field embeds in transformation mode', async () => {
      // Create a variable reference embed directly instead of trying to parse the example
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
      
      // Create the directive node with the variable reference path
      const embedNode = {
        type: 'Directive',
        directive: {
          kind: 'embed',
          path: variablePath
        },
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 20 } }
      } as DirectiveNode;
      
      const context = { 
        currentFilePath: 'test.meld', 
        state: stateService,
        parentState: stateService
      };
      
      // Variable resolves to the content string
      vi.mocked(resolutionService.resolveInContext)
        .mockResolvedValue('You are a senior architect skilled in TypeScript.');
      
      const result = await handler.execute(embedNode, context);
      
      // Should use variable value directly
      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: 'You are a senior architect skilled in TypeScript.',
        location: embedNode.location,
        formattingMetadata: {
          isFromDirective: true,
          originalNodeType: 'Directive',
          preserveFormatting: true
        }
      });
      
      // No file operations should happen
      expect(fileSystemService.exists).not.toHaveBeenCalled();
      expect(fileSystemService.readFile).not.toHaveBeenCalled();
    });

    it('should preserve error handling during transformation', async () => {
      // MIGRATION: Using centralized invalid example for file not found
      const invalidExample = embedDirectiveExamples.invalid.fileNotFound;
      const node = await createNodeFromExample(invalidExample.code);
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('missing.md');
      vi.mocked(fileSystemService.exists).mockResolvedValue(false);

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
      expect(circularityService.endImport).toHaveBeenCalled();
    });

    it('should handle circular imports during transformation', async () => {
      // MIGRATION: Using centralized example for simple embed in circular import scenario
      const example = embedDirectiveExamples.atomic.simpleEmbed;
      const node = await createNodeFromExample(example.code);
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('circular.md');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(circularityService.beginImport).mockImplementation(() => {
        throw new DirectiveError('Circular import detected', 'embed', DirectiveErrorCode.CIRCULAR_IMPORT);
      });

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
    });

    it('should properly transform variable-based embed directive with field access', async () => {
      // Create a complex data object
      const userData = {
        user: {
          name: 'Test User',
          profile: {
            bio: 'This is a test bio.',
            contact: {
              email: 'test@example.com',
              phone: '555-1234'
            }
          },
          settings: {
            theme: 'dark',
            notifications: true
          }
        }
      };

      // Mock the state service to return the data object
      stateService.getDataVar.mockImplementation((name) => {
        if (name === 'userData') {
          return userData;
        }
        return undefined;
      });
      stateService.isTransformationEnabled.mockReturnValue(true);

      // Create a variable reference embed directive with field access
      const varReference = {
        identifier: 'userData',
        content: 'userData.user.profile.bio',
        isVariableReference: true
      };

      const node = createEmbedDirective(varReference, undefined, createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      // Mock the resolution service to return the field value
      resolutionService.resolveInContext.mockResolvedValue('This is a test bio.');
      resolutionService.resolveFieldAccess.mockResolvedValue('This is a test bio.');
      resolutionService.convertToFormattedString.mockResolvedValue('This is a test bio.');

      // Execute the handler
      const result = await handler.execute(node, context);

      // Verify the result
      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: 'This is a test bio.',
        location: node.location,
        formattingMetadata: {
          isFromDirective: true,
          originalNodeType: 'Directive',
          preserveFormatting: true
        }
      });

      // Verify transformation was registered correctly on the cloned state
      // Not on the original stateService
      expect(clonedState.transformNode).toHaveBeenCalledWith(node, result.replacement);
    });

    it('should properly transform variable-based embed directive with object field access', async () => {
      // Create a complex data object
      const userData = {
        user: {
          name: 'Test User',
          profile: {
            bio: 'This is a test bio.',
            contact: {
              email: 'test@example.com',
              phone: '555-1234'
            }
          }
        }
      };

      // Mock the state service to return the data object
      stateService.getDataVar.mockImplementation((name) => {
        if (name === 'userData') {
          return userData;
        }
        return undefined;
      });
      stateService.isTransformationEnabled.mockReturnValue(true);

      // Create a variable reference embed directive with field access to an object
      const varReference = {
        identifier: 'userData',
        content: 'userData.user.profile.contact',
        isVariableReference: true
      };

      const node = createEmbedDirective(varReference, undefined, createLocation(1, 1));
      const context = { currentFilePath: 'test.meld', state: stateService };

      // Mock the resolution service to return the field value (an object)
      const contactObject = { email: 'test@example.com', phone: '555-1234' };
      resolutionService.resolveInContext.mockResolvedValue(JSON.stringify(contactObject, null, 2));
      resolutionService.resolveFieldAccess.mockResolvedValue(contactObject);
      resolutionService.convertToFormattedString.mockResolvedValue(
        JSON.stringify(contactObject, null, 2)
      );

      // Execute the handler
      const result = await handler.execute(node, context);

      // Verify the result
      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: JSON.stringify(contactObject, null, 2),
        location: node.location,
        formattingMetadata: {
          isFromDirective: true,
          originalNodeType: 'Directive',
          preserveFormatting: true
        }
      });

      // Verify transformation was registered correctly on the cloned state
      // Not on the original stateService
      expect(clonedState.transformNode).toHaveBeenCalledWith(node, result.replacement);
    });
  });
}); 