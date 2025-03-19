import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { container } from 'tsyringe';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { ImportDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler.js';
import { URLContentResolver } from '@services/resolution/URLContentResolver/URLContentResolver.js';
import { PathService } from '@services/fs/PathService/PathService.js';
import { DirectiveNode } from '@core/syntax/types/index.js';
import { createImportDirective } from '@tests/utils/testFactories.js';

// Mock fetch API
global.fetch = vi.fn();

describe('URL Resolver Delegation in ImportDirectiveHandler', () => {
  let context: TestContextDI;
  let importDirectiveHandler: ImportDirectiveHandler;
  let urlContentResolver: any;
  let pathService: any;
  
  beforeEach(async () => {
    // Reset mocks
    vi.resetAllMocks();
    
    // Create isolated test context
    context = TestContextDI.createIsolated();
    await context.initialize();
    
    // Create URLContentResolver mock with detailed tracking
    urlContentResolver = {
      isURL: vi.fn().mockImplementation((path) => {
        if (!path) return false;
        try {
          const url = new URL(path);
          return !!url.protocol && !!url.host;
        } catch {
          return false;
        }
      }),
      validateURL: vi.fn().mockImplementation(async (url, options) => {
        if (!url) throw new Error('URL is required');
        if (url.includes('invalid')) throw new Error('Invalid URL');
        return url;
      }),
      fetchURL: vi.fn().mockImplementation(async (url, options) => {
        return {
          content: `Content from ${url}`,
          metadata: {
            statusCode: 200,
            contentType: 'text/plain'
          },
          fromCache: false,
          url
        };
      })
    };
    
    // Create PathService mock
    pathService = {
      validateURL: vi.fn().mockImplementation(async (url, options) => {
        // This should not be called if URLContentResolver is used properly
        return url;
      }),
      fetchURL: vi.fn().mockImplementation(async (url, options) => {
        // This should not be called if URLContentResolver is used properly
        return {
          content: `PathService content from ${url}`,
          metadata: {
            statusCode: 200,
            contentType: 'text/plain'
          },
          fromCache: false,
          url
        };
      }),
      isURL: vi.fn().mockImplementation((path) => {
        // This should not be called in the ImportDirectiveHandler
        if (!path) return false;
        try {
          const url = new URL(path);
          return !!url.protocol && !!url.host;
        } catch {
          return false;
        }
      }),
      validatePath: vi.fn().mockImplementation(async (path) => path),
      normalizePath: vi.fn().mockImplementation((path) => path),
      resolveRelativePath: vi.fn().mockImplementation((path, basePath) => path),
      joinPaths: vi.fn().mockImplementation((...paths) => paths.join('/')),
      dirname: vi.fn().mockImplementation((path) => path.replace(/\/[^/]*$/, '')),
      basename: vi.fn().mockImplementation((path) => path.split('/').pop() || ''),
      extname: vi.fn().mockImplementation((path) => {
        const base = path.split('/').pop() || '';
        const match = base.match(/\.[^.]*$/);
        return match ? match[0] : '';
      })
    };
    
    // Register mocks
    context.registerMock('IURLContentResolver', urlContentResolver);
    context.registerMock('IPathService', pathService);
    
    // Setup other required mocks for ImportDirectiveHandler
    const validationService = { validate: vi.fn().mockResolvedValue(undefined) };
    const resolutionService = { 
      resolveInContext: vi.fn().mockImplementation(async (path) => {
        return path;
      })
    };
    const fileSystemService = {
      exists: vi.fn().mockResolvedValue(true),
      readFile: vi.fn().mockResolvedValue('')
    };
    const parserService = {
      parse: vi.fn().mockResolvedValue({
        nodes: []
      })
    };
    const stateService = {
      createChildState: vi.fn().mockReturnValue({
        setCurrentFilePath: vi.fn(),
        getAllTextVars: vi.fn().mockReturnValue(new Map()),
        getAllDataVars: vi.fn().mockReturnValue(new Map()),
        getAllPathVars: vi.fn().mockReturnValue(new Map()),
        getAllCommands: vi.fn().mockReturnValue(new Map())
      }),
      isTransformationEnabled: vi.fn().mockReturnValue(false)
    };
    const interpreterServiceClientFactory = {
      createClient: vi.fn().mockReturnValue({
        interpret: vi.fn().mockResolvedValue(stateService.createChildState()),
        createChildContext: vi.fn().mockResolvedValue(stateService.createChildState())
      })
    };
    const circularityService = {
      beginImport: vi.fn(),
      endImport: vi.fn()
    };
    
    context.registerMock('IValidationService', validationService);
    context.registerMock('IResolutionService', resolutionService);
    context.registerMock('IFileSystemService', fileSystemService);
    context.registerMock('IParserService', parserService);
    context.registerMock('IStateService', stateService);
    context.registerMock('InterpreterServiceClientFactory', interpreterServiceClientFactory);
    context.registerMock('ICircularityService', circularityService);
    
    // Create ImportDirectiveHandler instance
    importDirectiveHandler = await context.resolve(ImportDirectiveHandler);
  });
  
  afterEach(async () => {
    await context.cleanup();
  });
  
  it('should use URLContentResolver for URL validation', async () => {
    // Create a test import directive for a URL
    const node: DirectiveNode = {
      type: 'Directive',
      directive: {
        kind: 'import',
        url: 'https://example.com/data.json',
        path: undefined
      }
    };
    
    // Create a context for the import
    const directiveContext = {
      currentFilePath: '/path/to/file.meld',
      state: await context.resolve('IStateService')
    };
    
    // Execute the import directive
    await importDirectiveHandler.execute(node, directiveContext);
    
    // Verify URLContentResolver was used for URL validation
    expect(urlContentResolver.validateURL).toHaveBeenCalledWith(
      'https://example.com/data.json',
      undefined
    );
    
    // Verify PathService.validateURL was NOT used
    expect(pathService.validateURL).not.toHaveBeenCalled();
  });
  
  it('should use URLContentResolver for URL fetching', async () => {
    // Create a test import directive for a URL
    const node: DirectiveNode = {
      type: 'Directive',
      directive: {
        kind: 'import',
        url: 'https://example.com/data.json',
        path: undefined
      }
    };
    
    // Create a context for the import
    const directiveContext = {
      currentFilePath: '/path/to/file.meld',
      state: await context.resolve('IStateService')
    };
    
    // Execute the import directive
    await importDirectiveHandler.execute(node, directiveContext);
    
    // Verify URLContentResolver was used for URL fetching
    expect(urlContentResolver.fetchURL).toHaveBeenCalledWith(
      'https://example.com/data.json',
      expect.objectContaining({
        bypassCache: false
      })
    );
    
    // Verify PathService.fetchURL was NOT used
    expect(pathService.fetchURL).not.toHaveBeenCalled();
  });
  
  it('should fall back to PathService when URLContentResolver is not available', async () => {
    // Instead of creating a new handler, modify the urlContentResolver to undefined
    // in the existing handler through its private property
    (importDirectiveHandler as any).urlContentResolver = undefined;
    
    // Create a test import directive for a URL
    const node: DirectiveNode = {
      type: 'Directive',
      directive: {
        kind: 'import',
        url: 'https://example.com/fallback.json',
        path: undefined
      }
    };
    
    // Create a context for the import
    const directiveContext = {
      currentFilePath: '/path/to/file.meld',
      state: await context.resolve('IStateService')
    };
    
    // Execute the import directive
    await importDirectiveHandler.execute(node, directiveContext);
    
    // Verify PathService was used for URL validation as fallback
    expect(pathService.validateURL).toHaveBeenCalledWith(
      'https://example.com/fallback.json',
      undefined
    );
    
    // Verify PathService was used for URL fetching as fallback
    expect(pathService.fetchURL).toHaveBeenCalledWith(
      'https://example.com/fallback.json',
      expect.objectContaining({
        bypassCache: false
      })
    );
  });
  
  it('should work with either url or path parameter for URLs', async () => {
    // Create a test import directive with path parameter that is a URL
    const node: DirectiveNode = {
      type: 'Directive',
      directive: {
        kind: 'import',
        url: undefined,
        path: 'https://example.com/path-url.json',
        allowURLs: true
      }
    };
    
    // Create a context for the import
    const directiveContext = {
      currentFilePath: '/path/to/file.meld',
      state: await context.resolve('IStateService')
    };
    
    // Execute the import directive
    await importDirectiveHandler.execute(node, directiveContext);
    
    // Verify URLContentResolver was used for URL validation
    expect(urlContentResolver.validateURL).toHaveBeenCalledWith(
      'https://example.com/path-url.json',
      undefined
    );
    
    // Verify URLContentResolver was used for URL fetching
    expect(urlContentResolver.fetchURL).toHaveBeenCalledWith(
      'https://example.com/path-url.json',
      expect.objectContaining({
        bypassCache: false
      })
    );
  });
  
  it('should handle URL validation errors gracefully', async () => {
    // Create a test import directive with an invalid URL
    const node: DirectiveNode = {
      type: 'Directive',
      directive: {
        kind: 'import',
        url: 'https://example.com/invalid-url',
        path: undefined
      }
    };
    
    // Create a context for the import
    const directiveContext = {
      currentFilePath: '/path/to/file.meld',
      state: await context.resolve('IStateService')
    };
    
    // Create a URLValidationError with the correct name property
    const validationError = new Error('Invalid URL');
    validationError.name = 'URLValidationError';
    
    // URLContentResolver will throw the validation error for this URL
    urlContentResolver.validateURL.mockRejectedValueOnce(validationError);
    
    // Execute the import directive and expect it to throw
    await expect(importDirectiveHandler.execute(node, directiveContext))
      .rejects.toThrow(/URL validation error/);
    
    // Verify URLContentResolver was used for URL validation
    expect(urlContentResolver.validateURL).toHaveBeenCalledWith(
      'https://example.com/invalid-url',
      undefined
    );
    
    // Verify URLContentResolver was NOT used for fetching since validation failed
    expect(urlContentResolver.fetchURL).not.toHaveBeenCalled();
  });
});