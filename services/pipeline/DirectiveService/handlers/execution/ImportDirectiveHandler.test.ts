import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mockDeep, DeepMockProxy } from 'vitest-mock-extended';
import { ImportDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import type { ImportDirectiveData } from '@core/syntax/types/directives.js';
import type { MeldNode, DirectiveNode, StructuredPath, SourceLocation, VariableReferenceNode, InterpolatableValue, TextNode } from '@core/syntax/types/nodes.js';
import { VariableOrigin, type TextVariable, type DataVariable, type IPathVariable, type CommandVariable, type MeldVariable, type VariableMetadata, VariableType } from '@core/types/variables.js';
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
import type { URLResponse } from '@services/fs/PathService/IURLCache.js';
import type { DirectiveProcessingContext, OutputFormattingContext } from '@core/types/index.js';
import type { ResolutionContext, FormattingContext } from '@core/types/resolution.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import { MockFactory } from '@tests/utils/mocks/MockFactory.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import { container, type DependencyContainer } from 'tsyringe';
import { createTextVariable, createDataVariable, createPathVariable, createCommandVariable } from '@core/types/variables.js';
import { isCommandVariable } from '@core/types/guards.js';
import { DirectiveResult, StateChanges } from '@core/directives/DirectiveHandler'; 
import crypto from 'crypto'; 
import { VariableDefinition } from '@core/types/variables.js'; 
import path from 'path';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';

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

// Define a simple mock OutputFormattingContext
// ...

// >>> DEFINE HELPER HERE <<<
// --- Define a helper to create a more complete mock state for interpret results ---
const createMockInterpretedState = (vars: { 
    text?: Map<string, TextVariable>,
    data?: Map<string, DataVariable>,
    path?: Map<string, IPathVariable>,
    command?: Map<string, CommandVariable>
} = {}): IStateService => {
    const mockState = mockDeep<IStateService>();
    
    // Create actual maps with correct types
    const textMap = vars.text ?? new Map<string, TextVariable>();
    const dataMap = vars.data ?? new Map<string, DataVariable>();
    const pathMap = vars.path ?? new Map<string, IPathVariable>();
    const commandMap = vars.command ?? new Map<string, CommandVariable>();

    // Configure mock methods to return the correctly typed Maps
    mockState.getStateId.mockReturnValue(`mock-interpreted-${crypto.randomUUID()}`);
    mockState.getAllTextVars.mockReturnValue(textMap); 
    mockState.getAllDataVars.mockReturnValue(dataMap); 
    mockState.getAllPathVars.mockReturnValue(pathMap); 
    mockState.getAllCommands.mockReturnValue(commandMap); 
    mockState.getTransformedNodes.mockReturnValue([]);
    
    // Add stubs for other potentially accessed methods
    mockState.getCurrentFilePath.mockReturnValue('/imported/file.meld');
    mockState.isTransformationEnabled.mockReturnValue(false);
    mockState.getVariable.mockImplementation((name: string, type?: VariableType): MeldVariable | undefined => { 
        if (type === VariableType.TEXT || type === undefined) {
            const v = textMap.get(name);
            if (v) return v;
        }
        if (type === VariableType.DATA || type === undefined) {
            const v = dataMap.get(name);
            if (v) return v;
        }
        if (type === VariableType.PATH || type === undefined) {
            const v = pathMap.get(name);
            if (v) return v;
        }
        if (type === VariableType.COMMAND || type === undefined) {
             const v = commandMap.get(name);
            if (v) return v;
        }
        return undefined; 
    });
    mockState.setVariable.mockResolvedValue({} as any);
    mockState.setCurrentFilePath.mockImplementation(() => {});
    mockState.clone.mockReturnThis();
    mockState.getNodes.mockReturnValue([]);
    mockState.addNode.mockImplementation(() => {});
    mockState.createChildState.mockResolvedValue(mockState); 
    mockState.mergeChildState.mockImplementation(() => {});

    return mockState;
};

// Main test suite for DirectiveService
describe('ImportDirectiveHandler', () => {
  let handler: ImportDirectiveHandler;
  let stateService: IStateService;
  let resolutionService: IResolutionService;
  let fileSystemService: DeepMockProxy<IFileSystemService>;
  let pathService: DeepMockProxy<IPathService>;
  let parserService: DeepMockProxy<IParserService>;
  let interpreterServiceClient: IInterpreterServiceClient;
  let circularityService: DeepMockProxy<ICircularityService>;
  let urlContentResolver: DeepMockProxy<IURLContentResolver>;
  let testContainer: DependencyContainer;
  let mockProcessingContext: DirectiveProcessingContext;
  let validationService: DeepMockProxy<IValidationService>;

  beforeEach(async () => {
    stateService = {
        createChildState: vi.fn(),
        getCurrentFilePath: vi.fn().mockReturnValue('/project/current.meld'),
        isTransformationEnabled: vi.fn().mockReturnValue(false),
        setVariable: vi.fn(),
        mergeChildState: vi.fn(),
        getAllTextVars: vi.fn().mockReturnValue(new Map()),
        getAllDataVars: vi.fn().mockReturnValue(new Map()),
        getAllPathVars: vi.fn().mockReturnValue(new Map()),
        getAllCommands: vi.fn().mockReturnValue(new Map()),
        getVariable: vi.fn(),
        setCurrentFilePath: vi.fn(),
        getStateId: vi.fn().mockReturnValue('mock-state-id'),
        clone: vi.fn(),
        getNodes: vi.fn().mockReturnValue([]),
        getTransformedNodes: vi.fn().mockReturnValue([]),
        addNode: vi.fn(),
    } as unknown as IStateService;
    
    resolutionService = {
        resolvePath: vi.fn(),
        resolveNodes: vi.fn(),
        resolveInContext: vi.fn().mockResolvedValue('/project/resolved/import.meld'),
        resolveVariableReference: vi.fn(),
        extractSection: vi.fn()
    } as unknown as IResolutionService;

    interpreterServiceClient = {
        interpret: vi.fn(),
        createChildContext: vi.fn(),
    } as unknown as IInterpreterServiceClient;

    const cloneSpy = vi.spyOn(stateService, 'clone').mockImplementation(() => stateService);
    const createChildStateSpy = vi.spyOn(stateService, 'createChildState');
    createChildStateSpy.mockResolvedValue(stateService);
    const setVariableSpy = vi.spyOn(stateService, 'setVariable');
    setVariableSpy.mockResolvedValue({} as MeldVariable);
    const interpretSpy = vi.spyOn(interpreterServiceClient, 'interpret');
    const createChildContextSpy = vi.spyOn(interpreterServiceClient, 'createChildContext');
    createChildContextSpy.mockResolvedValue(stateService);

    fileSystemService = mockDeep<IFileSystemService>();
    pathService = mockDeep<IPathService>();
    parserService = mockDeep<IParserService>();
    circularityService = mockDeep<ICircularityService>();
    urlContentResolver = mockDeep<IURLContentResolver>();
    validationService = mockDeep<IValidationService>();

    testContainer = container.createChildContainer();

    testContainer.registerInstance('ILogger', mockLoggerObject);
    testContainer.registerInstance<IStateService>('IStateService', stateService);
    testContainer.registerInstance<IResolutionService>('IResolutionService', resolutionService);
    testContainer.registerInstance<IFileSystemService>('IFileSystemService', fileSystemService);
    testContainer.registerInstance<IPathService>('IPathService', pathService);
    testContainer.registerInstance<IParserService>('IParserService', parserService);
    testContainer.registerInstance<IInterpreterServiceClient>('IInterpreterServiceClient', interpreterServiceClient);
    testContainer.registerInstance<ICircularityService>('ICircularityService', circularityService);
    testContainer.registerInstance<IURLContentResolver>('IURLContentResolver', urlContentResolver);
    testContainer.registerInstance<IValidationService>('IValidationService', validationService);

    testContainer.registerInstance('DependencyContainer', testContainer);
    
    // <<< FIX: Register the mock IInterpreterService using the string token >>>
    const mockInterpreterService = mockDeep<IInterpreterService>(); // Create a basic mock
    testContainer.registerInstance<IInterpreterService>('IInterpreterService', mockInterpreterService);

    handler = testContainer.resolve(ImportDirectiveHandler);
    
    fileSystemService.readFile.mockResolvedValue('mock content');
    fileSystemService.exists.mockResolvedValue(true);
    parserService.parse.mockResolvedValue([
       { type: 'Text', content: 'Parsed mock content', location: undefined } as TextNode 
    ]);

    // Mock resolveInContext to return a default non-empty path
    vi.spyOn(resolutionService, 'resolveInContext').mockResolvedValue('/project/default/resolved.meld');
    // Mock resolvePath to handle string | StructuredPath input
    vi.spyOn(resolutionService, 'resolvePath').mockImplementation(async (pathInput: string | StructuredPath, context: ResolutionContext): Promise<MeldPath> => {
      // <<< LINTER FIX: Handle both string and StructuredPath input >>>
      const pathString = typeof pathInput === 'string' ? pathInput : pathInput?.raw ?? '';
      // Basic mock: just create a MeldPath from the input string representation
      return createMeldPath(pathString, unsafeCreateValidatedResourcePath(pathString), true);
    });

    // --- Default mock for interpret: Use the helper to return an empty state ---
    vi.spyOn(interpreterServiceClient, 'interpret').mockResolvedValue(createMockInterpretedState());
  });

  afterEach(async () => {
    testContainer?.dispose();
    vi.resetAllMocks();
  });

  const createMockProcessingContext = (node: DirectiveNode<ImportDirectiveData>): DirectiveProcessingContext => {
    const mockResolutionContext = mockDeep<ResolutionContext>({
      strict: true,
      state: stateService,
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
      fileSystemService.readFile.mockResolvedValue('mock content');
      fileSystemService.exists.mockResolvedValue(true);
      
      // Specific resolvePath mock for special path tests
      vi.spyOn(resolutionService, 'resolvePath').mockImplementation(async (pathInput: string | StructuredPath, context: ResolutionContext): Promise<MeldPath> => {
        // <<< LINTER FIX: Handle both string and StructuredPath input >>>
        const resolvedPathString = typeof pathInput === 'string' ? pathInput : pathInput?.raw ?? '';
        const testCasePath = 
            resolvedPathString.includes('nonexistent') ? resolvedNonExistentPath :
            resolvedPathString.includes('$./') || resolvedPathString.includes('$PROJECTPATH') ? resolvedProjectPath :
            resolvedPathString.includes('$~/') || resolvedPathString.includes('$HOMEPATH') ? resolvedHomePath :
            resolvedPathString; 
        return Promise.resolve(createMeldPath(resolvedPathString, unsafeCreateValidatedResourcePath(testCasePath), true));
      });
      
      // Clear the default mock for resolveInContext before setting specific ones
      vi.mocked(resolutionService.resolveInContext).mockClear();
    });

    it('should handle $. alias for project path', async () => {
      const node = createDirectiveNode('import', { path: { raw: '$./samples/nested.meld', structured: { base: '.', segments: ['samples', 'nested'], url: false }, isPathVariable: true }, imports: [{ name: '*' }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      
      // Mock resolveInContext to return the raw path string
      vi.spyOn(resolutionService, 'resolveInContext').mockResolvedValueOnce('$./samples/nested.meld'); 
            
      const importedVarDef: TextVariable = { name: 'sampleVar', type: VariableType.TEXT, value: 'sampleValue', metadata: { origin: VariableOrigin.DIRECT_DEFINITION, createdAt: Date.now(), modifiedAt: Date.now() } };
      // Use the helper to create the mock state with variables
      const mockInterpretedState = createMockInterpretedState({ text: new Map([['sampleVar', importedVarDef]]) });
      
      // Reset and mock interpret for this specific test
      const interpretSpy = vi.spyOn(interpreterServiceClient, 'interpret');
      interpretSpy.mockResolvedValue(mockInterpretedState);
      
      const result = await handler.handle(mockProcessingContext);
      
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(node.directive.path, expect.anything());
      expect(resolutionService.resolvePath).toHaveBeenCalledWith('$./samples/nested.meld', expect.anything());
      expect(fileSystemService.exists).toHaveBeenCalledWith(resolvedProjectPath);
      expect(circularityService.beginImport).toHaveBeenCalledWith(resolvedProjectPath.replace(/\\/g, '/'));
      expect(circularityService.endImport).toHaveBeenCalledWith(resolvedProjectPath.replace(/\\/g, '/'));
      
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('sampleVar');
      const sampleVarResult = result.stateChanges?.variables?.sampleVar;
      expect(sampleVarResult?.value).toBe('sampleValue');
      expect(sampleVarResult?.metadata?.origin).toBe(VariableOrigin.IMPORT); 
    });

    it('should handle $PROJECTPATH for project path', async () => {
      const node = createDirectiveNode('import', { path: { raw: '$PROJECTPATH/samples/nested.meld', structured: { base: '.', segments: ['samples', 'nested'], url: false }, isPathVariable: true }, imports: [{ name: '*' }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      
      vi.spyOn(resolutionService, 'resolveInContext').mockResolvedValueOnce('$PROJECTPATH/samples/nested.meld');
      vi.spyOn(resolutionService, 'resolvePath').mockResolvedValueOnce(
        createMeldPath(node.directive.path.raw, unsafeCreateValidatedResourcePath(resolvedProjectPath), true)
      );
      
      // Use helper for empty state
      const mockInterpretedState = createMockInterpretedState();

      const interpretSpy = vi.spyOn(interpreterServiceClient, 'interpret');
      interpretSpy.mockResolvedValue(mockInterpretedState);
      
      await handler.handle(mockProcessingContext);
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(node.directive.path, expect.anything());      
      expect(resolutionService.resolvePath).toHaveBeenCalledWith('$PROJECTPATH/samples/nested.meld', expect.anything());
      expect(fileSystemService.exists).toHaveBeenCalledWith(resolvedProjectPath);
      expect(circularityService.beginImport).toHaveBeenCalledWith(resolvedProjectPath.replace(/\\/g, '/'));
    });

    it('should handle $~ alias for home path', async () => {
      const node = createDirectiveNode('import', { path: { raw: '$~/examples/basic.meld', structured: { base: '.', segments: ['examples', 'basic'], url: false }, isPathVariable: true }, imports: [{ name: '*' }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      
      vi.spyOn(resolutionService, 'resolveInContext').mockResolvedValueOnce('$~/examples/basic.meld'); 
      
      // Use helper for empty state
      const mockInterpretedState = createMockInterpretedState();

      const interpretSpy = vi.spyOn(interpreterServiceClient, 'interpret');
      interpretSpy.mockResolvedValue(mockInterpretedState);
      
      await handler.handle(mockProcessingContext);
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(node.directive.path, expect.anything());      
      expect(resolutionService.resolvePath).toHaveBeenCalledWith('$~/examples/basic.meld', expect.anything());
      expect(fileSystemService.exists).toHaveBeenCalledWith(resolvedHomePath);
      expect(circularityService.beginImport).toHaveBeenCalledWith(resolvedHomePath.replace(/\\/g, '/'));
    });

    it('should handle $HOMEPATH for home path', async () => {
      const node = createDirectiveNode('import', { path: { raw: '$HOMEPATH/examples/basic.meld', structured: { base: '.', segments: ['examples', 'basic'], url: false }, isPathVariable: true }, imports: [{ name: '*' }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      
      vi.spyOn(resolutionService, 'resolveInContext').mockResolvedValueOnce('$HOMEPATH/examples/basic.meld'); 
      
      // Use helper for empty state
      const mockInterpretedState = createMockInterpretedState();

      const interpretSpy = vi.spyOn(interpreterServiceClient, 'interpret');
      interpretSpy.mockResolvedValue(mockInterpretedState);
      
      await handler.handle(mockProcessingContext);
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(node.directive.path, expect.anything());      
      expect(resolutionService.resolvePath).toHaveBeenCalledWith('$HOMEPATH/examples/basic.meld', expect.anything()); 
      expect(fileSystemService.exists).toHaveBeenCalledWith(resolvedHomePath);
      expect(circularityService.beginImport).toHaveBeenCalledWith(resolvedHomePath.replace(/\\/g, '/'));
    });

    it('should throw error if resolved path does not exist', async () => {
      fileSystemService.exists.mockResolvedValue(false);
      const node = createDirectiveNode('import', { path: { raw: '$PROJECTPATH/nonexistent.meld', structured: { base: '.', segments: ['nonexistent'], url: false }, isPathVariable: true }, imports: [{ name: '*' }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      
      // Mock resolveInContext to return the path string
      vi.spyOn(resolutionService, 'resolveInContext').mockResolvedValueOnce('nonexistent.meld'); 

      // Mock resolvePath to return a MeldPath object for the non-existent file
      vi.spyOn(resolutionService, 'resolvePath').mockResolvedValueOnce(
          createMeldPath('nonexistent.meld', unsafeCreateValidatedResourcePath(resolvedNonExistentPath), true)
      );
      
      // Mock exists to return false
      fileSystemService.exists.mockReset();
      fileSystemService.exists.mockResolvedValue(false);

      await expectToThrowWithConfig(
        () => handler.handle(mockProcessingContext),
        {
          type: 'DirectiveError',
          code: DirectiveErrorCode.FILE_NOT_FOUND, 
          messageContains: `Import file not found: ${resolvedNonExistentPath}`
        }
      );
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(node.directive.path, expect.anything());
      expect(resolutionService.resolvePath).toHaveBeenCalledWith('nonexistent.meld', expect.anything());
      expect(fileSystemService.exists).toHaveBeenCalledWith(resolvedNonExistentPath);
      expect(circularityService.endImport).toHaveBeenCalledWith(resolvedNonExistentPath.replace(/\\/g, '/'));
    });

    it('should handle user-defined path variables in import path', async () => {
      const importLocation = createLocation(5, 1, undefined, undefined, '/project/main.meld');
      const expectedResolvedPathString = resolvedProjectPath; 
      const node = createDirectiveNode('import', { path: { raw: '$docs/file.meld', structured: { base: '.', segments: ['file.meld'], variables: { path: ['docs'] } }, isPathVariable: true }, imports: [{ name: '*' }], subtype: 'importAll' }, importLocation) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      
      // Mock resolveInContext to return the raw path string
      vi.spyOn(resolutionService, 'resolveInContext').mockResolvedValueOnce('$docs/file.meld');

      // Mock resolvePath to return the final expected path
      vi.spyOn(resolutionService, 'resolvePath').mockResolvedValueOnce(
          createMeldPath('$docs/file.meld', unsafeCreateValidatedResourcePath(expectedResolvedPathString), true)
      );

      const importedTextVarDef: TextVariable = { name: 'imported', type: VariableType.TEXT, value:'mocked imported value', metadata: { origin: VariableOrigin.DIRECT_DEFINITION, createdAt: Date.now(), modifiedAt: Date.now() } };
      // Use helper with variable
      const mockInterpretedState = createMockInterpretedState({ text: new Map([['imported', importedTextVarDef]]) });

      const interpretSpy = vi.spyOn(interpreterServiceClient, 'interpret');
      interpretSpy.mockResolvedValue(mockInterpretedState);

      const result = await handler.handle(mockProcessingContext);

      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(node.directive.path, expect.anything());
      expect(resolutionService.resolvePath).toHaveBeenCalledWith('$docs/file.meld', expect.anything());
      expect(fileSystemService.exists).toHaveBeenCalledWith(expectedResolvedPathString);
      expect(fileSystemService.readFile).toHaveBeenCalledWith(expectedResolvedPathString);
      expect(parserService.parse).toHaveBeenCalledWith('mock content');
      expect(interpreterServiceClient.interpret).toHaveBeenCalled();
      expect(circularityService.beginImport).toHaveBeenCalledWith(expectedResolvedPathString.replace(/\\/g, '/'));

      process.stdout.write(`DEBUG [Test - user-defined path vars] Result object: ${JSON.stringify(result)}\n`);

      expect(result).toHaveProperty('stateChanges'); 
      expect(result.stateChanges).not.toBeUndefined();
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
      vi.spyOn(stateService, 'createChildState').mockResolvedValue(mockDeep<IStateService>()); 
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
      
      // Mock resolveInContext
      vi.spyOn(resolutionService, 'resolveInContext').mockResolvedValueOnce('imported.meld');
      // Mock resolvePath
      vi.spyOn(resolutionService, 'resolvePath').mockResolvedValueOnce(
        createMeldPath(importPathRaw, unsafeCreateValidatedResourcePath(finalPath), true)
      );
      
      fileSystemService.exists.mockResolvedValue(true);
      fileSystemService.readFile.mockResolvedValue('@text greeting="Hello"\n@data info={ "val": 1 }');
      const parsedNodes: MeldNode[] = [
         { type: 'Directive', directive: { kind: 'text', identifier: 'greeting', source:'literal', value: [{ type: 'Text', content:'Hello' }] }, location: createLocation(1,1, undefined, undefined, finalPath) } as any,
         { type: 'Directive', directive: { kind: 'data', identifier: 'info', source:'literal', value: { val: 1 } }, location: createLocation(2,1, undefined, undefined, finalPath) } as any
      ];
      parserService.parse.mockResolvedValue(parsedNodes as any);
      
      const importedTextVarDef: TextVariable = { name: 'greeting', type: VariableType.TEXT, value: 'Hello', metadata: { definedAt: createTestLocation(1, 1), origin: VariableOrigin.DIRECT_DEFINITION, createdAt: Date.now(), modifiedAt: Date.now() } };
      const importedDataVarDef: DataVariable = { name: 'info', type: VariableType.DATA, value: { val: 1 }, metadata: { definedAt: createTestLocation(2, 1), origin: VariableOrigin.DIRECT_DEFINITION, createdAt: Date.now(), modifiedAt: Date.now() } };
      
      // Use helper with variables
      const mockInterpretedState = createMockInterpretedState({
          text: new Map([['greeting', importedTextVarDef]]),
          data: new Map([['info', importedDataVarDef]])
      });

      const interpretSpy = vi.spyOn(interpreterServiceClient, 'interpret');
      interpretSpy.mockResolvedValue(mockInterpretedState);

      const result = await handler.handle(mockProcessingContext);
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(node.directive.path, expect.anything()); 
      expect(resolutionService.resolvePath).toHaveBeenCalledWith('imported.meld', expect.anything()); 
      expect(fileSystemService.exists).toHaveBeenCalledWith(finalPath);
      expect(fileSystemService.readFile).toHaveBeenCalledWith(finalPath);
      expect(parserService.parse).toHaveBeenCalledWith('@text greeting="Hello"\n@data info={ "val": 1 }');
      expect(interpreterServiceClient.interpret).toHaveBeenCalled();
      
      process.stdout.write(`DEBUG [Test - import *] Result object: ${JSON.stringify(result)}\n`);

      expect(result).toHaveProperty('stateChanges'); 
      expect(result.stateChanges).not.toBeUndefined();
      expect(result.stateChanges?.variables).toEqual({
        greeting: expect.objectContaining({ type: VariableType.TEXT, value: 'Hello', metadata: expect.objectContaining({ origin: VariableOrigin.IMPORT }) }),
        info: expect.objectContaining({ type: VariableType.DATA, value: { val: 1 }, metadata: expect.objectContaining({ origin: VariableOrigin.IMPORT }) })
      });
      
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
      
      // Mock resolveInContext
      vi.spyOn(resolutionService, 'resolveInContext').mockResolvedValueOnce('vars.meld');
      // Mock resolvePath
      vi.spyOn(resolutionService, 'resolvePath').mockResolvedValueOnce(
        createMeldPath(importPathRaw, unsafeCreateValidatedResourcePath(finalPath), true) 
      );
      
      fileSystemService.exists.mockResolvedValue(true);
      fileSystemService.readFile.mockResolvedValue('@text var1="value1"\n@text var2="value2"\n@text var3="value3"');
      const parsedNodes: MeldNode[] = [
        { type: 'Directive', directive: { kind: 'text', identifier: 'var1', source:'literal', value: [{ type: 'Text', content:'value1', nodeId: crypto.randomUUID() }] }, location: createLocation(1,1), nodeId: crypto.randomUUID() } as any,
        { type: 'Directive', directive: { kind: 'text', identifier: 'var2', source:'literal', value: [{ type: 'Text', content:'value2', nodeId: crypto.randomUUID() }] }, location: createLocation(2,1), nodeId: crypto.randomUUID() } as any,
        { type: 'Directive', directive: { kind: 'text', identifier: 'var3', source:'literal', value: [{ type: 'Text', content:'value3', nodeId: crypto.randomUUID() }] }, location: createLocation(3,1), nodeId: crypto.randomUUID() } as any
      ];
      parserService.parse.mockResolvedValue(parsedNodes as any);
      
      const importedVar1: TextVariable = { name: 'var1', type: VariableType.TEXT, value: 'value1', metadata: { definedAt: createTestLocation(1, 1), origin: VariableOrigin.DIRECT_DEFINITION, createdAt: Date.now(), modifiedAt: Date.now() } };
      const importedVar2: TextVariable = { name: 'var2', type: VariableType.TEXT, value: 'value2', metadata: { definedAt: createTestLocation(2, 1), origin: VariableOrigin.DIRECT_DEFINITION, createdAt: Date.now(), modifiedAt: Date.now() } };
      const importedVar3: TextVariable = { name: 'var3', type: VariableType.TEXT, value: 'value3', metadata: { definedAt: createTestLocation(3, 1), origin: VariableOrigin.DIRECT_DEFINITION, createdAt: Date.now(), modifiedAt: Date.now() } };
      
      // Use helper with variables
      const mockInterpretedState = createMockInterpretedState({
          text: new Map([
              ['var1', importedVar1],
              ['var2', importedVar2],
              ['var3', importedVar3]
          ])
      });
      
      const interpretSpy = vi.spyOn(interpreterServiceClient, 'interpret');
      interpretSpy.mockResolvedValue(mockInterpretedState);

      const result = await handler.handle(mockProcessingContext) as DirectiveResult;
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(node.directive.path, expect.anything()); 
      expect(resolutionService.resolvePath).toHaveBeenCalledWith('vars.meld', expect.anything()); 
      expect(fileSystemService.exists).toHaveBeenCalledWith(finalPath);
      expect(fileSystemService.readFile).toHaveBeenCalledWith(finalPath);
      expect(parserService.parse).toHaveBeenCalledWith('@text var1="value1"\n@text var2="value2"\n@text var3="value3"');
      expect(interpreterServiceClient.interpret).toHaveBeenCalled();

      process.stdout.write(`DEBUG [Test - import specific] Result object: ${JSON.stringify(result)}\n`);

      expect(result).toHaveProperty('stateChanges'); 
      expect(result.stateChanges).not.toBeUndefined();
      expect(result.stateChanges?.variables).toEqual({
        var1: expect.objectContaining({ type: VariableType.TEXT, value: 'value1', metadata: expect.objectContaining({ origin: VariableOrigin.IMPORT }) }),
        aliasedVar2: expect.objectContaining({ type: VariableType.TEXT, value: 'value2', metadata: expect.objectContaining({ origin: VariableOrigin.IMPORT }) })
      });
      expect(result.stateChanges?.variables).not.toHaveProperty('var2');
      expect(result.stateChanges?.variables).not.toHaveProperty('var3');

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
       expect(resolutionService.resolveInContext).not.toHaveBeenCalled();
    });

    it('should handle variable not found during path resolution', async () => {
      const node = createDirectiveNode('import', { path: { raw: '$invalidVar/path', structured: { base: '.', segments: ['$invalidVar', 'path'], url: false }, isPathVariable: true }, imports: [{ name: '*', alias: null }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      const resolutionError = new MeldResolutionError('Variable not found: invalidVar', { code: 'VAR_NOT_FOUND' });
      
      // Mock resolveInContext to throw the error
      vi.spyOn(resolutionService, 'resolveInContext').mockRejectedValueOnce(resolutionError);

      // resolvePath should NOT be called
      const resolvePathSpy = vi.spyOn(resolutionService, 'resolvePath'); 

      await expectToThrowWithConfig(
        () => handler.handle(mockProcessingContext),
        {
          type: 'DirectiveError',
          code: DirectiveErrorCode.RESOLUTION_FAILED, 
          // Check that the error message includes the original raw path and the cause
          messageContains: 'Failed to resolve import path/identifier: $invalidVar/path. Variable not found: invalidVar'
        }
      );
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(node.directive.path, expect.anything());
      expect(resolvePathSpy).not.toHaveBeenCalled(); 
    });

    it('should handle file not found from FileSystemService', async () => {
      const node = createDirectiveNode('import', { path: { raw: 'missing.meld', structured: { base: '.', segments: ['missing'], url: false }, isPathVariable: true }, imports: [{ name: '*' }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      const resolvedPathString = '/project/missing.meld';
      vi.spyOn(resolutionService, 'resolveInContext').mockResolvedValueOnce('missing.meld');
      vi.spyOn(resolutionService, 'resolvePath').mockResolvedValueOnce(createMeldPath('missing.meld', unsafeCreateValidatedResourcePath(resolvedPathString), true));
      fileSystemService.exists.mockReset();
      fileSystemService.exists.mockResolvedValue(false);
      await expectToThrowWithConfig(
        () => handler.handle(mockProcessingContext),
        {
          type: 'DirectiveError',
          code: DirectiveErrorCode.FILE_NOT_FOUND, // Correct code
          messageContains: `Import file not found: ${resolvedPathString}`
        }
      );
       expect(resolutionService.resolveInContext).toHaveBeenCalledWith(node.directive.path, expect.anything());
       expect(resolutionService.resolvePath).toHaveBeenCalledWith('missing.meld', expect.anything()); 
       expect(circularityService.endImport).toHaveBeenCalledWith(resolvedPathString.replace(/\\/g, '/'));
    });

    it('should handle circular imports from CircularityService', async () => {
      const node = createDirectiveNode('import', { path: { raw: 'circular.meld', structured: { base: '.', segments: ['circular'], url: false }, isPathVariable: true }, imports: [{ name: '*', alias: null }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      const resolvedPathString = '/project/circular.meld';
      const circularError = new MeldError('Circular import detected', { code: 'CIRCULAR_IMPORT', severity: ErrorSeverity.Fatal });
      
      vi.spyOn(resolutionService, 'resolveInContext').mockResolvedValueOnce('circular.meld');
      vi.spyOn(resolutionService, 'resolvePath').mockResolvedValueOnce(
          createMeldPath('circular.meld', unsafeCreateValidatedResourcePath(resolvedPathString), true)
      );
      fileSystemService.exists.mockResolvedValue(true);
      
      circularityService.beginImport.mockReset();
      circularityService.beginImport.mockImplementationOnce(() => { throw circularError; }); 

      await expectToThrowWithConfig(
        () => handler.handle(mockProcessingContext),
        {
          type: 'DirectiveError',
          code: DirectiveErrorCode.CIRCULAR_REFERENCE, // Correct code
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
      
      vi.spyOn(resolutionService, 'resolveInContext').mockResolvedValueOnce('parse_error.meld');
      vi.spyOn(resolutionService, 'resolvePath').mockResolvedValueOnce(createMeldPath('parse_error.meld', unsafeCreateValidatedResourcePath(resolvedPathString), true));
      fileSystemService.exists.mockResolvedValue(true);
      fileSystemService.readFile.mockResolvedValue('invalid meld content');
      
      parserService.parse.mockReset();
      parserService.parse.mockRejectedValueOnce(parseError);

      await expectToThrowWithConfig(
        () => handler.handle(mockProcessingContext),
        {
          type: 'DirectiveError',
          code: DirectiveErrorCode.EXECUTION_FAILED, 
          messageContains: 'Bad syntax in imported file'
        }
      );
      expect(parserService.parse).toHaveBeenCalledWith('invalid meld content');
      expect(circularityService.endImport).toHaveBeenCalledWith(resolvedPathString.replace(/\\/g, '/'));
    });

    it('should handle interpretation errors from InterpreterService', async () => {
      const node = createDirectiveNode('import', { path: { raw: 'interpret_error.meld', structured: { base: '.', segments: ['interpret_error'], url: false }, isPathVariable: true }, imports: [{ name: '*', alias: null }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      const resolvedPathString = '/project/interpret_error.meld';
      const interpretError = new Error('Simulated Interpretation failed');
      
      vi.spyOn(resolutionService, 'resolveInContext').mockResolvedValueOnce('interpret_error.meld');
      vi.spyOn(resolutionService, 'resolvePath').mockResolvedValueOnce(createMeldPath('interpret_error.meld', unsafeCreateValidatedResourcePath(resolvedPathString), true));
      fileSystemService.exists.mockResolvedValue(true);
      fileSystemService.readFile.mockResolvedValue('content');
      parserService.parse.mockResolvedValue([]);
      
      const interpretSpy = vi.spyOn(interpreterServiceClient, 'interpret');
      interpretSpy.mockReset();
      interpretSpy.mockRejectedValue(interpretError);
      
      vi.spyOn(stateService, 'createChildState').mockResolvedValue(mockDeep<IStateService>());
      
      await expect(handler.handle(mockProcessingContext)).rejects.toThrowError(
          expect.objectContaining({
              name: 'DirectiveError',
              code: DirectiveErrorCode.EXECUTION_FAILED, // Correct code
              message: expect.stringContaining('Failed to interpret imported content from /project/interpret_error.meld. Simulated Interpretation failed'),
          })
      );
      
      expect(circularityService.endImport).toHaveBeenCalledWith(resolvedPathString.replace(/\\/g, '/'));
    });
  });

  describe('cleanup', () => {
      it('should always call endImport on CircularityService even if read fails', async () => {
          const node = createDirectiveNode('import', { path: { raw: 'read_fail.meld', structured: { base: '.', segments: ['read_fail'], url: false }, isPathVariable: true }, imports: [{ name: '*' }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
          mockProcessingContext = createMockProcessingContext(node);
          const resolvedPathString = '/project/read_fail.meld';
          const readError = new MeldError('Disk read failed', { code: 'FS_READ_ERROR', severity: ErrorSeverity.Recoverable });
          
          vi.spyOn(resolutionService, 'resolveInContext').mockResolvedValueOnce('read_fail.meld');
          vi.spyOn(resolutionService, 'resolvePath').mockResolvedValueOnce(createMeldPath('read_fail.meld', unsafeCreateValidatedResourcePath(resolvedPathString), true));
          fileSystemService.exists.mockResolvedValue(true);
          
          fileSystemService.readFile.mockReset();
          fileSystemService.readFile.mockRejectedValueOnce(readError);

          await expectToThrowWithConfig(
              () => handler.handle(mockProcessingContext),
              {
                  type: 'DirectiveError',
                  code: DirectiveErrorCode.EXECUTION_FAILED, // Correct code
                  messageContains: 'Disk read failed'
              }
          );
          expect(circularityService.endImport).toHaveBeenCalledWith(resolvedPathString.replace(/\\/g, '/'));
          expect(parserService.parse).not.toHaveBeenCalled();
      });
  });
}); 