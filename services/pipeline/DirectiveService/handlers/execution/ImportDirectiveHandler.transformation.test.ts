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
} from '@tests/utils/mocks/serviceMocks';
import { InterpreterServiceClientFactory } from '@services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory';
import type { IInterpreterServiceClient } from '@services/pipeline/InterpreterService/interfaces/IInterpreterServiceClient';
import type { MeldPath } from '@core/types/paths';
import { createMeldPath, unsafeCreateValidatedResourcePath } from '@core/types/paths';

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
  let handler: ImportDirectiveHandler;
  let validationService: ReturnType<typeof createValidationServiceMock>;
  let stateService: ReturnType<typeof createStateServiceMock>;
  let resolutionService: ReturnType<typeof createResolutionServiceMock>;
  let fileSystemService: ReturnType<typeof createFileSystemServiceMock>;
  let pathService: ReturnType<typeof createPathServiceMock>;
  let parserService: DeepMockProxy<IParserService>;
  let interpreterServiceClientFactory: DeepMockProxy<InterpreterServiceClientFactory>;
  let interpreterServiceClient: DeepMockProxy<IInterpreterServiceClient>;
  let circularityService: DeepMockProxy<ICircularityService>;
  let childState: ReturnType<typeof createStateServiceMock>;
  let context: TestContextDI;

  beforeEach(async () => {
    context = TestContextDI.createIsolated();

    // Create Standard Mocks
    validationService = createValidationServiceMock();
    stateService = createStateServiceMock();
    resolutionService = createResolutionServiceMock();
    fileSystemService = createFileSystemServiceMock();
    pathService = createPathServiceMock();
    childState = createStateServiceMock();

    // Create Deep Mocks
    parserService = mockDeep<IParserService>();
    interpreterServiceClientFactory = mockDeep<InterpreterServiceClientFactory>();
    interpreterServiceClient = mockDeep<IInterpreterServiceClient>();
    circularityService = mockDeep<ICircularityService>();

    // Register Mocks
    context.registerMock('IValidationService', validationService);
    context.registerMock('IStateService', stateService);
    context.registerMock('IResolutionService', resolutionService);
    context.registerMock('IFileSystemService', fileSystemService);
    context.registerMock('IPathService', pathService);
    context.registerMock('IParserService', parserService);
    context.registerMock('InterpreterServiceClientFactory', interpreterServiceClientFactory);
    context.registerMock('ICircularityService', circularityService);

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
    resolutionService.resolveInContext.mockImplementation(async (pathInput: string | PathValueObject, context?: ResolutionContext): Promise<string> => {
      const rawPath = typeof pathInput === 'string' ? pathInput : pathInput.raw;
      const currentFilePath = context?.currentFilePath ?? '/project/main.meld';
      const baseDir = currentFilePath.substring(0, currentFilePath.lastIndexOf('/'));
      return `${baseDir}/${rawPath}`.replace(/\/\//g, '/');
    });
    resolutionService.resolvePath.mockImplementation(async (pathInput: PathValueObject | string, context: ResolutionContext): Promise<MeldPath> => {
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

    fileSystemService.exists.mockResolvedValue(true);
    fileSystemService.readFile.mockResolvedValue('');
    parserService.parse.mockResolvedValue([] as MeldNode[]);
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
      const directiveContext: DirectiveContext = { currentFilePath: '/project/main.meld', state: stateService };
      const importLocation = createTestLocation(5, 1);

      const node = createTestImportNode({
        pathObject: createTestPathObject(importPath),
        location: importLocation
      });

      resolutionService.resolveInContext.mockImplementation(async (pathInput) => {
        if (typeof pathInput === 'object' && pathInput.raw === importPath) return finalPath;
        return `/project/${pathInput}`;
      });
      resolutionService.resolvePath.mockResolvedValue(createMeldPath(importPath, unsafeCreateValidatedResourcePath(finalPath), true));
      fileSystemService.readFile.mockResolvedValue('@text var1="value1"');
      const parsedNodes: MeldNode[] = [/*...*/];
      parserService.parse.mockResolvedValue({ nodes: parsedNodes });
      const importedVar: TextVariable = { type:VariableType.TEXT, value: 'value1', metadata: { definedAt: createTestLocation(1,1,finalPath), origin: VariableOrigin.DIRECT_DEFINITION, createdAt: Date.now(), modifiedAt: Date.now() } };
      childState.getAllTextVars.mockReturnValue(new Map([['var1', importedVar]]));

      const result = await handler.execute(node as DirectiveNode, directiveContext) as DirectiveResult;

      expect(resolutionService.resolvePath).toHaveBeenCalledWith(expect.objectContaining({ raw: importPath }), expect.any(Object));
      expect(fileSystemService.readFile).toHaveBeenCalledWith(finalPath);
      expect(parserService.parse).toHaveBeenCalled();
      expect(interpreterServiceClient.interpret).toHaveBeenCalledWith(parsedNodes, expect.objectContaining({ initialState: childState, currentFilePath: finalPath }));
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
      const directiveContext: DirectiveContext = { currentFilePath: '/project/main.meld', state: stateService };
      const importLocation = createTestLocation(3, 1);

      const node = createTestImportNode({
        pathObject: createTestPathObject(importPath),
        imports: [{ name: 'var1' }, { name: 'var2', alias: 'alias2' }],
        subtype: 'importNamed',
        location: importLocation
      });

      resolutionService.resolveInContext.mockImplementation(async (pathInput) => {
        if (typeof pathInput === 'object' && pathInput.raw === importPath) return finalPath;
        return `/project/${pathInput}`;
      });
      resolutionService.resolvePath.mockResolvedValue(createMeldPath(importPath, unsafeCreateValidatedResourcePath(finalPath), true));
      fileSystemService.readFile.mockResolvedValue('@text var1="v1"\n@text var2="v2"');
      parserService.parse.mockResolvedValue([] as MeldNode[]);

      const importedVar1: TextVariable = { type: VariableType.TEXT, value: 'v1', metadata: { definedAt: createTestLocation(1,1,finalPath), origin: VariableOrigin.DIRECT_DEFINITION, createdAt: Date.now(), modifiedAt: Date.now() } };
      const importedVar2: TextVariable = { type: VariableType.TEXT, value: 'v2', metadata: { definedAt: createTestLocation(2,1,finalPath), origin: VariableOrigin.DIRECT_DEFINITION, createdAt: Date.now(), modifiedAt: Date.now() } };
      childState.getTextVar.mockImplementation(name => {
        if (name === 'var1') return importedVar1;
        if (name === 'var2') return importedVar2;
        return undefined;
      });

      const result = await handler.execute(node as DirectiveNode, directiveContext) as DirectiveResult;

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
      const directiveContext: DirectiveContext = { currentFilePath: 'test.meld', state: stateService };
      const importLocation = createTestLocation(1, 1);

      const node = createTestImportNode({
        pathObject: createTestPathObject(importPath),
        location: importLocation
      });

      resolutionService.resolveInContext.mockImplementation(async (pathInput) => {
        if (typeof pathInput === 'object' && pathInput.raw === importPath) return finalPath;
        return `/project/${pathInput}`;
      });
      resolutionService.resolvePath.mockResolvedValue(createMeldPath(importPath, unsafeCreateValidatedResourcePath(finalPath), true));
      fileSystemService.exists.mockResolvedValue(false);

      await expectToThrowWithConfig(
        () => handler.execute(node as DirectiveNode, directiveContext),
        {
          type: 'DirectiveError',
          code: DirectiveErrorCode.FILE_NOT_FOUND,
          messageContains: `File not found: ${finalPath}`
        }
      );

      expect(circularityService.beginImport).toHaveBeenCalledWith(finalPath.replace(/\\/g, '/'));
      expect(circularityService.endImport).toHaveBeenCalledWith(finalPath.replace(/\\/g, '/'));
      expect(stateService.setTextVar).not.toHaveBeenCalled();
    });
  });
}); 