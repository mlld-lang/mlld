import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockDeep, DeepMockProxy } from 'vitest-mock-extended';
import type { DirectiveNode, TextNode, StructuredPath as PathValueObject, MeldNode, SourceLocation, InterpolatableValue, VariableReferenceNode } from '@core/syntax/types/nodes';
import type { MeldPath, ValidatedResourcePath } from '@core/types/paths.js';
import { VariableOrigin, type TextVariable, VariableType, type VariableDefinition, type DataVariable, type IPathVariable, type CommandVariable } from '@core/types/variables.js';
import { ImportDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService, ResolutionContext, FormattingContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import type { DirectiveResult } from '@core/directives/DirectiveHandler';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { createTestLocation, createTestText, createTestDirective, createTestCodeFence } from '@tests/utils/nodeFactories.js';
import { expectToThrowWithConfig } from '@tests/utils/ErrorTestUtils.js';
import { importDirectiveExamples } from '@core/syntax/index';
import { createNodeFromExample } from '@core/syntax/helpers';
import { InterpreterServiceClientFactory } from '@services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory.js';
import type { IInterpreterServiceClient } from '@services/pipeline/InterpreterService/interfaces/IInterpreterServiceClient.js';
import { createMeldPath, unsafeCreateValidatedResourcePath, PathContentType } from '@core/types/paths';
import type { DirectiveProcessingContext, OutputFormattingContext } from '@core/types/index.js';
import { DirectiveTestFixture, type DirectiveTestOptions } from '@tests/utils/fixtures/DirectiveTestFixture.js';
import { MockFactory } from '@tests/utils/mocks/MockFactory.js';
import type { IStateTrackingService } from '@tests/utils/debug/StateTrackingService/IStateTrackingService.js';
import { MeldFileNotFoundError } from '@core/errors/MeldFileNotFoundError.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import crypto from 'crypto';
import { ResolutionFlags } from '@core/types/resolution.js';
import type { IURLContentResolver } from '@services/resolution/URLContentResolver/IURLContentResolver.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import { container, DependencyContainer } from 'tsyringe';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';

// Mock the logger using vi.mock
vi.mock('@core/utils/logger', () => {
  // DEFINE the mock object INSIDE the factory function
  const mockLoggerObject = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
  return { 
    // Ensure all exported loggers are mocked if needed by the SUT
    importLogger: mockLoggerObject, 
    directiveLogger: mockLoggerObject, // Add other loggers if imported directly
    logger: mockLoggerObject, // Add default logger if imported directly
    default: mockLoggerObject // ADD default export
    // ... add other exported loggers as needed
  };
});

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

// Local definition of reconstructRawString (copied from parser helpers)
function reconstructRawString(nodes: InterpolatableValue | string | PathValueObject): string {
  if (!Array.isArray(nodes)) {
    // Handle case where PathValueObject is passed directly
    if (typeof nodes === 'object' && nodes !== null && 'raw' in nodes) {
        return nodes.raw;
    }
    return String(nodes || '');
  }
  return nodes.map(node => {
    if (!node || typeof node !== 'object') {
      return '';
    }
    if (node.type === 'Text') { 
      return node.content || '';
    }
    if (node.type === 'VariableReference') { 
      let fieldsStr = '';
      if (node.fields && node.fields.length > 0) {
        fieldsStr = node.fields.map(f => {
          if (f.type === 'field') return '.' + f.value;
          if (f.type === 'index') {
              if (typeof f.value === 'string') {
                  return `[${f.value}]`;
              } else {
                  return `[${f.value}]`;
              }
          }
          return '';
        }).join('');
      }
      let formatStr = node.format ? `>>${node.format}` : '';

      if (node.valueType === 'path') {
        return `$${node.identifier}${fieldsStr}${formatStr}`;
      }
      return `{{${node.identifier}${fieldsStr}${formatStr}}}`;
    }
    return '';
  }).join('');
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
  const nodeId = crypto.randomUUID();
  return {
    type: 'Directive',
    directive: {
      kind: 'import',
      subtype,
      path: pathObject,
      imports,
    },
    location,
    nodeId,
  };
}

// >>> REFACTOR HELPER HERE <<<
const createMockInterpretedState = (vars: { text?: Map<string, VariableDefinition>, data?: Map<string, VariableDefinition>, path?: Map<string, VariableDefinition>, command?: Map<string, VariableDefinition> } = {}): IStateService => {
    const textMap = vars.text ?? new Map<string, VariableDefinition>();
    const dataMap = vars.data ?? new Map<string, VariableDefinition>();
    const pathMap = vars.path ?? new Map<string, VariableDefinition>();
    const commandMap = vars.command ?? new Map<string, VariableDefinition>();

    // Return a plain object implementing the necessary IStateService methods
    return {
        getStateId: vi.fn().mockReturnValue(`mock-interpreted-${crypto.randomUUID()}`),
        getAllTextVars: vi.fn().mockReturnValue(textMap),
        getAllDataVars: vi.fn().mockReturnValue(dataMap),
        getAllPathVars: vi.fn().mockReturnValue(pathMap),
        getAllCommands: vi.fn().mockReturnValue(commandMap),
        getTransformedNodes: vi.fn().mockReturnValue([]),
        // Add stubs for other potentially accessed methods by ImportDirectiveHandler
        getCurrentFilePath: vi.fn().mockReturnValue('/imported/transform/file.meld'), // Default path
        isTransformationEnabled: vi.fn().mockReturnValue(true), // Assume true for transformation tests
        setVariable: vi.fn(),
        getVariable: vi.fn().mockImplementation((name: string) => { 
            return textMap.get(name) ?? dataMap.get(name) ?? pathMap.get(name) ?? commandMap.get(name);
        }),
        setCurrentFilePath: vi.fn(),
        clone: vi.fn(),
        getNodes: vi.fn().mockReturnValue([]),
        addNode: vi.fn(),
        createChildState: vi.fn(),
        mergeChildState: vi.fn(),
        // Add any other methods if linting/errors indicate they are needed
    } as unknown as IStateService; // Use type assertion as we are partially mocking
};

describe('ImportDirectiveHandler Transformation', () => {
  let handler: ImportDirectiveHandler;
  let stateService: DeepMockProxy<IStateService>;
  let resolutionService: DeepMockProxy<IResolutionService>;
  let fileSystemService: DeepMockProxy<IFileSystemService>;
  let pathService: DeepMockProxy<IPathService>;
  let parserService: DeepMockProxy<IParserService>;
  let interpreterServiceClientFactory: DeepMockProxy<InterpreterServiceClientFactory>;
  let interpreterServiceClient: DeepMockProxy<IInterpreterServiceClient>;
  let circularityService: DeepMockProxy<ICircularityService>;
  let validationService: DeepMockProxy<IValidationService>;
  let urlContentResolver: DeepMockProxy<IURLContentResolver>;
  let context: TestContextDI;
  let mockProcessingContext: DirectiveProcessingContext;

  beforeEach(async () => {
    context = TestContextDI.createIsolated();

    stateService = mockDeep<IStateService>();
    resolutionService = mockDeep<IResolutionService>();
    fileSystemService = mockDeep<IFileSystemService>();
    pathService = mockDeep<IPathService>();
    parserService = mockDeep<IParserService>();
    circularityService = mockDeep<ICircularityService>();
    validationService = mockDeep<IValidationService>();
    interpreterServiceClient = mockDeep<IInterpreterServiceClient>();
    interpreterServiceClientFactory = mockDeep<InterpreterServiceClientFactory>();
    urlContentResolver = mockDeep<IURLContentResolver>();
    const stateTrackingService = mockDeep<IStateTrackingService>();

    interpreterServiceClientFactory.createClient.mockReturnValue(interpreterServiceClient);
    interpreterServiceClient.interpret.mockResolvedValue(createMockInterpretedState());
    circularityService.beginImport.mockImplementation(() => {});
    circularityService.endImport.mockImplementation(() => {});
    validationService.validate.mockResolvedValue();
    stateService.isTransformationEnabled.mockReturnValue(true);
    stateService.createChildState.mockResolvedValue(mockDeep<IStateService>({ setCurrentFilePath: vi.fn() }));
    stateService.getCurrentFilePath.mockReturnValue('/project/transform.meld');
    fileSystemService.exists.mockResolvedValue(true);
    fileSystemService.readFile.mockResolvedValue('@text var1="value1"');
    parserService.parse.mockResolvedValue([] as MeldNode[]);
    resolutionService.resolveInContext.mockImplementation(async (value) => typeof value === 'string' ? value : (value as PathValueObject).raw ?? '');
    resolutionService.resolvePath.mockImplementation(async (pathInput, ctx) => {
        let raw = '';
        if (typeof pathInput === 'string') raw = pathInput;
        else if (Array.isArray(pathInput)) raw = reconstructRawString(pathInput);
        else raw = (pathInput as PathValueObject)?.raw ?? '';
        const currentPath = ctx?.currentFilePath ?? '/project/main.meld';
        const baseDir = currentPath.substring(0, currentPath.lastIndexOf('/'));
        const isUrl = raw.startsWith('http');
        const resolved = isUrl ? raw : `${baseDir}/${raw}`.replace(/\/\//g, '/');
        return createMeldPath(raw, unsafeCreateValidatedResourcePath(resolved), resolved.startsWith('/') || isUrl);
    });

    // Register all mocks
    context.registerMock('IStateService', stateService);
    context.registerMock('IResolutionService', resolutionService);
    context.registerMock('IFileSystemService', fileSystemService);
    context.registerMock('IPathService', pathService);
    context.registerMock('IParserService', parserService);
    context.registerMock('ICircularityService', circularityService);
    context.registerMock('IValidationService', validationService);
    context.registerMock(InterpreterServiceClientFactory, interpreterServiceClientFactory);
    context.registerMock('IURLContentResolver', urlContentResolver);
    context.registerMock('IStateTrackingService', stateTrackingService);
    context.registerMock('ILogger', { 
      debug: vi.fn(), 
      info: vi.fn(), 
      warn: vi.fn(), 
      error: vi.fn() 
    });
    context.registerMock('DependencyContainer', context.container.getContainer());
    // <<< ADD MISSING DEPENDENCIES for Factory/Lazy Resolution >>>
    const mockInterpreterService = mockDeep<IInterpreterService>(); // Basic mock
    context.registerMock('IInterpreterService', mockInterpreterService);

    // <<< FIX: Explicitly register the handler class using the underlying container >>>
    context.container.getContainer().register(ImportDirectiveHandler, { useClass: ImportDirectiveHandler });

    // Resolve handler via DI AFTER registering all dependencies
    handler = context.resolveSync(ImportDirectiveHandler);
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  // Updated helper to create full DirectiveProcessingContext
  const createMockProcessingContext = (node: DirectiveNode): DirectiveProcessingContext => {
      // Fix mock creation: remove clone, ensure flags match interface
      const mockResolutionContext: ResolutionContext = {
          currentFilePath: stateService.getCurrentFilePath() ?? undefined,
          state: stateService,
          strict: true, 
          flags: {
            isVariableEmbed: false,
            isTransformation: true, 
            allowRawContentResolution: false,
            isDirectiveHandler: true,
            isImportContext: true, 
            processNestedVariables: true, 
          } as ResolutionFlags, 
          depth: 0, 
          withIncreasedDepth: vi.fn().mockReturnThis(), 
          withStrictMode: vi.fn().mockReturnThis(),
          withAllowedTypes: vi.fn().mockReturnThis(),
          withFlags: vi.fn().mockReturnThis(),
          withFormattingContext: vi.fn().mockReturnThis(),
          withPathContext: vi.fn().mockReturnThis(),
          withParserFlags: vi.fn().mockReturnThis(),
      };
      
      const mockFormattingContext: OutputFormattingContext = { 
          isBlock: false, 
          preserveLiteralFormatting: false, 
          preserveWhitespace: false 
      };

      if (!stateService) {
        throw new Error('Test setup error: stateService is not defined');
      }
      return {
          state: stateService, 
          resolutionContext: mockResolutionContext,
          directiveNode: node,
          formattingContext: mockFormattingContext, 
      };
  };

  describe('transformation behavior', () => {
    it.skip('should return DirectiveResult with empty text node replacement when transformation enabled', async () => {
      const importPath = 'imported.meld';
      const finalPath = '/project/imported.meld';
      const importLocation = createTestLocation(5, 1);
      const node = createTestImportNode({
        pathObject: createTestPathObject(importPath),
        location: importLocation
      });

      // Configure service mocks for this specific test
      resolutionService.resolveInContext.mockResolvedValueOnce(finalPath);
      resolutionService.resolvePath.mockResolvedValueOnce(createMeldPath(importPath, unsafeCreateValidatedResourcePath(finalPath), true));
      fileSystemService.readFile.mockResolvedValueOnce('@text var1="value1"');
      parserService.parse.mockResolvedValueOnce([]); // Assume empty parse result for simplicity here

      // Mock the state returned by the *interpreted* import
      const textVarMap = new Map<string, TextVariable>();
      textVarMap.set('var1', { name: 'var1', type: VariableType.TEXT, value: 'value1', metadata: {} as any });
      const mockInterpretedState = createMockInterpretedState({ text: textVarMap });
      interpreterServiceClient.interpret.mockResolvedValueOnce(mockInterpretedState);

      mockProcessingContext = createMockProcessingContext(node);
      const result = await handler.handle(mockProcessingContext as DirectiveProcessingContext) as DirectiveResult;

      expect(result.replacement).toEqual<TextNode[] | undefined>([{
        type: 'Text',
        content: '', 
        location: importLocation,
        nodeId: expect.any(String) // Check for nodeId
      }]);
      // Check stateChanges instead of direct calls
      expect(result.stateChanges?.variables).toHaveProperty('var1');
      expect(result.stateChanges?.variables?.var1?.value).toBe('value1');
    });

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

      resolutionService.resolveInContext.mockResolvedValueOnce(finalPath);
      resolutionService.resolvePath.mockResolvedValueOnce(createMeldPath(importPath, unsafeCreateValidatedResourcePath(finalPath), true));
      fileSystemService.readFile.mockResolvedValueOnce('@text var1="v1"\n@text var2="v2"');
      parserService.parse.mockResolvedValueOnce([]);

      // Mock interpreted state
      const textMap = new Map<string, TextVariable>();
      textMap.set('var1', { name: 'var1', type: VariableType.TEXT, value: 'v1', metadata: {} as any });
      textMap.set('var2', { name: 'var2', type: VariableType.TEXT, value: 'v2', metadata: {} as any });
      const mockInterpretedState = createMockInterpretedState({ text: textMap });
      interpreterServiceClient.interpret.mockResolvedValueOnce(mockInterpretedState);

      mockProcessingContext = createMockProcessingContext(node);
      const result = await handler.handle(mockProcessingContext as DirectiveProcessingContext) as DirectiveResult;

      // Check stateChanges
      expect(result.stateChanges?.variables).toHaveProperty('var1');
      expect(result.stateChanges?.variables?.var1?.value).toBe('v1');
      expect(result.stateChanges?.variables).toHaveProperty('alias2');
      expect(result.stateChanges?.variables?.alias2?.value).toBe('v2');
      expect(result.stateChanges?.variables).not.toHaveProperty('var2');
      expect(result.replacement).toEqual([{
        type: 'Text',
        content: '',
        location: importLocation,
        nodeId: expect.any(String)
      }]);
    });

    it('should preserve error handling and cleanup in transformation mode', async () => {
      const importPath = 'missing.meld';
      const finalPath = '/project/missing.meld';
      const importLocation = createTestLocation(1, 1);
      const node = createTestImportNode({
        pathObject: createTestPathObject(importPath),
        location: importLocation
      });
      
      resolutionService.resolveInContext.mockResolvedValue(finalPath);
      resolutionService.resolvePath.mockResolvedValue(createMeldPath(importPath, unsafeCreateValidatedResourcePath(finalPath), true));
      // Configure mocks for error path
      fileSystemService.exists.mockResolvedValue(false); 
      // No need to mock readFile if exists is false

      mockProcessingContext = createMockProcessingContext(node);

      await expectToThrowWithConfig(
        () => handler.handle(mockProcessingContext as DirectiveProcessingContext),
        {
          type: 'DirectiveError',
          code: DirectiveErrorCode.FILE_NOT_FOUND,
          messageContains: 'Import file not found:' 
        }
      );
      expect(circularityService.endImport).toHaveBeenCalledWith(finalPath.replace(/\\/g, '/'));
    });
  });
}); 