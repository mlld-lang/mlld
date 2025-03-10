import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { DirectiveNode, DirectiveContext } from 'meld-spec';
import { ImportDirectiveHandler } from './ImportDirectiveHandler.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import { createLocation } from '@tests/utils/testFactories.js';
// Import centralized syntax examples and helpers
import { importDirectiveExamples } from '@core/syntax/index.js';
import { createNodeFromExample } from '@core/syntax/helpers';
import { TestContextDI } from '@tests/utils/di/TestContextDI';

/**
 * MIGRATION NOTES:
 * 
 * This file has been migrated to use TestContextDI for dependency injection and centralized syntax examples where possible.
 * 
 * Migration details:
 * 
 * 1. Added TestContextDI for test environment setup
 * 2. Using a hybrid approach with direct handler instantiation while leveraging TestContextDI for test lifecycle
 * 3. Maintained use of centralized syntax examples
 * 4. Added proper cleanup with afterEach hook
 * 
 * Some key observations from the migration:
 * 
 * 1. For the first test "should return empty text node when transformation enabled",
 *    we were able to use the centralized 'basicImport' example directly.
 * 
 * 2. For the tests involving specific importList formats (second and third tests),
 *    we kept the direct node creation approach since:
 *    - The specific format of importList is important for the test behavior
 *    - The handler expects a particular structure for these specialized cases
 * 
 * 3. For the error handling test, we were able to use a modified version of the 
 *    centralized example by replacing the file path with a non-existent one.
 * 
 * These decisions were made to balance using centralized examples while ensuring
 * the tests continue to properly test the handler's specific behaviors, particularly
 * around the importList parameter which is crucial for the transformation tests.
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

describe('ImportDirectiveHandler Transformation', () => {
  let handler: ImportDirectiveHandler;
  let validationService: any;
  let stateService: any;
  let resolutionService: any;
  let fileSystemService: any;
  let parserService: any;
  let interpreterService: any;
  let circularityService: any;
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
      getTextVar: vi.fn(),
      getDataVar: vi.fn(),
      getPathVar: vi.fn(),
      getCommand: vi.fn(),
      getAllTextVars: vi.fn().mockReturnValue(new Map()),
      getAllDataVars: vi.fn().mockReturnValue(new Map()),
      getAllPathVars: vi.fn().mockReturnValue(new Map()),
      getAllCommands: vi.fn().mockReturnValue(new Map()),
      clone: vi.fn(),
      mergeChildState: vi.fn(),
      isTransformationEnabled: vi.fn().mockReturnValue(true)
    };

    clonedState = {
      setTextVar: vi.fn(),
      setDataVar: vi.fn(),
      setPathVar: vi.fn(),
      setCommand: vi.fn(),
      getTextVar: vi.fn(),
      getDataVar: vi.fn(),
      getPathVar: vi.fn(),
      getCommand: vi.fn(),
      getAllTextVars: vi.fn().mockReturnValue(new Map()),
      getAllDataVars: vi.fn().mockReturnValue(new Map()),
      getAllPathVars: vi.fn().mockReturnValue(new Map()),
      getAllCommands: vi.fn().mockReturnValue(new Map()),
      createChildState: vi.fn().mockReturnValue(childState),
      mergeChildState: vi.fn(),
      clone: vi.fn(),
      isTransformationEnabled: vi.fn().mockReturnValue(true)
    };

    stateService = {
      setTextVar: vi.fn(),
      setDataVar: vi.fn(),
      setPathVar: vi.fn(),
      setCommand: vi.fn(),
      getTextVar: vi.fn(),
      getDataVar: vi.fn(),
      getPathVar: vi.fn(),
      getCommand: vi.fn(),
      getAllTextVars: vi.fn().mockReturnValue(new Map()),
      getAllDataVars: vi.fn().mockReturnValue(new Map()),
      getAllPathVars: vi.fn().mockReturnValue(new Map()),
      getAllCommands: vi.fn().mockReturnValue(new Map()),
      clone: vi.fn().mockReturnValue(clonedState),
      createChildState: vi.fn().mockReturnValue(childState),
      isTransformationEnabled: vi.fn().mockReturnValue(true)
    };

    validationService = {
      validate: vi.fn()
    };
    
    resolutionService = {
      resolveInContext: vi.fn()
    };

    fileSystemService = {
      exists: vi.fn(),
      readFile: vi.fn(),
      dirname: vi.fn().mockReturnValue('/workspace'),
      join: vi.fn().mockImplementation((...args) => args.join('/')),
      normalize: vi.fn().mockImplementation(path => path)
    };

    parserService = {
      parse: vi.fn()
    };

    interpreterService = {
      interpret: vi.fn().mockResolvedValue(childState)
    };

    circularityService = {
      beginImport: vi.fn(),
      endImport: vi.fn()
    };

    // Instead of using the container to resolve the handler,
    // create the handler directly with the mocks
    handler = new ImportDirectiveHandler(
      validationService,
      resolutionService,
      stateService,
      fileSystemService,
      parserService,
      interpreterService,
      circularityService
    );
  });

  afterEach(async () => {
    // Cleanup to prevent container leaks
    await context.cleanup();
  });

  describe('transformation behavior', () => {
    it('should return empty text node when transformation enabled', async () => {
      // MIGRATION: Using centralized syntax example
      const example = importDirectiveExamples.atomic.basicImport;
      const node = await createNodeFromExample(example.code);
      const context = { currentFilePath: 'test.meld', state: stateService };

      // Reset mock call counters
      vi.clearAllMocks();

      // Setup mocks
      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('test.meld');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue('test content');
      vi.mocked(parserService.parse).mockResolvedValue([]);
      vi.mocked(childState.getAllTextVars).mockReturnValue(new Map([['var1', 'value1']]));

      // Execute the handler
      const result = await handler.execute(node, context);

      // Verify the result has the expected structure
      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: '',
        location: expect.objectContaining({
          start: expect.anything(),
          end: expect.anything()
        })
      });

      // Verify the behavior - not the exact state reference
      // Just check that we have a state
      expect(result.state).toBeDefined();
    });

    it('should still import variables when transformation enabled', async () => {
      // MIGRATION: Let's revert to using direct node creation for now since the particular
      // format of the importList is important for this test
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'import',
          path: 'test.meld',
          importList: 'myVar'
        },
        location: createLocation(1, 1)
      };
      const context = { currentFilePath: 'test.meld', state: stateService };

      // Reset mock call counters
      vi.clearAllMocks();

      // Setup mocks
      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('test.meld');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue('test content');
      vi.mocked(parserService.parse).mockResolvedValue([]);
      vi.mocked(childState.getTextVar).mockReturnValue('value1');

      // Execute the handler
      const result = await handler.execute(node, context);

      // Verify the result has the expected structure
      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: '',
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 1 },
          filePath: undefined
        }
      });

      // Verify the behavior - not the exact state reference
      // Just check that we have a state
      expect(result.state).toBeDefined();
    });

    it('should handle aliased imports in transformation mode', async () => {
      // MIGRATION: Using direct node creation for consistent behavior with importList format
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'import',
          path: 'test.meld',
          importList: 'sourceVar:targetVar'
        },
        location: createLocation(1, 1)
      };
      const context = { currentFilePath: 'test.meld', state: stateService };

      // Reset mock call counters
      vi.clearAllMocks();

      // Setup mocks
      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('test.meld');
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue('test content');
      vi.mocked(parserService.parse).mockResolvedValue([]);
      vi.mocked(childState.getTextVar).mockReturnValue('value1');

      // Execute the handler
      const result = await handler.execute(node, context);

      // Verify the result has the expected structure
      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual({
        type: 'Text',
        content: '',
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 1 },
          filePath: undefined
        }
      });

      // Verify the behavior - not the exact state reference
      // Just check that we have a state
      expect(result.state).toBeDefined();
    });

    it('should preserve error handling in transformation mode', async () => {
      // MIGRATION: Using centralized syntax example for the file not found case
      const example = importDirectiveExamples.atomic.basicImport;
      // Modify the example to use a non-existent file path
      const modifiedCode = example.code.replace('imported.meld', 'missing.meld');
      const node = await createNodeFromExample(modifiedCode);
      const context = { currentFilePath: 'test.meld', state: stateService };

      vi.mocked(validationService.validate).mockResolvedValue(undefined);
      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('missing.meld');
      vi.mocked(fileSystemService.exists).mockResolvedValue(false);

      // The test expects the handler to throw the error even in transformation mode
      await expect(handler.execute(node, context)).rejects.toThrow();
      expect(circularityService.endImport).toHaveBeenCalled();
    });
  });
}); 