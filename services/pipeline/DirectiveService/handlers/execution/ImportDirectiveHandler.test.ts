import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mock, mockDeep, DeepMockProxy } from 'vitest-mock-extended';
import { ImportDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService, ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import type { ImportDirectiveData } from '@core/syntax/types/directives';
import type { MeldNode, DirectiveNode, StructuredPath, SourceLocation, VariableReferenceNode } from '@core/syntax/types/nodes';
import { VariableOrigin, type TextVariable, type MeldVariable, type VariableMetadata, type IPathVariable, VariableType } from '@core/types/variables.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { MeldFileNotFoundError } from '@core/errors/MeldFileNotFoundError';
import { MeldResolutionError, ResolutionErrorDetails } from '@core/errors/MeldResolutionError.js';
import { ErrorSeverity, MeldError } from '@core/errors/MeldError.js';
import {
  expectToThrowWithConfig
} from '@tests/utils/ErrorTestUtils.js';
import { createLocation, createTestPathObject, createTestImportNode } from '@tests/utils/testFactories.js';
import { importDirectiveExamples } from '@core/syntax/index';
import { createNodeFromExample } from '@core/syntax/helpers/index';
import { TestContextDI } from '@tests/utils/di/TestContextDI';
import {
  createValidationServiceMock,
  createStateServiceMock,
  createResolutionServiceMock,
  createFileSystemServiceMock,
  createPathServiceMock,
} from '@tests/utils/mocks/serviceMocks';
import { InterpreterServiceClientFactory } from '@services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory';
import type { IInterpreterServiceClient } from '@services/pipeline/InterpreterService/interfaces/IInterpreterServiceClient.js';
import type { IURLContentResolver } from '@services/resolution/URLContentResolver/IURLContentResolver.js';
import type { MeldPath, PathPurpose, ValidatedResourcePath } from '@core/types/paths';
import { createMeldPath, unsafeCreateValidatedResourcePath } from '@core/types/paths';
import type { URLResponse } from '@services/fs/PathService/IURLCache';
import type { DirectiveContext } from '@services/pipeline/DirectiveService/IDirectiveService.js';

/**
 * ImportDirectiveHandler Test Status
 * ----------------------------------------
 * 
 * MIGRATION STATUS: Complete
 * 
 * This test file has been fully migrated to use:
 * - TestContextDI for container management
 * - Standardized mock factories with vitest-mock-extended
 * - Centralized syntax examples
 * 
 * COMPLETED:
 * - Using TestContextDI for test environment setup
 * - Using standardized mock factories for service mocks
 * - Using a hybrid approach with direct handler instantiation
 * - Added proper cleanup for container management
 * - Enhanced with centralized syntax examples
 */

/**
 * Create an Import directive node that matches the structure expected by the handler
 * DEPRECATED: Use createTestImportNode instead.
 */
function _createImportDirectiveNode_Deprecated(options: {
  path: StructuredPath;
  imports?: Array<{ name: string; alias?: string | null }>;
  subtype?: 'importAll' | 'importStandard' | 'importNamed';
  location?: ReturnType<typeof createLocation>;
}): DirectiveNode<ImportDirectiveData> {
  const { path, imports = [{ name: '*', alias: null }], subtype = 'importAll', location = createLocation(1, 1) } = options;
  
  // Format the directive structure as expected by the handler
  return {
    type: 'Directive',
    directive: {
      kind: 'import',
      subtype: subtype,
      path: path, // Use the provided StructuredPath object
      imports: imports,
    },
    location
  } as unknown as DirectiveNode<ImportDirectiveData>; // Use unknown assertion for complex mock type
}

// Mock the actual logger module
const mockLoggerObject = { // Define the mock object structure
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};
vi.mock('@core/utils/logger', () => ({
  directiveLogger: mockLoggerObject,
  importLogger: mockLoggerObject
}));

describe('ImportDirectiveHandler', () => {
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
  let urlContentResolver: DeepMockProxy<IURLContentResolver>;
  let childState: ReturnType<typeof createStateServiceMock>;
  let context: TestContextDI;

  beforeEach(async () => {
    context = TestContextDI.createIsolated();

    // Create Mocks
    validationService = createValidationServiceMock();
    stateService = createStateServiceMock();
    childState = createStateServiceMock();
    resolutionService = createResolutionServiceMock();
    fileSystemService = createFileSystemServiceMock();
    pathService = createPathServiceMock();
    parserService = mockDeep<IParserService>();
    interpreterServiceClientFactory = mockDeep<InterpreterServiceClientFactory>();
    interpreterServiceClient = mockDeep<IInterpreterServiceClient>();
    circularityService = mockDeep<ICircularityService>();
    urlContentResolver = mockDeep<IURLContentResolver>();

    // Register Mocks
    context.registerMock('IValidationService', validationService);
    context.registerMock('IStateService', stateService);
    context.registerMock('IResolutionService', resolutionService);
    context.registerMock('IFileSystemService', fileSystemService);
    context.registerMock('IPathService', pathService);
    context.registerMock('IParserService', parserService);
    context.registerMock('InterpreterServiceClientFactory', interpreterServiceClientFactory);
    context.registerMock('ICircularityService', circularityService);
    context.registerMock('IURLContentResolver', urlContentResolver);

    // Configure default mock behaviors
    stateService.createChildState.mockReturnValue(childState);
    interpreterServiceClientFactory.createClient.mockReturnValue(interpreterServiceClient);
    interpreterServiceClient.interpret.mockResolvedValue(childState);

    vi.mocked(childState.getAllTextVars).mockReturnValue(new Map());
    vi.mocked(childState.getAllDataVars).mockReturnValue(new Map());
    vi.mocked(childState.getAllPathVars).mockReturnValue(new Map());
    vi.mocked(childState.getAllCommands).mockReturnValue(new Map());
    vi.mocked(childState.getCurrentFilePath).mockReturnValue('imported.meld');
    // Ensure required IStateService properties are mocked
    vi.mocked(stateService.getCurrentFilePath).mockReturnValue('/project/current.meld');
    vi.mocked(childState.getCurrentFilePath).mockReturnValue('/project/imported.meld');

    // Corrected mock for resolvePath to match expected signature
    resolutionService.resolvePath.mockImplementation(async (pathInput: StructuredPath | string, context: ResolutionContext): Promise<MeldPath> => {
      const raw = typeof pathInput === 'string' ? pathInput : pathInput.raw;
      // Attempt to get currentFilePath from context, provide default if missing
      const currentPath = context?.currentFilePath ?? '/project/current.meld';
      const baseDir = currentPath.substring(0, currentPath.lastIndexOf('/'));
      const isUrl = raw.startsWith('http');
      const resolved = isUrl ? raw : `${baseDir}/${raw}`.replace(/\/\//g, '/'); // Basic join
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
    urlContentResolver.validateURL.mockResolvedValue(undefined);
    urlContentResolver.fetchURL.mockResolvedValue({
      content: '',
      url: '',
      fromCache: false,
      metadata: {
        size: 0,
        contentType: 'text/plain',
        statusCode: 200
      }
    } as URLResponse);

    await context.initialize();
    
    // Resolve the handler instance from the container
    handler = await context.resolve(ImportDirectiveHandler);
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  describe('special path variables', () => {
    // Define expected resolved strings for mocks
    const resolvedProjectPath = '/project/path/test.meld';
    const resolvedHomePath = '/home/user/test.meld';
    const resolvedNonExistentPath = '/project/path/nonexistent.meld'; // Used in failure test

    beforeEach(() => {
      // Mock resolveInContext to return the resolved path string
      resolutionService.resolveInContext.mockImplementation(async (value: any, context: ResolutionContext) => {
        const raw = typeof value === 'string' ? value : value?.raw; // Handle string or object input
        if (!raw) return ''; // Handle potential null/undefined input gracefully
        if (raw.includes('$.') || raw.includes('$PROJECTPATH')) {
          return resolvedProjectPath;
        } else if (raw.includes('$~') || raw.includes('$HOMEPATH')) {
          return resolvedHomePath;
        } else if (raw.includes('nonexistent')) {
            return resolvedNonExistentPath; // For the file not found test
        }
        return raw; // Default pass-through for other paths in this block
      });

      // Mock resolvePath to accept the resolved string and return MeldPath
      resolutionService.resolvePath.mockImplementation(async (resolvedPathString: string, context: ResolutionContext): Promise<MeldPath> => {
          // Simulate validation based on the resolved string
          return createMeldPath(resolvedPathString, unsafeCreateValidatedResourcePath(resolvedPathString), true);
      });

      fileSystemService.readFile.mockResolvedValue('mock content');
      fileSystemService.exists.mockResolvedValue(true); // Default to exists=true
    });

    it('should handle $. alias for project path', async () => {
      const pathInput = createTestPathObject('$./samples/nested.meld');
      const node = createTestImportNode({ pathObject: pathInput });
      const directiveContext: DirectiveContext = { currentFilePath: '/some/path.meld', state: stateService };

      await handler.execute(node, directiveContext);

      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(pathInput.raw, expect.objectContaining({ currentFilePath: '/some/path.meld' }));
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(resolvedProjectPath, expect.objectContaining({ currentFilePath: '/some/path.meld' }));
      expect(fileSystemService.exists).toHaveBeenCalledWith(resolvedProjectPath);
      expect(circularityService.beginImport).toHaveBeenCalledWith(resolvedProjectPath);
      expect(circularityService.endImport).toHaveBeenCalledWith(resolvedProjectPath);
    });

    it('should handle $PROJECTPATH for project path', async () => {
      const pathInput = createTestPathObject('$PROJECTPATH/samples/nested.meld');
      const node = createTestImportNode({ pathObject: pathInput });
      const directiveContext: DirectiveContext = { currentFilePath: '/some/path.meld', state: stateService };

      await handler.execute(node, directiveContext);
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(pathInput.raw, expect.objectContaining({ currentFilePath: '/some/path.meld' }));
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(resolvedProjectPath, expect.objectContaining({ currentFilePath: '/some/path.meld' }));
      expect(fileSystemService.exists).toHaveBeenCalledWith(resolvedProjectPath);
      expect(circularityService.beginImport).toHaveBeenCalledWith(resolvedProjectPath);
    });

    it('should handle $~ alias for home path', async () => {
      const pathInput = createTestPathObject('$~/examples/basic.meld');
      const node = createTestImportNode({ pathObject: pathInput });
      const directiveContext: DirectiveContext = { currentFilePath: '/some/path.meld', state: stateService };

      await handler.execute(node, directiveContext);
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(pathInput.raw, expect.objectContaining({ currentFilePath: '/some/path.meld' }));
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(resolvedHomePath, expect.objectContaining({ currentFilePath: '/some/path.meld' }));
      expect(fileSystemService.exists).toHaveBeenCalledWith(resolvedHomePath);
      expect(circularityService.beginImport).toHaveBeenCalledWith(resolvedHomePath);
    });

    it('should handle $HOMEPATH for home path', async () => {
      const pathInput = createTestPathObject('$HOMEPATH/examples/basic.meld');
      const node = createTestImportNode({ pathObject: pathInput });
      const directiveContext: DirectiveContext = { currentFilePath: '/some/path.meld', state: stateService };

      await handler.execute(node, directiveContext);
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(pathInput.raw, expect.objectContaining({ currentFilePath: '/some/path.meld' }));
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(resolvedHomePath, expect.objectContaining({ currentFilePath: '/some/path.meld' }));
      expect(fileSystemService.exists).toHaveBeenCalledWith(resolvedHomePath);
      expect(circularityService.beginImport).toHaveBeenCalledWith(resolvedHomePath);
    });

    it('should throw error if resolved path does not exist', async () => {
      fileSystemService.exists.mockResolvedValue(false);
      const pathInput = createTestPathObject('$PROJECTPATH/nonexistent.meld');
      const node = createTestImportNode({ pathObject: pathInput });
      const directiveContext: DirectiveContext = { currentFilePath: '/some/path.meld', state: stateService };

      await expectToThrowWithConfig(
        () => handler.execute(node, directiveContext),
        {
          type: DirectiveError,
          code: DirectiveErrorCode.FILE_NOT_FOUND,
          messageContains: resolvedNonExistentPath
        }
      );
      expect(circularityService.endImport).toHaveBeenCalledWith(resolvedNonExistentPath);
    });

    it.skip('should handle user-defined path variables in import path', async () => {
      const directiveContext: DirectiveContext = { currentFilePath: '/project/main.meld', state: stateService };
      const importLocation = createLocation(5, 1);

      const mockDocsPathVariable: IPathVariable = {
        type: VariableType.PATH,
        value: { type: 'filesystem', path: './local_docs' },
        validatedPath: unsafeCreateValidatedResourcePath('/project/local_docs'),
        metadata: {
            definedAt: createLocation(1, 1),
            origin: VariableOrigin.DIRECT_DEFINITION,
            createdAt: Date.now(),
            modifiedAt: Date.now(),
        }
      };

      const pathObject: StructuredPath = {
        raw: '$docs/file.meld',
        structured: {
          segments: ['file.meld'],
          variables: { path: ['docs'] },
        },
        isPathVariable: true,
      };
      const node = createTestImportNode({ pathObject, location: importLocation });

      const finalResolvedPath = '/project/local_docs/file.meld';
      resolutionService.resolvePath.mockResolvedValue(createMeldPath(pathObject.raw, unsafeCreateValidatedResourcePath(finalResolvedPath), true));

      fileSystemService.exists.mockResolvedValue(true);
      fileSystemService.readFile.mockResolvedValue('@text imported = "Imported content"');

      const parsedNodes: MeldNode[] = [
        { type: 'Directive', directive: { kind: 'text', identifier: 'imported', source: 'literal', value: [{ type: 'Text', content: 'Imported content', location: createLocation(1,1) }] }, location: createLocation(1,1) } as any
      ];
      parserService.parse.mockResolvedValue(parsedNodes as any);

      const importedTextVar: TextVariable = {
        type: VariableType.TEXT,
        name: 'imported',
        value: 'Imported content',
        metadata: { definedAt: createLocation(1, 1, finalResolvedPath), origin: VariableOrigin.DIRECT_DEFINITION, createdAt: Date.now(), modifiedAt: Date.now() }
      };
      childState.getAllTextVars.mockReturnValue(new Map([['imported', importedTextVar]]));

      await handler.execute(node, directiveContext);

      expect(resolutionService.resolvePath).toHaveBeenCalledWith(pathObject, expect.objectContaining({ purpose: 'import', currentFilePath: '/project/main.meld' }));
      expect(fileSystemService.exists).toHaveBeenCalledWith(finalResolvedPath);
      expect(fileSystemService.readFile).toHaveBeenCalledWith(finalResolvedPath);
      expect(parserService.parse).toHaveBeenCalledWith('@text imported = "Imported content"', { filePath: finalResolvedPath });
      expect(interpreterServiceClient.interpret).toHaveBeenCalledWith(parsedNodes as any[], expect.objectContaining({ initialState: childState, currentFilePath: finalResolvedPath }));
      expect(stateService.setTextVar).toHaveBeenCalledWith('imported', expect.objectContaining({
        type: VariableType.TEXT,
        value: 'Imported content',
        metadata: expect.objectContaining({
          origin: VariableOrigin.IMPORT,
          definedAt: importLocation,
          context: { importedFrom: importedTextVar.metadata }
        })
      }));
      expect(circularityService.beginImport).toHaveBeenCalledWith(finalResolvedPath.replace(/\/g, '/'));
      expect(circularityService.endImport).toHaveBeenCalledWith(finalResolvedPath.replace(/\/g, '/'));
    });
  });

  describe('basic importing', () => {
    it('should import all variables with *', async () => {
      const importPathRaw = 'imported.meld';
      const finalPath = '/project/imported.meld';
      const directiveContext = { currentFilePath: '/project/test.meld', state: stateService };
      const importLocation = createLocation(2, 1);
      const pathInput = createTestPathObject(importPathRaw);

      const node = createTestImportNode({
        pathObject: pathInput,
        imports: [{ name: '*' }],
        subtype: 'importAll',
        location: importLocation,
      });

      resolutionService.resolveInContext.mockResolvedValue(finalPath);
      resolutionService.resolvePath.mockResolvedValue(createMeldPath(finalPath, unsafeCreateValidatedResourcePath(finalPath), true));
      fileSystemService.exists.mockResolvedValue(true);
      fileSystemService.readFile.mockResolvedValue('@text greeting="Hello"\n@data info={ "val": 1 }');
      const parsedNodes: MeldNode[] = [
         { type: 'Directive', directive: { kind: 'text', identifier: 'greeting', source:'literal', value: [{ type: 'Text', content:'Hello' }] }, location: createLocation(1,1) } as any,
         { type: 'Directive', directive: { kind: 'data', identifier: 'info', source:'literal', value: { val: 1 } }, location: createLocation(2,1) } as any
      ];
      parserService.parse.mockResolvedValue(parsedNodes as any);

      const importedTextVar: TextVariable = { name: 'greeting', type: VariableType.TEXT, value: 'Hello', metadata: { definedAt: createLocation(1, 1, finalPath), origin: VariableOrigin.DIRECT_DEFINITION, createdAt: Date.now(), modifiedAt: Date.now() } };
      const importedDataVar: any = { name: 'info', type: 'data', value: { val: 1 }, metadata: { definedAt: createLocation(2, 1, finalPath), origin: VariableOrigin.DIRECT_DEFINITION, createdAt: Date.now(), modifiedAt: Date.now() } };
      childState.getAllTextVars.mockReturnValue(new Map([['greeting', importedTextVar]]));
      childState.getAllDataVars.mockReturnValue(new Map([['info', importedDataVar]]));
      (childState as any).getCurrentFilePath.mockReturnValue(finalPath);

      await handler.execute(node, directiveContext);

      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(importPathRaw, expect.objectContaining({ currentFilePath: '/project/test.meld' }));
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(finalPath, expect.objectContaining({ currentFilePath: '/project/test.meld' }));
      expect(fileSystemService.exists).toHaveBeenCalledWith(finalPath);
      expect(fileSystemService.readFile).toHaveBeenCalledWith(finalPath);
      expect(parserService.parse).toHaveBeenCalledWith('@text greeting="Hello"\n@data info={ "val": 1 }');
      expect(interpreterServiceClient.interpret).toHaveBeenCalledWith(parsedNodes as any[], expect.objectContaining({ initialState: childState, currentFilePath: finalPath }));
      expect(stateService.setTextVar).toHaveBeenCalledWith('greeting', 'Hello');
      expect(stateService.setDataVar).toHaveBeenCalledWith('info', { val: 1 });
      expect(circularityService.beginImport).toHaveBeenCalledWith(finalPath.replace(/\\\\/g, '/'));
      expect(circularityService.endImport).toHaveBeenCalledWith(finalPath.replace(/\\\\/g, '/'));
    });

    it('should import specific variables with alias', async () => {
      const importPathRaw = 'vars.meld';
      const finalPath = '/project/vars.meld';
      const directiveContext = { currentFilePath: '/project/test.meld', state: stateService };
      const importLocation = createLocation(3, 1);
      const pathInput = createTestPathObject(importPathRaw);

      const node = createTestImportNode({
        pathObject: pathInput,
        imports: [
          { name: 'var1', alias: null },
          { name: 'var2', alias: 'aliasedVar2' }
        ],
        subtype: 'importNamed',
        location: importLocation,
      });

      resolutionService.resolveInContext.mockResolvedValue(finalPath);
      resolutionService.resolvePath.mockResolvedValue(createMeldPath(finalPath, unsafeCreateValidatedResourcePath(finalPath), true));
      fileSystemService.exists.mockResolvedValue(true);
      fileSystemService.readFile.mockResolvedValue('@text var1="value1"\n@text var2="value2"\n@text var3="value3"');
      const parsedNodes: MeldNode[] = [
        { type: 'Directive', directive: { kind: 'text', identifier: 'var1', source:'literal', value: [{ type: 'Text', content:'value1'}] }, location: createLocation(1,1) } as any,
        { type: 'Directive', directive: { kind: 'text', identifier: 'var2', source:'literal', value: [{ type: 'Text', content:'value2'}] }, location: createLocation(2,1) } as any,
        { type: 'Directive', directive: { kind: 'text', identifier: 'var3', source:'literal', value: [{ type: 'Text', content:'value3'}] }, location: createLocation(3,1) } as any
      ];
      parserService.parse.mockResolvedValue(parsedNodes as any);

      const importedVar1: TextVariable = { name: 'var1', type: VariableType.TEXT, value: 'value1', metadata: { definedAt: createLocation(1, 1, finalPath), origin: VariableOrigin.DIRECT_DEFINITION, createdAt: Date.now(), modifiedAt: Date.now() } };
      const importedVar2: TextVariable = { name: 'var2', type: VariableType.TEXT, value: 'value2', metadata: { definedAt: createLocation(2, 1, finalPath), origin: VariableOrigin.DIRECT_DEFINITION, createdAt: Date.now(), modifiedAt: Date.now() } };
      const importedVar3: TextVariable = { name: 'var3', type: VariableType.TEXT, value: 'value3', metadata: { definedAt: createLocation(3, 1, finalPath), origin: VariableOrigin.DIRECT_DEFINITION, createdAt: Date.now(), modifiedAt: Date.now() } };
      childState.getAllTextVars.mockReturnValue(new Map([['var1', importedVar1], ['var2', importedVar2], ['var3', importedVar3]]));
      (childState as any).getCurrentFilePath.mockReturnValue(finalPath);

      const result = await handler.execute(node, directiveContext);

      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(importPathRaw, expect.objectContaining({ currentFilePath: '/project/test.meld' }));
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(finalPath, expect.objectContaining({ currentFilePath: '/project/test.meld' }));
      expect(fileSystemService.exists).toHaveBeenCalledWith(finalPath);
      expect(fileSystemService.readFile).toHaveBeenCalledWith(finalPath);
      expect(parserService.parse).toHaveBeenCalledWith('@text var1="value1"\n@text var2="value2"\n@text var3="value3"');
      expect(interpreterServiceClient.interpret).toHaveBeenCalledWith(parsedNodes as any[], expect.objectContaining({ initialState: childState, currentFilePath: finalPath }));

      expect(stateService.setTextVar).toHaveBeenCalledTimes(2);
      expect(stateService.setTextVar).toHaveBeenCalledWith('var1', 'value1');
      expect(stateService.setTextVar).toHaveBeenCalledWith('aliasedVar2', 'value2');
      expect(stateService.setTextVar).not.toHaveBeenCalledWith('var3', expect.any(String));

      expect(circularityService.beginImport).toHaveBeenCalledWith(finalPath.replace(/\\\\/g, '/'));
      expect(circularityService.endImport).toHaveBeenCalledWith(finalPath.replace(/\\\\/g, '/'));
      expect(result.replacement).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle validation errors from ValidationService', async () => {
      const pathInput = createTestPathObject('valid.meld');
      const node = createTestImportNode({ pathObject: pathInput });
      const directiveContext = { currentFilePath: '/project/test.meld', state: stateService };
      const validationError = new DirectiveError('Mock validation error', 'import', DirectiveErrorCode.VALIDATION_FAILED);
      validationService.validate.mockImplementationOnce(async () => { throw validationError; });

      await expectToThrowWithConfig(
        () => handler.execute(node, directiveContext),
        {
          type: DirectiveError,
          code: DirectiveErrorCode.VALIDATION_FAILED,
          messageContains: 'Mock validation error'
        }
      );
       expect(resolutionService.resolveInContext).not.toHaveBeenCalled();
    });

    it('should handle variable not found during path resolution', async () => {
      const pathInputRaw = '$invalidVar/path';
      const pathInput = createTestPathObject(pathInputRaw);
      const node = createTestImportNode({ pathObject: pathInput });
      const directiveContext = { currentFilePath: '/project/test.meld', state: stateService };
      const resolutionError = new MeldResolutionError('Variable not found: invalidVar', { code: 'VAR_NOT_FOUND' });
      resolutionService.resolveInContext.mockImplementationOnce(async () => { throw resolutionError; });

      await expectToThrowWithConfig(
        () => handler.execute(node, directiveContext),
        {
          type: DirectiveError,
          code: DirectiveErrorCode.RESOLUTION_FAILED,
          messageContains: 'Failed to resolve import path',
          cause: {
            type: MeldResolutionError,
            code: 'VAR_NOT_FOUND',
            messageContains: 'Variable not found: invalidVar'
          }
        }
      );
       expect(resolutionService.resolvePath).not.toHaveBeenCalled();
    });

    it('should handle file not found from FileSystemService', async () => {
      const pathInputRaw = 'missing.meld';
      const pathInput = createTestPathObject(pathInputRaw);
      const node = createTestImportNode({ pathObject: pathInput });
      const directiveContext = { currentFilePath: '/project/test.meld', state: stateService };
      const resolvedPathString = '/project/missing.meld';

      resolutionService.resolveInContext.mockResolvedValue(resolvedPathString);
      resolutionService.resolvePath.mockResolvedValue(createMeldPath(resolvedPathString, unsafeCreateValidatedResourcePath(resolvedPathString), true));
      fileSystemService.exists.mockResolvedValue(false);

      await expectToThrowWithConfig(
        () => handler.execute(node, directiveContext),
        {
          type: DirectiveError,
          code: DirectiveErrorCode.FILE_NOT_FOUND,
          messageContains: `File not found: ${resolvedPathString}`
        }
      );
       expect(resolutionService.resolveInContext).toHaveBeenCalledWith(pathInputRaw, expect.any(Object));
       expect(resolutionService.resolvePath).toHaveBeenCalledWith(resolvedPathString, expect.any(Object));
       expect(circularityService.endImport).toHaveBeenCalledWith(resolvedPathString.replace(/\\\\/g, '/'));
    });

    it('should handle circular imports from CircularityService', async () => {
      const pathInputRaw = 'circular.meld';
      const pathInput = createTestPathObject(pathInputRaw);
      const node = createTestImportNode({ pathObject: pathInput });
      const directiveContext = { currentFilePath: '/project/test.meld', state: stateService };
      const resolvedPathString = '/project/circular.meld';
      const circularError = new DirectiveError('Circular import detected: /project/circular.meld', 'import', DirectiveErrorCode.CIRCULAR_REFERENCE);

      resolutionService.resolveInContext.mockResolvedValue(resolvedPathString);
      resolutionService.resolvePath.mockResolvedValue(createMeldPath(resolvedPathString, unsafeCreateValidatedResourcePath(resolvedPathString), true));
      fileSystemService.exists.mockResolvedValue(true);
      circularityService.beginImport.mockImplementationOnce(() => { throw circularError; });

      await expectToThrowWithConfig(
        () => handler.execute(node, directiveContext),
        {
          type: DirectiveError,
          code: DirectiveErrorCode.CIRCULAR_REFERENCE,
          messageContains: 'Circular import detected'
        }
      );
       expect(resolutionService.resolveInContext).toHaveBeenCalledWith(pathInputRaw, expect.any(Object));
       expect(resolutionService.resolvePath).toHaveBeenCalledWith(resolvedPathString, expect.any(Object));
       expect(circularityService.beginImport).toHaveBeenCalledWith(resolvedPathString.replace(/\\\\/g, '/'));
      expect(circularityService.endImport).toHaveBeenCalledWith(resolvedPathString.replace(/\\\\/g, '/'));
    });

    it('should handle parse errors from ParserService', async () => {
      const pathInputRaw = 'parse_error.meld';
      const pathInput = createTestPathObject(pathInputRaw);
      const node = createTestImportNode({ pathObject: pathInput });
      const directiveContext = { currentFilePath: '/project/test.meld', state: stateService };
      const resolvedPathString = '/project/parse_error.meld';
      const parseError = new MeldError('Bad syntax in imported file', { code: 'PARSE_ERROR', severity: ErrorSeverity.Recoverable });

      resolutionService.resolveInContext.mockResolvedValue(resolvedPathString);
      resolutionService.resolvePath.mockResolvedValue(createMeldPath(resolvedPathString, unsafeCreateValidatedResourcePath(resolvedPathString), true));
      fileSystemService.exists.mockResolvedValue(true);
      fileSystemService.readFile.mockResolvedValue('invalid meld content');
      parserService.parse.mockRejectedValueOnce(parseError);

      await expectToThrowWithConfig(
        () => handler.execute(node, directiveContext),
        {
          type: DirectiveError,
          code: DirectiveErrorCode.PARSE_ERROR,
          messageContains: 'Bad syntax in imported file',
          cause: {
             type: MeldError,
             code: 'PARSE_ERROR'
          }
        }
      );
      expect(fileSystemService.readFile).toHaveBeenCalledWith(resolvedPathString);
      expect(parserService.parse).toHaveBeenCalledWith('invalid meld content');
      expect(circularityService.endImport).toHaveBeenCalledWith(resolvedPathString.replace(/\\\\/g, '/'));
    });

    it('should handle interpretation errors from InterpreterService', async () => {
      const pathInputRaw = 'interpret_error.meld';
      const pathInput = createTestPathObject(pathInputRaw);
      const node = createTestImportNode({ pathObject: pathInput });
      const directiveContext = { currentFilePath: '/project/test.meld', state: stateService };
      const resolvedPathString = '/project/interpret_error.meld';
      const interpretError = new MeldError('Interpretation failed', { code: 'INTERPRET_FAIL', severity: ErrorSeverity.Recoverable });
      const parsedNodes: MeldNode[] = [{ type: 'Text', content: 'content' } as any];

      resolutionService.resolveInContext.mockResolvedValue(resolvedPathString);
      resolutionService.resolvePath.mockResolvedValue(createMeldPath(resolvedPathString, unsafeCreateValidatedResourcePath(resolvedPathString), true));
      fileSystemService.exists.mockResolvedValue(true);
      fileSystemService.readFile.mockResolvedValue('content');
      parserService.parse.mockResolvedValue(parsedNodes as any);
      interpreterServiceClient.interpret.mockRejectedValueOnce(interpretError);

      await expectToThrowWithConfig(
        () => handler.execute(node, directiveContext),
        {
          type: DirectiveError,
          code: DirectiveErrorCode.INTERPRETATION_ERROR,
          messageContains: 'Interpretation failed',
           cause: {
             type: MeldError,
             code: 'INTERPRET_FAIL'
          }
        }
      );
       expect(parserService.parse).toHaveBeenCalledWith('content');
       expect(interpreterServiceClient.interpret).toHaveBeenCalledWith(parsedNodes as any[], expect.objectContaining({ initialState: childState, currentFilePath: resolvedPathString }));
      expect(circularityService.endImport).toHaveBeenCalledWith(resolvedPathString.replace(/\\\\/g, '/'));
    });
  });

  describe('cleanup', () => {
      it('should always call endImport on CircularityService even if read fails', async () => {
          const pathInputRaw = 'read_fail.meld';
          const pathInput = createTestPathObject(pathInputRaw);
          const node = createTestImportNode({ pathObject: pathInput });
          const directiveContext = { currentFilePath: '/project/test.meld', state: stateService };
          const resolvedPathString = '/project/read_fail.meld';
          const readError = new MeldError('Disk read failed', { code: 'FS_READ_ERROR', severity: ErrorSeverity.Recoverable });

          resolutionService.resolveInContext.mockResolvedValue(resolvedPathString);
          resolutionService.resolvePath.mockResolvedValue(createMeldPath(resolvedPathString, unsafeCreateValidatedResourcePath(resolvedPathString), true));
          fileSystemService.exists.mockResolvedValue(true);
          fileSystemService.readFile.mockRejectedValueOnce(readError);

          await expectToThrowWithConfig(
              () => handler.execute(node, directiveContext),
              {
                  type: DirectiveError,
                  code: DirectiveErrorCode.EXECUTION_FAILED,
                  messageContains: 'Disk read failed',
                  cause: { type: MeldError, code: 'FS_READ_ERROR' }
              }
          );

          expect(circularityService.endImport).toHaveBeenCalledWith(resolvedPathString.replace(/\\\\/g, '/'));
          expect(parserService.parse).not.toHaveBeenCalled();
      });
  });
}); 