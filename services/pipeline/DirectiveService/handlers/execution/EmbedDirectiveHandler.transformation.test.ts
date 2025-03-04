import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DirectiveNode, DirectiveData, MeldNode } from 'meld-spec';
import { EmbedDirectiveHandler, type ILogger } from './EmbedDirectiveHandler.js';
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
import { createNodeFromExample } from '@core/syntax/helpers';

/**
 * MIGRATION NOTES:
 * 
 * This file has been migrated to use centralized syntax examples where possible.
 * 
 * Some key observations from the migration:
 * 
 * 1. For tests with basic embed directives, we use centralized syntax examples.
 * 
 * 2. For tests requiring specific options or behaviors, we either:
 *    - Use centralized examples with appropriate options if available
 *    - Continue using createEmbedDirective where needed for specialized cases
 * 
 * 3. For error handling tests, we use appropriate invalid examples from the centralized examples.
 */

/**
 * Creates a DirectiveNode from example code string
 * 
 * @param code - The directive code to parse
 * @returns The parsed DirectiveNode
 */
async function createNodeFromExample(code: string): Promise<DirectiveNode> {
  try {
    const { parse } = await import('meld-ast');
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
    console.error('Error parsing with meld-ast:', error);
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
  let validationService: IValidationService;
  let resolutionService: IResolutionService;
  let stateService: IStateService;
  let circularityService: ICircularityService;
  let fileSystemService: IFileSystemService;
  let parserService: IParserService;
  let interpreterService: IInterpreterService;
  let clonedState: IStateService;
  let childState: IStateService;

  beforeEach(() => {
    validationService = {
      validate: vi.fn()
    } as unknown as IValidationService;

    childState = {
      setTextVar: vi.fn(),
      setDataVar: vi.fn(),
      setPathVar: vi.fn(),
      setCommand: vi.fn(),
      clone: vi.fn(),
      mergeChildState: vi.fn(),
      isTransformationEnabled: vi.fn().mockReturnValue(true)
    } as unknown as IStateService;

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
    } as unknown as IStateService;

    stateService = {
      setTextVar: vi.fn(),
      setDataVar: vi.fn(),
      setPathVar: vi.fn(),
      setCommand: vi.fn(),
      clone: vi.fn().mockReturnValue(clonedState),
      createChildState: vi.fn().mockReturnValue(childState),
      isTransformationEnabled: vi.fn().mockReturnValue(true),
      transformNode: vi.fn()
    } as unknown as IStateService;

    resolutionService = {
      resolveInContext: vi.fn(),
      extractSection: vi.fn()
    } as unknown as IResolutionService;

    circularityService = {
      beginImport: vi.fn(),
      endImport: vi.fn()
    } as unknown as ICircularityService;

    fileSystemService = {
      exists: vi.fn(),
      readFile: vi.fn(),
      dirname: vi.fn().mockReturnValue('/workspace'),
      join: vi.fn().mockImplementation((...args) => args.join('/')),
      normalize: vi.fn().mockImplementation(path => path)
    } as unknown as IFileSystemService;

    parserService = {
      parse: vi.fn()
    } as unknown as IParserService;

    interpreterService = {
      interpret: vi.fn().mockResolvedValue(childState)
    } as unknown as IInterpreterService;

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
        location: node.location
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
        location: node.location
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
        location: node.location
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
        location: node.location
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
        location: node.location
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
          type: 'TextVar',
          identifier: 'content'
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
        location: node.location
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
          type: 'DataVar',
          identifier: 'role',
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
        location: embedNode.location
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
  });
}); 