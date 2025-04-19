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

    (resolutionService.resolvePath as any).mockImplementation(async (p: string | StructuredPath, ctx?: ResolutionContext): Promise<MeldPath> => {
      const raw = typeof p === 'string' ? p : p?.raw ?? '';
      const currentPath = ctx?.currentFilePath ?? '/project/current.meld';
      const baseDir = path.dirname(currentPath);
      const isUrl = raw.startsWith('http');
      const resolved = isUrl ? raw : path.join(baseDir, raw).replace(/\\/g, '/');
      return createMeldPath(raw, unsafeCreateValidatedResourcePath(resolved), resolved.startsWith('/') || isUrl);
    });
     (resolutionService.resolveInContext as any).mockImplementation(async (value: any) => typeof value === 'string' ? value : value?.raw ?? '');
    (fileSystemService.exists as any).mockResolvedValue(true);
    (fileSystemService.readFile as any).mockResolvedValue('');
    const mockParsedNodes: MeldNode[] = [
      createDirectiveNode('text', { identifier: 'mockVar', value: 'mockValue', source: 'literal' })
    ];
    (parserService.parse as any).mockResolvedValue(mockParsedNodes);
    (urlContentResolver.validateURL as any).mockResolvedValue(undefined as any);
    (urlContentResolver.fetchURL as any).mockResolvedValue({ content: '', url: '', fromCache: false, metadata: {} } as URLResponse);

    circularityService.beginImport.mockImplementation(() => {});
    circularityService.endImport.mockImplementation(() => {}); 

    // Add stateService to globalThis for identity checking in handler logs
    (globalThis as any).__test_state_service = stateService;
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
      // Configure mocks specific to this describe block directly
      (resolutionService.resolveInContext as any).mockImplementation(async (value: any, context: ResolutionContext): Promise<string> => {
        const raw = typeof value === 'string' ? value : value?.raw;
        process.stdout.write(`\nDEBUG: resolveInContext mock (special path variables) - raw: ${raw}\n`); // Added log
        if (!raw) return Promise.resolve('');
        if (raw.includes('nonexistent')) return Promise.resolve(resolvedNonExistentPath);
        // Assume $docs resolves like $. or $PROJECTPATH for this test block
        if (raw.includes('$.') || raw.includes('$PROJECTPATH') || raw.includes('$docs')) return Promise.resolve(resolvedProjectPath); 
        if (raw.includes('$~') || raw.includes('$HOMEPATH')) return Promise.resolve(resolvedHomePath);
        return Promise.resolve(raw); // Return raw if no match
      });
      // resolvePath should expect the *resolved* string from resolveInContext
      (resolutionService.resolvePath as any).mockImplementation(async (resolvedPathString: string, context: ResolutionContext): Promise<MeldPath> => {
        process.stdout.write(`\nDEBUG: resolvePath mock (special path variables) - resolvedPathString: ${resolvedPathString}\n`); // Added log
        // Use the resolvedPathString to create the MeldPath
        return Promise.resolve(createMeldPath(resolvedPathString, unsafeCreateValidatedResourcePath(resolvedPathString), true));
      });
      (fileSystemService.readFile as any).mockResolvedValue('mock content');
      (fileSystemService.exists as any).mockResolvedValue(true);

      // Override interpret mock for this block to succeed
      interpreterServiceClient.interpret.mockReset(); // Reset beforeEach rejection
      // Resolve with a state containing the variable expected by the test
      const mockResultState = mockDeep<IStateService>();
      mockResultState.getTransformedNodes.mockReturnValue([]);
      // Match the structure expected by the setTextVar assertion in the failing test
      const mockImportedVar: TextVariable = {
        name: 'imported', // Match the expected name
        type: VariableType.TEXT,
        value: 'mocked imported value', // Value content doesn't matter due to expect.any(String)
        metadata: { 
            // Include basic metadata; exact details might not be crucial 
            // if the assertion only checks for object existence or specific fields
            origin: VariableOrigin.DIRECT_DEFINITION, // Or IMPORT if more accurate
            createdAt: Date.now(), 
            modifiedAt: Date.now(), 
            // definedAt and context could be mocked if needed by handler logic
        }
      };
      mockResultState.getAllTextVars.mockReturnValue(new Map([['imported', mockImportedVar]]));
      mockResultState.getAllDataVars.mockReturnValue(new Map()); // Keep others empty
      mockResultState.getAllPathVars.mockReturnValue(new Map());
      mockResultState.getAllCommands.mockReturnValue(new Map());
      interpreterServiceClient.interpret.mockResolvedValue(mockResultState); 
    });

    it('should handle $. alias for project path', async () => {
      const node = createDirectiveNode('import', { path: { raw: '$./samples/nested.meld', structured: { base: '.', segments: ['samples', 'nested'], url: false }, isPathVariable: true }, imports: [{ name: '*' }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      await handler.handle(mockProcessingContext);
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(node.directive.path.raw, mockProcessingContext.resolutionContext);
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(resolvedProjectPath, mockProcessingContext.resolutionContext);
      expect(fileSystemService.exists).toHaveBeenCalledWith(resolvedProjectPath);
      expect(circularityService.beginImport).toHaveBeenCalledWith(resolvedProjectPath);
      expect(circularityService.endImport).toHaveBeenCalledWith(resolvedProjectPath);
    });

    it('should handle $PROJECTPATH for project path', async () => {
      const node = createDirectiveNode('import', { path: { raw: '$PROJECTPATH/samples/nested.meld', structured: { base: '.', segments: ['samples', 'nested'], url: false }, isPathVariable: true }, imports: [{ name: '*' }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      await handler.handle(mockProcessingContext);
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(node.directive.path.raw, mockProcessingContext.resolutionContext);
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(resolvedProjectPath, mockProcessingContext.resolutionContext);
      expect(fileSystemService.exists).toHaveBeenCalledWith(resolvedProjectPath);
      expect(circularityService.beginImport).toHaveBeenCalledWith(resolvedProjectPath);
    });

    it('should handle $~ alias for home path', async () => {
      const node = createDirectiveNode('import', { path: { raw: '$~/examples/basic.meld', structured: { base: '.', segments: ['examples', 'basic'], url: false }, isPathVariable: true }, imports: [{ name: '*' }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      await handler.handle(mockProcessingContext);
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(node.directive.path.raw, mockProcessingContext.resolutionContext);
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(resolvedHomePath, mockProcessingContext.resolutionContext);
      expect(fileSystemService.exists).toHaveBeenCalledWith(resolvedHomePath);
      expect(circularityService.beginImport).toHaveBeenCalledWith(resolvedHomePath);
    });

    it('should handle $HOMEPATH for home path', async () => {
      const node = createDirectiveNode('import', { path: { raw: '$HOMEPATH/examples/basic.meld', structured: { base: '.', segments: ['examples', 'basic'], url: false }, isPathVariable: true }, imports: [{ name: '*' }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      await handler.handle(mockProcessingContext);
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(node.directive.path.raw, mockProcessingContext.resolutionContext);
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(resolvedHomePath, mockProcessingContext.resolutionContext);
      expect(fileSystemService.exists).toHaveBeenCalledWith(resolvedHomePath);
      expect(circularityService.beginImport).toHaveBeenCalledWith(resolvedHomePath);
    });

    it('should throw error if resolved path does not exist', async () => {
      (fileSystemService.exists as any).mockResolvedValue(false);
      const node = createDirectiveNode('import', { path: { raw: '$PROJECTPATH/nonexistent.meld', structured: { base: '.', segments: ['nonexistent'], url: false }, isPathVariable: true }, imports: [{ name: '*' }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      await expectToThrowWithConfig(
        () => handler.handle(mockProcessingContext),
        {
          type: 'DirectiveError',
          code: DirectiveErrorCode.FILE_NOT_FOUND,
          messageContains: resolvedNonExistentPath
        }
      );
      expect(circularityService.endImport).toHaveBeenCalledWith(resolvedNonExistentPath);
    });

    it('should handle user-defined path variables in import path', async () => {
      const importLocation = createLocation(5, 1, undefined, undefined, '/project/main.meld');
      const node = createDirectiveNode('import', { path: { raw: '$docs/file.meld', structured: { base: '.', segments: ['file.meld'], variables: { path: ['docs'] } }, isPathVariable: true }, imports: [{ name: '*' }], subtype: 'importAll' }, importLocation) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      await handler.handle(mockProcessingContext);
      // Expect resolveInContext to be called with the raw path
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(node.directive.path.raw, mockProcessingContext.resolutionContext);
      // Expect resolvePath to be called with the *resolved* path based on the mock
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(resolvedProjectPath, mockProcessingContext.resolutionContext);
      // fileSystemService checks should use the resolved path
      expect(fileSystemService.exists).toHaveBeenCalledWith(resolvedProjectPath); 
      expect(fileSystemService.readFile).toHaveBeenCalledWith(resolvedProjectPath); 
      // Parser service might be called with resolved path or original, check implementation or adjust test
      // Assuming it uses resolved path for now:
      expect(parserService.parse).toHaveBeenCalledWith('mock content'); 
      expect(interpreterServiceClient.interpret).toHaveBeenCalledWith(expect.any(Array));
      // This assertion might fail if interpreter mock returns empty state, adjust if needed
      const result = await handler.handle(mockProcessingContext) as DirectiveResult;
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(node.directive.path.raw, mockProcessingContext.resolutionContext);
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(resolvedProjectPath, mockProcessingContext.resolutionContext);
      expect(fileSystemService.exists).toHaveBeenCalledWith(resolvedProjectPath);
      expect(circularityService.beginImport).toHaveBeenCalledWith(resolvedProjectPath.replace(/\\/g, '/'));
      expect(interpreterServiceClient.interpret).toHaveBeenCalled();
      // Check stateChanges content
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('imported');
      const importedDef = result.stateChanges?.variables?.imported;
      expect(importedDef?.type).toBe(VariableType.TEXT);
      expect(importedDef?.value).toBe('mocked imported value');
      expect(importedDef?.metadata?.origin).toBe(VariableOrigin.IMPORT);
      // Check replacement
      expect(result.replacement).toEqual([]);
    });
  });

  describe('basic importing', () => {
    beforeEach(() => {
      // Override interpret mock for this block to succeed and return a state with nodes
      const mockResultState = mockDeep<IStateService>();
      const mockNodes: MeldNode[] = [ { type: 'Text', content: 'Imported Content', location: undefined } as TextNode ]; // Cast to TextNode
      mockResultState.getTransformedNodes.mockReturnValue(mockNodes);
      // Ensure other methods needed by importAllVariables/processStructuredImports are mocked
      mockResultState.getAllTextVars.mockReturnValue(new Map([['importedVar', { name: 'importedVar', type: VariableType.TEXT, value: 'Imported Value'}]]));
      mockResultState.getAllDataVars.mockReturnValue(new Map());
      mockResultState.getAllPathVars.mockReturnValue(new Map());
      mockResultState.getAllCommands.mockReturnValue(new Map());
      
      interpreterServiceClient.interpret.mockReset(); 
      interpreterServiceClient.interpret.mockResolvedValue(mockResultState);
      
      // Mock createChildState for this block too
      const mockChildState = mockDeep<IStateService>();
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
      resolutionService.resolveInContext.mockResolvedValue(finalPath);
      resolutionService.resolvePath.mockResolvedValue(createMeldPath(finalPath, unsafeCreateValidatedResourcePath(finalPath), true));
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

      interpreterServiceClient.interpret.mockResolvedValueOnce(expectedResultState);
      const mockChildState = mockDeep<IStateService>();
      stateService.createChildState.mockReset();
      stateService.createChildState.mockResolvedValueOnce(mockChildState); 

      await handler.handle(mockProcessingContext);
      await handler.execute(mockProcessingContext);
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(importPathRaw, mockProcessingContext.resolutionContext);
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(finalPath, mockProcessingContext.resolutionContext);
      expect(fileSystemService.exists).toHaveBeenCalledWith(finalPath);
      expect(fileSystemService.readFile).toHaveBeenCalledWith(finalPath);
      expect(parserService.parse).toHaveBeenCalledWith('@text greeting="Hello"\n@data info={ "val": 1 }');
      // Assert setVariable calls
      expect(stateService.setVariable).toHaveBeenCalledWith(expect.objectContaining({
        type: VariableType.TEXT,
        name: 'greeting',
        value: 'Hello',
        metadata: expect.objectContaining({ origin: VariableOrigin.IMPORT })
      }));
      expect(stateService.setVariable).toHaveBeenCalledWith(expect.objectContaining({
        type: VariableType.DATA,
        name: 'info',
        value: { val: 1 },
        metadata: expect.objectContaining({ origin: VariableOrigin.IMPORT })
      }));
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
      resolutionService.resolveInContext.mockResolvedValue(finalPath);
      resolutionService.resolvePath.mockResolvedValue(createMeldPath(finalPath, unsafeCreateValidatedResourcePath(finalPath), true));
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
      
      // Use mockDeep for the result state and mock getVariable
      const expectedResultState = mockDeep<IStateService>();
      expectedResultState.getTransformedNodes.mockReturnValue([]);
      expectedResultState.getVariable.mockImplementation((name, type?: VariableType): MeldVariable | undefined => {
        if (type === VariableType.TEXT) {
            if (name === 'var1') return importedVar1;
            if (name === 'var2') return importedVar2;
            if (name === 'var3') return importedVar3;
        }
        return undefined;
      });
      expectedResultState.setCurrentFilePath.mockImplementation(() => {});
      
      interpreterServiceClient.interpret.mockResolvedValueOnce(expectedResultState);
      const mockChildState = mockDeep<IStateService>();
      stateService.createChildState.mockReset();
      stateService.createChildState.mockResolvedValueOnce(mockChildState);

      const result = await handler.handle(mockProcessingContext) as DirectiveResult;
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(importPathRaw, mockProcessingContext.resolutionContext);
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(finalPath, mockProcessingContext.resolutionContext);
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
       expect(resolutionService.resolveInContext).not.toHaveBeenCalled();
    });

    it('should handle variable not found during path resolution', async () => {
      const node = createDirectiveNode('import', { path: { raw: '$invalidVar/path', structured: { base: '.', segments: ['$invalidVar', 'path'], url: false }, isPathVariable: true }, imports: [{ name: '*', alias: null }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      const resolutionError = new MeldResolutionError('Variable not found: invalidVar', { code: 'VAR_NOT_FOUND' });
      (resolutionService.resolveInContext as any).mockReset();
      (resolutionService.resolveInContext as any).mockRejectedValueOnce(resolutionError);
      await expectToThrowWithConfig(
        () => handler.handle(mockProcessingContext),
        {
          type: 'DirectiveError',
          code: DirectiveErrorCode.RESOLUTION_FAILED,
          messageContains: 'Failed to resolve import path'
        }
      );
       expect(resolutionService.resolvePath).not.toHaveBeenCalled();
    });

    it('should handle file not found from FileSystemService', async () => {
      const node = createDirectiveNode('import', { path: { raw: 'missing.meld', structured: { base: '.', segments: ['missing'], url: false }, isPathVariable: true }, imports: [{ name: '*', alias: null }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      const resolvedPathString = '/project/missing.meld';
      (resolutionService.resolveInContext as any).mockReset();
      (resolutionService.resolveInContext as any).mockResolvedValue(resolvedPathString);
      (resolutionService.resolvePath as any).mockReset();
      (resolutionService.resolvePath as any).mockResolvedValue(createMeldPath(resolvedPathString, unsafeCreateValidatedResourcePath(resolvedPathString), true));
      (fileSystemService.exists as any).mockReset();
      (fileSystemService.exists as any).mockResolvedValue(false);
      await expectToThrowWithConfig(
        () => handler.handle(mockProcessingContext),
        {
          type: 'DirectiveError',
          code: DirectiveErrorCode.FILE_NOT_FOUND,
          messageContains: `File not found: ${resolvedPathString}`
        }
      );
       expect(resolutionService.resolveInContext).toHaveBeenCalledWith(node.directive.path.raw, expect.any(Object));
       expect(resolutionService.resolvePath).toHaveBeenCalledWith(resolvedPathString, expect.any(Object));
       expect(circularityService.endImport).toHaveBeenCalledWith(resolvedPathString.replace(/\\/g, '/'));
    });

    it('should handle circular imports from CircularityService', async () => {
      const node = createDirectiveNode('import', { path: { raw: 'circular.meld', structured: { base: '.', segments: ['circular'], url: false }, isPathVariable: true }, imports: [{ name: '*', alias: null }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      const resolvedPathString = '/project/circular.meld';
      const circularError = new DirectiveError('Circular import detected', 'import', DirectiveErrorCode.CIRCULAR_REFERENCE); 
      (resolutionService.resolveInContext as any).mockReset();
      (resolutionService.resolveInContext as any).mockResolvedValue(resolvedPathString);
      (resolutionService.resolvePath as any).mockReset();
      (resolutionService.resolvePath as any).mockResolvedValue(createMeldPath(resolvedPathString, unsafeCreateValidatedResourcePath(resolvedPathString), true));
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
      (resolutionService.resolveInContext as any).mockReset();
      (resolutionService.resolveInContext as any).mockResolvedValue(resolvedPathString);
      (resolutionService.resolvePath as any).mockReset();
      (resolutionService.resolvePath as any).mockResolvedValue(createMeldPath(resolvedPathString, unsafeCreateValidatedResourcePath(resolvedPathString), true));
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
      
      (resolutionService.resolveInContext as any).mockReset();
      (resolutionService.resolveInContext as any).mockResolvedValue(resolvedPathString);
      (resolutionService.resolvePath as any).mockReset();
      (resolutionService.resolvePath as any).mockResolvedValue(createMeldPath(resolvedPathString, unsafeCreateValidatedResourcePath(resolvedPathString), true));
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
          (resolutionService.resolveInContext as any).mockReset();
          (resolutionService.resolveInContext as any).mockResolvedValue(resolvedPathString);
          (resolutionService.resolvePath as any).mockReset();
          (resolutionService.resolvePath as any).mockResolvedValue(createMeldPath(resolvedPathString, unsafeCreateValidatedResourcePath(resolvedPathString), true));
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