import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import { ImportDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import type { IParserService } from '@services/pipeline/ParserService/IParserService';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService';
import type { ImportDirectiveData } from '@core/syntax/types/directives';
import type { MeldNode, DirectiveNode, StructuredPath, SourceLocation } from '@core/syntax/types/nodes';
import { VariableOrigin, type TextVariable, type MeldVariable, type VariableMetadata } from '@core/types/variables';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import { MeldFileNotFoundError } from '@core/errors/MeldFileNotFoundError';
import { MeldResolutionError, ResolutionErrorDetails } from '@core/errors/MeldResolutionError';
import { ErrorSeverity } from '@core/errors/MeldError';
import {
  expectToThrowWithConfig
} from '@tests/utils/ErrorTestUtils';
import { createLocation } from '@tests/utils/testFactories';
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
import type { IInterpreterServiceClient } from '@services/pipeline/InterpreterService/interfaces/IInterpreterServiceClient';
import type { IURLContentResolver } from '@services/resolution/URLContentResolver/IURLContentResolver';

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
 */
function createImportDirectiveNode(options: {
  path: string;
  importList?: string;
  imports?: Array<{ name: string; alias?: string }>;
  location?: ReturnType<typeof createLocation>;
}): DirectiveNode<ImportDirectiveData> {
  const { path, importList = '*', imports, location = createLocation(1, 1) } = options;
  
  // Format the directive structure as expected by the handler
  return {
    type: 'Directive',
    directive: {
      kind: 'import',
      // For backward compatibility, we set both path and identifier/value
      path,
      importList: importList,
      // New in meld-ast 3.4.0: structured imports array
      imports: imports || (importList && importList !== '*' ? 
        importList.split(',').map(part => {
          const trimmed = part.trim();
          if (trimmed.includes(' as ')) {
            const [name, alias] = trimmed.split(' as ').map(s => s.trim());
            return { name, alias };
          }
          return { name: trimmed };
        }) : 
        undefined),
      identifier: 'import',
      value: importList ? `path = "${path}" importList = "${importList}"` : `path = "${path}"`
    },
    location
  } as DirectiveNode<ImportDirectiveData>;
}

// Helper to create a valid PathValueObject for tests
function createTestPathObject(rawPath: string, isUrl: boolean = false): StructuredPath {
  // Basic mock structure, adjust segments etc. as needed per test
  return {
    raw: rawPath,
    structured: {
      segments: rawPath.split('/').filter(s => s !== '.' && s !== ''),
      url: isUrl,
      // variables: { text: [], special: [], path: [] } // Assume no vars unless specified by test
    },
    // interpolatedValue: undefined, // Add if testing quoted paths
    // isPathVariable: false,
  };
}

// Helper to create a basic ImportDirectiveNode for tests
function createTestImportNode(options: {
  pathObject: StructuredPath;
  imports?: Array<{ name: string; alias?: string | null }>;
  subtype?: 'importAll' | 'importStandard' | 'importNamed';
  location?: SourceLocation;
}): DirectiveNode<ImportDirectiveData> {
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

    // Create Mocks using standard factories where available
    validationService = createValidationServiceMock();
    stateService = createStateServiceMock();
    resolutionService = createResolutionServiceMock();
    fileSystemService = createFileSystemServiceMock();
    pathService = createPathServiceMock();
    childState = createStateServiceMock();

    // Manually create mocks for services/factories without dedicated mock creators
    parserService = mockDeep<IParserService>();
    interpreterServiceClientFactory = mockDeep<InterpreterServiceClientFactory>();
    interpreterServiceClient = mockDeep<IInterpreterServiceClient>();
    circularityService = mockDeep<ICircularityService>();
    urlContentResolver = mockDeep<IURLContentResolver>();

    // Register All Mocks with TestContextDI
    context.registerMock('IValidationService', validationService);
    context.registerMock('IStateService', stateService);
    context.registerMock('IResolutionService', resolutionService);
    context.registerMock('IFileSystemService', fileSystemService);
    context.registerMock('IPathService', pathService);
    context.registerMock('IParserService', parserService);
    context.registerMock('InterpreterServiceClientFactory', interpreterServiceClientFactory);
    context.registerMock('ICircularityService', circularityService);
    context.registerMock('IURLContentResolver', urlContentResolver);

    // Configure default mock behaviors (ensure interpreterServiceClient is configured)
    stateService.createChildState.mockReturnValue(childState);
    interpreterServiceClientFactory.createClient.mockReturnValue(interpreterServiceClient);
    interpreterServiceClient.interpret.mockResolvedValue(childState);

    vi.mocked(childState.getAllTextVars).mockReturnValue(new Map());
    vi.mocked(childState.getAllDataVars).mockReturnValue(new Map());
    vi.mocked(childState.getAllPathVars).mockReturnValue(new Map());
    vi.mocked(childState.getAllCommands).mockReturnValue(new Map());
    vi.mocked(childState.getCurrentFilePath).mockReturnValue('imported.meld');

    // Add default mock for resolvePath
    resolutionService.resolvePath.mockImplementation(async (pathInput) => {
      const raw = typeof pathInput === 'string' ? pathInput : pathInput.raw;
      // Basic default mock: assume file path relative to /project/
      const isUrl = raw.startsWith('http');
      const resolved = isUrl ? raw : `/project/${raw}`.replace('//','/'); // Basic join
      return createMeldPath(
        raw, 
        resolved as any, // Using 'any' for mock simplicity with branded types
        resolved.startsWith('/') || isUrl,
        true, // Assume validated for mock
        isUrl ? 'url' : 'filesystem'
      );
    });

    fileSystemService.exists.mockResolvedValue(true);
    fileSystemService.readFile.mockResolvedValue(''); 
    parserService.parse.mockResolvedValue({ nodes: [] }); 
    circularityService.beginImport.mockImplementation(() => {});
    circularityService.endImport.mockImplementation(() => {});
    urlContentResolver.validateURL.mockResolvedValue(undefined);
    urlContentResolver.fetchURL.mockResolvedValue({ content: '', url: '', fromCache: false });

    context.registerClass(ImportDirectiveHandler);

    await context.initialize();
    
    handler = await context.resolve(ImportDirectiveHandler);
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  describe('special path variables', () => {
    beforeEach(() => {
      resolutionService.resolvePathString.mockImplementation(async (rawPath) => {
        if (rawPath.includes('$.') || rawPath.includes('$PROJECTPATH')) {
          return '/project/path/test.meld';
        }
        if (rawPath.includes('$~') || rawPath.includes('$HOMEPATH')) {
          return '/home/user/test.meld';
        }
        return rawPath;
      });
      fileSystemService.readFile.mockResolvedValue('mock content');
    });

    it('should handle $. alias for project path', async () => {
      const pathObject = createTestPathObject('$./samples/nested.meld');
      const node = createTestImportNode({ pathObject });
      const directiveContext = { currentFilePath: '/some/path', state: stateService };

      await handler.execute(node, directiveContext);

      expect(resolutionService.resolvePathString).toHaveBeenCalledWith('$./samples/nested.meld', expect.any(Object));
      expect(fileSystemService.exists).toHaveBeenCalledWith('/project/path/test.meld');
      expect(circularityService.beginImport).toHaveBeenCalledWith('/project/path/test.meld');
      expect(circularityService.endImport).toHaveBeenCalledWith('/project/path/test.meld');
    });

    it('should handle $PROJECTPATH for project path', async () => {
      const pathObject = createTestPathObject('$PROJECTPATH/samples/nested.meld');
      const node = createTestImportNode({ pathObject });
      const directiveContext = { currentFilePath: '/some/path', state: stateService };

      await handler.execute(node, directiveContext);

      expect(resolutionService.resolvePathString).toHaveBeenCalledWith('$PROJECTPATH/samples/nested.meld', expect.any(Object));
      expect(fileSystemService.exists).toHaveBeenCalledWith('/project/path/test.meld');
      expect(circularityService.beginImport).toHaveBeenCalledWith('/project/path/test.meld');
    });

    it('should handle $~ alias for home path', async () => {
      const pathObject = createTestPathObject('$~/examples/basic.meld');
      const node = createTestImportNode({ pathObject });
      const directiveContext = { currentFilePath: '/some/path', state: stateService };

      await handler.execute(node, directiveContext);

      expect(resolutionService.resolvePathString).toHaveBeenCalledWith('$~/examples/basic.meld', expect.any(Object));
      expect(fileSystemService.exists).toHaveBeenCalledWith('/home/user/test.meld');
      expect(circularityService.beginImport).toHaveBeenCalledWith('/home/user/test.meld');
    });

    it('should handle $HOMEPATH for home path', async () => {
      const pathObject = createTestPathObject('$HOMEPATH/examples/basic.meld');
      const node = createTestImportNode({ pathObject });
      const directiveContext = { currentFilePath: '/some/path', state: stateService };

      await handler.execute(node, directiveContext);

      expect(resolutionService.resolvePathString).toHaveBeenCalledWith('$HOMEPATH/examples/basic.meld', expect.any(Object));
      expect(fileSystemService.exists).toHaveBeenCalledWith('/home/user/test.meld');
      expect(circularityService.beginImport).toHaveBeenCalledWith('/home/user/test.meld');
    });

    it('should throw error if resolved path does not exist', async () => {
      fileSystemService.exists.mockResolvedValue(false);
      const pathObject = createTestPathObject('$PROJECTPATH/nonexistent.meld');
      const node = createTestImportNode({ pathObject });
      const directiveContext = { currentFilePath: '/some/path', state: stateService };

      await expectToThrowDirectiveError(
        () => handler.execute(node, directiveContext),
        DirectiveErrorCode.FILE_NOT_FOUND,
        /File not found: \/project\/path\/test.meld/
      );
      expect(circularityService.endImport).toHaveBeenCalledWith('/project/path/test.meld');
    });

    it('should handle user-defined path variables in import path', async () => {
      const directiveContext = { currentFilePath: '/project/main.meld', state: stateService };
      const importLocation = createLocation(5, 1);

      const pathObject: StructuredPath = {
        raw: '$docs/file.meld',
        structured: {
          segments: ['file.meld'],
          variables: { path: ['docs'] },
        },
        isPathVariable: true,
      };
      const node = createTestImportNode({ pathObject, location: importLocation });

      const mockDocsPathVariable: IPathVariable = {
        type: 'path', valueType: 'filesystem', originalValue: './local_docs', validatedPath: '/project/local_docs',
        metadata: { definedAt: createLocation(1, 1), origin: VariableOrigin.DIRECT_DEFINITION }
      };
      resolutionService.resolveVariableReference.mockImplementation(async (refNode, ctx) => {
        if (refNode.identifier === 'docs' && refNode.valueType === 'path') {
          return mockDocsPathVariable;
        }
        return undefined;
      });
      resolutionService.resolvePathString.mockResolvedValue('/project/local_docs/file.meld');

      const finalPath = '/project/local_docs/file.meld';
      fileSystemService.exists.mockResolvedValue(true);
      fileSystemService.readFile.mockResolvedValue('@text imported = "Imported content"');
      
      const parsedNodes: MeldNode[] = [
        { type: 'Directive', directive: { kind: 'text', identifier: 'imported', source: 'literal', value: [{ type: 'Text', content: 'Imported content', location: createLocation(1,1) }] }, location: createLocation(1,1) } as any
      ];
      parserService.parse.mockResolvedValue({ nodes: parsedNodes });

      const importedTextVar: TextVariable = {
        type: 'text', value: 'Imported content',
        metadata: { definedAt: createLocation(1, 1, finalPath), origin: VariableOrigin.DIRECT_DEFINITION }
      };
      childState.getAllTextVars.mockReturnValue(new Map([['imported', importedTextVar]]));

      await handler.execute(node, directiveContext);

      expect(resolutionService.resolveVariableReference).toHaveBeenCalledWith(
        expect.objectContaining({ identifier: 'docs', valueType: 'path' }),
        expect.any(Object)
      );
      expect(resolutionService.resolvePathString).toHaveBeenCalledWith('$docs/file.meld', expect.any(Object));
      expect(fileSystemService.exists).toHaveBeenCalledWith(finalPath);
      expect(fileSystemService.readFile).toHaveBeenCalledWith(finalPath);
      expect(parserService.parse).toHaveBeenCalledWith('@text imported = "Imported content"', { filePath: finalPath });
      expect(interpreterServiceClient.interpret).toHaveBeenCalledWith(parsedNodes, expect.objectContaining({ initialState: childState, currentFilePath: finalPath }));
      expect(stateService.setTextVar).toHaveBeenCalledWith('imported', expect.objectContaining({
        type: 'text',
        value: 'Imported content',
        metadata: expect.objectContaining({
          origin: VariableOrigin.IMPORT,
          definedAt: importLocation,
          context: { importedFrom: importedTextVar.metadata.definedAt }
        })
      }));
      expect(circularityService.beginImport).toHaveBeenCalledWith(finalPath.replace(/\\/g, '/'));
      expect(circularityService.endImport).toHaveBeenCalledWith(finalPath.replace(/\\/g, '/'));
    });
  });

  describe('basic importing', () => {
    it('should import all variables with *', async () => {
      const importPath = 'imported.meld';
      const finalPath = '/project/imported.meld';
      const directiveContext = { currentFilePath: '/project/test.meld', state: stateService };
      const importLocation = createLocation(2, 1);

      const node = createTestImportNode({
        pathObject: createTestPathObject(importPath),
        imports: [{ name: '*' }],
        subtype: 'importAll',
        location: importLocation,
      });

      resolutionService.resolvePathString.mockResolvedValue(finalPath);
      fileSystemService.readFile.mockResolvedValue('@text greeting="Hello"\n@data info={ "val": 1 }');
      const parsedNodes: MeldNode[] = [
         { type: 'Directive', directive: { kind: 'text', identifier: 'greeting', source:'literal', value: [{ type: 'Text', content:'Hello' }] }, location: createLocation(1,1) } as any,
         { type: 'Directive', directive: { kind: 'data', identifier: 'info', source:'literal', value: { val: 1 } }, location: createLocation(2,1) } as any
      ];
      parserService.parse.mockResolvedValue({ nodes: parsedNodes });

      const importedTextVar: TextVariable = { type: 'text', value: 'Hello', metadata: { definedAt: createLocation(1, 1, finalPath), origin: VariableOrigin.DIRECT_DEFINITION } };
      const importedDataVar: any = { type: 'data', value: { val: 1 }, metadata: { definedAt: createLocation(2, 1, finalPath), origin: VariableOrigin.DIRECT_DEFINITION } };
      childState.getAllTextVars.mockReturnValue(new Map([['greeting', importedTextVar]]));
      childState.getAllDataVars.mockReturnValue(new Map([['info', importedDataVar]]));
      childState.getCurrentFilePath.mockReturnValue(finalPath);

      await handler.execute(node, directiveContext);

      expect(resolutionService.resolvePathString).toHaveBeenCalledWith(importPath, expect.any(Object));
      expect(fileSystemService.exists).toHaveBeenCalledWith(finalPath);
      expect(fileSystemService.readFile).toHaveBeenCalledWith(finalPath);
      expect(parserService.parse).toHaveBeenCalledWith(expect.any(String), { filePath: finalPath });
      expect(interpreterServiceClient.interpret).toHaveBeenCalledWith(parsedNodes, expect.objectContaining({ initialState: childState, currentFilePath: finalPath }));
      expect(stateService.createChildState).toHaveBeenCalled();

      expect(stateService.setTextVar).toHaveBeenCalledWith('greeting', expect.objectContaining({
        type: 'text',
        value: 'Hello',
        metadata: expect.objectContaining({ origin: VariableOrigin.IMPORT, definedAt: importLocation })
      }));
      expect(stateService.setDataVar).toHaveBeenCalledWith('info', expect.objectContaining({
        type: 'data',
        value: { val: 1 },
        metadata: expect.objectContaining({ origin: VariableOrigin.IMPORT, definedAt: importLocation })
      }));
      expect(circularityService.beginImport).toHaveBeenCalledWith(finalPath.replace(/\\/g, '/'));
      expect(circularityService.endImport).toHaveBeenCalledWith(finalPath.replace(/\\/g, '/'));
    });

    it('should import specific variables with alias', async () => {
      const importPath = 'vars.meld';
      const finalPath = '/project/vars.meld';
      const directiveContext = { currentFilePath: '/project/test.meld', state: stateService };
      const importLocation = createLocation(3, 1);

      const node = createTestImportNode({
        pathObject: createTestPathObject(importPath),
        imports: [
          { name: 'var1' },
          { name: 'var2', alias: 'alias2' }
        ],
        subtype: 'importNamed',
        location: importLocation
      });

      resolutionService.resolvePathString.mockResolvedValue(finalPath);
      fileSystemService.readFile.mockResolvedValue('@text var1="value1"\n@text var2="value2"\n@text var3="value3"');
      const parsedNodes: MeldNode[] = [
      ];
      parserService.parse.mockResolvedValue({ nodes: parsedNodes });

      const importedVar1: TextVariable = { type: 'text', value: 'value1', metadata: { definedAt: createLocation(1, 1, finalPath), origin: VariableOrigin.DIRECT_DEFINITION } };
      const importedVar2: TextVariable = { type: 'text', value: 'value2', metadata: { definedAt: createLocation(2, 1, finalPath), origin: VariableOrigin.DIRECT_DEFINITION } };
      const importedVar3: TextVariable = { type: 'text', value: 'value3', metadata: { definedAt: createLocation(3, 1, finalPath), origin: VariableOrigin.DIRECT_DEFINITION } };
      childState.getTextVar.mockImplementation(name => {
        if (name === 'var1') return importedVar1;
        if (name === 'var2') return importedVar2;
        if (name === 'var3') return importedVar3;
        return undefined;
      });
      childState.getCurrentFilePath.mockReturnValue(finalPath);

      const result = await handler.execute(node, directiveContext);

      expect(resolutionService.resolvePathString).toHaveBeenCalledWith(importPath, expect.any(Object));
      expect(fileSystemService.exists).toHaveBeenCalledWith(finalPath);
      expect(fileSystemService.readFile).toHaveBeenCalledWith(finalPath);
      expect(interpreterServiceClient.interpret).toHaveBeenCalled();

      expect(stateService.setTextVar).toHaveBeenCalledWith('var1', expect.objectContaining({
        value: 'value1',
        metadata: expect.objectContaining({ origin: VariableOrigin.IMPORT, definedAt: importLocation })
      }));
      expect(stateService.setTextVar).toHaveBeenCalledWith('alias2', expect.objectContaining({
        value: 'value2',
        metadata: expect.objectContaining({ origin: VariableOrigin.IMPORT, definedAt: importLocation })
      }));
      expect(stateService.setTextVar).not.toHaveBeenCalledWith('var3', expect.anything());
      expect(stateService.setTextVar).not.toHaveBeenCalledWith('var2', expect.anything());

      expect(result).toBe(stateService);
      expect(circularityService.beginImport).toHaveBeenCalledWith(finalPath.replace(/\\/g, '/'));
      expect(circularityService.endImport).toHaveBeenCalledWith(finalPath.replace(/\\/g, '/'));
    });
  });

  describe('error handling', () => {
    it('should handle validation errors from ValidationService', async () => {
      const node = createTestImportNode({ pathObject: createTestPathObject('') });
      const directiveContext = { currentFilePath: 'test.meld', state: stateService };
      const validationError = new DirectiveError('Path cannot be empty', 'import', DirectiveErrorCode.VALIDATION_FAILED);

      validationService.validate.mockRejectedValueOnce(validationError);

      await expectToThrowDirectiveError(
        () => handler.execute(node, directiveContext),
        DirectiveErrorCode.VALIDATION_FAILED,
        'Path cannot be empty'
      );
      expect(validationService.validate).toHaveBeenCalledWith(node);
    });

    it('should handle variable not found during path resolution', async () => {
      const pathObject: StructuredPath = { raw: '{{nonexistent}}/file', structured: { variables: { text: ['nonexistent'] } }, interpolatedValue: [] } as any;
      const node = createTestImportNode({ pathObject });
      const directiveContext = { currentFilePath: '/some/path', state: stateService };
      const resolutionError = new MeldResolutionError('Variable not found: nonexistent');

      resolutionService.resolveInterpolatableValue.mockRejectedValueOnce(resolutionError);

      await expectToThrowDirectiveError(
        () => handler.execute(node, directiveContext),
        DirectiveErrorCode.EXECUTION_FAILED,
        /Import directive error: Variable not found: nonexistent/
      );
      expect(circularityService.beginImport).not.toHaveBeenCalled();
      expect(circularityService.endImport).not.toHaveBeenCalled();
    });

    it('should handle file not found from FileSystemService', async () => {
      const pathObject = createTestPathObject('missing.meld');
      const node = createTestImportNode({ pathObject });
      const directiveContext = { currentFilePath: '/some/path', state: stateService };
      const resolvedPath = '/project/missing.meld';

      resolutionService.resolvePathString.mockResolvedValue(resolvedPath);
      fileSystemService.exists.mockResolvedValue(false);

      await expectToThrowDirectiveError(
        () => handler.execute(node, directiveContext),
        DirectiveErrorCode.FILE_NOT_FOUND,
        /File not found: \/project\/missing.meld/
      );
      expect(circularityService.endImport).toHaveBeenCalledWith(resolvedPath.replace(/\\/g, '/'));
    });

    it('should handle circular imports from CircularityService', async () => {
      const pathObject = createTestPathObject('circular.meld');
      const node = createTestImportNode({ pathObject });
      const directiveContext = { currentFilePath: 'test.meld', state: stateService };
      const resolvedPath = '/project/circular.meld';
      const circularError = new DirectiveError('Circular import detected: /project/circular.meld', 'import', DirectiveErrorCode.CIRCULAR_REFERENCE);

      resolutionService.resolvePathString.mockResolvedValue(resolvedPath);
      fileSystemService.exists.mockResolvedValue(true);
      circularityService.beginImport.mockImplementationOnce(() => { throw circularError; });

      await expectToThrowDirectiveError(
        () => handler.execute(node, directiveContext),
          DirectiveErrorCode.CIRCULAR_REFERENCE,
        /Circular import detected: \/project\/circular.meld/
      );
      expect(circularityService.beginImport).toHaveBeenCalledWith(resolvedPath.replace(/\\/g, '/'));
      expect(circularityService.endImport).not.toHaveBeenCalled();
    });

    it('should handle parse errors from ParserService', async () => {
      const pathObject = createTestPathObject('invalid.meld');
      const node = createTestImportNode({ pathObject });
      const directiveContext = { currentFilePath: 'test.meld', state: stateService };
      const resolvedPath = '/project/invalid.meld';
      const parseError = new Error('Bad syntax in imported file');

      resolutionService.resolvePathString.mockResolvedValue(resolvedPath);
      fileSystemService.readFile.mockResolvedValue('invalid meld content');
      parserService.parse.mockRejectedValueOnce(parseError);

      await expectToThrowDirectiveError(
        () => handler.execute(node, directiveContext),
        DirectiveErrorCode.EXECUTION_FAILED,
        /Import directive error: Bad syntax in imported file/
      );
      expect(parserService.parse).toHaveBeenCalledWith('invalid meld content', { filePath: resolvedPath });
      expect(circularityService.endImport).toHaveBeenCalledWith(resolvedPath.replace(/\\/g, '/'));
    });

    it('should handle interpretation errors from InterpreterService', async () => {
      const pathObject = createTestPathObject('error.meld');
      const node = createTestImportNode({ pathObject });
      const directiveContext = { currentFilePath: 'test.meld', state: stateService };
      const resolvedPath = '/project/error.meld';
      const interpretError = new Error('Runtime error during interpretation');
      const parsedNodes: MeldNode[] = [{ type: 'Text', content: 'content' } as any];

      resolutionService.resolvePathString.mockResolvedValue(resolvedPath);
      fileSystemService.readFile.mockResolvedValue('content');
      parserService.parse.mockResolvedValue({ nodes: parsedNodes });
      interpreterServiceClient.interpret.mockRejectedValueOnce(interpretError);

      await expectToThrowDirectiveError(
        () => handler.execute(node, directiveContext),
        DirectiveErrorCode.EXECUTION_FAILED,
        /Failed to interpret imported file: Runtime error during interpretation/
      );
      expect(interpreterServiceClient.interpret).toHaveBeenCalledWith(parsedNodes, expect.any(Object));
      expect(circularityService.endImport).toHaveBeenCalledWith(resolvedPath.replace(/\\/g, '/'));
    });
  });

  describe('cleanup', () => {
    it('should always call endImport on CircularityService even if read fails', async () => {
      const pathObject = createTestPathObject('read_error.meld');
      const node = createTestImportNode({ pathObject });
      const directiveContext = { currentFilePath: 'test.meld', state: stateService };
      const resolvedPath = '/project/read_error.meld';
      const readError = new Error('Disk read failed');

      resolutionService.resolvePathString.mockResolvedValue(resolvedPath);
      fileSystemService.exists.mockResolvedValue(true);
      fileSystemService.readFile.mockRejectedValueOnce(readError);

      await expectToThrowDirectiveError(
        () => handler.execute(node, directiveContext),
        DirectiveErrorCode.EXECUTION_FAILED,
        /Import directive error: Disk read failed/
      );
      expect(circularityService.beginImport).toHaveBeenCalledWith(resolvedPath.replace(/\\/g, '/'));
      expect(circularityService.endImport).toHaveBeenCalledWith(resolvedPath.replace(/\\/g, '/'));
    });
  });
}); 