import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { DirectiveNode, TextNode } from '@core/syntax/types.js';
import type { ImportDirectiveNode, PathValueObject, MeldNode } from '@core/syntax/types/index.js';
import type { SourceLocation } from '@core/syntax/types/location.js';
import { VariableOrigin, type TextVariable } from '@core/types/variables.js';
import { ImportDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { ICircularityService as ICircularityServiceType } from '@services/resolution/CircularityService/ICircularityService.js';
import type { DirectiveResult } from '@services/pipeline/DirectiveService/types.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { createLocation, createTestText, createTestDirective, createTestCodeFence } from '@tests/utils/nodeFactories';
import { expectToThrowDirectiveError } from '@tests/utils/errorTestUtils.js';
import { createMockLogger } from '@tests/utils/logger.js';
import { importDirectiveExamples } from '@core/syntax/index.js';
import { createNodeFromExample } from '@core/syntax/helpers.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI';
import {
  createValidationServiceMock,
  createStateServiceMock,
  createResolutionServiceMock,
  createFileSystemServiceMock,
  createPathServiceMock,
  createParserServiceMock,
  createInterpreterServiceClientFactoryMock,
  createInterpreterServiceClientMock
} from '@tests/utils/mocks/serviceMocks.js';
import { DirectiveKind, VariableType } from '@core/types/index';

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
}): ImportDirectiveNode {
  const { pathObject, imports = [{ name: '*' }], subtype = 'importAll', location = createLocation(1, 1) } = options;
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
  let handler: ImportDirectiveHandler;
  let validationService: ReturnType<typeof createValidationServiceMock>;
  let stateService: ReturnType<typeof createStateServiceMock>;
  let resolutionService: ReturnType<typeof createResolutionServiceMock>;
  let fileSystemService: ReturnType<typeof createFileSystemServiceMock>;
  let pathService: ReturnType<typeof createPathServiceMock>;
  let parserService: ReturnType<typeof createParserServiceMock>;
  let interpreterServiceClientFactory: ReturnType<typeof createInterpreterServiceClientFactoryMock>;
  let interpreterServiceClient: ReturnType<typeof createInterpreterServiceClientMock>;
  let circularityService: ReturnType<typeof createCircularityServiceMock>;
  let childState: ReturnType<typeof createStateServiceMock>;
  let context: TestContextDI;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(async () => {
    context = TestContextDI.createIsolated();
    logger = createMockLogger();

    // Create Mocks
    validationService = createValidationServiceMock();
    stateService = createStateServiceMock();
    resolutionService = createResolutionServiceMock();
    fileSystemService = createFileSystemServiceMock();
    pathService = createPathServiceMock();
    parserService = createParserServiceMock();
    interpreterServiceClientFactory = createInterpreterServiceClientFactoryMock();
    interpreterServiceClient = createInterpreterServiceClientMock();
    circularityService = createCircularityServiceMock();
    childState = createStateServiceMock();

    // Register Mocks
    context.registerMock('IValidationService', validationService);
    context.registerMock('IStateService', stateService);
    context.registerMock('IResolutionService', resolutionService);
    context.registerMock('IFileSystemService', fileSystemService);
    context.registerMock('IPathService', pathService);
    context.registerMock('IParserService', parserService);
    context.registerMock('InterpreterServiceClientFactory', interpreterServiceClientFactory);
    context.registerMock('ICircularityService', circularityService);
    context.registerLogger(logger);

    // Configure Mocks
    stateService.isTransformationEnabled.mockReturnValue(true);
    stateService.createChildState.mockReturnValue(childState);
    stateService.getCurrentFilePath.mockReturnValue('/project/main.meld');

    childState.getAllTextVars.mockReturnValue(new Map());
    childState.getAllDataVars.mockReturnValue(new Map());
    childState.getAllPathVars.mockReturnValue(new Map());
    childState.getAllCommands.mockReturnValue(new Map());
    childState.isTransformationEnabled.mockReturnValue(false);
    childState.getCurrentFilePath.mockReturnValue('/project/imported.meld');

    interpreterServiceClientFactory.createClient.mockReturnValue(interpreterServiceClient);
    interpreterServiceClient.interpret.mockResolvedValue(childState);

    validationService.validate.mockResolvedValue(undefined);
    resolutionService.resolvePathString.mockImplementation(async p => `/project/${p}`);
    fileSystemService.exists.mockResolvedValue(true);
    fileSystemService.readFile.mockResolvedValue('');
    parserService.parse.mockResolvedValue({ nodes: [] });
    circularityService.beginImport.mockImplementation(() => {});
    circularityService.endImport.mockImplementation(() => {});

    context.registerClass(ImportDirectiveHandler);

    await context.initialize();

    handler = await context.resolve(ImportDirectiveHandler);
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  describe('transformation behavior', () => {
    it('should return DirectiveResult with empty text node replacement when transformation enabled', async () => {
      const importPath = 'imported.meld';
      const finalPath = '/project/imported.meld';
      const directiveContext = { currentFilePath: '/project/main.meld', state: stateService };
      const importLocation = createLocation(5, 1);

      const node = createTestImportNode({
        pathObject: createTestPathObject(importPath),
        location: importLocation
      });

      resolutionService.resolvePathString.mockResolvedValue(finalPath);
      fileSystemService.readFile.mockResolvedValue('@text var1="value1"');
      const parsedNodes: MeldNode[] = [/*...*/];
      parserService.parse.mockResolvedValue({ nodes: parsedNodes });
      const importedVar: TextVariable = { type:'text', value: 'value1', metadata: { definedAt: createLocation(1,1,finalPath), origin: VariableOrigin.DIRECT_DEFINITION } };
      childState.getAllTextVars.mockReturnValue(new Map([['var1', importedVar]]));

      const result = await handler.execute(node, directiveContext) as DirectiveResult;

      expect(resolutionService.resolvePathString).toHaveBeenCalledWith(importPath, expect.any(Object));
      expect(fileSystemService.readFile).toHaveBeenCalledWith(finalPath);
      expect(parserService.parse).toHaveBeenCalled();
      expect(interpreterServiceClient.interpret).toHaveBeenCalledWith(parsedNodes, expect.objectContaining({ initialState: childState }));
      expect(stateService.createChildState).toHaveBeenCalled();
      expect(circularityService.beginImport).toHaveBeenCalledWith(finalPath.replace(/\\/g, '/'));
      expect(circularityService.endImport).toHaveBeenCalledWith(finalPath.replace(/\\/g, '/'));

      expect(result).toBeDefined();
      expect(result.state).toBe(stateService);
      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual<TextNode>({
        type: 'Text',
        content: '',
        location: importLocation
      });

      expect(stateService.setTextVar).toHaveBeenCalledWith('var1', expect.objectContaining({
        value: 'value1',
        metadata: expect.objectContaining({ origin: VariableOrigin.IMPORT, definedAt: importLocation })
      }));
    });

    it('should handle specific imports correctly in transformation mode', async () => {
      const importPath = 'vars.meld';
      const finalPath = '/project/vars.meld';
      const directiveContext = { currentFilePath: '/project/main.meld', state: stateService };
      const importLocation = createLocation(3, 1);

      const node = createTestImportNode({
        pathObject: createTestPathObject(importPath),
        imports: [{ name: 'var1' }, { name: 'var2', alias: 'alias2' }],
        subtype: 'importNamed',
        location: importLocation
      });

      resolutionService.resolvePathString.mockResolvedValue(finalPath);
      fileSystemService.readFile.mockResolvedValue('@text var1="v1"\n@text var2="v2"');
      parserService.parse.mockResolvedValue({ nodes: [] });

      const importedVar1: TextVariable = { type: 'text', value: 'v1', metadata: { definedAt: createLocation(1,1,finalPath), origin: VariableOrigin.DIRECT_DEFINITION } };
      const importedVar2: TextVariable = { type: 'text', value: 'v2', metadata: { definedAt: createLocation(2,1,finalPath), origin: VariableOrigin.DIRECT_DEFINITION } };
      childState.getTextVar.mockImplementation(name => {
        if (name === 'var1') return importedVar1;
        if (name === 'var2') return importedVar2;
        return undefined;
      });

      const result = await handler.execute(node, directiveContext) as DirectiveResult;

      expect(result.state).toBe(stateService);
      expect(result.replacement).toEqual<TextNode>({
        type: 'Text', content: '', location: importLocation
      });

      expect(stateService.setTextVar).toHaveBeenCalledWith('var1', expect.objectContaining({
        value: 'v1',
        metadata: expect.objectContaining({ origin: VariableOrigin.IMPORT, definedAt: importLocation })
      }));
      expect(stateService.setTextVar).toHaveBeenCalledWith('alias2', expect.objectContaining({
        value: 'v2',
        metadata: expect.objectContaining({ origin: VariableOrigin.IMPORT, definedAt: importLocation })
      }));
      expect(stateService.setTextVar).not.toHaveBeenCalledWith('var2', expect.anything());
    });

    it('should preserve error handling and cleanup in transformation mode', async () => {
      const importPath = 'missing.meld';
      const finalPath = '/project/missing.meld';
      const directiveContext = { currentFilePath: 'test.meld', state: stateService };
      const importLocation = createLocation(1, 1);

      const node = createTestImportNode({
        pathObject: createTestPathObject(importPath),
        location: importLocation
      });

      resolutionService.resolvePathString.mockResolvedValue(finalPath);
      fileSystemService.exists.mockResolvedValue(false);

      await expectToThrowDirectiveError(
        () => handler.execute(node, directiveContext),
        DirectiveErrorCode.FILE_NOT_FOUND,
        /File not found: \/project\/missing.meld/
      );

      expect(circularityService.beginImport).toHaveBeenCalledWith(finalPath.replace(/\\/g, '/'));
      expect(circularityService.endImport).toHaveBeenCalledWith(finalPath.replace(/\\/g, '/'));
      expect(stateService.setTextVar).not.toHaveBeenCalled();
    });
  });
}); 