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
import { isCommandVariable } from '@core/types/guards.js';
import { DirectiveResult, StateChanges } from '@core/directives/DirectiveHandler'; 
import crypto from 'crypto'; 
import { VariableDefinition } from '@core/types/variables.js'; 

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
  let stateService: IStateService;
  let resolutionService: IResolutionService;
  let fileSystemService: DeepMockProxy<IFileSystemService>;
  let pathService: DeepMockProxy<IPathService>;
  let parserService: DeepMockProxy<IParserService>;
  let interpreterServiceClientFactory: DeepMockProxy<InterpreterServiceClientFactory>;
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
        setVariable: vi.fn().mockResolvedValue({} as MeldVariable),
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
    vi.spyOn(stateService, 'clone').mockImplementation(() => stateService);
    vi.spyOn(stateService, 'createChildState').mockResolvedValue(stateService);

    resolutionService = {
        resolvePath: vi.fn(),
        resolveNodes: vi.fn(),
        resolveInContext: vi.fn(),
        resolveVariableReference: vi.fn(),
        extractSection: vi.fn()
    } as unknown as IResolutionService;

    interpreterServiceClient = {
        interpret: vi.fn(),
        createChildContext: vi.fn(),
    } as unknown as IInterpreterServiceClient;
    interpreterServiceClient.interpret.mockRejectedValue(new Error('Simulated Interpretation failed'));
    interpreterServiceClient.createChildContext.mockResolvedValue(stateService);

    fileSystemService = mockDeep<IFileSystemService>();
    pathService = mockDeep<IPathService>();
    parserService = mockDeep<IParserService>();
    interpreterServiceClientFactory = mockDeep<InterpreterServiceClientFactory>();
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
    testContainer.registerInstance<InterpreterServiceClientFactory>('InterpreterServiceClientFactory', interpreterServiceClientFactory);
    testContainer.registerInstance<ICircularityService>('ICircularityService', circularityService);
    testContainer.registerInstance<IURLContentResolver>('IURLContentResolver', urlContentResolver);
    testContainer.registerInstance<IValidationService>('IValidationService', validationService);

    handler = testContainer.resolve(ImportDirectiveHandler);
    
    interpreterServiceClientFactory.createClient.mockReturnValue(interpreterServiceClient);

    fileSystemService.readFile.mockResolvedValue('mock content');
    fileSystemService.exists.mockResolvedValue(true);
    parserService.parse.mockResolvedValue([
       { type: 'Text', content: 'Parsed mock content', location: undefined } as TextNode 
    ]);
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
      resolutionService.resolvePath.mockImplementation(async (pathInput: string | StructuredPath, context: ResolutionContext): Promise<MeldPath> => {
        const rawPath = typeof pathInput === 'string' ? pathInput : pathInput?.raw ?? '';
        let resolvedString: string;
        if (rawPath.includes('nonexistent')) resolvedString = resolvedNonExistentPath;
        else if (rawPath.includes('$.') || rawPath.includes('$PROJECTPATH') || rawPath.includes('$docs')) resolvedString = resolvedProjectPath; 
        else if (rawPath.includes('$~') || rawPath.includes('$HOMEPATH')) resolvedString = resolvedHomePath;
        else resolvedString = path.isAbsolute(rawPath) ? rawPath : path.join('/project', rawPath).replace(/\\/g, '/');

        return Promise.resolve(createMeldPath(rawPath, unsafeCreateValidatedResourcePath(resolvedString), resolvedString.startsWith('/') || resolvedString.startsWith('http')));
      });
    });

    it('should handle $. alias for project path', async () => {
      const node = createDirectiveNode('import', { path: { raw: '$./samples/nested.meld', structured: { base: '.', segments: ['samples', 'nested'], url: false }, isPathVariable: true }, imports: [{ name: '*' }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      resolutionService.resolvePath.mockResolvedValueOnce(
        createMeldPath(node.directive.path.raw, unsafeCreateValidatedResourcePath(resolvedProjectPath), true)
      );
      
      // Ensure the mocked interpreted state contains variables
      const importedVarDef: VariableDefinition = { name: 'sampleVar', type: VariableType.TEXT, value: 'sampleValue', metadata: { origin: VariableOrigin.DIRECT_DEFINITION } };
      const mockInterpretedState = {
          getStateId: vi.fn().mockReturnValue('interpreted-state-projectpath'),
          getAllTextVars: vi.fn().mockReturnValue(new Map([['sampleVar', importedVarDef]])),
          getAllDataVars: vi.fn().mockReturnValue(new Map()),
          getAllPathVars: vi.fn().mockReturnValue(new Map()),
          getAllCommands: vi.fn().mockReturnValue(new Map()),
          getTransformedNodes: vi.fn().mockReturnValue([]),
          // Add other methods if needed by the handler's state processing logic
      };
      interpreterServiceClient.interpret.mockReset(); // Reset before setting new mock behavior
      interpreterServiceClient.interpret.mockResolvedValue(mockInterpretedState as unknown as IStateService);
      
      // Expect the handler to produce stateChanges containing the imported variable
      const result = await handler.handle(mockProcessingContext);
      
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(node.directive.path, expect.anything());
      expect(fileSystemService.exists).toHaveBeenCalledWith(resolvedProjectPath);
      expect(circularityService.beginImport).toHaveBeenCalledWith(resolvedProjectPath.replace(/\\/g, '/'));
      expect(circularityService.endImport).toHaveBeenCalledWith(resolvedProjectPath.replace(/\\/g, '/'));
      
      // Verify stateChanges includes the imported variable
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('sampleVar');
      const sampleVarResult = result.stateChanges?.variables?.sampleVar;
      expect(sampleVarResult?.value).toBe('sampleValue');
      expect(sampleVarResult?.metadata?.origin).toBe(VariableOrigin.IMPORT); 
    });

    it('should handle $PROJECTPATH for project path', async () => {
      const node = createDirectiveNode('import', { path: { raw: '$PROJECTPATH/samples/nested.meld', structured: { base: '.', segments: ['samples', 'nested'], url: false }, isPathVariable: true }, imports: [{ name: '*' }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      resolutionService.resolvePath.mockResolvedValueOnce(
        createMeldPath(node.directive.path.raw, unsafeCreateValidatedResourcePath(resolvedProjectPath), true)
      );
      const plainMockState = { getAllTextVars: vi.fn().mockReturnValue(new Map()), getAllDataVars: vi.fn().mockReturnValue(new Map()), getAllPathVars: vi.fn().mockReturnValue(new Map()), getAllCommands: vi.fn().mockReturnValue(new Map()) };
      interpreterServiceClient.interpret.mockReset();
      interpreterServiceClient.interpret.mockResolvedValue(plainMockState as unknown as IStateService);
      
      await handler.handle(mockProcessingContext);
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(node.directive.path, expect.anything());      
      expect(fileSystemService.exists).toHaveBeenCalledWith(resolvedProjectPath);
      expect(circularityService.beginImport).toHaveBeenCalledWith(resolvedProjectPath.replace(/\\/g, '/'));
    });

    it('should handle $~ alias for home path', async () => {
      const node = createDirectiveNode('import', { path: { raw: '$~/examples/basic.meld', structured: { base: '.', segments: ['examples', 'basic'], url: false }, isPathVariable: true }, imports: [{ name: '*' }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      resolutionService.resolvePath.mockResolvedValueOnce(
        createMeldPath(node.directive.path.raw, unsafeCreateValidatedResourcePath(resolvedHomePath), true)
      );
      const plainMockState = { getAllTextVars: vi.fn().mockReturnValue(new Map()), getAllDataVars: vi.fn().mockReturnValue(new Map()), getAllPathVars: vi.fn().mockReturnValue(new Map()), getAllCommands: vi.fn().mockReturnValue(new Map()) };
      interpreterServiceClient.interpret.mockReset();
      interpreterServiceClient.interpret.mockResolvedValue(plainMockState as unknown as IStateService);
      
      await handler.handle(mockProcessingContext);
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(node.directive.path, expect.anything());      
      expect(fileSystemService.exists).toHaveBeenCalledWith(resolvedHomePath);
      expect(circularityService.beginImport).toHaveBeenCalledWith(resolvedHomePath.replace(/\\/g, '/'));
    });

    it('should handle $HOMEPATH for home path', async () => {
      const node = createDirectiveNode('import', { path: { raw: '$HOMEPATH/examples/basic.meld', structured: { base: '.', segments: ['examples', 'basic'], url: false }, isPathVariable: true }, imports: [{ name: '*' }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      resolutionService.resolvePath.mockResolvedValueOnce(
        createMeldPath(node.directive.path.raw, unsafeCreateValidatedResourcePath(resolvedHomePath), true)
      );
      const plainMockState = { getAllTextVars: vi.fn().mockReturnValue(new Map()), getAllDataVars: vi.fn().mockReturnValue(new Map()), getAllPathVars: vi.fn().mockReturnValue(new Map()), getAllCommands: vi.fn().mockReturnValue(new Map()) };
      interpreterServiceClient.interpret.mockReset();
      interpreterServiceClient.interpret.mockResolvedValue(plainMockState as unknown as IStateService);
      
      await handler.handle(mockProcessingContext);
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(node.directive.path, expect.anything());      
      expect(fileSystemService.exists).toHaveBeenCalledWith(resolvedHomePath);
      expect(circularityService.beginImport).toHaveBeenCalledWith(resolvedHomePath.replace(/\\/g, '/'));
    });

    it('should throw error if resolved path does not exist', async () => {
      fileSystemService.exists.mockResolvedValue(false);
      const node = createDirectiveNode('import', { path: { raw: '$PROJECTPATH/nonexistent.meld', structured: { base: '.', segments: ['nonexistent'], url: false }, isPathVariable: true }, imports: [{ name: '*' }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      resolutionService.resolvePath.mockResolvedValueOnce(
          createMeldPath(node.directive.path.raw, unsafeCreateValidatedResourcePath(resolvedNonExistentPath), true)
      );
      
      await expectToThrowWithConfig(
        () => handler.handle(mockProcessingContext),
        {
          type: 'DirectiveError',
          code: DirectiveErrorCode.FILE_NOT_FOUND,
          messageContains: `Import file not found: ${resolvedNonExistentPath}`
        }
      );
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(node.directive.path, expect.anything());
      expect(fileSystemService.exists).toHaveBeenCalledWith(resolvedNonExistentPath);
      expect(circularityService.endImport).toHaveBeenCalledWith(resolvedNonExistentPath.replace(/\\/g, '/'));
    });

    it('should handle user-defined path variables in import path', async () => {
      const importLocation = createLocation(5, 1, undefined, undefined, '/project/main.meld');
      const expectedResolvedPathString = resolvedProjectPath; 
      const node = createDirectiveNode('import', { path: { raw: '$docs/file.meld', structured: { base: '.', segments: ['file.meld'], variables: { path: ['docs'] } }, isPathVariable: true }, imports: [{ name: '*' }], subtype: 'importAll' }, importLocation) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      
      resolutionService.resolvePath.mockResolvedValueOnce(
          createMeldPath(node.directive.path.raw, unsafeCreateValidatedResourcePath(expectedResolvedPathString), true)
      );

      const importedTextVarDef: VariableDefinition = { name:'imported', type: VariableType.TEXT, value:'mocked imported value', metadata: { origin: VariableOrigin.DIRECT_DEFINITION }};
      const plainMockState = {
          getStateId: vi.fn().mockReturnValue('interpreted-state-1'),
          getAllTextVars: vi.fn().mockReturnValue(new Map([['imported', importedTextVarDef]])),
          getAllDataVars: vi.fn().mockReturnValue(new Map()),
          getAllPathVars: vi.fn().mockReturnValue(new Map()),
          getAllCommands: vi.fn().mockReturnValue(new Map()),
          getTransformedNodes: vi.fn().mockReturnValue([])
      };
      interpreterServiceClient.interpret.mockReset();
      interpreterServiceClient.interpret.mockResolvedValue(plainMockState as unknown as IStateService);

      const result = await handler.handle(mockProcessingContext);

      expect(resolutionService.resolvePath).toHaveBeenCalledWith(node.directive.path, expect.anything());      
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
      const mockChildState = mockDeep<IStateService>();
      mockChildState.getAllTextVars.mockReturnValue(new Map());
      mockChildState.getAllDataVars.mockReturnValue(new Map());
      mockChildState.getAllPathVars.mockReturnValue(new Map());
      mockChildState.getAllCommands.mockReturnValue(new Map());
      mockChildState.getTransformedNodes.mockReturnValue([]);
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
      resolutionService.resolvePath.mockResolvedValueOnce(
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
      
      const importedTextVarDef: VariableDefinition = { name: 'greeting', type: VariableType.TEXT, value: 'Hello', metadata: { definedAt: createTestLocation(1, 1), origin: VariableOrigin.DIRECT_DEFINITION, createdAt: Date.now(), modifiedAt: Date.now() } };
      const importedDataVarDef: VariableDefinition = { name: 'info', type: VariableType.DATA, value: { val: 1 }, metadata: { definedAt: createTestLocation(2, 1), origin: VariableOrigin.DIRECT_DEFINITION, createdAt: Date.now(), modifiedAt: Date.now() } };
      
      const plainMockState = {
          getStateId: vi.fn().mockReturnValue('interpreted-state-2'),
          getAllTextVars: vi.fn().mockReturnValue(new Map([['greeting', importedTextVarDef]])),
          getAllDataVars: vi.fn().mockReturnValue(new Map([['info', importedDataVarDef]])),
          getAllPathVars: vi.fn().mockReturnValue(new Map()),
          getAllCommands: vi.fn().mockReturnValue(new Map()),
          getTransformedNodes: vi.fn().mockReturnValue([])
      };

      interpreterServiceClient.interpret.mockReset(); 
      interpreterServiceClient.interpret.mockResolvedValue(plainMockState as unknown as IStateService);

      const result = await handler.handle(mockProcessingContext);
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(node.directive.path, expect.anything()); 
      expect(fileSystemService.exists).toHaveBeenCalledWith(finalPath);
      expect(fileSystemService.readFile).toHaveBeenCalledWith(finalPath);
      expect(parserService.parse).toHaveBeenCalledWith('@text greeting="Hello"\n@data info={ "val": 1 }');
      expect(interpreterServiceClient.interpret).toHaveBeenCalled();
      
      process.stdout.write(`DEBUG [Test - import *] Result object: ${JSON.stringify(result)}\n`);

      expect(result).toHaveProperty('stateChanges'); 
      expect(result.stateChanges).not.toBeUndefined();
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
      resolutionService.resolvePath.mockResolvedValueOnce(
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
      
      const expectedResultState = mockDeep<IStateService>();
      expectedResultState.getTransformedNodes.mockReturnValue([]);
      expectedResultState.getVariable.mockImplementation((name, type?: VariableType): MeldVariable | undefined => {
        if (type === VariableType.TEXT) {
            if (name === 'var1') return importedVar1;
            if (name === 'var2') return importedVar2;
        }
        return undefined;
      });
      expectedResultState.getAllTextVars.mockReturnValue(new Map([['var1', importedVar1], ['var2', importedVar2]]));
      expectedResultState.getAllDataVars.mockReturnValue(new Map());
      expectedResultState.getAllPathVars.mockReturnValue(new Map());
      expectedResultState.getAllCommands.mockReturnValue(new Map());
      expectedResultState.setCurrentFilePath.mockImplementation(() => {});
      
      interpreterServiceClient.interpret.mockResolvedValueOnce(expectedResultState);

      const result = await handler.handle(mockProcessingContext) as DirectiveResult;
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(node.directive.path, expect.anything()); 
      expect(fileSystemService.exists).toHaveBeenCalledWith(finalPath);
      expect(fileSystemService.readFile).toHaveBeenCalledWith(finalPath);
      expect(parserService.parse).toHaveBeenCalledWith('@text var1="value1"\n@text var2="value2"\n@text var3="value3"');
      expect(interpreterServiceClient.interpret).toHaveBeenCalled();

      process.stdout.write(`DEBUG [Test - import *] Result object: ${JSON.stringify(result)}\n`);

      expect(result).toHaveProperty('stateChanges'); 
      expect(result.stateChanges).not.toBeUndefined();
      expect(result.stateChanges?.variables).toHaveProperty('var1');
      expect(result.stateChanges?.variables).toHaveProperty('aliasedVar2');
      expect(result.stateChanges?.variables).not.toHaveProperty('var2');
      expect(result.stateChanges?.variables).not.toHaveProperty('var3');
      const var1Def = result.stateChanges?.variables?.var1;
      const aliasedVar2Def = result.stateChanges?.variables?.aliasedVar2;
      expect(var1Def?.type).toBe(VariableType.TEXT);
      expect(var1Def?.value).toBe('value1');
      expect(var1Def?.metadata?.origin).toBe(VariableOrigin.IMPORT);
      expect(aliasedVar2Def?.type).toBe(VariableType.TEXT);
      expect(aliasedVar2Def?.value).toBe('value2');
      expect(aliasedVar2Def?.metadata?.origin).toBe(VariableOrigin.IMPORT);

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
      resolutionService.resolvePath.mockRejectedValueOnce(resolutionError);
      await expectToThrowWithConfig(
        () => handler.handle(mockProcessingContext),
        {
          type: 'DirectiveError',
          code: DirectiveErrorCode.RESOLUTION_FAILED,
          messageContains: 'Failed to resolve import path'
        }
      );
       expect(resolutionService.resolvePath).toHaveBeenCalledWith(node.directive.path, expect.anything());
    });

    it('should handle file not found from FileSystemService', async () => {
      const node = createDirectiveNode('import', { path: { raw: 'missing.meld', structured: { base: '.', segments: ['missing'], url: false }, isPathVariable: true }, imports: [{ name: '*' }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      const resolvedPathString = '/project/missing.meld';
      resolutionService.resolvePath.mockResolvedValueOnce(createMeldPath(node.directive.path.raw, unsafeCreateValidatedResourcePath(resolvedPathString), true));
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
      resolutionService.resolvePath.mockResolvedValueOnce(createMeldPath(node.directive.path.raw, unsafeCreateValidatedResourcePath(resolvedPathString), true));
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
      resolutionService.resolvePath.mockResolvedValueOnce(createMeldPath(node.directive.path.raw, unsafeCreateValidatedResourcePath(resolvedPathString), true));
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
      
      interpreterServiceClient.interpret.mockReset();
      interpreterServiceClient.interpret.mockRejectedValue(interpretError);
      const mockChildState = mockDeep<IStateService>();
      stateService.createChildState.mockReset();
      stateService.createChildState.mockResolvedValueOnce(mockChildState);
      
      resolutionService.resolvePath.mockResolvedValueOnce(createMeldPath(node.directive.path.raw, unsafeCreateValidatedResourcePath(resolvedPathString), true));
      (fileSystemService.exists as any).mockReset();
      (fileSystemService.exists as any).mockResolvedValue(true);
      (fileSystemService.readFile as any).mockReset();
      (fileSystemService.readFile as any).mockResolvedValue('content');
      (parserService.parse as any).mockReset();
      (parserService.parse as any).mockResolvedValue([]);
      
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
          resolutionService.resolvePath.mockResolvedValueOnce(createMeldPath(node.directive.path.raw, unsafeCreateValidatedResourcePath(resolvedPathString), true));
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