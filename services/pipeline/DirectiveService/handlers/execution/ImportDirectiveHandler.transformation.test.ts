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
  let fixture: DirectiveTestFixture;
  let handler: ImportDirectiveHandler;
  let parserService: DeepMockProxy<IParserService>;
  let interpreterServiceClientFactory: DeepMockProxy<InterpreterServiceClientFactory>;
  let interpreterServiceClient: DeepMockProxy<IInterpreterServiceClient>;
  let circularityService: DeepMockProxy<ICircularityService>;
  let childState: IStateService;
  let mockProcessingContext: Partial<DirectiveProcessingContext>;
  let urlContentResolver: DeepMockProxy<IURLContentResolver>;
  let stateTrackingService: DeepMockProxy<IStateTrackingService>;

  beforeEach(async () => {
    // Create Deep Mocks for non-standard services
    parserService = mockDeep<IParserService>();
    interpreterServiceClientFactory = mockDeep<InterpreterServiceClientFactory>();
    interpreterServiceClient = mockDeep<IInterpreterServiceClient>();
    circularityService = mockDeep<ICircularityService>();

    // Create fixture, register additional mocks
    fixture = await DirectiveTestFixture.create({
      additionalMocks: {
        'IParserService': parserService,
        'InterpreterServiceClientFactory': interpreterServiceClientFactory,
        'ICircularityService': circularityService,
        // Register the logger mock needed by ImportDirectiveHandler
        'ILogger': mockLoggerObject 
      }
    });

    // Manually create child state mock (could be standardized later)
    childState = MockFactory.createStateService({
      getAllTextVars: vi.fn().mockReturnValue(new Map()),
      getAllDataVars: vi.fn().mockReturnValue(new Map()),
      getAllPathVars: vi.fn().mockReturnValue(new Map()),
      getAllCommands: vi.fn().mockReturnValue(new Map()),
      isTransformationEnabled: vi.fn().mockReturnValue(false),
      getCurrentFilePath: vi.fn().mockReturnValue('/project/imported.meld'),
    });

    // Configure mocks provided by fixture or registered
    vi.spyOn(fixture.stateService, 'isTransformationEnabled').mockReturnValue(true);
    vi.spyOn(fixture.stateService, 'createChildState').mockResolvedValue(childState);
    vi.spyOn(fixture.stateService, 'getCurrentFilePath').mockReturnValue('/project/transform.meld');

    interpreterServiceClientFactory.createClient.mockReturnValue(interpreterServiceClient);
    interpreterServiceClient.interpret.mockResolvedValue(childState);

    vi.spyOn(fixture.validationService, 'validate').mockResolvedValue(undefined);
    vi.spyOn(fixture.resolutionService, 'resolveInContext').mockImplementation(async (pathInput: string | PathValueObject, context?: ResolutionContext): Promise<string> => {
      const rawPath = typeof pathInput === 'string' ? pathInput : pathInput.raw;
      const currentFilePath = context?.currentFilePath ?? '/project/main.meld';
      const baseDir = currentFilePath.substring(0, currentFilePath.lastIndexOf('/'));
      return `${baseDir}/${rawPath}`.replace(/\/\//g, '/');
    });
    vi.spyOn(fixture.resolutionService, 'resolvePath').mockImplementation(async (pathInput: PathValueObject | string, context: ResolutionContext): Promise<MeldPath> => {
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

    vi.spyOn(fixture.fileSystemService, 'exists').mockResolvedValue(true);
    vi.spyOn(fixture.fileSystemService, 'readFile').mockResolvedValue('');
    parserService.parse.mockResolvedValue([] as MeldNode[]);
    circularityService.beginImport.mockImplementation(() => {});
    circularityService.endImport.mockImplementation(() => {});

    // Resolve the handler using the fixture's context
    handler = await fixture.context.resolve(ImportDirectiveHandler);
  });

  afterEach(async () => {
    await fixture?.cleanup();
  });

  // Updated helper to use fixture services AND include resolutionContext
  const createMockProcessingContext = (node: DirectiveNode): Partial<DirectiveProcessingContext> => {
      const mockResolutionContext = mockDeep<ResolutionContext>(); // Create mock context
      // const mockFormattingContext = mockDeep<FormattingContext>(); // Can be mocked if needed
      if (!fixture || !fixture.stateService) {
        throw new Error('Test setup error: fixture or stateService is not defined');
      }
      expect(fixture.stateService.getCurrentFilePath).toBeDefined(); 
      expect(fixture.stateService.isTransformationEnabled).toBeDefined();
      
      // Set required properties for the mock context
      // You might need to add more properties based on handler needs
      mockResolutionContext.currentFilePath = fixture.stateService.getCurrentFilePath();
      mockResolutionContext.state = fixture.stateService;
      mockResolutionContext.strict = true; 
      mockResolutionContext.depth = 0;
      mockResolutionContext.flags = {}; // Add default flags if needed
      mockResolutionContext.pathContext = { purpose: 'read' }; // Add default path context

      return {
          state: fixture.stateService, 
          resolutionContext: mockResolutionContext, // ADDED mock context
          // formattingContext: mockFormattingContext,
          directiveNode: node,
      };
  };

  describe('transformation behavior', () => {
    it('should return DirectiveResult with empty text node replacement when transformation enabled', async () => {
      const importPath = 'imported.meld';
      const finalPath = '/project/imported.meld';
      const importLocation = createTestLocation(5, 1);

      const node = createTestImportNode({
        pathObject: createTestPathObject(importPath),
        location: importLocation
      });

      vi.spyOn(fixture.resolutionService, 'resolveInContext').mockImplementation(async (pathInput) => {
        if (typeof pathInput === 'object' && pathInput.raw === importPath) return finalPath;
        return `/project/${pathInput}`;
      });
      vi.spyOn(fixture.resolutionService, 'resolvePath').mockResolvedValue(createMeldPath(importPath, unsafeCreateValidatedResourcePath(finalPath), true));
      vi.spyOn(fixture.fileSystemService, 'readFile').mockResolvedValue('@text var1="value1"');
      const parsedNodes: MeldNode[] = [];
      parserService.parse.mockResolvedValue(parsedNodes as any);
      const importedVar: TextVariable = { name: 'var1', type:VariableType.TEXT, value: 'value1', metadata: { definedAt: createTestLocation(1,1), origin: VariableOrigin.DIRECT_DEFINITION, createdAt: Date.now(), modifiedAt: Date.now() } };
      childState.getAllTextVars.mockReturnValue(new Map([['var1', importedVar]]));

      mockProcessingContext = createMockProcessingContext(node);

      const result = await handler.execute(mockProcessingContext as DirectiveProcessingContext) as DirectiveResult;

      expect(fixture.resolutionService.resolvePath).toHaveBeenCalledWith(finalPath, expect.any(Object));
      expect(fixture.fileSystemService.readFile).toHaveBeenCalledWith(finalPath);
      expect(parserService.parse).toHaveBeenCalled();
      expect(interpreterServiceClient.interpret).toHaveBeenCalledWith(parsedNodes);
      expect(fixture.stateService.createChildState).toHaveBeenCalled();
      expect(circularityService.endImport).toHaveBeenCalledWith(finalPath.replace(/\\/g, '/'));

      expect(result).toBeDefined();
      expect(result.state).toBe(fixture.stateService);
      expect(result.replacement).toBeDefined();
      expect(result.replacement).toEqual<TextNode>({
        type: 'Text',
        content: '',
        location: importLocation
      });

      expect(fixture.stateService.setTextVar).toHaveBeenCalledWith('var1', 'value1');
    });

    it('should handle specific imports correctly in transformation mode', async () => {
      const importPath = 'vars.meld';
      const finalPath = '/project/vars.meld';
      const importLocation = createTestLocation(3, 1);

      const node = createTestImportNode({
        pathObject: createTestPathObject(importPath),
        imports: [{ name: 'var1' }, { name: 'var2', alias: 'alias2' }],
        subtype: 'importNamed',
        location: importLocation
      });

      vi.spyOn(fixture.resolutionService, 'resolveInContext').mockImplementation(async (pathInput) => {
        if (typeof pathInput === 'object' && pathInput.raw === importPath) return finalPath;
        return `/project/${pathInput}`;
      });
      vi.spyOn(fixture.resolutionService, 'resolvePath').mockResolvedValue(createMeldPath(importPath, unsafeCreateValidatedResourcePath(finalPath), true));
      vi.spyOn(fixture.fileSystemService, 'readFile').mockResolvedValue('@text var1="v1"\n@text var2="v2"');
      parserService.parse.mockResolvedValue([] as MeldNode[]);

      const importedVar1: TextVariable = { name: 'var1', type: VariableType.TEXT, value: 'v1', metadata: { definedAt: createTestLocation(1,1,finalPath), origin: VariableOrigin.DIRECT_DEFINITION, createdAt: Date.now(), modifiedAt: Date.now() } };
      const importedVar2: TextVariable = { name: 'var2', type: VariableType.TEXT, value: 'v2', metadata: { definedAt: createTestLocation(2,1,finalPath), origin: VariableOrigin.DIRECT_DEFINITION, createdAt: Date.now(), modifiedAt: Date.now() } };
      childState.getTextVar.mockImplementation(name => {
        if (name === 'var1') return importedVar1;
        if (name === 'var2') return importedVar2;
        return undefined;
      });

      mockProcessingContext = createMockProcessingContext(node);

      const result = await handler.execute(mockProcessingContext as DirectiveProcessingContext) as DirectiveResult;

      expect(result.state).toBe(fixture.stateService);
      expect(result.replacement).toEqual<TextNode>({
        type: 'Text', content: '', location: importLocation
      });

      expect(fixture.stateService.setTextVar).toHaveBeenCalledWith('var1', 'v1');
      expect(fixture.stateService.setTextVar).toHaveBeenCalledWith('alias2', 'v2');
      expect(fixture.stateService.setTextVar).not.toHaveBeenCalledWith('var2', expect.anything());
    });

    it('should preserve error handling and cleanup in transformation mode', async () => {
      const importPath = 'missing.meld';
      const finalPath = '/project/missing.meld';
      const importLocation = createTestLocation(1, 1);

      const node = createTestImportNode({
        pathObject: createTestPathObject(importPath),
        location: importLocation
      });

      // Configure mocks via fixture services
      vi.spyOn(fixture.resolutionService, 'resolveInContext').mockImplementation(async (pathInput) => {
        if (typeof pathInput === 'object' && pathInput.raw === importPath) return finalPath;
        return `/project/${pathInput}`;
      });
      vi.spyOn(fixture.resolutionService, 'resolvePath').mockResolvedValue(createMeldPath(importPath, unsafeCreateValidatedResourcePath(finalPath), true));
      vi.spyOn(fixture.fileSystemService, 'exists').mockResolvedValue(false);
      // Use imported MeldFileNotFoundError
      vi.spyOn(fixture.fileSystemService, 'readFile').mockRejectedValue(new MeldFileNotFoundError(`File not found: ${finalPath}`, { details: { filePath: finalPath }})); 

      mockProcessingContext = createMockProcessingContext(node);

      await expectToThrowWithConfig(
        () => handler.execute(mockProcessingContext as DirectiveProcessingContext),
        {
          type: 'DirectiveError',
          // Keep expected code as FILE_NOT_FOUND, handler logic catches MeldFileNotFoundError
          code: DirectiveErrorCode.FILE_NOT_FOUND, 
          messageContains: `File not found: ${finalPath}`
        }
      );

      // Assertions use fixture services or registered mocks
      expect(circularityService.endImport).toHaveBeenCalledWith(finalPath.replace(/\\/g, '/'));
      expect(fixture.stateService.setTextVar).not.toHaveBeenCalled();
    });
  });
}); 