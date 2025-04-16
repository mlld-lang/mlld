import { vi } from 'vitest';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { StateNode } from '@services/state/StateService/types.js';
import type { IResolutionService, ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import type { IDirectiveService } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { TransformationOptions } from '@core/types/state.js';
import type { MeldPath, RawPath, AbsolutePath, RelativePath, ValidatedResourcePath, UrlPath } from '@core/types/paths.js';
import { StructuredPath as AstStructuredPath } from '@core/syntax/types/nodes.js';
import { unsafeCreateValidatedResourcePath, PathContentType } from '@core/types/paths.js';
import type { TextVariable, DataVariable, IPathVariable } from '@core/types/variables.js';

export class MockFactory {
  /**
   * Map of standard mock factories for core services
   */
  static standardFactories: Record<string, () => any> = {
    'IStateService': () => MockFactory.createStateService(),
    'IResolutionService': () => MockFactory.createResolutionService(),
    'IFileSystemService': () => MockFactory.createFileSystemService(),
    'IPathService': () => MockFactory.createPathService(),
    'IDirectiveService': () => MockFactory.createDirectiveService(),
    'IInterpreterService': () => MockFactory.createInterpreterService(),
    'IParserService': () => MockFactory.createParserService(),
    'IValidationService': () => MockFactory.createValidationService(),
    // Add other core services as needed
  };

  /**
   * Create a typed mock state service using mockDeep for better compatibility
   */
  static createStateService(overrides: Partial<IStateService> = {}): IStateService {
    const selfRefMock: { current?: IStateService } = {};
    const baseMock: IStateService = {
      getTextVar: vi.fn().mockReturnValue(undefined),
      setTextVar: vi.fn().mockResolvedValue({ name: 'mockText', value: 'value' } as any),
      getAllTextVars: vi.fn().mockReturnValue(new Map()),
      getLocalTextVars: vi.fn().mockReturnValue(new Map()),
      getDataVar: vi.fn().mockReturnValue(undefined),
      setDataVar: vi.fn().mockResolvedValue({ name: 'mockData', value: {} } as any),
      getAllDataVars: vi.fn().mockReturnValue(new Map()),
      getLocalDataVars: vi.fn().mockReturnValue(new Map()),
      getPathVar: vi.fn().mockReturnValue(undefined),
      setPathVar: vi.fn().mockResolvedValue({ name: 'mockPath', value: { path: '/test' } } as any),
      getAllPathVars: vi.fn().mockReturnValue(new Map()),
      getCommandVar: vi.fn().mockReturnValue(undefined),
      setCommandVar: vi.fn().mockResolvedValue({ name: 'mockCmd', value: { command: 'test' } } as any),
      getAllCommands: vi.fn().mockReturnValue(new Map()),
      getVariable: vi.fn().mockReturnValue(undefined),
      setVariable: vi.fn().mockImplementation(async (v) => v),
      hasVariable: vi.fn().mockReturnValue(false),
      removeVariable: vi.fn().mockResolvedValue(false),
      getNodes: vi.fn().mockReturnValue([]),
      addNode: vi.fn(),
      appendContent: vi.fn(),
      getTransformedNodes: vi.fn().mockReturnValue([]),
      setTransformedNodes: vi.fn(),
      transformNode: vi.fn(),
      createChildState: vi.fn().mockImplementation(async () => selfRefMock.current!),
      mergeChildState: vi.fn(),
      clone: vi.fn().mockImplementation(() => selfRefMock.current!),
      getParentState: vi.fn(),
      isTransformationEnabled: vi.fn().mockReturnValue(false),
      setTransformationEnabled: vi.fn(),
      getTransformationOptions: vi.fn().mockReturnValue({
        enabled: false, preserveOriginal: true, transformNested: true,
        selective: false, directiveKinds: new Set()
      } as TransformationOptions),
      setTransformationOptions: vi.fn(),
      hasTransformationSupport: vi.fn().mockReturnValue(true),
      shouldTransform: vi.fn().mockReturnValue(false),
      addImport: vi.fn(),
      removeImport: vi.fn(),
      hasImport: vi.fn().mockReturnValue(false),
      getImports: vi.fn().mockReturnValue(new Set()),
      getCurrentFilePath: vi.fn().mockReturnValue('/mock/path.meld'),
      setCurrentFilePath: vi.fn(),
      setEventService: vi.fn(),
      setTrackingService: vi.fn(),
      getStateId: vi.fn().mockReturnValue('mock-state-id'),
      hasLocalChanges: vi.fn().mockReturnValue(false),
      getLocalChanges: vi.fn().mockReturnValue([]),
      setImmutable: vi.fn(),
      get isImmutable() { return false; },
      getCommand: vi.fn(),
      getCommandOutput: vi.fn(),
      getInternalStateNode: vi.fn().mockReturnValue({
        stateId: 'mock-state-id',
        variables: { text: new Map<string, TextVariable>(), data: new Map<string, DataVariable>(), path: new Map<string, IPathVariable>() },
        commands: new Map(),
        nodes: [],
        imports: new Set(),
        parentStateId: undefined,
        filePath: '/mock/path.meld'
      } as StateNode),
    };
    selfRefMock.current = { ...baseMock, ...overrides }; 
    return selfRefMock.current;
  }
  
  /**
   * Create a typed mock resolution service
   */
  static createResolutionService(overrides: Partial<IResolutionService> = {}): IResolutionService {
    const baseMock: IResolutionService = {
      resolveText: vi.fn().mockImplementation(async (text) => text),
      resolveData: vi.fn().mockResolvedValue({}),
      resolvePath: vi.fn().mockResolvedValue({} as MeldPath), // Simplified return for validation
      resolveCommand: vi.fn().mockResolvedValue('command output'),
      resolveFile: vi.fn().mockResolvedValue('file content'),
      resolveContent: vi.fn().mockResolvedValue(''),
      resolveNodes: vi.fn().mockResolvedValue('resolved nodes'),
      resolveInContext: vi.fn().mockImplementation(async (value) => typeof value === 'string' ? value : 'resolved value'),
      resolveFieldAccess: vi.fn().mockResolvedValue({ success: true, value: {} }),
      validateResolution: vi.fn().mockResolvedValue({ 
          originalValue: '', 
          validatedPath: unsafeCreateValidatedResourcePath('/validated/path'), 
          isAbsolute: true, 
          isValidated: true,
          isValidSyntax: true, 
          contentType: PathContentType.FILESYSTEM, 
          exists: true, 
          isSecure: true,
       } as MeldPath),
      extractSection: vi.fn().mockResolvedValue('section content'),
      detectCircularReferences: vi.fn(),
      convertToFormattedString: vi.fn().mockImplementation(async (value) => typeof value === 'string' ? value : JSON.stringify(value)),
      enableResolutionTracking: vi.fn(),
      getResolutionTracker: vi.fn()
    };
    return { ...baseMock, ...overrides };
  }
  
  /**
   * Create a typed mock file system service
   */
  static createFileSystemService(overrides: Partial<IFileSystemService> = {}): IFileSystemService {
    const baseMock: Partial<IFileSystemService> = {
      readFile: vi.fn().mockResolvedValue(''),
      writeFile: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn().mockResolvedValue(false),
      stat: vi.fn().mockResolvedValue({ isFile: () => true, isDirectory: () => false, size: 0, mtime: new Date() } as any),
      isFile: vi.fn().mockResolvedValue(true),
      readDir: vi.fn().mockResolvedValue([]),
      ensureDir: vi.fn().mockResolvedValue(undefined),
      isDirectory: vi.fn().mockResolvedValue(false),
      watch: vi.fn().mockImplementation(function*() {}),
      getCwd: vi.fn().mockReturnValue('/mock/cwd'),
      dirname: vi.fn().mockImplementation(path => path.split('/').slice(0, -1).join('/')),
      executeCommand: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
      setFileSystem: vi.fn(),
      getFileSystem: vi.fn(),
      mkdir: vi.fn().mockResolvedValue(undefined),
      deleteFile: vi.fn().mockResolvedValue(undefined),
      fileExists: vi.fn().mockResolvedValue(false),
      resolvePath: vi.fn().mockImplementation((filePath: RawPath | AstStructuredPath, baseDir?: RawPath): AbsolutePath | RelativePath => { 
          const rawPath = typeof filePath === 'string' ? filePath : filePath?.raw ?? 'mock/path';
          return `/abs/${rawPath}`.replace('//', '/') as AbsolutePath;
      })
    };
    return { ...baseMock, ...overrides } as IFileSystemService;
  }
  
  /**
   * Create a typed mock path service
   */
  static createPathService(overrides: Partial<IPathService> = {}): IPathService {
    const baseMock: Partial<IPathService> = { 
      initialize: vi.fn(),
      enableTestMode: vi.fn(),
      disableTestMode: vi.fn(),
      isTestMode: vi.fn().mockReturnValue(true),
      setHomePath: vi.fn(),
      setProjectPath: vi.fn(),
      getHomePath: vi.fn().mockReturnValue('/mock/home'),
      getProjectPath: vi.fn().mockReturnValue('/mock/project'),
      resolveProjectPath: vi.fn().mockResolvedValue('/mock/project'),
      resolvePath: vi.fn().mockImplementation(
        (filePath: RawPath | AstStructuredPath, baseDir?: RawPath): AbsolutePath | RelativePath => {
          const rawPath = typeof filePath === 'string' ? filePath : filePath?.raw ?? 'mock/path';
          return `/abs/${rawPath}`.replace('//', '/') as AbsolutePath;
        }
      ) as any,
      validatePath: vi.fn().mockResolvedValue({ 
          originalValue: 'mock/input', 
          validatedPath: unsafeCreateValidatedResourcePath('/mock/validated/path'),
          isAbsolute: true, 
          isValidated: true,
          isValidSyntax: true,
          contentType: PathContentType.FILESYSTEM, 
          exists: true, 
          isSecure: true 
      } as MeldPath),
      joinPaths: vi.fn().mockImplementation((...paths) => paths.join('/')),
      dirname: vi.fn().mockImplementation(path => path.split('/').slice(0, -1).join('/')),
      basename: vi.fn().mockImplementation(path => path.split('/').pop() || ''),
      normalizePath: vi.fn().mockImplementation(path => path),
      isURL: vi.fn().mockImplementation(path => path.startsWith('http')),
      validateURL: vi.fn().mockResolvedValue('https://example.com' as UrlPath),
      fetchURL: vi.fn().mockResolvedValue({
        content: 'mock content',
        metadata: { statusCode: 200, contentType: 'text/plain' },
        fromCache: false,
        url: 'https://example.com'
      })
    };
    return { ...baseMock, ...overrides } as IPathService;
  }
  
  /**
   * Create a typed mock directive service
   */
  static createDirectiveService(overrides: Partial<IDirectiveService> = {}): IDirectiveService {
    const baseMock: IDirectiveService = {
      initialize: vi.fn(),
      updateInterpreterService: vi.fn(),
      handleDirective: vi.fn().mockResolvedValue({}),
      registerHandler: vi.fn(),
      hasHandler: vi.fn().mockReturnValue(true),
      validateDirective: vi.fn(),
      createChildContext: vi.fn(),
      processDirective: vi.fn().mockResolvedValue({}),
      processDirectives: vi.fn().mockResolvedValue({}),
      supportsDirective: vi.fn().mockReturnValue(true),
      getSupportedDirectives: vi.fn().mockReturnValue(['text', 'data', 'path', 'define', 'run', 'embed', 'import'])
    };
    
    return { ...baseMock, ...overrides };
  }
  
  /**
   * Create a typed mock interpreter service
   */
  static createInterpreterService(overrides: Partial<IInterpreterService> = {}): IInterpreterService {
    const baseMock: IInterpreterService = {
      canHandleTransformations: vi.fn().mockReturnValue(true),
      initialize: vi.fn(),
      interpret: vi.fn().mockResolvedValue({}),
      interpretNode: vi.fn().mockResolvedValue({}),
      createChildContext: vi.fn().mockResolvedValue({})
    };
    
    return { ...baseMock, ...overrides };
  }
  
  /**
   * Create a typed mock parser service
   */
  static createParserService(overrides: Partial<IParserService> = {}): IParserService {
    const baseMock: IParserService = {
      parseString: vi.fn().mockResolvedValue([]),
      parseFile: vi.fn().mockResolvedValue([]),
      parse: vi.fn().mockResolvedValue([]),
      parseWithLocations: vi.fn().mockResolvedValue([])
    };
    
    return { ...baseMock, ...overrides };
  }
  
  /**
   * Create a typed mock validation service
   */
  static createValidationService(overrides: Partial<IValidationService> = {}): IValidationService {
    const baseMock: IValidationService = {
      validate: vi.fn().mockResolvedValue(undefined),
      registerValidator: vi.fn(),
      removeValidator: vi.fn(),
      getRegisteredDirectiveKinds: vi.fn().mockReturnValue(['text', 'data', 'path', 'define', 'run', 'embed', 'import'])
    };
    
    return { ...baseMock, ...overrides };
  }
  
  /**
   * Create a mock for a client factory
   */
  static createClientFactory<T>(
    clientImpl: T, 
    _factoryToken: string // Keep token for consistency with proposal, even if unused here
  ): { factory: any, client: T } {
    const client = clientImpl;
    const factory = {
      createClient: vi.fn().mockReturnValue(client)
    };
    
    return { factory, client };
  }
  
  /**
   * Create a chain of mock state services for testing state transitions
   */
  static createStateChain(count: number): IStateService[] {
    const states: IStateService[] = [];
    
    for (let i = 0; i < count; i++) {
      states.push(MockFactory.createStateService({
        getStateId: vi.fn().mockReturnValue(`state-${i}`),
      }));
    }
    
    // Set up parent-child relationships
    for (let i = 0; i < count - 1; i++) {
      const parentState = states[i];
      const childState = states[i + 1];
      
      // Make createChildState return the next state
      vi.spyOn(parentState, 'createChildState').mockReturnValue(childState);
      
      // Make getParentState return the previous state
      vi.spyOn(childState, 'getParentState').mockReturnValue(parentState);
    }
    
    return states;
  }
} 