import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ImportDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import type { ImportDirectiveData } from '@core/syntax/types/directives.js';
import type { MeldNode, DirectiveNode, StructuredPath, SourceLocation, VariableReferenceNode, InterpolatableValue, TextNode } from '@core/syntax/types/nodes.js';
import { VariableOrigin, type TextVariable, type MeldVariable, type VariableMetadata, type IPathVariable, VariableType, type DataVariable } from '@core/types/variables.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { MeldFileNotFoundError } from '@core/errors/MeldFileNotFoundError.js';
import { MeldResolutionError, ResolutionErrorDetails } from '@core/errors/MeldResolutionError.js';
import { ErrorSeverity, MeldError } from '@core/errors/MeldError.js';
import { expectToThrowWithConfig, ErrorTestOptions } from '@tests/utils/ErrorTestUtils.js';
import { createTestLocation, createTestText } from '@tests/utils/nodeFactories.js';
import { createLocation, createDirectiveNode } from '@tests/utils/testFactories.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import type { InterpreterServiceClientFactory } from '@services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory.js';
import type { IInterpreterServiceClient } from '@services/pipeline/InterpreterService/interfaces/IInterpreterServiceClient.js';
import type { IURLContentResolver } from '@services/resolution/URLContentResolver/IURLContentResolver.js';
import type { MeldPath, PathPurpose, ValidatedResourcePath } from '@core/types/paths.js';
import { createMeldPath, unsafeCreateValidatedResourcePath, PathContentType } from '@core/types/paths.js';
import type { URLResponse } from '@services/fs/PathService/IURLCache';
import type { DirectiveProcessingContext, OutputFormattingContext } from '@core/types/index.js';
import type { ResolutionContext, FormattingContext } from '@core/types/resolution.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import { MockFactory } from '@tests/utils/mocks/MockFactory.js';
import type { DirectiveResult } from '@services/pipeline/DirectiveService/types.js';
import { mock, mockDeep, DeepMockProxy } from 'vitest-mock-extended';
import path from 'path';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import { container, type DependencyContainer } from 'tsyringe';
import { createTextVariable, createDataVariable, createPathVariable, createCommandVariable } from '@core/types/variables.js';

/**
 * ImportDirectiveHandler Test Status
 * ----------------------------------------
 * MIGRATION STATUS: Phase 5 ✅ (Using TestContextDI helpers)
 * This test file has been migrated to use:
 * - TestContextDI helpers for container management
 * - Standard mocks provided by TestContextDI/MockFactory
 * - vi.spyOn on resolved mocks for test-specific behavior
 */

// Mock logger
const mockLoggerObject = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
vi.mock('@core/utils/logger', () => ({ importLogger: mockLoggerObject }));

