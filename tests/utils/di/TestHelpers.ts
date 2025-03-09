/**
 * TestHelpers.ts
 * 
 * Provides unified helper methods for common test patterns with DI
 */

import { vi } from 'vitest';
import { TestContextDI, TestContextDIOptions } from './TestContextDI';

/**
 * Helper methods for setting up common test scenarios
 */
export const TestHelpers = {
  /**
   * Sets up a TestContextDI instance for a test
   * @param options TestContextDI options
   */
  setup: (options: TestContextDIOptions = {}): TestContextDI => {
    return TestContextDI.create(options);
  },
  
  /**
   * Creates a context with common mock services
   * @param mockOverrides Object with mock overrides
   */
  setupWithMocks: (mockOverrides: Record<string, any> = {}): TestContextDI => {
    const context = TestContextDI.create();
    
    // Register default mocks for common services
    const defaultMocks: Record<string, any> = {
      'IStateService': {
        getVariable: vi.fn(),
        setVariable: vi.fn(),
        hasVariable: vi.fn().mockReturnValue(false),
        getDataVariable: vi.fn(),
        setDataVariable: vi.fn(),
        hasDataVariable: vi.fn().mockReturnValue(false),
        getPathVariable: vi.fn(),
        setPathVariable: vi.fn(),
        hasPathVariable: vi.fn().mockReturnValue(false),
        getCommand: vi.fn(),
        setCommand: vi.fn(),
        hasCommand: vi.fn().mockReturnValue(false),
        getCommandRef: vi.fn(),
        getOriginalNode: vi.fn(),
        storeOriginalNode: vi.fn(),
        getTransformedNode: vi.fn(),
        storeTransformedNode: vi.fn(),
        hasTransformedNode: vi.fn().mockReturnValue(false),
        createChildState: vi.fn().mockImplementation(function() { return this; }),
        getImmutable: vi.fn().mockReturnValue(false),
        setImmutable: vi.fn(),
        getParentState: vi.fn().mockReturnValue(null),
        createTransformationState: vi.fn().mockImplementation(function() { return this; }),
        isTransformationState: vi.fn().mockReturnValue(false),
        getTransformationState: vi.fn().mockReturnValue(null),
        getGlobalState: vi.fn().mockImplementation(function() { return this; }),
        clone: vi.fn().mockImplementation(function() { return this; }),
        merge: vi.fn()
      },
      'IFileSystemService': {
        readFile: vi.fn().mockResolvedValue(''),
        writeFile: vi.fn().mockResolvedValue(undefined),
        exists: vi.fn().mockResolvedValue(false),
        mkdir: vi.fn().mockResolvedValue(undefined),
        stat: vi.fn().mockResolvedValue({
          isDirectory: () => false,
          isFile: () => true
        }),
        listFiles: vi.fn().mockResolvedValue([]),
        isDirectory: vi.fn().mockResolvedValue(false),
        isFile: vi.fn().mockResolvedValue(true)
      },
      'IPathService': {
        validatePath: vi.fn().mockImplementation(path => path),
        normalizePath: vi.fn().mockImplementation(path => path),
        resolveRelativePath: vi.fn().mockImplementation((path, base) => 
          path.startsWith('/') ? path : (base || '/') + '/' + path),
        joinPaths: vi.fn().mockImplementation((...paths) => paths.join('/')),
        isAbsolutePath: vi.fn().mockImplementation(path => path.startsWith('/')),
        dirname: vi.fn().mockImplementation(path => path.replace(/\/[^/]*$/, '') || '/'),
        basename: vi.fn().mockImplementation(path => path.split('/').pop() || '')
      },
      'IResolutionService': {
        resolveVariable: vi.fn(),
        resolvePathVariable: vi.fn(),
        resolveDataVariable: vi.fn(),
        resolvePrimitive: vi.fn().mockImplementation(value => value),
        resolveCommand: vi.fn(),
        resolveVariableInText: vi.fn().mockImplementation((text) => text),
        resolveAll: vi.fn().mockImplementation((value) => value)
      },
      'IValidationService': {
        validateDirective: vi.fn().mockReturnValue(true),
        registerValidator: vi.fn()
      }
    };
    
    // Register all default mocks
    for (const [token, mock] of Object.entries(defaultMocks)) {
      // If an override is provided, use it instead
      const finalMock = mockOverrides[token] || mock;
      context.registerMock(token, finalMock);
    }
    
    // Register additional mocks from overrides
    for (const [token, mock] of Object.entries(mockOverrides)) {
      if (!(token in defaultMocks)) {
        context.registerMock(token, mock);
      }
    }
    
    return context;
  },
  
  /**
   * Creates a test context for directive handler testing
   * @param directiveHandler The directive handler to test
   * @param mockOverrides Mock overrides for services
   */
  setupDirectiveTest: <T>(
    directiveHandler: T,
    mockOverrides: Record<string, any> = {}
  ): {
    context: TestContextDI;
    validationService: any;
    stateService: any;
    resolutionService: any;
    handler: T | null;
  } => {
    const context = TestContextDI.create();
    
    // Register default mocks for directive testing
    const defaultMocks: Record<string, any> = {
      'IValidationService': {
        validateDirective: vi.fn().mockReturnValue(true)
      },
      'IStateService': {
        getVariable: vi.fn(),
        setVariable: vi.fn(),
        hasVariable: vi.fn().mockReturnValue(false),
        getDataVariable: vi.fn(),
        setDataVariable: vi.fn(),
        hasDataVariable: vi.fn().mockReturnValue(false),
        getPathVariable: vi.fn(),
        setPathVariable: vi.fn(),
        hasPathVariable: vi.fn().mockReturnValue(false),
        getCommand: vi.fn(),
        setCommand: vi.fn(),
        hasCommand: vi.fn().mockReturnValue(false),
        storeOriginalNode: vi.fn(),
        storeTransformedNode: vi.fn(),
        hasTransformedNode: vi.fn().mockReturnValue(false),
        createChildState: vi.fn().mockImplementation(function() { return this; }),
        getImmutable: vi.fn().mockReturnValue(false)
      },
      'IResolutionService': {
        resolveVariable: vi.fn(),
        resolvePathVariable: vi.fn(),
        resolveDataVariable: vi.fn(),
        resolvePrimitive: vi.fn().mockImplementation(value => value),
        resolveVariableInText: vi.fn().mockImplementation((text) => text),
        resolveAll: vi.fn().mockImplementation((value) => value)
      }
    };
    
    // Register handler if provided
    if (directiveHandler) {
      context.registerMock('directiveHandler', directiveHandler);
    }
    
    // Register all default mocks
    for (const [token, mock] of Object.entries(defaultMocks)) {
      // If an override is provided, use it instead
      const finalMock = mockOverrides[token] || mock;
      context.registerMock(token, finalMock);
    }
    
    // Register additional mocks from overrides
    for (const [token, mock] of Object.entries(mockOverrides)) {
      if (!(token in defaultMocks)) {
        context.registerMock(token, mock);
      }
    }
    
    return {
      context,
      validationService: context.resolveSync<any>('IValidationService'),
      stateService: context.resolveSync<any>('IStateService'),
      resolutionService: context.resolveSync<any>('IResolutionService'),
      handler: directiveHandler || null
    };
  },
  
  /**
   * Helper for vitest beforeEach/afterEach hooks
   * @param options Options for test setup
   */
  createTestSetup: (options: {
    /**
     * Create an isolated container
     */
    isolated?: boolean;
    
    /**
     * Enable leak detection
     */
    leakDetection?: boolean;
    
    /**
     * Default mock overrides to register
     */
    mocks?: Record<string, any>;
  } = {}) => {
    // Create a test setup helper class to maintain instance state
    class TestSetupHelper {
      context: TestContextDI | null = null;
      
      /**
       * Setup function for beforeEach
       */
      setup() {
        if (options.mocks) {
          this.context = TestHelpers.setupWithMocks(options.mocks);
        } else {
          this.context = TestContextDI.create({
            isolatedContainer: options.isolated,
            leakDetection: options.leakDetection
          });
        }
        
        return this.context;
      }
      
      /**
       * Cleanup function for afterEach
       */
      async cleanup() {
        if (this.context) {
          await this.context.cleanup();
          this.context = null;
        }
      }
    }
    
    return new TestSetupHelper();
  }
};

/**
 * Export TestHelpers as default
 */
export default TestHelpers; 