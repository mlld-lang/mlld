import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockDeep, DeepMockProxy } from 'vitest-mock-extended';
import type { DirectiveNode, TextNode, PathValueObject, MeldNode, SourceLocation } from '@core/syntax/types/nodes';
import type { IDirectiveNode, PathPurpose, ValidatedResourcePath } from '@core/syntax/types/index';
import { VariableOrigin, type TextVariable, VariableType } from '@core/types/variables';
import { ImportDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IResolutionService, ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import type { IParserService } from '@services/pipeline/ParserService/IParserService';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService';
import type { DirectiveResult } from '@services/pipeline/DirectiveService/types';
import type { DirectiveContext } from '@services/pipeline/DirectiveService/IDirectiveService';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import { createTestLocation, createTestText, createTestDirective, createTestCodeFence } from '@tests/utils/nodeFactories';
import { expectToThrowWithConfig } from '@tests/utils/ErrorTestUtils';
import { importDirectiveExamples } from '@core/syntax/index';
import { createNodeFromExample } from '@core/syntax/helpers';
import { InterpreterServiceClientFactory } from '@services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory.js';
import type { IInterpreterServiceClient } from '@services/pipeline/InterpreterService/interfaces/IInterpreterServiceClient.js';
import type { MeldPath } from '@core/types/paths';
import { createMeldPath, unsafeCreateValidatedResourcePath } from '@core/types/paths';
import type { DirectiveProcessingContext, FormattingContext } from '@core/types/index.js';
import { DirectiveTestFixture, type DirectiveTestOptions } from '@tests/utils/fixtures/DirectiveTestFixture.js';
import { MockFactory } from '@tests/utils/mocks/MockFactory.js';
import type { IStateTrackingService } from '@tests/utils/debug/StateTrackingService/IStateTrackingService.js';
import { MeldFileNotFoundError } from '@core/errors/MeldFileNotFoundError.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';

// Mock the logger using vi.mock
const mockLoggerObject = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};
vi.mock('@core/utils/logger', () => ({
  directiveLogger: mockLoggerObject,
  importLogger: mockLoggerObject
}));

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
 * Creates a DirectiveNode from example code string (Local helper)
 * 
 * @param code - The directive code to parse
 * @returns The parsed DirectiveNode
 */