describe('ImportDirectiveHandler', () => {
  let handler: ImportDirectiveHandler;
  let stateService: DeepMockProxy<IStateService>;
  let resolutionService: DeepMockProxy<IResolutionService>;
  let fileSystemService: DeepMockProxy<IFileSystemService>;
  let pathService: DeepMockProxy<IPathService>;
  let parserService: DeepMockProxy<IParserService>;
  let interpreterServiceClientFactory: DeepMockProxy<InterpreterServiceClientFactory>;
  let interpreterServiceClient: DeepMockProxy<IInterpreterServiceClient>;
  let circularityService: DeepMockProxy<ICircularityService>;
  let urlContentResolver: DeepMockProxy<IURLContentResolver>;
  let testContainer: DependencyContainer;
  let mockProcessingContext: DirectiveProcessingContext;
  let validationService: DeepMockProxy<IValidationService>;

  beforeEach(async () => {
    stateService = mockDeep<IStateService>();
    resolutionService = mockDeep<IResolutionService>();
    fileSystemService = mockDeep<IFileSystemService>();
    pathService = mockDeep<IPathService>();
    parserService = mockDeep<IParserService>();
    interpreterServiceClientFactory = mockDeep<InterpreterServiceClientFactory>();
    interpreterServiceClient = mockDeep<IInterpreterServiceClient>();
    circularityService = mockDeep<ICircularityService>();
    urlContentResolver = mockDeep<IURLContentResolver>();
    validationService = mockDeep<IValidationService>();

    testContainer = container.createChildContainer();

    testContainer.registerInstance('ILogger', mockLoggerObject);
    testContainer.registerInstance('IStateService', stateService);
    testContainer.registerInstance('IResolutionService', resolutionService);
    testContainer.registerInstance('IFileSystemService', fileSystemService);
    testContainer.registerInstance('IPathService', pathService);
    testContainer.registerInstance('IParserService', parserService);
    testContainer.registerInstance('InterpreterServiceClientFactory', interpreterServiceClientFactory);
    testContainer.registerInstance('ICircularityService', circularityService);
    testContainer.registerInstance('IURLContentResolver', urlContentResolver);
    testContainer.registerInstance('IValidationService', validationService);

    handler = testContainer.resolve(ImportDirectiveHandler);
    
    interpreterServiceClientFactory.createClient.mockReturnValue(interpreterServiceClient);

    const interpretError = new Error('Simulated Interpretation failed');
    interpreterServiceClient.interpret.mockRejectedValue(interpretError); 
    interpreterServiceClient.createChildContext.mockResolvedValue(mockDeep<IStateService>());

    stateService.createChildState.mockResolvedValue(mockDeep<IStateService>({ setCurrentFilePath: vi.fn() })); 
    stateService.getCurrentFilePath.mockReturnValue('/project/current.meld');
    stateService.isTransformationEnabled.mockReturnValue(false);
    stateService.setVariable.mockResolvedValue({} as MeldVariable);
    stateService.mergeChildState.mockImplementation(() => {});

    // Add stateService to globalThis for identity checking in handler logs
    (globalThis as any).__test_state_service = stateService;

    // Configure mocks needed by ALL tests in this suite
    (fileSystemService.readFile as any).mockResolvedValue('mock content');
    (fileSystemService.exists as any).mockResolvedValue(true);
    // --- ADD Mock for parserService.parse --- 
    (parserService.parse as any).mockResolvedValue([
       // Return a minimal valid AST array, e.g., a single text node
       { type: 'Text', content: 'Parsed mock content', location: undefined } as TextNode 
    ]);
    // Ensure interpret mock is reset and provides a minimal valid state
    interpreterServiceClient.interpret.mockReset(); 
    const mockResultState = mockDeep<IStateService>();
    mockResultState.getAllTextVars.mockReturnValue(new Map([['imported', { name:'imported', type: VariableType.TEXT, value:'mocked imported value'}]])); // Minimal var for user-defined test
    mockResultState.getAllDataVars.mockReturnValue(new Map()); 
    mockResultState.getAllPathVars.mockReturnValue(new Map());
    mockResultState.getAllCommands.mockReturnValue(new Map());
    mockResultState.getTransformedNodes.mockReturnValue([]);
    interpreterServiceClient.interpret.mockResolvedValue(mockResultState); 
  });

  afterEach(async () => {
    testContainer?.dispose();
    vi.resetAllMocks();
  });

  const createMockProcessingContext = (node: DirectiveNode<ImportDirectiveData>): DirectiveProcessingContext => {
    // Create a deep mock for ResolutionContext, providing properties directly
    const mockResolutionContext = mockDeep<ResolutionContext>({
      strict: true,
      state: stateService,
      // Add default implementations for methods if needed, or rely on mockDeep defaults
      // For example:
      // withIncreasedDepth: vi.fn().mockReturnThis(),
      // withStrictMode: vi.fn().mockReturnThis(),
      // ... other methods
    });

    const mockFormattingContext: OutputFormattingContext = { isBlock: false, preserveLiteralFormatting: false, preserveWhitespace: false };
    if (!stateService) throw new Error('stateService not initialized');
    return {
      state: stateService, 
      resolutionContext: mockResolutionContext,
      formattingContext: mockFormattingContext,
      directiveNode: node,
    };
  };

  describe('special path variables', () => {
    const resolvedProjectPath = '/project/path/test.meld';
    const resolvedHomePath = '/home/user/test.meld';
    const resolvedNonExistentPath = '/project/path/nonexistent.meld';

    beforeEach(() => {
      // Configure mocks needed by ALL tests in this suite
      (fileSystemService.readFile as any).mockResolvedValue('mock content');
      (fileSystemService.exists as any).mockResolvedValue(true);
      // --- UPDATE MOCK: Mock resolvePath to *actually* resolve based on input --- 
      (resolutionService.resolvePath as any).mockImplementation(async (pathInput: string | StructuredPath, context: ResolutionContext): Promise<MeldPath> => {
        const rawPath = typeof pathInput === 'string' ? pathInput : pathInput?.raw ?? '';
        let resolvedString: string;
        // Determine resolved path based on input pattern
        if (rawPath.includes('nonexistent')) resolvedString = resolvedNonExistentPath;
        else if (rawPath.includes('$.') || rawPath.includes('$PROJECTPATH') || rawPath.includes('$docs')) resolvedString = resolvedProjectPath; 
        else if (rawPath.includes('$~') || rawPath.includes('$HOMEPATH')) resolvedString = resolvedHomePath;
        else resolvedString = path.isAbsolute(rawPath) ? rawPath : path.join('/project', rawPath).replace(/\\/g, '/'); // Basic fallback for relative paths

        // Return a MeldPath object containing the raw path and the RESOLVED validated path
        return Promise.resolve(createMeldPath(rawPath, unsafeCreateValidatedResourcePath(resolvedString), resolvedString.startsWith('/') || resolvedString.startsWith('http')));
      });
      // Ensure interpret mock is reset and provides a minimal valid state
      interpreterServiceClient.interpret.mockReset(); 
      const mockResultState = mockDeep<IStateService>();
      mockResultState.getAllTextVars.mockReturnValue(new Map([['imported', { name:'imported', type: VariableType.TEXT, value:'mocked imported value'}]])); // Minimal var for user-defined test
      mockResultState.getAllDataVars.mockReturnValue(new Map()); 
      mockResultState.getAllPathVars.mockReturnValue(new Map());
      mockResultState.getAllCommands.mockReturnValue(new Map());
      mockResultState.getTransformedNodes.mockReturnValue([]);
      interpreterServiceClient.interpret.mockResolvedValue(mockResultState); 
    });

    it('should handle $. alias for project path', async () => {
      const node = createDirectiveNode('import', { path: { raw: '$./samples/nested.meld', structured: { base: '.', segments: ['samples', 'nested'], url: false }, isPathVariable: true }, imports: [{ name: '*' }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      // Mock resolvePath specifically for this test's input path object
      (resolutionService.resolvePath as any).mockResolvedValueOnce(
        createMeldPath(node.directive.path.raw, unsafeCreateValidatedResourcePath(resolvedProjectPath), true)
      );
      await handler.handle(mockProcessingContext);
      // Assert resolvePath called with the StructuredPath object
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(node.directive.path, expect.anything());
      expect(fileSystemService.exists).toHaveBeenCalledWith(resolvedProjectPath);
      expect(circularityService.beginImport).toHaveBeenCalledWith(resolvedProjectPath.replace(/\\/g, '/'));
      expect(circularityService.endImport).toHaveBeenCalledWith(resolvedProjectPath.replace(/\\/g, '/'));
    });

    it('should handle $PROJECTPATH for project path', async () => {
      const node = createDirectiveNode('import', { path: { raw: '$PROJECTPATH/samples/nested.meld', structured: { base: '.', segments: ['samples', 'nested'], url: false }, isPathVariable: true }, imports: [{ name: '*' }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      // Mock resolvePath specifically for this test's input path object
      (resolutionService.resolvePath as any).mockResolvedValueOnce(
        createMeldPath(node.directive.path.raw, unsafeCreateValidatedResourcePath(resolvedProjectPath), true)
      );
      await handler.handle(mockProcessingContext);
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(node.directive.path, expect.anything());      
      expect(fileSystemService.exists).toHaveBeenCalledWith(resolvedProjectPath);
      expect(circularityService.beginImport).toHaveBeenCalledWith(resolvedProjectPath.replace(/\\/g, '/'));
    });

    it('should handle $~ alias for home path', async () => {
      const node = createDirectiveNode('import', { path: { raw: '$~/examples/basic.meld', structured: { base: '.', segments: ['examples', 'basic'], url: false }, isPathVariable: true }, imports: [{ name: '*' }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      // Mock resolvePath specifically for this test's input path object
      (resolutionService.resolvePath as any).mockResolvedValueOnce(
        createMeldPath(node.directive.path.raw, unsafeCreateValidatedResourcePath(resolvedHomePath), true)
      );
      await handler.handle(mockProcessingContext);
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(node.directive.path, expect.anything());      
      expect(fileSystemService.exists).toHaveBeenCalledWith(resolvedHomePath);
      expect(circularityService.beginImport).toHaveBeenCalledWith(resolvedHomePath.replace(/\\/g, '/'));
    });

    it('should handle $HOMEPATH for home path', async () => {
      const node = createDirectiveNode('import', { path: { raw: '$HOMEPATH/examples/basic.meld', structured: { base: '.', segments: ['examples', 'basic'], url: false }, isPathVariable: true }, imports: [{ name: '*' }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      // Mock resolvePath specifically for this test's input path object
      (resolutionService.resolvePath as any).mockResolvedValueOnce(
        createMeldPath(node.directive.path.raw, unsafeCreateValidatedResourcePath(resolvedHomePath), true)
      );
      await handler.handle(mockProcessingContext);
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(node.directive.path, expect.anything());      
      expect(fileSystemService.exists).toHaveBeenCalledWith(resolvedHomePath);
      expect(circularityService.beginImport).toHaveBeenCalledWith(resolvedHomePath.replace(/\\/g, '/'));
    });

    it('should throw error if resolved path does not exist', async () => {
      (fileSystemService.exists as any).mockResolvedValue(false);
      const node = createDirectiveNode('import', { path: { raw: '$PROJECTPATH/nonexistent.meld', structured: { base: '.', segments: ['nonexistent'], url: false }, isPathVariable: true }, imports: [{ name: '*' }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      // Mock resolvePath to return the non-existent path object
      (resolutionService.resolvePath as any).mockResolvedValueOnce(
          createMeldPath(node.directive.path.raw, unsafeCreateValidatedResourcePath(resolvedNonExistentPath), true)
      );
      
      await expectToThrowWithConfig(
        () => handler.handle(mockProcessingContext),
        {
          type: 'DirectiveError',
          code: DirectiveErrorCode.FILE_NOT_FOUND,
          messageContains: `Import file not found: ${resolvedNonExistentPath}` // Updated expected message
        }
      );
      // Verify resolvePath was called with the structured path object
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(node.directive.path, expect.anything());
      // Verify exists was called with the *resolved* path string
      expect(fileSystemService.exists).toHaveBeenCalledWith(resolvedNonExistentPath);
      // Ensure endImport is still called with the *resolved* path string
      expect(circularityService.endImport).toHaveBeenCalledWith(resolvedNonExistentPath.replace(/\\/g, '/'));
    });

    it('should handle user-defined path variables in import path', async () => {
      const importLocation = createLocation(5, 1, undefined, undefined, '/project/main.meld');
      const expectedResolvedPathString = resolvedProjectPath; 
      const node = createDirectiveNode('import', { path: { raw: '$docs/file.meld', structured: { base: '.', segments: ['file.meld'], variables: { path: ['docs'] } }, isPathVariable: true }, imports: [{ name: '*' }], subtype: 'importAll' }, importLocation) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      
      // Mock resolvePath to handle the structured path and return the correct MeldPath
      (resolutionService.resolvePath as any).mockResolvedValueOnce(
          createMeldPath(node.directive.path.raw, unsafeCreateValidatedResourcePath(expectedResolvedPathString), true)
      );

      const result = await handler.handle(mockProcessingContext);

      // Expect resolvePath to be called with the StructuredPath object
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(node.directive.path, expect.anything());      
      // File system checks should use the final resolved path string
      expect(fileSystemService.exists).toHaveBeenCalledWith(expectedResolvedPathString);
      expect(fileSystemService.readFile).toHaveBeenCalledWith(expectedResolvedPathString);
      expect(parserService.parse).toHaveBeenCalledWith('mock content');
      expect(interpreterServiceClient.interpret).toHaveBeenCalled();
      expect(circularityService.beginImport).toHaveBeenCalledWith(expectedResolvedPathString.replace(/\\/g, '/'));

      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('imported');
      const importedDef = result.stateChanges?.variables?.imported;
      expect(importedDef?.type).toBe(VariableType.TEXT);
      expect(importedDef?.value).toBe('mocked imported value');
      expect(importedDef?.metadata?.origin).toBe(VariableOrigin.IMPORT);
      expect(result.replacement).toEqual([]);
    });
  });

  describe('basic importing', () => {
    beforeEach(() => {
      // Mock createChildState for this block too
      const mockChildState = mockDeep<IStateService>();
      // --- ADD Mock getAll... methods on child state BEFORE interpret mock --- 
      mockChildState.getAllTextVars.mockReturnValue(new Map());
      mockChildState.getAllDataVars.mockReturnValue(new Map());
      mockChildState.getAllPathVars.mockReturnValue(new Map());
      mockChildState.getAllCommands.mockReturnValue(new Map());
      mockChildState.getTransformedNodes.mockReturnValue([]); // Ensure this is mocked too
      stateService.createChildState.mockReset();
      stateService.createChildState.mockResolvedValueOnce(mockChildState);
    });

    it('should import all variables with *', async () => {
      const importPathRaw = 'imported.meld';
      const finalPath = '/project/imported.meld';
      const node = createDirectiveNode('import', {
        path: { raw: importPathRaw, structured: { base: '.', segments: ['imported'], url: false }, isPathVariable: true },
        imports: [{ name: '*' }],
        subtype: 'importAll'
      }, createLocation(2, 1, undefined, undefined, '/project/test.meld')) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      // Mock resolvePath for this specific path object 
      (resolutionService.resolvePath as any).mockResolvedValueOnce(
        createMeldPath(node.directive.path.raw, unsafeCreateValidatedResourcePath(finalPath), true)
      );
      fileSystemService.exists.mockResolvedValue(true);
      fileSystemService.readFile.mockResolvedValue('@text greeting="Hello"\n@data info={ "val": 1 }');
      const parsedNodes: MeldNode[] = [
         { type: 'Directive', directive: { kind: 'text', identifier: 'greeting', source:'literal', value: [{ type: 'Text', content:'Hello' }] }, location: createLocation(1,1, undefined, undefined, finalPath) } as any,
         { type: 'Directive', directive: { kind: 'data', identifier: 'info', source:'literal', value: { val: 1 } }, location: createLocation(2,1, undefined, undefined, finalPath) } as any
      ];
      parserService.parse.mockResolvedValue(parsedNodes as any);
      const nodeContentLocation1 = createLocation(1, 1, undefined, undefined, finalPath);
      const nodeContentLocation2 = createLocation(2, 1, undefined, undefined, finalPath);
      const importedTextVar: TextVariable = { name: 'greeting', type: VariableType.TEXT, value: 'Hello', metadata: { definedAt: createTestLocation(1, 1), origin: VariableOrigin.DIRECT_DEFINITION, createdAt: Date.now(), modifiedAt: Date.now() } };
      const importedDataVar: any = { name: 'info', type: 'data', value: { val: 1 }, metadata: { definedAt: createTestLocation(2, 1), origin: VariableOrigin.DIRECT_DEFINITION, createdAt: Date.now(), modifiedAt: Date.now() } };
      
      // Use mockDeep for the result state AND mock getAll...Vars
      const expectedResultState = mockDeep<IStateService>();
      expectedResultState.getAllTextVars.mockReturnValue(new Map([['greeting', importedTextVar]]));
      expectedResultState.getAllDataVars.mockReturnValue(new Map([['info', importedDataVar]]));
      expectedResultState.getAllPathVars.mockReturnValue(new Map());
      expectedResultState.getAllCommands.mockReturnValue(new Map());
      expectedResultState.getTransformedNodes.mockReturnValue([]);
      expectedResultState.setCurrentFilePath.mockImplementation(() => {}); 

      // Set interpret mock specifically for this test 
      interpreterServiceClient.interpret.mockResolvedValueOnce(expectedResultState);

      const result = await handler.handle(mockProcessingContext);
      // Expect resolvePath to be called with the path object
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(node.directive.path, expect.anything()); 
      expect(fileSystemService.exists).toHaveBeenCalledWith(finalPath);
      expect(fileSystemService.readFile).toHaveBeenCalledWith(finalPath);
      expect(parserService.parse).toHaveBeenCalledWith('@text greeting="Hello"\n@data info={ "val": 1 }');
      expect(interpreterServiceClient.interpret).toHaveBeenCalled();
      
      // Assert stateChanges content
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('greeting');
      expect(result.stateChanges?.variables).toHaveProperty('info');
      const greetingDef = result.stateChanges?.variables?.greeting;
      const infoDef = result.stateChanges?.variables?.info;
      expect(greetingDef?.type).toBe(VariableType.TEXT);
      expect(greetingDef?.value).toBe('Hello');
      expect(greetingDef?.metadata?.origin).toBe(VariableOrigin.IMPORT);
      expect(infoDef?.type).toBe(VariableType.DATA);
      expect(infoDef?.value).toEqual({ val: 1 });
      expect(infoDef?.metadata?.origin).toBe(VariableOrigin.IMPORT);
      
      // Assert replacement is empty
      expect(result.replacement).toEqual([]);

      expect(circularityService.beginImport).toHaveBeenCalledWith(finalPath.replace(/\\/g, '/'));
      expect(circularityService.endImport).toHaveBeenCalledWith(finalPath.replace(/\\/g, '/'));
    });

    it('should import specific variables with alias', async () => {
      const importPathRaw = 'vars.meld';
      const finalPath = '/project/vars.meld';
      const node = createDirectiveNode('import', {
        path: { raw: importPathRaw, structured: { base: '.', segments: ['vars'], url: false }, isPathVariable: true },
        imports: [
          { name: 'var1', alias: null },
          { name: 'var2', alias: 'aliasedVar2' }
        ],
        subtype: 'importNamed'
      }, createLocation(3, 1, undefined, undefined, '/project/test.meld')) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      // Mock resolvePath for this specific path object
      (resolutionService.resolvePath as any).mockResolvedValueOnce(
        createMeldPath(node.directive.path.raw, unsafeCreateValidatedResourcePath(finalPath), true) 
      );
      fileSystemService.exists.mockResolvedValue(true);
      fileSystemService.readFile.mockResolvedValue('@text var1="value1"\n@text var2="value2"\n@text var3="value3"');
      const parsedNodes: MeldNode[] = [
        { type: 'Directive', directive: { kind: 'text', identifier: 'var1', source:'literal', value: [{ type: 'Text', content:'value1', nodeId: crypto.randomUUID() }] }, location: createLocation(1,1), nodeId: crypto.randomUUID() } as any,
        { type: 'Directive', directive: { kind: 'text', identifier: 'var2', source:'literal', value: [{ type: 'Text', content:'value2', nodeId: crypto.randomUUID() }] }, location: createLocation(2,1), nodeId: crypto.randomUUID() } as any,
        { type: 'Directive', directive: { kind: 'text', identifier: 'var3', source:'literal', value: [{ type: 'Text', content:'value3', nodeId: crypto.randomUUID() }] }, location: createLocation(3,1), nodeId: crypto.randomUUID() } as any
      ];
      parserService.parse.mockResolvedValue(parsedNodes as any);
      const nodeContentLocation1 = createLocation(1, 1, undefined, undefined, finalPath);
      const nodeContentLocation2 = createLocation(2, 1, undefined, undefined, finalPath);
      const nodeContentLocation3 = createLocation(3, 1, undefined, undefined, finalPath);
      const importedVar1: TextVariable = { name: 'var1', type: VariableType.TEXT, value: 'value1', metadata: { definedAt: createTestLocation(1, 1), origin: VariableOrigin.DIRECT_DEFINITION, createdAt: Date.now(), modifiedAt: Date.now() } };
      const importedVar2: TextVariable = { name: 'var2', type: VariableType.TEXT, value: 'value2', metadata: { definedAt: createTestLocation(2, 1), origin: VariableOrigin.DIRECT_DEFINITION, createdAt: Date.now(), modifiedAt: Date.now() } };
      const importedVar3: TextVariable = { name: 'var3', type: VariableType.TEXT, value: 'value3', metadata: { definedAt: createTestLocation(3, 1), origin: VariableOrigin.DIRECT_DEFINITION, createdAt: Date.now(), modifiedAt: Date.now() } };
      
      // Use mockDeep for the result state AND mock getAll...Vars
      const expectedResultState = mockDeep<IStateService>();
      expectedResultState.getTransformedNodes.mockReturnValue([]);
      // Mock getVariable to return specific vars when asked
      expectedResultState.getVariable.mockImplementation((name, type?: VariableType): MeldVariable | undefined => {
        if (type === VariableType.TEXT) {
            if (name === 'var1') return importedVar1;
            if (name === 'var2') return importedVar2;
            // Do not return var3, simulating it wasn't needed for structured import
        }
        return undefined;
      });
      // Mock getAll...Vars to return Maps containing the relevant vars for structured import
      expectedResultState.getAllTextVars.mockReturnValue(new Map([['var1', importedVar1], ['var2', importedVar2]]));
      expectedResultState.getAllDataVars.mockReturnValue(new Map()); // Ensure empty Map
      expectedResultState.getAllPathVars.mockReturnValue(new Map()); // Ensure empty Map
      expectedResultState.getAllCommands.mockReturnValue(new Map()); // Ensure empty Map
      expectedResultState.setCurrentFilePath.mockImplementation(() => {});
      
      // Set interpret mock specifically for this test 
      interpreterServiceClient.interpret.mockResolvedValueOnce(expectedResultState);

      const result = await handler.handle(mockProcessingContext) as DirectiveResult;
      // Assert resolvePath was called with the path object and any context
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(node.directive.path, expect.anything()); 
      expect(fileSystemService.exists).toHaveBeenCalledWith(finalPath);
      expect(fileSystemService.readFile).toHaveBeenCalledWith(finalPath);
      expect(parserService.parse).toHaveBeenCalledWith('@text var1="value1"\n@text var2="value2"\n@text var3="value3"');
      expect(interpreterServiceClient.interpret).toHaveBeenCalled(); // Verify interpret was called

      // Assert stateChanges content
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('var1');
      expect(result.stateChanges?.variables).toHaveProperty('aliasedVar2');
      expect(result.stateChanges?.variables).not.toHaveProperty('var2'); // Original name not imported
      expect(result.stateChanges?.variables).not.toHaveProperty('var3'); // Not requested
      const var1Def = result.stateChanges?.variables?.var1;
      const aliasedVar2Def = result.stateChanges?.variables?.aliasedVar2;
      expect(var1Def?.type).toBe(VariableType.TEXT);
      expect(var1Def?.value).toBe('value1');
      expect(var1Def?.metadata?.origin).toBe(VariableOrigin.IMPORT);
      expect(aliasedVar2Def?.type).toBe(VariableType.TEXT);
      expect(aliasedVar2Def?.value).toBe('value2');
      expect(aliasedVar2Def?.metadata?.origin).toBe(VariableOrigin.IMPORT);

      // Assert replacement is empty
      expect(result.replacement).toEqual([]);

      expect(circularityService.beginImport).toHaveBeenCalledWith(finalPath.replace(/\\/g, '/'));
      expect(circularityService.endImport).toHaveBeenCalledWith(finalPath.replace(/\\/g, '/'));
    });
  });

  describe('error handling', () => {
    it('should handle validation errors from ValidationService', async () => {
      const node = createDirectiveNode('import', { path: { raw: 'valid.meld', structured: { base: '.', segments: ['valid'], url: false }, isPathVariable: true }, imports: [{ name: '*', alias: null }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      const validationError = new DirectiveError('Mock validation error', 'import', DirectiveErrorCode.VALIDATION_FAILED);
      validationService.validate.mockImplementationOnce(async () => { throw validationError; }); 
      await expectToThrowWithConfig(
        () => handler.handle(mockProcessingContext),
        {
          type: 'DirectiveError',
          code: DirectiveErrorCode.VALIDATION_FAILED,
          messageContains: 'Mock validation error'
        }
      );
       expect(resolutionService.resolvePath).not.toHaveBeenCalled();
    });

    it('should handle variable not found during path resolution', async () => {
      const node = createDirectiveNode('import', { path: { raw: '$invalidVar/path', structured: { base: '.', segments: ['$invalidVar', 'path'], url: false }, isPathVariable: true }, imports: [{ name: '*', alias: null }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      const resolutionError = new MeldResolutionError('Variable not found: invalidVar', { code: 'VAR_NOT_FOUND' });
      // Mock resolvePath to reject when called with the specific path object
      (resolutionService.resolvePath as any).mockRejectedValueOnce(resolutionError);
      await expectToThrowWithConfig(
        () => handler.handle(mockProcessingContext),
        {
          type: 'DirectiveError',
          code: DirectiveErrorCode.RESOLUTION_FAILED,
          messageContains: 'Failed to resolve import path'
        }
      );
       expect(resolutionService.resolvePath).toHaveBeenCalledWith(node.directive.path, expect.anything()); // Verify resolvePath was called
    });

    it('should handle file not found from FileSystemService', async () => {
      const node = createDirectiveNode('import', { path: { raw: 'missing.meld', structured: { base: '.', segments: ['missing'], url: false }, isPathVariable: true }, imports: [{ name: '*' }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      const resolvedPathString = '/project/missing.meld';
      // Mock resolvePath to return the MeldPath for the missing file
      (resolutionService.resolvePath as any).mockResolvedValueOnce(createMeldPath(node.directive.path.raw, unsafeCreateValidatedResourcePath(resolvedPathString), true));
      (fileSystemService.exists as any).mockReset();
      (fileSystemService.exists as any).mockResolvedValue(false);
      await expectToThrowWithConfig(
        () => handler.handle(mockProcessingContext),
        {
          type: 'DirectiveError',
          code: DirectiveErrorCode.FILE_NOT_FOUND,
          messageContains: `Import file not found: ${resolvedPathString}`
        }
      );
       expect(resolutionService.resolvePath).toHaveBeenCalledWith(node.directive.path, expect.anything());
       expect(circularityService.endImport).toHaveBeenCalledWith(resolvedPathString.replace(/\\/g, '/'));
    });

    it('should handle circular imports from CircularityService', async () => {
      const node = createDirectiveNode('import', { path: { raw: 'circular.meld', structured: { base: '.', segments: ['circular'], url: false }, isPathVariable: true }, imports: [{ name: '*', alias: null }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      const resolvedPathString = '/project/circular.meld';
      const circularError = new DirectiveError('Circular import detected', 'import', DirectiveErrorCode.CIRCULAR_REFERENCE); 
      // Mock resolvePath to return the MeldPath for the circular file
      (resolutionService.resolvePath as any).mockResolvedValueOnce(createMeldPath(node.directive.path.raw, unsafeCreateValidatedResourcePath(resolvedPathString), true));
      (fileSystemService.exists as any).mockReset();
      (fileSystemService.exists as any).mockResolvedValue(true);
      circularityService.beginImport.mockReset();
      circularityService.beginImport.mockImplementationOnce(() => { throw circularError; }); 
      await expectToThrowWithConfig(
        () => handler.handle(mockProcessingContext),
        {
          type: 'DirectiveError',
          code: DirectiveErrorCode.CIRCULAR_REFERENCE,
          messageContains: 'Circular import detected'
        }
      );
      expect(circularityService.beginImport).toHaveBeenCalledWith(resolvedPathString.replace(/\\/g, '/'));
      expect(circularityService.endImport).toHaveBeenCalledWith(resolvedPathString.replace(/\\/g, '/'));
    });

    it('should handle parse errors from ParserService', async () => {
      const node = createDirectiveNode('import', { path: { raw: 'parse_error.meld', structured: { base: '.', segments: ['parse_error'], url: false }, isPathVariable: true }, imports: [{ name: '*', alias: null }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      const resolvedPathString = '/project/parse_error.meld';
      const parseError = new MeldError('Bad syntax in imported file', { code: 'PARSE_ERROR', severity: ErrorSeverity.Recoverable });
      // Mock resolvePath to return the MeldPath for the file with parse error
      (resolutionService.resolvePath as any).mockResolvedValueOnce(createMeldPath(node.directive.path.raw, unsafeCreateValidatedResourcePath(resolvedPathString), true));
      (fileSystemService.exists as any).mockReset();
      (fileSystemService.exists as any).mockResolvedValue(true);
      (fileSystemService.readFile as any).mockReset();
      (fileSystemService.readFile as any).mockResolvedValue('invalid meld content');
      (parserService.parse as any).mockReset();
      (parserService.parse as any).mockRejectedValueOnce(parseError);
      await expectToThrowWithConfig(
        () => handler.handle(mockProcessingContext),
        {
          type: 'DirectiveError',
          code: DirectiveErrorCode.EXECUTION_FAILED,
          messageContains: 'Bad syntax in imported file'
        }
      );
      expect(fileSystemService.readFile).toHaveBeenCalledWith(resolvedPathString);
      expect(parserService.parse).toHaveBeenCalledWith('invalid meld content');
      expect(circularityService.endImport).toHaveBeenCalledWith(resolvedPathString.replace(/\\/g, '/'));
    });

    it('should handle interpretation errors from InterpreterService', async () => {
      const node = createDirectiveNode('import', { path: { raw: 'interpret_error.meld', structured: { base: '.', segments: ['interpret_error'], url: false }, isPathVariable: true }, imports: [{ name: '*', alias: null }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      const resolvedPathString = '/project/interpret_error.meld';
      const interpretError = new Error('Simulated Interpretation failed');
      
      // Explicitly set the mock for this test
      interpreterServiceClient.interpret.mockReset(); // Reset any previous mocks
      interpreterServiceClient.interpret.mockRejectedValue(interpretError);
      // Ensure createChildState is still mocked sufficiently
      const mockChildState = mockDeep<IStateService>();
      stateService.createChildState.mockReset();
      stateService.createChildState.mockResolvedValueOnce(mockChildState);
      
      // Mock resolvePath to return the MeldPath for the file with interpretation error
      (resolutionService.resolvePath as any).mockResolvedValueOnce(createMeldPath(node.directive.path.raw, unsafeCreateValidatedResourcePath(resolvedPathString), true));
      (fileSystemService.exists as any).mockReset();
      (fileSystemService.exists as any).mockResolvedValue(true);
      (fileSystemService.readFile as any).mockReset();
      (fileSystemService.readFile as any).mockResolvedValue('content');
      (parserService.parse as any).mockReset();
      (parserService.parse as any).mockResolvedValue([]);
      // No need for spyOn stateService.createChildState here, already mocked above
      
      // Use rejects.toThrow for async error assertion
      await expect(handler.handle(mockProcessingContext)).rejects.toThrowError(
          expect.objectContaining({
              name: 'DirectiveError',
              code: DirectiveErrorCode.EXECUTION_FAILED,
              message: expect.stringContaining('Simulated Interpretation failed'),
          })
      );
      
      expect(circularityService.endImport).toHaveBeenCalledWith(resolvedPathString.replace(/\\/g, '/'));
    });
  });

  describe('cleanup', () => {
      it('should always call endImport on CircularityService even if read fails', async () => {
          const node = createDirectiveNode('import', { path: { raw: 'read_fail.meld', structured: { base: '.', segments: ['read_fail'], url: false }, isPathVariable: true }, imports: [{ name: '*', alias: null }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
          mockProcessingContext = createMockProcessingContext(node);
          const resolvedPathString = '/project/read_fail.meld';
          const readError = new MeldError('Disk read failed', { code: 'FS_READ_ERROR', severity: ErrorSeverity.Recoverable });
          // Mock resolvePath to return the MeldPath for the file that fails to read
          (resolutionService.resolvePath as any).mockResolvedValueOnce(createMeldPath(node.directive.path.raw, unsafeCreateValidatedResourcePath(resolvedPathString), true));
          (fileSystemService.exists as any).mockReset();
          (fileSystemService.exists as any).mockResolvedValue(true);
          (fileSystemService.readFile as any).mockReset();
          (fileSystemService.readFile as any).mockRejectedValueOnce(readError);
          await expectToThrowWithConfig(
              () => handler.handle(mockProcessingContext),
              {
                  type: 'DirectiveError',
                  code: DirectiveErrorCode.EXECUTION_FAILED,
                  messageContains: 'Disk read failed'
              }
          );
          expect(circularityService.endImport).toHaveBeenCalledWith(resolvedPathString.replace(/\\/g, '/'));
          expect(parserService.parse).not.toHaveBeenCalled();
      });
  });
}); 