import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mockDeep, DeepMockProxy } from 'vitest-mock-extended';
import { ImportDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import type { IParserService } from '@services/pipeline/ParserService/IParserService';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService';
import type { DirectiveNode } from '@core/ast/types/base';
import type { ImportDirectiveNode } from '@core/ast/types/import';  
import type { MeldNode, SourceLocation, VariableReferenceNode, TextNode } from '@core/ast/types';
import { VariableOrigin, type TextVariable, type DataVariable, type IPathVariable, type CommandVariable, type MeldVariable, type VariableMetadata, VariableType } from '@core/types/variables';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import { MeldFileNotFoundError } from '@core/errors/MeldFileNotFoundError';
import { MeldResolutionError, ResolutionErrorDetails } from '@core/errors/MeldResolutionError';
import { ErrorSeverity, MeldError } from '@core/errors/MeldError';
import { expectToThrowWithConfig, ErrorTestOptions } from '@tests/utils/ErrorTestUtils';
import { createTestLocation, createTestText } from '@tests/utils/nodeFactories';
import { createLocation, createDirectiveNode } from '@tests/utils/testFactories';
import { TestContextDI } from '@tests/utils/di/TestContextDI';
import type { IInterpreterServiceClient } from '@services/pipeline/InterpreterService/interfaces/IInterpreterServiceClient';
import type { IURLContentResolver } from '@services/resolution/URLContentResolver/IURLContentResolver';
import type { MeldPath, PathPurpose, ValidatedResourcePath } from '@core/types/paths';
import { createMeldPath, unsafeCreateValidatedResourcePath, PathContentType } from '@core/types/paths';
import type { URLResponse } from '@services/fs/PathService/IURLCache';
import type { DirectiveProcessingContext, OutputFormattingContext } from '@core/types/index';
import type { ResolutionContext, FormattingContext } from '@core/types/resolution';
import type { IPathService } from '@services/fs/PathService/IPathService';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService';
import { container, type DependencyContainer } from 'tsyringe';
import { createTextVariable, createDataVariable, createPathVariable, createCommandVariable } from '@core/types/variables';
import { isCommandVariable } from '@core/types/guards';
import { DirectiveResult, StateChanges } from '@core/directives/DirectiveHandler'; 
import crypto from 'crypto'; 
import { VariableDefinition } from '@core/types/variables'; 
import path from 'path';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService';
import { InterpreterServiceClientFactory } from '@services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory';
import { StateTrackingService } from '@tests/utils/debug/StateTrackingService/StateTrackingService';
import type { IStateTrackingService } from '@tests/utils/debug/StateTrackingService/IStateTrackingService';
import { MockFactory } from '@tests/utils/mocks/MockFactory';

/**
 * ImportDirectiveHandler Test Status
 * ----------------------------------------
 * MIGRATION STATUS: Phase 5 ✅ (Using TestContextDI helpers)
 * This test file has been migrated to use:
 * - TestContextDI helpers for container management
 * - Standard mocks provided by TestContextDI/MockFactory
 * - vi.spyOn on resolved mocks for test-specific behavior
 */

vi.mock('@core/utils/logger', () => {
  // EXEC the mock object INSIDE the factory function
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

// Define a simple mock OutputFormattingContext
// ...

// >>> EXEC HELPER HERE <<<
// --- Exec a helper to create a more complete mock state for interpret results ---
const createMockInterpretedState = (vars: { 
    text?: Map<string, TextVariable>,
    data?: Map<string, DataVariable>,
    path?: Map<string, IPathVariable>,
    command?: Map<string, CommandVariable>
} = {}): IStateService => {
    const combinedVars: Record<string, VariableDefinition> = {};
    vars.text?.forEach((v, k) => combinedVars[k] = v);
    vars.data?.forEach((v, k) => combinedVars[k] = v);
    vars.path?.forEach((v, k) => combinedVars[k] = v);
    vars.command?.forEach((v, k) => combinedVars[k] = v);

    const mockState: Record<keyof IStateService, any> = { 
      getStateId: vi.fn().mockReturnValue(`manual-mock-interpreted-${crypto.randomUUID()}`),
      getAllTextVars: vi.fn().mockReturnValue(vars.text ?? new Map()),
      getAllDataVars: vi.fn().mockReturnValue(vars.data ?? new Map()),
      getAllPathVars: vi.fn().mockReturnValue(vars.path ?? new Map()),
      getAllCommands: vi.fn().mockReturnValue(vars.command ?? new Map()),
      getTransformedNodes: vi.fn().mockReturnValue([]),
      getCurrentFilePath: vi.fn().mockReturnValue('/imported/file.meld'),
      isTransformationEnabled: vi.fn().mockReturnValue(false),
      getVariable: vi.fn().mockImplementation((name: string, type?: VariableType): MeldVariable | undefined => {
          const textMap = vars.text ?? new Map();
          const dataMap = vars.data ?? new Map();
          const pathMap = vars.path ?? new Map();
          const commandMap = vars.command ?? new Map();
          if (type === VariableType.TEXT || type === undefined) { const v = textMap.get(name); if (v) return v; }
          if (type === VariableType.DATA || type === undefined) { const v = dataMap.get(name); if (v) return v; }
          if (type === VariableType.PATH || type === undefined) { const v = pathMap.get(name); if (v) return v; }
          if (type === VariableType.COMMAND || type === undefined) { const v = commandMap.get(name); if (v) return v; }
          return undefined; 
      }),
      setVariable: vi.fn().mockResolvedValue({} as any),
      setCurrentFilePath: vi.fn(),
      clone: vi.fn(), // Mock clone
      getNodes: vi.fn().mockReturnValue([]),
      addNode: vi.fn(),
      createChildState: vi.fn(), // Mock createChildState
      mergeChildState: vi.fn(),
      // Add any other IStateService methods used by the handler AFTER the initial check
      hasTransformationSupport: vi.fn().mockReturnValue(true),
      applyStateChanges: vi.fn(), // Add applyStateChanges
      getParentState: vi.fn(),
      setEventService: vi.fn(),
      setTrackingService: vi.fn(),
      getInternalStateNode: vi.fn(),
      getTextVar: vi.fn(),
      getDataVar: vi.fn(),
      getPathVar: vi.fn(),
      getCommandVar: vi.fn(),
      setTextVar: vi.fn(),
      setDataVar: vi.fn(),
      setPathVar: vi.fn(),
      setCommandVar: vi.fn(),
      getLocalTextVars: vi.fn().mockReturnValue(vars.text ?? new Map()),
      getLocalDataVars: vi.fn().mockReturnValue(vars.data ?? new Map()),
      hasVariable: vi.fn(),
      removeVariable: vi.fn(),
      getCommandOutput: vi.fn(),
      shouldTransform: vi.fn(),
      setTransformationEnabled: vi.fn(),
      getTransformationOptions: vi.fn(),
      setTransformationOptions: vi.fn(),
      appendContent: vi.fn(),
      addImport: vi.fn(),
      removeImport: vi.fn(),
      hasImport: vi.fn(),
      getImports: vi.fn(),
      hasLocalChanges: vi.fn(),
      getLocalChanges: vi.fn().mockReturnValue(Object.keys(combinedVars)), // Return array of keys
      setImmutable: vi.fn(),
      isImmutable: false, // Add isImmutable property
      transformNode: vi.fn(),
      setTransformedNodes: vi.fn(), // Add missing method
    };
    
    // Configure clone and createChildState to return the mock itself for chaining if needed
    mockState.clone.mockReturnThis(); 
    mockState.createChildState.mockResolvedValue(mockState);

    // Cast to IStateService
    return mockState as IStateService;
};

// Main test suite for DirectiveService
describe('ImportDirectiveHandler', () => {
  let handler: ImportDirectiveHandler;
  let mockStateService: DeepMockProxy<IStateService>;
  let mockResolutionService: DeepMockProxy<IResolutionService>;
  let mockFileSystemService: DeepMockProxy<IFileSystemService>;
  let mockPathService: DeepMockProxy<IPathService>;
  let mockParserService: DeepMockProxy<IParserService>;
  let mockCircularityService: DeepMockProxy<ICircularityService>;
  let mockUrlContentResolver: DeepMockProxy<IURLContentResolver>;
  let mockValidationService: DeepMockProxy<IValidationService>;
  let mockInterpreterServiceClient: DeepMockProxy<IInterpreterServiceClient>;
  let mockInterpreterServiceClientFactory: DeepMockProxy<InterpreterServiceClientFactory>;
  let testContainer: DependencyContainer;
  let mockProcessingContext: DirectiveProcessingContext;
  let mockStateTrackingService: IStateTrackingService;

  beforeEach(async () => {
    mockStateService = mockDeep<IStateService>();
    mockResolutionService = mockDeep<IResolutionService>();
    mockInterpreterServiceClient = mockDeep<IInterpreterServiceClient>();
    mockInterpreterServiceClientFactory = mockDeep<InterpreterServiceClientFactory>();

    mockStateService.getCurrentFilePath.mockReturnValue('/project/current.meld');
    mockStateService.isTransformationEnabled.mockReturnValue(false);
    mockStateService.getStateId.mockReturnValue('mock-state-id');
    mockStateService.clone.mockReturnValue(mockStateService);
    mockStateService.createChildState.mockResolvedValue(mockStateService);
    mockStateService.getNodes.mockReturnValue([]);
    mockStateService.getTransformedNodes.mockReturnValue([]);

    mockResolutionService.resolveInContext.mockResolvedValue('/project/default/resolved.meld');
    mockResolutionService.resolveNodes = vi.fn().mockResolvedValue('/project/default/resolved.meld');
    mockResolutionService.resolvePath.mockImplementation(async (pathInput: string, context: ResolutionContext): Promise<MeldPath> => {
      const pathString = pathInput;
      return createMeldPath(pathString, unsafeCreateValidatedResourcePath(pathString), true);
    });

    mockFileSystemService = mockDeep<IFileSystemService>();
    mockPathService = mockDeep<IPathService>();
    mockParserService = mockDeep<IParserService>();
    mockCircularityService = mockDeep<ICircularityService>();
    mockUrlContentResolver = mockDeep<IURLContentResolver>();
    mockValidationService = mockDeep<IValidationService>();

    mockInterpreterServiceClientFactory.createClient.mockReturnValue(mockInterpreterServiceClient);
    mockInterpreterServiceClient.interpret.mockResolvedValue(createMockInterpretedState());

    testContainer = container.createChildContainer();

    testContainer.registerInstance('ILogger', { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() });
    testContainer.registerInstance<IStateService>('IStateService', mockStateService);
    testContainer.registerInstance<IResolutionService>('IResolutionService', mockResolutionService);
    testContainer.registerInstance<IFileSystemService>('IFileSystemService', mockFileSystemService);
    testContainer.registerInstance<IPathService>('IPathService', mockPathService);
    testContainer.registerInstance<IParserService>('IParserService', mockParserService);
    testContainer.registerInstance<ICircularityService>('ICircularityService', mockCircularityService);
    testContainer.registerInstance<IURLContentResolver>('IURLContentResolver', mockUrlContentResolver);
    testContainer.registerInstance<IValidationService>('IValidationService', mockValidationService);
    testContainer.registerInstance(InterpreterServiceClientFactory, mockInterpreterServiceClientFactory);

    testContainer.registerInstance('DependencyContainer', testContainer);
    
    mockStateTrackingService = {
      registerState: vi.fn(),
      addRelationship: vi.fn(),
      registerRelationship: vi.fn(),
      getStateLineage: vi.fn().mockReturnValue([]),
      getStateDescendants: vi.fn().mockReturnValue([]),
      getAllStates: vi.fn(),
      getStateMetadata: vi.fn(),
      trackContextBoundary: vi.fn(),
      trackVariableCrossing: vi.fn(),
      getContextBoundaries: vi.fn(),
      getVariableCrossings: vi.fn(),
      getContextHierarchy: vi.fn(),
    };
    testContainer.registerInstance<IStateTrackingService>('StateTrackingService', mockStateTrackingService);

    testContainer.register(ImportDirectiveHandler, { useClass: ImportDirectiveHandler });

    handler = testContainer.resolve(ImportDirectiveHandler);
    
    mockFileSystemService.readFile.mockResolvedValue('mock content');
    mockFileSystemService.exists.mockResolvedValue(true);
    mockParserService.parse.mockResolvedValue([
       { type: 'Text', content: 'Parsed mock content', location: undefined } as TextNode 
    ]);
  });

  afterEach(async () => {
    testContainer?.dispose();
    vi.resetAllMocks();
  });

  const createMockProcessingContext = (node: DirectiveNode<ImportDirectiveData>): DirectiveProcessingContext => {
    // Use the factory to create a valid ResolutionContext
    const resolutionContext = ResolutionContextFactory.create(
      mockStateService, 
      mockStateService.getCurrentFilePath() ?? undefined
    );

    const mockFormattingContext: OutputFormattingContext = { isBlock: false, preserveLiteralFormatting: false, preserveWhitespace: false };
    
    return {
      state: mockStateService, 
      resolutionContext: resolutionContext, // Use the factory-created context
      formattingContext: mockFormattingContext,
      directiveNode: node,
    };
  };

  describe('special path variables', () => {
    const resolvedProjectPath = '/project/path/test.meld';
    const resolvedHomePath = '/home/user/test.meld';
    const resolvedNonExistentPath = '/project/path/nonexistent.meld';

    beforeEach(() => {
      mockFileSystemService.readFile.mockResolvedValue('mock content');
      mockFileSystemService.exists.mockResolvedValue(true);
      
      mockResolutionService.resolvePath.mockImplementation(async (pathInput: string | StructuredPath, context: ResolutionContext): Promise<MeldPath> => {
        const resolvedPathString = typeof pathInput === 'string' ? pathInput : pathInput?.raw ?? '';
        const testCasePath = 
            resolvedPathString.includes('nonexistent') ? resolvedNonExistentPath :
            resolvedPathString.includes('$.') || resolvedPathString.includes('$PROJECTPATH') ? resolvedProjectPath :
            resolvedPathString.includes('$~/') || resolvedPathString.includes('$HOMEPATH') ? resolvedHomePath :
            resolvedPathString; 
        return Promise.resolve(createMeldPath(resolvedPathString, unsafeCreateValidatedResourcePath(testCasePath), true));
      });
      
      vi.mocked(mockResolutionService.resolveInContext).mockClear();
    });

    it('should handle $. alias for project path', async () => {
      const node = createDirectiveNode('import', {
        kind: 'import',
        subtype: 'importAll',
        values: {
          imports: [{ type: 'VariableReference', identifier: '*', valueType: 'import' }],
          path: [
            { type: 'VariableReference', identifier: '.' },
            { type: 'PathSeparator', separator: '/' },
            { type: 'Text', content: 'samples' },
            { type: 'PathSeparator', separator: '/' },
            { type: 'Text', content: 'nested.meld' }
          ]
        },
        raw: {
          imports: '*',
          path: '$./samples/nested.meld'
        }
      }) as ImportDirectiveNode;
      mockProcessingContext = createMockProcessingContext(node);
      mockResolutionService.resolveNodes.mockResolvedValueOnce('$./samples/nested.meld');

      const importedVarDef: TextVariable = { name: 'sampleVar', type: VariableType.TEXT, value: 'sampleValue', metadata: { origin: VariableOrigin.DIRECT_DEFINITION, createdAt: Date.now(), modifiedAt: Date.now() } };
      
      const mockInterpretedState = createMockInterpretedState({ text: new Map([['sampleVar', importedVarDef]]) });
      
      mockInterpreterServiceClient.interpret.mockResolvedValue(mockInterpretedState);
      
      const result = await handler.handle(mockProcessingContext);
      
      expect(mockResolutionService.resolveNodes).toHaveBeenCalledWith(node.values.path, expect.anything());
      expect(mockResolutionService.resolvePath).toHaveBeenCalledWith('$./samples/nested.meld', expect.anything());
      expect(mockFileSystemService.exists).toHaveBeenCalledWith(resolvedProjectPath);
      expect(mockCircularityService.beginImport).toHaveBeenCalledWith(resolvedProjectPath.replace(/\\/g, '/'));
      expect(mockCircularityService.endImport).toHaveBeenCalledWith(resolvedProjectPath.replace(/\\/g, '/'));
      
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('sampleVar');
      const sampleVarResult = result.stateChanges?.variables?.sampleVar;
      expect(sampleVarResult?.value).toBe('sampleValue');
      expect(sampleVarResult?.metadata?.origin).toBe(VariableOrigin.IMPORT);
      expect(mockInterpreterServiceClient.interpret).toHaveBeenCalled();
    });

    it('should handle $PROJECTPATH for project path', async () => {
      const node = createDirectiveNode('import', {
        kind: 'import',
        subtype: 'importAll',
        values: {
          imports: [{ type: 'VariableReference', identifier: '*', valueType: 'import' }],
          path: [
            { type: 'VariableReference', identifier: 'PROJECTPATH' },
            { type: 'PathSeparator', separator: '/' },
            { type: 'Text', content: 'samples' },
            { type: 'PathSeparator', separator: '/' },
            { type: 'Text', content: 'nested.meld' }
          ]
        },
        raw: {
          imports: '*',
          path: '$PROJECTPATH/samples/nested.meld'
        }
      }) as ImportDirectiveNode;
      mockProcessingContext = createMockProcessingContext(node);
      
      mockResolutionService.resolveNodes.mockResolvedValueOnce('$PROJECTPATH/samples/nested.meld');
      mockResolutionService.resolvePath.mockResolvedValueOnce(
        createMeldPath('$PROJECTPATH/samples/nested.meld', unsafeCreateValidatedResourcePath(resolvedProjectPath), true)
      );
      
      mockInterpreterServiceClient.interpret.mockResolvedValue(createMockInterpretedState());

      await handler.handle(mockProcessingContext);
      expect(mockResolutionService.resolveNodes).toHaveBeenCalledWith(node.values.path, expect.anything());      
      expect(mockResolutionService.resolvePath).toHaveBeenCalledWith('$PROJECTPATH/samples/nested.meld', expect.anything());
      expect(mockFileSystemService.exists).toHaveBeenCalledWith(resolvedProjectPath);
      expect(mockCircularityService.beginImport).toHaveBeenCalledWith(resolvedProjectPath.replace(/\\/g, '/'));
      expect(mockInterpreterServiceClient.interpret).toHaveBeenCalled();
    });

    it('should handle $~ alias for home path', async () => {
      const node = createDirectiveNode('import', {
        kind: 'import',
        subtype: 'importAll',
        values: {
          imports: [{ type: 'VariableReference', identifier: '*', valueType: 'import' }],
          path: [
            { type: 'VariableReference', identifier: '~' },
            { type: 'PathSeparator', separator: '/' },
            { type: 'Text', content: 'examples' },
            { type: 'PathSeparator', separator: '/' },
            { type: 'Text', content: 'basic.meld' }
          ]
        },
        raw: {
          imports: '*',
          path: '$~/examples/basic.meld'
        }
      }) as ImportDirectiveNode;
      mockProcessingContext = createMockProcessingContext(node);
      
      mockResolutionService.resolveNodes.mockResolvedValueOnce('$~/examples/basic.meld'); 
      
      mockInterpreterServiceClient.interpret.mockResolvedValue(createMockInterpretedState());
      
      await handler.handle(mockProcessingContext);
      expect(mockResolutionService.resolveNodes).toHaveBeenCalledWith(node.values.path, expect.anything());      
      expect(mockResolutionService.resolvePath).toHaveBeenCalledWith('$~/examples/basic.meld', expect.anything());
      expect(mockFileSystemService.exists).toHaveBeenCalledWith(resolvedHomePath);
      expect(mockCircularityService.beginImport).toHaveBeenCalledWith(resolvedHomePath.replace(/\\/g, '/'));
      expect(mockInterpreterServiceClient.interpret).toHaveBeenCalled();
    });

    it('should handle $HOMEPATH for home path', async () => {
      const node = createDirectiveNode('import', {
        kind: 'import',
        subtype: 'importAll',
        values: {
          imports: [{ type: 'VariableReference', identifier: '*', valueType: 'import' }],
          path: [
            { type: 'VariableReference', identifier: 'HOMEPATH' },
            { type: 'PathSeparator', separator: '/' },
            { type: 'Text', content: 'examples' },
            { type: 'PathSeparator', separator: '/' },
            { type: 'Text', content: 'basic.meld' }
          ]
        },
        raw: {
          imports: '*',
          path: '$HOMEPATH/examples/basic.meld'
        }
      }) as ImportDirectiveNode;
      mockProcessingContext = createMockProcessingContext(node);
      
      mockResolutionService.resolveNodes.mockResolvedValueOnce('$HOMEPATH/examples/basic.meld'); 
      
      mockInterpreterServiceClient.interpret.mockResolvedValue(createMockInterpretedState());
      
      await handler.handle(mockProcessingContext);
      expect(mockResolutionService.resolveNodes).toHaveBeenCalledWith(node.values.path, expect.anything());      
      expect(mockResolutionService.resolvePath).toHaveBeenCalledWith('$HOMEPATH/examples/basic.meld', expect.anything()); 
      expect(mockFileSystemService.exists).toHaveBeenCalledWith(resolvedHomePath);
      expect(mockCircularityService.beginImport).toHaveBeenCalledWith(resolvedHomePath.replace(/\\/g, '/'));
      expect(mockInterpreterServiceClient.interpret).toHaveBeenCalled();
    });

    it('should throw error if resolved path does not exist', async () => {
      mockFileSystemService.exists.mockResolvedValue(false);
      const node = createDirectiveNode('import', {
        kind: 'import',
        subtype: 'importAll',
        values: {
          imports: [{ type: 'VariableReference', identifier: '*', valueType: 'import' }],
          path: [
            { type: 'VariableReference', identifier: 'PROJECTPATH' },
            { type: 'PathSeparator', separator: '/' },
            { type: 'Text', content: 'nonexistent.meld' }
          ]
        },
        raw: {
          imports: '*',
          path: '$PROJECTPATH/nonexistent.meld'
        }
      }) as ImportDirectiveNode;
      mockProcessingContext = createMockProcessingContext(node);
      
      mockResolutionService.resolveNodes.mockResolvedValueOnce('nonexistent.meld'); 

      mockResolutionService.resolvePath.mockResolvedValueOnce(
          createMeldPath('nonexistent.meld', unsafeCreateValidatedResourcePath(resolvedNonExistentPath), true)
      );
      
      mockFileSystemService.exists.mockReset();
      mockFileSystemService.exists.mockResolvedValue(false);

      await expectToThrowWithConfig(
        () => handler.handle(mockProcessingContext),
        {
          type: 'DirectiveError',
          code: DirectiveErrorCode.FILE_NOT_FOUND, 
          messageContains: `Import file not found: ${resolvedNonExistentPath}`
        }
      );
      expect(mockResolutionService.resolveNodes).toHaveBeenCalledWith(node.values.path, expect.anything());
      expect(mockResolutionService.resolvePath).toHaveBeenCalledWith('nonexistent.meld', expect.anything());
      expect(mockFileSystemService.exists).toHaveBeenCalledWith(resolvedNonExistentPath);
      expect(mockCircularityService.endImport).toHaveBeenCalledWith(resolvedNonExistentPath.replace(/\\/g, '/'));
    });

    it('should handle user-defined path variables in import path', async () => {
      const importLocation = createLocation(5, 1, undefined, undefined, '/project/main.meld');
      const expectedResolvedPathString = resolvedProjectPath; 
      const node = createDirectiveNode('import', {
        kind: 'import',
        subtype: 'importAll',
        values: {
          imports: [{ type: 'VariableReference', identifier: '*', valueType: 'import' }],
          path: [
            { type: 'VariableReference', identifier: 'docs' },
            { type: 'PathSeparator', separator: '/' },
            { type: 'Text', content: 'file.meld' }
          ]
        },
        raw: {
          imports: '*',
          path: '$docs/file.meld'
        }
      }, importLocation) as ImportDirectiveNode;
      mockProcessingContext = createMockProcessingContext(node);
      
      mockResolutionService.resolveNodes.mockResolvedValueOnce('$docs/file.meld');

      mockResolutionService.resolvePath.mockResolvedValueOnce(
          createMeldPath('$docs/file.meld', unsafeCreateValidatedResourcePath(expectedResolvedPathString), true)
      );

      const importedTextVarDef: TextVariable = { name: 'imported', type: VariableType.TEXT, value:'mocked imported value', metadata: { origin: VariableOrigin.DIRECT_DEFINITION, createdAt: Date.now(), modifiedAt: Date.now() } };
      const mockInterpretedState = createMockInterpretedState({ text: new Map([['imported', importedTextVarDef]]) });

      mockInterpreterServiceClient.interpret.mockResolvedValue(mockInterpretedState);

      const result = await handler.handle(mockProcessingContext);

      expect(mockResolutionService.resolveNodes).toHaveBeenCalledWith(node.values.path, expect.anything());
      expect(mockResolutionService.resolvePath).toHaveBeenCalledWith('$docs/file.meld', expect.anything());
      expect(mockFileSystemService.exists).toHaveBeenCalledWith(expectedResolvedPathString);
      expect(mockFileSystemService.readFile).toHaveBeenCalledWith(expectedResolvedPathString);
      expect(mockParserService.parse).toHaveBeenCalledWith('mock content');
      expect(mockInterpreterServiceClient.interpret).toHaveBeenCalled();
      expect(mockCircularityService.beginImport).toHaveBeenCalledWith(expectedResolvedPathString.replace(/\\/g, '/'));

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
      vi.spyOn(mockStateService, 'createChildState').mockResolvedValue(mockDeep<IStateService>()); 
    });

    it('should import all variables with *', async () => {
      const importPathRaw = 'imported.meld';
      const finalPath = '/project/imported.meld';
      const node = createDirectiveNode('import', {
        kind: 'import',
        subtype: 'importAll',
        values: {
          imports: [{ type: 'VariableReference', identifier: '*', valueType: 'import' }],
          path: [
            { type: 'Text', content: 'imported.meld' }
          ]
        },
        raw: {
          imports: '*',
          path: 'imported.meld'
        }
      }, createLocation(2, 1, undefined, undefined, '/project/test.meld')) as ImportDirectiveNode;
      mockProcessingContext = createMockProcessingContext(node);
      
      mockResolutionService.resolveNodes.mockResolvedValueOnce('imported.meld');
      mockResolutionService.resolvePath.mockResolvedValueOnce(
        createMeldPath(importPathRaw, unsafeCreateValidatedResourcePath(finalPath), true)
      );
      
      mockFileSystemService.exists.mockResolvedValue(true);
      mockFileSystemService.readFile.mockResolvedValue('@text greeting="Hello"\n@data info={ "val": 1 }');
      const parsedNodes: MeldNode[] = [
         { type: 'Directive', directive: { kind: 'text', identifier: 'greeting', source:'literal', value: [{ type: 'Text', content:'Hello' }] }, location: createLocation(1,1, undefined, undefined, finalPath) } as any,
         { type: 'Directive', directive: { kind: 'data', identifier: 'info', source:'literal', value: { val: 1 } }, location: createLocation(2,1, undefined, undefined, finalPath) } as any
      ];
      mockParserService.parse.mockResolvedValue(parsedNodes as any);
      
      const importedTextVarDef: TextVariable = { name: 'greeting', type: VariableType.TEXT, value: 'Hello', metadata: { definedAt: createTestLocation(1, 1), origin: VariableOrigin.DIRECT_DEFINITION, createdAt: Date.now(), modifiedAt: Date.now() } };
      const importedDataVarDef: DataVariable = { name: 'info', type: VariableType.DATA, value: { val: 1 }, metadata: { definedAt: createTestLocation(2, 1), origin: VariableOrigin.DIRECT_DEFINITION, createdAt: Date.now(), modifiedAt: Date.now() } };
      
      const mockInterpretedState = createMockInterpretedState({
          text: new Map([['greeting', importedTextVarDef]]),
          data: new Map([['info', importedDataVarDef]])
      });

      mockInterpreterServiceClient.interpret.mockResolvedValue(mockInterpretedState);

      const result = await handler.handle(mockProcessingContext);
      expect(mockResolutionService.resolveNodes).toHaveBeenCalledWith(node.values.path, expect.anything()); 
      expect(mockResolutionService.resolvePath).toHaveBeenCalledWith('imported.meld', expect.anything()); 
      expect(mockFileSystemService.exists).toHaveBeenCalledWith(finalPath);
      expect(mockFileSystemService.readFile).toHaveBeenCalledWith(finalPath);
      expect(mockParserService.parse).toHaveBeenCalledWith('@text greeting="Hello"\n@data info={ "val": 1 }');
      expect(mockInterpreterServiceClient.interpret).toHaveBeenCalled();
      
      process.stdout.write(`DEBUG [Test - import *] Result object: ${JSON.stringify(result)}\n`);

      expect(result).toHaveProperty('stateChanges'); 
      expect(result.stateChanges).not.toBeUndefined();
      expect(result.stateChanges?.variables).toEqual({
        greeting: expect.objectContaining({ type: VariableType.TEXT, value: 'Hello', metadata: expect.objectContaining({ origin: VariableOrigin.IMPORT }) }),
        info: expect.objectContaining({ type: VariableType.DATA, value: { val: 1 }, metadata: expect.objectContaining({ origin: VariableOrigin.IMPORT }) })
      });
      
      expect(result.replacement).toEqual([]);

      expect(mockCircularityService.beginImport).toHaveBeenCalledWith(finalPath.replace(/\\/g, '/'));
      expect(mockCircularityService.endImport).toHaveBeenCalledWith(finalPath.replace(/\\/g, '/'));
    });

    it('should import specific variables with alias', async () => {
      const importPathRaw = 'vars.meld';
      const finalPath = '/project/vars.meld';
      const node = createDirectiveNode('import', {
        kind: 'import',
        subtype: 'importSelected',
        values: {
          imports: [
            { type: 'VariableReference', identifier: 'var1', valueType: 'import', alias: null },
            { type: 'VariableReference', identifier: 'var2', valueType: 'import', alias: 'aliasedVar2' }
          ],
          path: [
            { type: 'Text', content: 'vars.meld' }
          ]
        },
        raw: {
          imports: [{ name: 'var1' }, { name: 'var2', alias: 'aliasedVar2' }],
          path: 'vars.meld'
        }
      }, createLocation(3, 1, undefined, undefined, '/project/test.meld')) as ImportDirectiveNode;
      mockProcessingContext = createMockProcessingContext(node);
      
      mockResolutionService.resolveNodes.mockResolvedValueOnce('vars.meld');
      mockResolutionService.resolvePath.mockResolvedValueOnce(
        createMeldPath(importPathRaw, unsafeCreateValidatedResourcePath(finalPath), true) 
      );
      
      mockFileSystemService.exists.mockResolvedValue(true);
      mockFileSystemService.readFile.mockResolvedValue('@text var1="value1"\n@text var2="value2"\n@text var3="value3"');
      const parsedNodes: MeldNode[] = [
        { type: 'Directive', directive: { kind: 'text', identifier: 'var1', source:'literal', value: [{ type: 'Text', content:'value1', nodeId: crypto.randomUUID() }] }, location: createLocation(1,1), nodeId: crypto.randomUUID() } as any,
        { type: 'Directive', directive: { kind: 'text', identifier: 'var2', source:'literal', value: [{ type: 'Text', content:'value2', nodeId: crypto.randomUUID() }] }, location: createLocation(2,1), nodeId: crypto.randomUUID() } as any,
        { type: 'Directive', directive: { kind: 'text', identifier: 'var3', source:'literal', value: [{ type: 'Text', content:'value3', nodeId: crypto.randomUUID() }] }, location: createLocation(3,1), nodeId: crypto.randomUUID() } as any
      ];
      mockParserService.parse.mockResolvedValue(parsedNodes as any);
      
      const importedVar1: TextVariable = { name: 'var1', type: VariableType.TEXT, value: 'value1', metadata: { definedAt: createTestLocation(1, 1), origin: VariableOrigin.DIRECT_DEFINITION, createdAt: Date.now(), modifiedAt: Date.now() } };
      const importedVar2: TextVariable = { name: 'var2', type: VariableType.TEXT, value: 'value2', metadata: { definedAt: createTestLocation(2, 1), origin: VariableOrigin.DIRECT_DEFINITION, createdAt: Date.now(), modifiedAt: Date.now() } };
      const importedVar3: TextVariable = { name: 'var3', type: VariableType.TEXT, value: 'value3', metadata: { definedAt: createTestLocation(3, 1), origin: VariableOrigin.DIRECT_DEFINITION, createdAt: Date.now(), modifiedAt: Date.now() } };
      
      const mockInterpretedState = createMockInterpretedState({
          text: new Map([
              ['var1', importedVar1],
              ['var2', importedVar2],
              ['var3', importedVar3]
          ])
      });

      mockInterpreterServiceClient.interpret.mockResolvedValue(mockInterpretedState);

      const result = await handler.handle(mockProcessingContext) as DirectiveResult;
      expect(mockResolutionService.resolveNodes).toHaveBeenCalledWith(node.values.path, expect.anything()); 
      expect(mockResolutionService.resolvePath).toHaveBeenCalledWith('vars.meld', expect.anything()); 
      expect(mockFileSystemService.exists).toHaveBeenCalledWith(finalPath);
      expect(mockFileSystemService.readFile).toHaveBeenCalledWith(finalPath);
      expect(mockParserService.parse).toHaveBeenCalledWith('@text var1="value1"\n@text var2="value2"\n@text var3="value3"');
      expect(mockInterpreterServiceClient.interpret).toHaveBeenCalled();

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

      expect(mockCircularityService.beginImport).toHaveBeenCalledWith(finalPath.replace(/\\/g, '/'));
      expect(mockCircularityService.endImport).toHaveBeenCalledWith(finalPath.replace(/\\/g, '/'));
    });
  });

  describe('error handling', () => {
    it('should handle validation errors from ValidationService', async () => {
      const node = createDirectiveNode('import', {
        kind: 'import',
        subtype: 'importAll',
        values: {
          imports: [{ type: 'VariableReference', identifier: '*', valueType: 'import' }],
          path: [
            { type: 'Text', content: 'valid.meld' }
          ]
        },
        raw: {
          imports: '*',
          path: 'valid.meld'
        }
      }) as ImportDirectiveNode;
      mockProcessingContext = createMockProcessingContext(node);
      const validationError = new DirectiveError('Mock validation error', 'import', DirectiveErrorCode.VALIDATION_FAILED);
      mockValidationService.validate.mockImplementationOnce(async () => { throw validationError; }); 
      await expectToThrowWithConfig(
        () => handler.handle(mockProcessingContext),
        {
          type: 'DirectiveError',
          code: DirectiveErrorCode.VALIDATION_FAILED,
          messageContains: 'Mock validation error'
        }
      );
       expect(mockResolutionService.resolveNodes).not.toHaveBeenCalled();
    });

    it('should handle variable not found during path resolution', async () => {
      const node = createDirectiveNode('import', {
        kind: 'import',
        subtype: 'importAll',
        values: {
          imports: [{ type: 'VariableReference', identifier: '*', valueType: 'import' }],
          path: [
            { type: 'VariableReference', identifier: 'invalidVar' },
            { type: 'PathSeparator', separator: '/' },
            { type: 'Text', content: 'path' }
          ]
        },
        raw: {
          imports: '*',
          path: '$invalidVar/path'
        }
      }) as ImportDirectiveNode;
      mockProcessingContext = createMockProcessingContext(node);
      const resolutionError = new MeldResolutionError('Variable not found: invalidVar', { code: 'VAR_NOT_FOUND' });
      
      mockResolutionService.resolveNodes.mockRejectedValueOnce(resolutionError);

      const resolvePathSpy = vi.spyOn(mockResolutionService, 'resolvePath'); 

      await expectToThrowWithConfig(
        () => handler.handle(mockProcessingContext),
        {
          type: 'DirectiveError',
          code: DirectiveErrorCode.RESOLUTION_FAILED, 
          messageContains: 'Variable not found: invalidVar'
        }
      );
      expect(mockResolutionService.resolveNodes).toHaveBeenCalledWith(node.values.path, expect.anything());
      expect(resolvePathSpy).not.toHaveBeenCalled(); 
    });

    it('should handle file not found from FileSystemService', async () => {
      const node = createDirectiveNode('import', {
        kind: 'import',
        subtype: 'importAll',
        values: {
          imports: [{ type: 'VariableReference', identifier: '*', valueType: 'import' }],
          path: [
            { type: 'Text', content: 'missing.meld' }
          ]
        },
        raw: {
          imports: '*',
          path: 'missing.meld'
        }
      }) as ImportDirectiveNode;
      mockProcessingContext = createMockProcessingContext(node);
      const resolvedPathString = '/project/missing.meld';
      mockResolutionService.resolveNodes.mockResolvedValueOnce('missing.meld');
      mockResolutionService.resolvePath.mockResolvedValueOnce(createMeldPath('missing.meld', unsafeCreateValidatedResourcePath(resolvedPathString), true));
      mockFileSystemService.exists.mockReset();
      mockFileSystemService.exists.mockResolvedValue(false);
      await expectToThrowWithConfig(
        () => handler.handle(mockProcessingContext),
        {
          type: 'DirectiveError',
          code: DirectiveErrorCode.FILE_NOT_FOUND,
          messageContains: `Import file not found: ${resolvedPathString}`
        }
      );
       expect(mockResolutionService.resolveNodes).toHaveBeenCalledWith(node.values.path, expect.anything());
       expect(mockResolutionService.resolvePath).toHaveBeenCalledWith('missing.meld', expect.anything()); 
       expect(mockFileSystemService.exists).toHaveBeenCalledWith(resolvedPathString);
       expect(mockCircularityService.endImport).toHaveBeenCalledWith(resolvedPathString.replace(/\\/g, '/'));
    });

    it('should handle circular imports from CircularityService', async () => {
      const node = createDirectiveNode('import', {
        kind: 'import',
        subtype: 'importAll',
        values: {
          imports: [{ type: 'VariableReference', identifier: '*', valueType: 'import' }],
          path: [
            { type: 'Text', content: 'circular.meld' }
          ]
        },
        raw: {
          imports: '*',
          path: 'circular.meld'
        }
      }) as ImportDirectiveNode;
      mockProcessingContext = createMockProcessingContext(node);
      const resolvedPathString = '/project/circular.meld';
      const circularError = new MeldError('Circular import detected', { code: 'CIRCULAR_IMPORT', severity: ErrorSeverity.Fatal });
      
      mockResolutionService.resolveNodes.mockResolvedValueOnce('circular.meld');
      mockResolutionService.resolvePath.mockResolvedValueOnce(
          createMeldPath('circular.meld', unsafeCreateValidatedResourcePath(resolvedPathString), true)
      );
      mockFileSystemService.exists.mockResolvedValue(true);
      
      // Configure the mock directly to throw the error
      mockCircularityService.beginImport.mockImplementationOnce(() => { throw circularError; });
      // Ensure endImport is still mockable for the cleanup check
      mockCircularityService.endImport.mockClear(); 

      await expectToThrowWithConfig(
        () => handler.handle(mockProcessingContext),
        {
          type: 'DirectiveError',
          code: DirectiveErrorCode.CIRCULAR_REFERENCE,
          messageContains: 'Circular import detected'
        }
      );
      expect(mockCircularityService.beginImport).toHaveBeenCalledWith(resolvedPathString.replace(/\\/g, '/'));
      expect(mockCircularityService.endImport).toHaveBeenCalledWith(resolvedPathString.replace(/\\/g, '/'));
    });

    it('should handle parse errors from ParserService', async () => {
      const node = createDirectiveNode('import', {
        kind: 'import',
        subtype: 'importAll',
        values: {
          imports: [{ type: 'VariableReference', identifier: '*', valueType: 'import' }],
          path: [
            { type: 'Text', content: 'parse_error.meld' }
          ]
        },
        raw: {
          imports: '*',
          path: 'parse_error.meld'
        }
      }) as ImportDirectiveNode;
      mockProcessingContext = createMockProcessingContext(node);
      const resolvedPathString = '/project/parse_error.meld';
      const parseError = new MeldError('Bad syntax in imported file', { code: 'PARSE_ERROR', severity: ErrorSeverity.Recoverable });
      
      mockResolutionService.resolveNodes.mockResolvedValueOnce('parse_error.meld');
      mockResolutionService.resolvePath.mockResolvedValueOnce(createMeldPath('parse_error.meld', unsafeCreateValidatedResourcePath(resolvedPathString), true));
      vi.spyOn(mockFileSystemService, 'exists').mockResolvedValue(true);
      vi.spyOn(mockFileSystemService, 'readFile').mockResolvedValue('invalid meld content');
      
      vi.spyOn(mockParserService, 'parse').mockReset().mockRejectedValueOnce(parseError);

      await expectToThrowWithConfig(
        () => handler.handle(mockProcessingContext),
        {
          type: 'DirectiveError',
          code: DirectiveErrorCode.EXECUTION_FAILED, 
          messageContains: 'Bad syntax in imported file'
        }
      );
      expect(mockParserService.parse).toHaveBeenCalledWith('invalid meld content');
      expect(mockCircularityService.endImport).toHaveBeenCalledWith(resolvedPathString.replace(/\\/g, '/'));
    });

    it('should handle interpretation errors from InterpreterService Client', async () => {
      const node = createDirectiveNode('import', {
        kind: 'import',
        subtype: 'importAll',
        values: {
          imports: [{ type: 'VariableReference', identifier: '*', valueType: 'import' }],
          path: [
            { type: 'Text', content: 'interpret_error.meld' }
          ]
        },
        raw: {
          imports: '*',
          path: 'interpret_error.meld'
        }
      }) as ImportDirectiveNode;
      mockProcessingContext = createMockProcessingContext(node);
      const resolvedPathString = '/project/interpret_error.meld';
      const interpretError = new Error('Simulated Client Interpretation failed');
      
      mockResolutionService.resolveNodes.mockResolvedValueOnce('interpret_error.meld');
      mockResolutionService.resolvePath.mockResolvedValueOnce(createMeldPath('interpret_error.meld', unsafeCreateValidatedResourcePath(resolvedPathString), true));
      vi.spyOn(mockFileSystemService, 'exists').mockResolvedValue(true);
      vi.spyOn(mockFileSystemService, 'readFile').mockResolvedValue('content');
      vi.spyOn(mockParserService, 'parse').mockResolvedValue([]);
      
      mockInterpreterServiceClient.interpret.mockRejectedValue(interpretError);
      
      await expect(handler.handle(mockProcessingContext)).rejects.toThrowError(
          expect.objectContaining({ 
              name: 'DirectiveError',
              code: DirectiveErrorCode.EXECUTION_FAILED, 
              message: expect.stringContaining('Failed to interpret imported content from /project/interpret_error.meld. Simulated Client Interpretation failed'), 
              cause: interpretError
          })
      );
      
      expect(mockCircularityService.endImport).toHaveBeenCalledWith(resolvedPathString.replace(/\\/g, '/'));
    });
  });

  describe('cleanup', () => {
      it('should always call endImport on CircularityService even if read fails', async () => {
          const node = createDirectiveNode('import', {
            kind: 'import',
            subtype: 'importAll',
            values: {
              imports: [{ type: 'VariableReference', identifier: '*', valueType: 'import' }],
              path: [
                { type: 'Text', content: 'read_fail.meld' }
              ]
            },
            raw: {
              imports: '*',
              path: 'read_fail.meld'
            }
          }) as ImportDirectiveNode;
          mockProcessingContext = createMockProcessingContext(node);
          const resolvedPathString = '/project/read_fail.meld';
          const readError = new MeldError('Disk read failed', { code: 'FS_READ_ERROR', severity: ErrorSeverity.Recoverable });
          
          mockResolutionService.resolveNodes.mockResolvedValueOnce('read_fail.meld');
          mockResolutionService.resolvePath.mockResolvedValueOnce(createMeldPath('read_fail.meld', unsafeCreateValidatedResourcePath(resolvedPathString), true));
          vi.spyOn(mockFileSystemService, 'exists').mockResolvedValue(true);
          
          vi.spyOn(mockFileSystemService, 'readFile').mockReset().mockRejectedValueOnce(readError);

          await expectToThrowWithConfig(
              () => handler.handle(mockProcessingContext),
              {
                  type: 'DirectiveError',
                  code: DirectiveErrorCode.EXECUTION_FAILED,
                  messageContains: 'Disk read failed'
              }
          );
          expect(mockCircularityService.endImport).toHaveBeenCalledWith(resolvedPathString.replace(/\\/g, '/'));
          expect(mockParserService.parse).not.toHaveBeenCalled();
      });
  });
}); 