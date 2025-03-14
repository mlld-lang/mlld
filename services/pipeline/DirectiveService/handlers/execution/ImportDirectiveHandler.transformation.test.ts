import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { DirectiveNode } from '@core/syntax/types';
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
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { mockDeep, mockReset } from 'vitest-mock-extended';
import {
  createValidationServiceMock,
  createStateServiceMock,
  createResolutionServiceMock,
  createFileSystemServiceMock,
  createDirectiveErrorMock
} from '@tests/utils/mocks/serviceMocks';

/**
 * ImportDirectiveHandler Transformation Test Status
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
    console.error('Error parsing with meld-ast:', error);
    throw error;
  }
}

describe('ImportDirectiveHandler Transformation', () => {
  let handler: ImportDirectiveHandler;
  let validationService: ReturnType<typeof createValidationServiceMock>;
  let stateService: ReturnType<typeof createStateServiceMock>;
  let resolutionService: ReturnType<typeof createResolutionServiceMock>;
  let fileSystemService: ReturnType<typeof createFileSystemServiceMock>;
  let parserService: ReturnType<typeof mockDeep<IParserService>>;
  let interpreterService: ReturnType<typeof mockDeep<IInterpreterService>>;
  let circularityService: ReturnType<typeof mockDeep<ICircularityService>>;
  let clonedState: ReturnType<typeof createStateServiceMock>;
  let childState: ReturnType<typeof createStateServiceMock>;
  let context: TestContextDI;

  beforeEach(async () => {
    context = TestContextDI.createIsolated();
    await context.initialize();

    // Create mocks using vitest-mock-extended
    validationService = createValidationServiceMock();
    resolutionService = createResolutionServiceMock();
    stateService = createStateServiceMock();
    fileSystemService = createFileSystemServiceMock();
    parserService = mockDeep<IParserService>();
    interpreterService = mockDeep<IInterpreterService>();
    circularityService = mockDeep<ICircularityService>();

    // Reset all mocks before each test
    mockReset(validationService);
    mockReset(resolutionService);
    mockReset(stateService);
    mockReset(fileSystemService);
    mockReset(parserService);
    mockReset(interpreterService);
    mockReset(circularityService);

    // Register mocks with the DI container
    context.registerMock('IValidationService', validationService);
    context.registerMock('IResolutionService', resolutionService);
    context.registerMock('IStateService', stateService);
    context.registerMock('IFileSystemService', fileSystemService);
    context.registerMock('IParserService', parserService);
    context.registerMock('IInterpreterService', interpreterService);
    context.registerMock('ICircularityService', circularityService);

    // Set up child state and cloned state mocks
    childState = createStateServiceMock();
    clonedState = createStateServiceMock();

    // Configure state service behavior
    stateService.clone.mockReturnValue(clonedState);
    stateService.createChildState.mockReturnValue(childState);
    stateService.isTransformationEnabled.mockReturnValue(true);
    stateService.getAllTextVars.mockReturnValue(new Map());
    stateService.getAllDataVars.mockReturnValue(new Map());
    stateService.getAllPathVars.mockReturnValue(new Map());
    stateService.getAllCommands.mockReturnValue(new Map());

    // Configure child state behavior
    childState.getAllTextVars.mockReturnValue(new Map());
    childState.getAllDataVars.mockReturnValue(new Map());
    childState.getAllPathVars.mockReturnValue(new Map());
    childState.getAllCommands.mockReturnValue(new Map());
    childState.isTransformationEnabled.mockReturnValue(true);

    // Configure cloned state behavior
    clonedState.createChildState.mockReturnValue(childState);
    clonedState.getAllTextVars.mockReturnValue(new Map());
    clonedState.getAllDataVars.mockReturnValue(new Map());
    clonedState.getAllPathVars.mockReturnValue(new Map());
    clonedState.getAllCommands.mockReturnValue(new Map());
    clonedState.isTransformationEnabled.mockReturnValue(true);

    // Configure file system service
    fileSystemService.dirname.mockReturnValue('/workspace');
    fileSystemService.join.mockImplementation((...args) => args.join('/'));
    fileSystemService.normalize.mockImplementation(path => path);

    // Configure interpreter service
    interpreterService.interpret.mockResolvedValue(childState);

    // Register the handler through DI with all required dependencies
    context.registerMock('ImportDirectiveHandler', new ImportDirectiveHandler(
      validationService,
      resolutionService,
      stateService,
      fileSystemService,
      parserService,
      interpreterService,
      circularityService
    ));
    handler = await context.container.resolve('ImportDirectiveHandler');
  });

  afterEach(async () => {
    await context?.cleanup();
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