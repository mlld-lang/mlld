import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ImportDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import type { ImportDirectiveData } from '@core/syntax/types/directives.js';
import type { MeldNode, DirectiveNode, StructuredPath, SourceLocation, VariableReferenceNode } from '@core/syntax/types/nodes.js';
import { VariableOrigin, type TextVariable, type MeldVariable, type VariableMetadata, type IPathVariable, VariableType } from '@core/types/variables.js';
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
import type { DirectiveProcessingContext, FormattingContext } from '@core/types/index.js';
import type { ResolutionContext } from '@core/types/resolution.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import { MockFactory } from '@tests/utils/mocks/MockFactory.js';
import type { DirectiveResult } from '@services/pipeline/DirectiveService/types.js';
import { mock, mockDeep, DeepMockProxy } from 'vitest-mock-extended';

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
  const helpers = TestContextDI.createTestHelpers();
  let handler: ImportDirectiveHandler;
  let stateService: IStateService;
  let resolutionService: IResolutionService;
  let fileSystemService: IFileSystemService;
  let pathService: IPathService;
  let parserService: IParserService;
  let interpreterServiceClientFactory: InterpreterServiceClientFactory;
  let interpreterServiceClient: IInterpreterServiceClient;
  let circularityService: DeepMockProxy<ICircularityService>;
  let urlContentResolver: IURLContentResolver;
  let context: TestContextDI;
  let mockProcessingContext: DirectiveProcessingContext;
  let childState: IStateService;
  let validationService: any; // Assuming IValidationService is imported but not used in the test

  beforeEach(async () => {
    // Create the deep mock first
    circularityService = mockDeep<ICircularityService>();

    context = helpers.setupWithStandardMocks({
        'ILogger': mockLoggerObject,
        // Register the mock for ICircularityService
        'ICircularityService': circularityService 
    });
    await context.resolve('IFileSystemService');

    stateService = await context.resolve('IStateService');
    resolutionService = await context.resolve('IResolutionService');
    fileSystemService = await context.resolve('IFileSystemService');
    pathService = await context.resolve('IPathService');
    parserService = await context.resolve('IParserService');
    interpreterServiceClientFactory = await context.resolve('InterpreterServiceClientFactory');
    urlContentResolver = await context.resolve('IURLContentResolver');
    validationService = await context.resolve('IValidationService');
    
    // Create the childState mock using the factory - this has default mocks
    childState = MockFactory.createStateService({ 
        getCurrentFilePath: vi.fn().mockReturnValue('/project/imported.meld'),
        isTransformationEnabled: vi.fn().mockReturnValue(false),
        // No need to override getAll...Vars here, factory provides defaults
    });
    
    // Add the check/spy for setCurrentFilePath (workaround)
    if (childState.setCurrentFilePath) { 
        vi.spyOn(childState, 'setCurrentFilePath'); 
    } else {
        (childState as any).setCurrentFilePath = vi.fn();
    }

    // Resolve the handler AFTER setting up mocks it might depend on
    handler = await context.resolve(ImportDirectiveHandler);

    // Create a deep mock for the client
    interpreterServiceClient = mockDeep<IInterpreterServiceClient>();
    // Configure its methods to return the shared childState
    interpreterServiceClient.interpret.mockResolvedValue(childState);
    interpreterServiceClient.createChildContext.mockResolvedValue(childState);
    
    // Ensure the factory returns this specific deep mock client
    vi.spyOn(interpreterServiceClientFactory, 'createClient').mockReturnValue(interpreterServiceClient);
    
    // Mock parent state's createChildState to also return the same childState instance
    vi.spyOn(stateService, 'createChildState').mockResolvedValue(childState); 
    
    vi.spyOn(stateService, 'getCurrentFilePath').mockReturnValue('/project/current.meld');
    vi.spyOn(stateService, 'isTransformationEnabled').mockReturnValue(false);
    vi.spyOn(stateService, 'setTextVar');
    vi.spyOn(stateService, 'setDataVar');
    vi.spyOn(stateService, 'mergeChildState');

    // Configure other mocks
    vi.spyOn(resolutionService, 'resolvePath').mockImplementation(async (p: string | StructuredPath, ctx?: ResolutionContext): Promise<MeldPath> => {
      const raw = typeof p === 'string' ? p : p?.raw ?? '';
      const currentPath = ctx?.currentFilePath ?? '/project/current.meld';
      const baseDir = path.dirname(currentPath);
      const isUrl = raw.startsWith('http');
      const resolved = isUrl ? raw : path.join(baseDir, raw).replace(/\\/g, '/');
      return createMeldPath(raw, unsafeCreateValidatedResourcePath(resolved), resolved.startsWith('/') || isUrl);
    });
     vi.spyOn(resolutionService, 'resolveInContext').mockImplementation(async (value: any) => typeof value === 'string' ? value : value?.raw ?? '');

    vi.spyOn(fileSystemService, 'exists').mockResolvedValue(true);
    vi.spyOn(fileSystemService, 'readFile').mockResolvedValue('');
    vi.spyOn(parserService, 'parse').mockResolvedValue([]);
    
    vi.spyOn(urlContentResolver, 'validateURL').mockResolvedValue(undefined as any);
    vi.spyOn(urlContentResolver, 'fetchURL').mockResolvedValue({ content: '', url: '', fromCache: false, metadata: {} } as URLResponse);
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  const createMockProcessingContext = (node: DirectiveNode<ImportDirectiveData>): DirectiveProcessingContext => {
    const mockResolutionContext = { strict: true, state: stateService } as ResolutionContext;
    const mockFormattingContext: FormattingContext = { isBlock: false, preserveLiteralFormatting: false, preserveWhitespace: false };
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
      resolutionService.resolveInContext.mockImplementation(async (value: any, context: ResolutionContext): Promise<string> => {
        const raw = typeof value === 'string' ? value : value?.raw;
        if (!raw) return '';
        if (raw.includes('nonexistent')) return resolvedNonExistentPath;
        if (raw.includes('$.') || raw.includes('$PROJECTPATH')) return resolvedProjectPath;
        if (raw.includes('$~') || raw.includes('$HOMEPATH')) return resolvedHomePath;
        return raw;
      });
      resolutionService.resolvePath.mockImplementation(async (resolvedPathString: string, context: ResolutionContext): Promise<MeldPath> => {
        return createMeldPath(resolvedPathString, unsafeCreateValidatedResourcePath(resolvedPathString), true);
      });
      fileSystemService.readFile.mockResolvedValue('mock content');
      fileSystemService.exists.mockResolvedValue(true);
    });

    it('should handle $. alias for project path', async () => {
      const node = createDirectiveNode('import', { path: { raw: '$./samples/nested.meld', structured: { base: '.', segments: ['samples', 'nested'], url: false }, isPathVariable: true }, imports: [{ name: '*' }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      await handler.execute(mockProcessingContext);
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(node.directive.path.raw, mockProcessingContext.resolutionContext);
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(resolvedProjectPath, mockProcessingContext.resolutionContext);
      expect(fileSystemService.exists).toHaveBeenCalledWith(resolvedProjectPath);
      expect(circularityService.beginImport).toHaveBeenCalledWith(resolvedProjectPath);
      expect(circularityService.endImport).toHaveBeenCalledWith(resolvedProjectPath);
    });

    it('should handle $PROJECTPATH for project path', async () => {
      const node = createDirectiveNode('import', { path: { raw: '$PROJECTPATH/samples/nested.meld', structured: { base: '.', segments: ['samples', 'nested'], url: false }, isPathVariable: true }, imports: [{ name: '*' }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      await handler.execute(mockProcessingContext);
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(node.directive.path.raw, mockProcessingContext.resolutionContext);
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(resolvedProjectPath, mockProcessingContext.resolutionContext);
      expect(fileSystemService.exists).toHaveBeenCalledWith(resolvedProjectPath);
      expect(circularityService.beginImport).toHaveBeenCalledWith(resolvedProjectPath);
    });

    it('should handle $~ alias for home path', async () => {
      const node = createDirectiveNode('import', { path: { raw: '$~/examples/basic.meld', structured: { base: '.', segments: ['examples', 'basic'], url: false }, isPathVariable: true }, imports: [{ name: '*' }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      await handler.execute(mockProcessingContext);
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(node.directive.path.raw, mockProcessingContext.resolutionContext);
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(resolvedHomePath, mockProcessingContext.resolutionContext);
      expect(fileSystemService.exists).toHaveBeenCalledWith(resolvedHomePath);
      expect(circularityService.beginImport).toHaveBeenCalledWith(resolvedHomePath);
    });

    it('should handle $HOMEPATH for home path', async () => {
      const node = createDirectiveNode('import', { path: { raw: '$HOMEPATH/examples/basic.meld', structured: { base: '.', segments: ['examples', 'basic'], url: false }, isPathVariable: true }, imports: [{ name: '*' }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      await handler.execute(mockProcessingContext);
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(node.directive.path.raw, mockProcessingContext.resolutionContext);
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(resolvedHomePath, mockProcessingContext.resolutionContext);
      expect(fileSystemService.exists).toHaveBeenCalledWith(resolvedHomePath);
      expect(circularityService.beginImport).toHaveBeenCalledWith(resolvedHomePath);
    });

    it('should throw error if resolved path does not exist', async () => {
      fileSystemService.exists.mockResolvedValue(false);
      const node = createDirectiveNode('import', { path: { raw: '$PROJECTPATH/nonexistent.meld', structured: { base: '.', segments: ['nonexistent'], url: false }, isPathVariable: true }, imports: [{ name: '*' }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      await expectToThrowWithConfig(
        () => handler.execute(mockProcessingContext),
        {
          type: 'DirectiveError',
          code: DirectiveErrorCode.FILE_NOT_FOUND,
          messageContains: resolvedNonExistentPath
        }
      );
      expect(circularityService.endImport).toHaveBeenCalledWith(resolvedNonExistentPath);
    });

    it.skip('should handle user-defined path variables in import path', async () => {
      const importLocation = createLocation(5, 1, undefined, undefined, '/project/main.meld');
      const node = createDirectiveNode('import', { path: { raw: '$docs/file.meld', structured: { base: '.', segments: ['file.meld'], variables: { path: ['docs'] } }, isPathVariable: true }, imports: [{ name: '*' }], subtype: 'importAll' }, importLocation) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      await handler.execute(mockProcessingContext);
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(node.directive.path, expect.objectContaining({ purpose: 'import', currentFilePath: '/project/main.meld' }));
      expect(fileSystemService.exists).toHaveBeenCalledWith(node.directive.path.raw);
      expect(fileSystemService.readFile).toHaveBeenCalledWith(node.directive.path.raw);
      expect(parserService.parse).toHaveBeenCalledWith(node.directive.path.raw, { filePath: node.directive.path.raw });
      expect(interpreterServiceClient.interpret).toHaveBeenCalledWith(expect.any(Array));
      expect(stateService.setTextVar).toHaveBeenCalledWith('imported', expect.objectContaining({
        type: VariableType.TEXT,
        value: expect.any(String),
        metadata: expect.objectContaining({
          origin: VariableOrigin.IMPORT,
          definedAt: importLocation,
          context: { importedFrom: expect.any(Object) }
        })
      }));
      expect(circularityService.beginImport).toHaveBeenCalledWith(node.directive.path.raw.replace(/\\/g, '/'));
      expect(circularityService.endImport).toHaveBeenCalledWith(node.directive.path.raw.replace(/\\/g, '/'));
    });
  });

  describe('basic importing', () => {
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
      // Configure the mocks on the childState instance created in beforeEach
      childState.getAllTextVars.mockReturnValue(new Map([['greeting', importedTextVar]]));
      childState.getAllDataVars.mockReturnValue(new Map([['info', importedDataVar]]));

      await handler.execute(mockProcessingContext);
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(importPathRaw, mockProcessingContext.resolutionContext);
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(finalPath, mockProcessingContext.resolutionContext);
      expect(fileSystemService.exists).toHaveBeenCalledWith(finalPath);
      expect(fileSystemService.readFile).toHaveBeenCalledWith(finalPath);
      expect(parserService.parse).toHaveBeenCalledWith('@text greeting="Hello"\n@data info={ "val": 1 }');
      expect(stateService.setTextVar).toHaveBeenCalledWith('greeting', 'Hello');
      expect(stateService.setDataVar).toHaveBeenCalledWith('info', { val: 1 });
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
        { type: 'Directive', directive: { kind: 'text', identifier: 'var1', source:'literal', value: [{ type: 'Text', content:'value1'}] }, location: createLocation(1,1) } as any,
        { type: 'Directive', directive: { kind: 'text', identifier: 'var2', source:'literal', value: [{ type: 'Text', content:'value2'}] }, location: createLocation(2,1) } as any,
        { type: 'Directive', directive: { kind: 'text', identifier: 'var3', source:'literal', value: [{ type: 'Text', content:'value3'}] }, location: createLocation(3,1) } as any
      ];
      parserService.parse.mockResolvedValue(parsedNodes as any);
      const nodeContentLocation1 = createLocation(1, 1, undefined, undefined, finalPath);
      const nodeContentLocation2 = createLocation(2, 1, undefined, undefined, finalPath);
      const nodeContentLocation3 = createLocation(3, 1, undefined, undefined, finalPath);
      const importedVar1: TextVariable = { name: 'var1', type: VariableType.TEXT, value: 'value1', metadata: { definedAt: createTestLocation(1, 1), origin: VariableOrigin.DIRECT_DEFINITION, createdAt: Date.now(), modifiedAt: Date.now() } };
      const importedVar2: TextVariable = { name: 'var2', type: VariableType.TEXT, value: 'value2', metadata: { definedAt: createTestLocation(2, 1), origin: VariableOrigin.DIRECT_DEFINITION, createdAt: Date.now(), modifiedAt: Date.now() } };
      const importedVar3: TextVariable = { name: 'var3', type: VariableType.TEXT, value: 'value3', metadata: { definedAt: createTestLocation(3, 1), origin: VariableOrigin.DIRECT_DEFINITION, createdAt: Date.now(), modifiedAt: Date.now() } };
      // Configure the mock on the childState instance created in beforeEach
      childState.getTextVar.mockImplementation((name) => {
        if (name === 'var1') return importedVar1;
        if (name === 'var2') return importedVar2;
        if (name === 'var3') return importedVar3;
        return undefined;
      });

      const result = await handler.execute(mockProcessingContext);
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(importPathRaw, mockProcessingContext.resolutionContext);
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(finalPath, mockProcessingContext.resolutionContext);
      expect(fileSystemService.exists).toHaveBeenCalledWith(finalPath);
      expect(fileSystemService.readFile).toHaveBeenCalledWith(finalPath);
      expect(parserService.parse).toHaveBeenCalledWith('@text var1="value1"\n@text var2="value2"\n@text var3="value3"');
      expect(stateService.setTextVar).toHaveBeenCalledTimes(2);
      expect(stateService.setTextVar).toHaveBeenCalledWith('var1', 'value1');
      expect(stateService.setTextVar).toHaveBeenCalledWith('aliasedVar2', 'value2');
      expect(stateService.setTextVar).not.toHaveBeenCalledWith('var3', expect.any(String));
      expect(circularityService.beginImport).toHaveBeenCalledWith(finalPath.replace(/\\/g, '/'));
      expect(circularityService.endImport).toHaveBeenCalledWith(finalPath.replace(/\\/g, '/'));
      expect(result.replacement).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle validation errors from ValidationService', async () => {
      const node = createDirectiveNode('import', { path: { raw: 'valid.meld', structured: { base: '.', segments: ['valid'], url: false }, isPathVariable: true }, imports: [{ name: '*', alias: null }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      const validationError = new DirectiveError('Mock validation error', 'import', DirectiveErrorCode.VALIDATION_FAILED);
      vi.spyOn(validationService, 'validate').mockImplementationOnce(async () => { throw validationError; }); 
      await expectToThrowWithConfig(
        () => handler.execute(mockProcessingContext),
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
      vi.spyOn(resolutionService, 'resolveInContext').mockRejectedValueOnce(resolutionError);
      await expectToThrowWithConfig(
        () => handler.execute(mockProcessingContext),
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
      vi.spyOn(resolutionService, 'resolveInContext').mockResolvedValue(resolvedPathString);
      vi.spyOn(resolutionService, 'resolvePath').mockResolvedValue(createMeldPath(resolvedPathString, unsafeCreateValidatedResourcePath(resolvedPathString), true));
      fileSystemService.exists.mockResolvedValue(false);
      await expectToThrowWithConfig(
        () => handler.execute(mockProcessingContext),
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
      const circularError = new DirectiveError('Circular import detected: /project/circular.meld', 'import', DirectiveErrorCode.CIRCULAR_REFERENCE);
      vi.spyOn(resolutionService, 'resolveInContext').mockResolvedValue(resolvedPathString);
      vi.spyOn(resolutionService, 'resolvePath').mockResolvedValue(createMeldPath(resolvedPathString, unsafeCreateValidatedResourcePath(resolvedPathString), true));
      fileSystemService.exists.mockResolvedValue(true);
      // Configure mockDeep object directly
      circularityService.beginImport.mockImplementationOnce(() => { throw circularError; }); 
      await expectToThrowWithConfig(
        () => handler.execute(mockProcessingContext),
        {
          type: 'DirectiveError',
          code: DirectiveErrorCode.CIRCULAR_REFERENCE, 
          messageContains: 'Circular import detected'
        }
      );
       expect(resolutionService.resolveInContext).toHaveBeenCalledWith(node.directive.path.raw, expect.any(Object));
       expect(resolutionService.resolvePath).toHaveBeenCalledWith(resolvedPathString, expect.any(Object));
       expect(circularityService.beginImport).toHaveBeenCalledWith(resolvedPathString.replace(/\\/g, '/'));
      expect(circularityService.endImport).toHaveBeenCalledWith(resolvedPathString.replace(/\\/g, '/'));
    });

    it('should handle parse errors from ParserService', async () => {
      const node = createDirectiveNode('import', { path: { raw: 'parse_error.meld', structured: { base: '.', segments: ['parse_error'], url: false }, isPathVariable: true }, imports: [{ name: '*', alias: null }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
      mockProcessingContext = createMockProcessingContext(node);
      const resolvedPathString = '/project/parse_error.meld';
      const parseError = new MeldError('Bad syntax in imported file', { code: 'PARSE_ERROR', severity: ErrorSeverity.Recoverable });
      vi.spyOn(resolutionService, 'resolveInContext').mockResolvedValue(resolvedPathString);
      vi.spyOn(resolutionService, 'resolvePath').mockResolvedValue(createMeldPath(resolvedPathString, unsafeCreateValidatedResourcePath(resolvedPathString), true));
      fileSystemService.exists.mockResolvedValue(true);
      fileSystemService.readFile.mockResolvedValue('invalid meld content');
      vi.spyOn(parserService, 'parse').mockRejectedValueOnce(parseError);
      await expectToThrowWithConfig(
        () => handler.execute(mockProcessingContext),
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
      const interpretError = new MeldError('Interpretation failed', { code: 'INTERPRET_FAIL', severity: ErrorSeverity.Recoverable });
      const parsedNodes: MeldNode[] = [{ type: 'Text', content: 'content' } as any];
      vi.spyOn(resolutionService, 'resolveInContext').mockResolvedValue(resolvedPathString);
      vi.spyOn(resolutionService, 'resolvePath').mockResolvedValue(createMeldPath(resolvedPathString, unsafeCreateValidatedResourcePath(resolvedPathString), true));
      fileSystemService.exists.mockResolvedValue(true);
      fileSystemService.readFile.mockResolvedValue('content');
      vi.spyOn(parserService, 'parse').mockResolvedValue(parsedNodes as any);
      vi.spyOn(interpreterServiceClient, 'interpret').mockRejectedValueOnce(interpretError);
      await expectToThrowWithConfig(
        () => handler.execute(mockProcessingContext),
        {
          type: 'DirectiveError',
          code: DirectiveErrorCode.EXECUTION_FAILED,
          messageContains: 'Interpretation failed'
        }
      );
       expect(parserService.parse).toHaveBeenCalledWith('content');
       expect(interpreterServiceClient.interpret).toHaveBeenCalledWith(parsedNodes as any[]);
      expect(circularityService.endImport).toHaveBeenCalledWith(resolvedPathString.replace(/\\/g, '/'));
    });
  });

  describe('cleanup', () => {
      it('should always call endImport on CircularityService even if read fails', async () => {
          const node = createDirectiveNode('import', { path: { raw: 'read_fail.meld', structured: { base: '.', segments: ['read_fail'], url: false }, isPathVariable: true }, imports: [{ name: '*', alias: null }], subtype: 'importAll' }) as DirectiveNode<ImportDirectiveData>;
          mockProcessingContext = createMockProcessingContext(node);
          const resolvedPathString = '/project/read_fail.meld';
          const readError = new MeldError('Disk read failed', { code: 'FS_READ_ERROR', severity: ErrorSeverity.Recoverable });
          vi.spyOn(resolutionService, 'resolveInContext').mockResolvedValue(resolvedPathString);
          vi.spyOn(resolutionService, 'resolvePath').mockResolvedValue(createMeldPath(resolvedPathString, unsafeCreateValidatedResourcePath(resolvedPathString), true));
          fileSystemService.exists.mockResolvedValue(true);
          fileSystemService.readFile.mockRejectedValueOnce(readError);
          await expectToThrowWithConfig(
              () => handler.execute(mockProcessingContext),
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