async function createNodeFromExampleLocal(code: string): Promise<DirectiveNode> {
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

// Helper to create a valid PathValueObject for tests
function createTestPathObject(rawPath: string, isUrl: boolean = false): PathValueObject {
  return {
    raw: rawPath,
    structured: {
      base: isUrl ? '' : '.',
      segments: rawPath.split('/').filter(s => s !== '.' && s !== ''),
      url: isUrl,
      variables: { text: [], special: [], path: [] }
    },
  };
}

// Helper to create a basic ImportDirectiveNode for tests
function createTestImportNode(options: {
  pathObject: PathValueObject;
  imports?: Array<{ name: string; alias?: string | null }>;
  subtype?: 'importAll' | 'importStandard' | 'importNamed';
  location?: SourceLocation;
}): DirectiveNode {
  const { pathObject, imports = [{ name: '*' }], subtype = 'importAll', location = createTestLocation(1, 1) } = options;
  return {
    type: 'Directive',
    directive: {
      kind: 'import',
      subtype,
      path: pathObject,
      imports,
    },
    location,
  };
}

describe('ImportDirectiveHandler Transformation', () => {
  const helpers = TestContextDI.createTestHelpers();
  let handler: ImportDirectiveHandler;
  let stateService: IStateService;
  let resolutionService: IResolutionService;
  let fileSystemService: IFileSystemService;
  let pathService: IPathService;
  let parserService: IParserService;
  let interpreterServiceClientFactory: InterpreterServiceClientFactory;
  let interpreterServiceClient: DeepMockProxy<IInterpreterServiceClient>;
  let circularityService: DeepMockProxy<ICircularityService>;
  let context: TestContextDI;
  let mockProcessingContext: Partial<DirectiveProcessingContext>;

  beforeEach(async () => {
    // Create deep mocks for services NOT handled by standard setup 
    // or needing specific mockDeep features
    circularityService = mockDeep<ICircularityService>();
    interpreterServiceClient = mockDeep<IInterpreterServiceClient>();
    // Configure necessary defaults on deep mocks
    circularityService.beginImport.mockImplementation(() => {});
    circularityService.endImport.mockImplementation(() => {});
    interpreterServiceClient.interpret.mockResolvedValue(MockFactory.createStateService()); // Default generic state

    // Setup context using helper, providing additional mocks
    context = helpers.setupWithStandardMocks({
      'ICircularityService': circularityService,
      'ILogger': mockLoggerObject,
      // We will spy on the factory provided by the standard setup
      // 'InterpreterServiceClientFactory': interpreterServiceClientFactory, 
      // Provide IParserService mock if not standard in setupWithStandardMocks
      'IParserService': MockFactory.createParserService(), 
    });
    await context.resolve('IFileSystemService'); // Ensure initialization

    // Resolve services needed from the context
    stateService = await context.resolve('IStateService');
    resolutionService = await context.resolve('IResolutionService');
    fileSystemService = await context.resolve('IFileSystemService');
    pathService = await context.resolve('IPathService');
    parserService = await context.resolve('IParserService'); 
    interpreterServiceClientFactory = await context.resolve('InterpreterServiceClientFactory'); // Resolve the standard one
    handler = await context.resolve(ImportDirectiveHandler); // Resolve handler via DI
    // We still need to mock the client returned by the FACTORY resolved from context
    vi.spyOn(interpreterServiceClientFactory, 'createClient').mockReturnValue(interpreterServiceClient);

    // Configure standard mocks provided by the context
    vi.spyOn(stateService, 'isTransformationEnabled').mockReturnValue(true); // ENABLE TRANSFORMATION
    vi.spyOn(stateService, 'createChildState').mockResolvedValue(MockFactory.createStateService({ setCurrentFilePath: vi.fn() })); // Simple mock for imported state
    vi.spyOn(stateService, 'getCurrentFilePath').mockReturnValue('/project/transform.meld');
    vi.spyOn(stateService, 'setTextVar');
    vi.spyOn(stateService, 'setDataVar');
    vi.spyOn(resolutionService, 'resolveInContext').mockImplementation(async (pathInput: string | PathValueObject, context?: ResolutionContext): Promise<string> => {
      const rawPath = typeof pathInput === 'string' ? pathInput : pathInput.raw;
      const currentFilePath = context?.currentFilePath ?? '/project/main.meld';
      const baseDir = currentFilePath.substring(0, currentFilePath.lastIndexOf('/'));
      return `${baseDir}/${rawPath}`.replace(/\/\//g, '/');
    });
    vi.spyOn(resolutionService, 'resolvePath').mockImplementation(async (pathInput: PathValueObject | string, context: ResolutionContext): Promise<MeldPath> => {
      const raw = typeof pathInput === 'string' ? pathInput : (pathInput as PathValueObject).raw;
      const currentPath = context?.currentFilePath ?? '/project/main.meld';
      const baseDir = currentPath.substring(0, currentPath.lastIndexOf('/'));
      const isUrl = raw.startsWith('http');
      const resolved = isUrl ? raw : `${baseDir}/${raw}`.replace(/\/\//g, '/');
      return createMeldPath(
        raw,
        unsafeCreateValidatedResourcePath(resolved),
        resolved.startsWith('/') || isUrl
      );
    });
    vi.spyOn(fileSystemService, 'exists').mockResolvedValue(true);
    vi.spyOn(fileSystemService, 'readFile').mockResolvedValue('');
    vi.spyOn(parserService, 'parse').mockResolvedValue([] as MeldNode[]);
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  // Updated helper to use resolved stateService
  const createMockProcessingContext = (node: DirectiveNode): Partial<DirectiveProcessingContext> => {
      const mockResolutionContext = mockDeep<ResolutionContext>();
      if (!stateService) {
        throw new Error('Test setup error: stateService is not defined');
      }
      mockResolutionContext.currentFilePath = stateService.getCurrentFilePath() ?? undefined;
      mockResolutionContext.state = stateService;
      // ... configure other context properties ...
      return {
          state: stateService, 
          resolutionContext: mockResolutionContext,
          directiveNode: node,
      };
  };

  describe('transformation behavior', () => {
    // TODO(mock-issue): Skipping due to complex DI/mock interaction issues (see Issue #39).
    it.skip('should return DirectiveResult with empty text node replacement when transformation enabled', async () => {
      const importPath = 'imported.meld';
      const finalPath = '/project/imported.meld';
      const importLocation = createTestLocation(5, 1);
      const node = createTestImportNode({
        pathObject: createTestPathObject(importPath),
        location: importLocation
      });
      // Configure necessary mocks on resolved services for this test case
      resolutionService.resolveInContext.mockImplementation(async (pathInput) => {
          if (typeof pathInput === 'object' && pathInput.raw === importPath) return finalPath;
          return `/project/${pathInput}`;
      });
      resolutionService.resolvePath.mockResolvedValue(createMeldPath(importPath, unsafeCreateValidatedResourcePath(finalPath), true));
      fileSystemService.readFile.mockResolvedValue('@text var1="value1"');
      const parsedNodes: MeldNode[] = []; 
      parserService.parse.mockResolvedValue(parsedNodes as any);
      // Configure the state returned by the interpreter mock
      const expectedResultState = MockFactory.createStateService({
          getAllTextVars: vi.fn().mockReturnValue(new Map([['var1', { name:'var1', value: 'value1' } as TextVariable]])),
          // Add other needed methods returning defaults
          getAllDataVars: vi.fn().mockReturnValue(new Map()),
          getAllPathVars: vi.fn().mockReturnValue(new Map()),
          getAllCommands: vi.fn().mockReturnValue(new Map()),
      });
      interpreterServiceClient.interpret.mockResolvedValueOnce(expectedResultState);

      mockProcessingContext = createMockProcessingContext(node);
      const result = await handler.handle(mockProcessingContext as DirectiveProcessingContext) as DirectiveResult;

      // Assertions
      expect(result.replacement).toEqual<TextNode>({
        type: 'Text',
        content: '', 
        location: importLocation
      });
      expect(stateService.setTextVar).toHaveBeenCalledWith('var1', 'value1'); // Check target state
    });

    // TODO(mock-issue): Skipping due to complex DI/mock interaction issues (see Issue #39).
    it.skip('should handle specific imports correctly in transformation mode', async () => {
      const importPath = 'vars.meld';
      const finalPath = '/project/vars.meld';
      const importLocation = createTestLocation(3, 1);

      const node = createTestImportNode({
        pathObject: createTestPathObject(importPath),
        imports: [{ name: 'var1' }, { name: 'var2', alias: 'alias2' }],
        subtype: 'importNamed',
        location: importLocation
      });

      // Configure necessary mocks on resolved services
      vi.spyOn(resolutionService, 'resolveInContext').mockImplementation(async (pathInput) => {
        if (typeof pathInput === 'object' && pathInput.raw === importPath) return finalPath;
        return `/project/${pathInput}`;
      });
      vi.spyOn(resolutionService, 'resolvePath').mockResolvedValue(createMeldPath(importPath, unsafeCreateValidatedResourcePath(finalPath), true));
      vi.spyOn(fileSystemService, 'readFile').mockResolvedValue('@text var1="v1"\n@text var2="v2"');
      parserService.parse.mockResolvedValue([] as MeldNode[]);

      // Configure the state returned by the interpreter mock for this test
      const importedVar1: TextVariable = { name: 'var1', type: VariableType.TEXT, value: 'v1', metadata: { /*...*/ } as any };
      const importedVar2: TextVariable = { name: 'var2', type: VariableType.TEXT, value: 'v2', metadata: { /*...*/ } as any };
      const expectedResultState = MockFactory.createStateService({
          getTextVar: vi.fn().mockImplementation(name => {
            if (name === 'var1') return importedVar1;
            if (name === 'var2') return importedVar2;
            return undefined;
          }),
          // Add other getters used by processStructuredImports
          getDataVar: vi.fn().mockReturnValue(undefined),
          getPathVar: vi.fn().mockReturnValue(undefined),
          getCommand: vi.fn().mockReturnValue(undefined),
      });
      interpreterServiceClient.interpret.mockResolvedValueOnce(expectedResultState);
      // Ensure createChildState returns state with setCurrentFilePath
      vi.spyOn(stateService, 'createChildState').mockResolvedValueOnce(
           MockFactory.createStateService({ setCurrentFilePath: vi.fn() })
      );

      mockProcessingContext = createMockProcessingContext(node);
      const result = await handler.handle(mockProcessingContext as DirectiveProcessingContext) as DirectiveResult;

      expect(result.state).toBe(stateService);
      expect(result.replacement).toEqual<TextNode>({
        type: 'Text', content: '', location: importLocation
      });

      // Assertions on the main stateService (target state)
      expect(stateService.setTextVar).toHaveBeenCalledWith('var1', 'v1');
      expect(stateService.setTextVar).toHaveBeenCalledWith('alias2', 'v2');
      expect(stateService.setTextVar).not.toHaveBeenCalledWith('var2', expect.anything());
    });

    it('should preserve error handling and cleanup in transformation mode', async () => {
      const importPath = 'missing.meld';
      const finalPath = '/project/missing.meld';
      const importLocation = createTestLocation(1, 1);
      const node = createTestImportNode({
        pathObject: createTestPathObject(importPath),
        location: importLocation
      });
      // Configure mocks for error path
      resolutionService.resolveInContext.mockImplementation(async (pathInput) => finalPath);
      resolutionService.resolvePath.mockResolvedValue(createMeldPath(importPath, unsafeCreateValidatedResourcePath(finalPath), true));
      fileSystemService.exists.mockResolvedValue(false);
      fileSystemService.readFile.mockRejectedValue(new MeldFileNotFoundError(`File not found: ${finalPath}`, { details: { filePath: finalPath }})); 

      mockProcessingContext = createMockProcessingContext(node);

      await expectToThrowWithConfig(
        () => handler.handle(mockProcessingContext as DirectiveProcessingContext),
        {
          type: 'DirectiveError',
          code: DirectiveErrorCode.FILE_NOT_FOUND,
          message: /File not found:.*?missing\.meld/i
        }
      );
      expect(circularityService.endImport).toHaveBeenCalledWith(finalPath.replace(/\\/g, '/'));
    });
  });
}); 