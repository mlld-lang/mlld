import { vi } from 'vitest';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import type { IDirectiveService } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';

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
    // Add other core services as needed
  };

  /**
   * Create a typed mock state service with standard implementations
   */
  static createStateService(overrides: Partial<IStateService> = {}): IStateService {
    // Create a comprehensive base mock with all methods
    const baseMock: IStateService = {
      // Text variables
      getTextVar: vi.fn(),
      setTextVar: vi.fn().mockResolvedValue({ name: 'mockText', value: 'value' }),
      getAllTextVars: vi.fn().mockReturnValue(new Map()),
      getLocalTextVars: vi.fn().mockReturnValue(new Map()),
      
      // Data variables
      getDataVar: vi.fn(),
      setDataVar: vi.fn().mockResolvedValue({ name: 'mockData', value: {} }),
      getAllDataVars: vi.fn().mockReturnValue(new Map()),
      getLocalDataVars: vi.fn().mockReturnValue(new Map()),
      
      // Path variables
      getPathVar: vi.fn(),
      setPathVar: vi.fn().mockResolvedValue({ name: 'mockPath', value: { path: '/test' } }),
      getAllPathVars: vi.fn().mockReturnValue(new Map()),
      
      // Command variables
      getCommandVar: vi.fn(),
      setCommandVar: vi.fn().mockResolvedValue({ name: 'mockCmd', value: { command: 'test' } }),
      getAllCommands: vi.fn().mockReturnValue(new Map()),
      
      // General variable methods
      getVariable: vi.fn(),
      setVariable: vi.fn().mockImplementation(async (v) => v),
      hasVariable: vi.fn().mockReturnValue(false),
      removeVariable: vi.fn().mockResolvedValue(false),
      
      // Nodes and content
      getNodes: vi.fn().mockReturnValue([]),
      addNode: vi.fn(),
      appendContent: vi.fn(),
      getTransformedNodes: vi.fn().mockReturnValue([]),
      setTransformedNodes: vi.fn(),
      transformNode: vi.fn(),
      
      // State hierarchy
      createChildState: vi.fn().mockImplementation(function() { return this; }),
      mergeChildState: vi.fn(),
      clone: vi.fn().mockImplementation(function() { return this; }),
      getParentState: vi.fn(),
      
      // Transformation
      isTransformationEnabled: vi.fn().mockReturnValue(false),
      setTransformationEnabled: vi.fn(),
      getTransformationOptions: vi.fn().mockReturnValue({}),
      setTransformationOptions: vi.fn(),
      hasTransformationSupport: vi.fn().mockReturnValue(true),
      shouldTransform: vi.fn().mockReturnValue(false),
      
      // Imports
      addImport: vi.fn(),
      removeImport: vi.fn(),
      hasImport: vi.fn().mockReturnValue(false),
      getImports: vi.fn().mockReturnValue(new Set()),
      
      // File path
      getCurrentFilePath: vi.fn().mockReturnValue('/mock/path.meld'),
      setCurrentFilePath: vi.fn(),
      
      // Events and tracking
      setEventService: vi.fn(),
      setTrackingService: vi.fn(),
      
      // State management
      getStateId: vi.fn().mockReturnValue('mock-state-id'),
      hasLocalChanges: vi.fn().mockReturnValue(false),
      getLocalChanges: vi.fn().mockReturnValue([]),
      setImmutable: vi.fn(),
      get isImmutable() { return false; },
      
      // Command output
      getCommand: vi.fn(),
      getCommandOutput: vi.fn(),
      
      // Internal state
      getInternalStateNode: vi.fn().mockReturnValue({})
    };
    
    // Apply any overrides
    return { ...baseMock, ...overrides };
  }
  
  /**
   * Create a typed mock resolution service
   */
  static createResolutionService(overrides: Partial<IResolutionService> = {}): IResolutionService {
    const baseMock: IResolutionService = {
      resolveText: vi.fn().mockImplementation(async (text) => text),
      resolveData: vi.fn().mockResolvedValue({}),
      resolvePath: vi.fn().mockResolvedValue({ path: '/mock/path', type: 'file' }),
      resolveCommand: vi.fn().mockResolvedValue('command output'),
      resolveFile: vi.fn().mockResolvedValue('file content'),
      resolveContent: vi.fn().mockResolvedValue(''),
      resolveNodes: vi.fn().mockResolvedValue('resolved nodes'),
      resolveInContext: vi.fn().mockImplementation(async (value) => 
        typeof value === 'string' ? value : 'resolved value'),
      resolveFieldAccess: vi.fn().mockResolvedValue({ success: true, value: {} }),
      validateResolution: vi.fn().mockResolvedValue({ path: '/validated/path', type: 'file' }),
      extractSection: vi.fn().mockResolvedValue('section content'),
      detectCircularReferences: vi.fn(),
      convertToFormattedString: vi.fn().mockImplementation(async (value) => 
        typeof value === 'string' ? value : JSON.stringify(value)),
      enableResolutionTracking: vi.fn(),
      getResolutionTracker: vi.fn()
    };
    
    return { ...baseMock, ...overrides };
  }
  
  /**
   * Create a typed mock file system service
   */
  static createFileSystemService(overrides: Partial<IFileSystemService> = {}): IFileSystemService {
    const baseMock: IFileSystemService = {
      readFile: vi.fn().mockResolvedValue(''),
      writeFile: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn().mockResolvedValue(false),
      stat: vi.fn().mockResolvedValue({
        isFile: () => true,
        isDirectory: () => false,
        size: 0,
        mtime: new Date()
      }),
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
      deleteFile: vi.fn().mockResolvedValue(undefined)
    };
    
    return { ...baseMock, ...overrides };
  }
  
  /**
   * Create a typed mock path service
   */
  static createPathService(overrides: Partial<IPathService> = {}): IPathService {
    const baseMock: IPathService = {
      initialize: vi.fn(),
      enableTestMode: vi.fn(),
      disableTestMode: vi.fn(),
      isTestMode: vi.fn().mockReturnValue(true),
      setHomePath: vi.fn(),
      setProjectPath: vi.fn(),
      getHomePath: vi.fn().mockReturnValue('/mock/home'),
      getProjectPath: vi.fn().mockReturnValue('/mock/project'),
      resolveProjectPath: vi.fn().mockResolvedValue('/mock/project'),
      resolvePath: vi.fn().mockImplementation(path => typeof path === 'string' ? path : '/mock/resolved/path'),
      validatePath: vi.fn().mockResolvedValue({ path: '/mock/validated/path', type: 'file' }),
      joinPaths: vi.fn().mockImplementation((...paths) => paths.join('/')),
      dirname: vi.fn().mockImplementation(path => path.split('/').slice(0, -1).join('/')),
      basename: vi.fn().mockImplementation(path => path.split('/').pop() || ''),
      normalizePath: vi.fn().mockImplementation(path => path),
      isURL: vi.fn().mockImplementation(path => path.startsWith('http')),
      validateURL: vi.fn().mockResolvedValue('https://example.com'),
      fetchURL: vi.fn().mockResolvedValue({
        content: 'mock content',
        metadata: { statusCode: 200, contentType: 'text/plain' },
        fromCache: false,
        url: 'https://example.com'
      })
    };
    
    return { ...baseMock, ...overrides };
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