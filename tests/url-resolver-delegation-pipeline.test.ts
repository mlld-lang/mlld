import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { ImportDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler.js';
import { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService.js';

describe.skip('URL Resolver Delegation Pipeline Tests', () => {
  let context: TestContextDI;
  let directiveService: DirectiveService;
  let urlContentResolver: any;
  let pathService: any;
  
  beforeEach(async () => {
    // Reset mocks
    vi.resetAllMocks();
    
    // Create isolated test context
    context = TestContextDI.createIsolated();
    await context.initialize();
    
    // Get references to mocks
    urlContentResolver = await context.resolve('IURLContentResolver');
    pathService = await context.resolve('IPathService');
    
    // Create spy functions
    urlContentResolver.validateURL = vi.fn().mockImplementation(async (url) => url);
    urlContentResolver.fetchURL = vi.fn().mockImplementation(async (url) => ({
      content: `URLContentResolver content from ${url}`,
      metadata: {
        statusCode: 200,
        contentType: 'text/plain'
      },
      fromCache: false,
      url
    }));
    
    pathService.validateURL = vi.fn().mockImplementation(async (url) => url);
    pathService.fetchURL = vi.fn().mockImplementation(async (url) => ({
      content: `PathService content from ${url}`,
      metadata: {
        statusCode: 200,
        contentType: 'text/plain'
      },
      fromCache: false,
      url
    }));
    
    // Configure directive service
    const mockFileSystemService = await context.resolve('IFileSystemService');
    mockFileSystemService.readFile.mockResolvedValue('@text greeting = "Hello from import"');
    mockFileSystemService.exists.mockResolvedValue(true);
    
    const mockParserService = await context.resolve('IParserService');
    mockParserService.parse.mockResolvedValue({
      nodes: [{
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'greeting',
          value: 'Hello from import'
        }
      }]
    });
    
    // Resolve directive service
    directiveService = await context.resolve('IDirectiveService');
    
    // Run initialize to make sure service is ready
    if (directiveService.initialize) {
      await directiveService.initialize();
    }
  });
  
  afterEach(async () => {
    await context.cleanup();
  });
  
  it('should use URLContentResolver when processing import directives with URLs', async () => {
    // Create a test import directive node
    const node = {
      type: 'Directive',
      directive: {
        kind: 'import',
        url: 'https://example.com/file.json'
      },
      location: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 42 }
      }
    };
    
    // Create a directive context
    const directiveContext = {
      currentFilePath: '/path/to/file.meld',
      state: await context.resolve('IStateService'),
      strict: true
    };
    
    // Execute the directive
    await directiveService.executeDirective(node, directiveContext);
    
    // URLContentResolver should be used, not PathService
    expect(urlContentResolver.validateURL).toHaveBeenCalledWith(
      'https://example.com/file.json', 
      undefined
    );
    expect(urlContentResolver.fetchURL).toHaveBeenCalled();
    
    // PathService should not be used for URL operations
    expect(pathService.validateURL).not.toHaveBeenCalled();
    expect(pathService.fetchURL).not.toHaveBeenCalled();
  });
  
  it('should fall back to PathService when URLContentResolver is not available', async () => {
    // Get a reference to the ImportDirectiveHandler
    const importHandler = await context.resolve(ImportDirectiveHandler);
    
    // Set URLContentResolver to undefined
    (importHandler as any).urlContentResolver = undefined;
    
    // Create a test import directive node
    const node = {
      type: 'Directive',
      directive: {
        kind: 'import',
        url: 'https://example.com/file.json'
      },
      location: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 42 }
      }
    };
    
    // Create a directive context
    const directiveContext = {
      currentFilePath: '/path/to/file.meld',
      state: await context.resolve('IStateService')
    };
    
    // Execute the directive handler directly
    await importHandler.execute(node, directiveContext);
    
    // PathService should be used for URL operations as fallback
    expect(pathService.validateURL).toHaveBeenCalledWith(
      'https://example.com/file.json',
      undefined
    );
    expect(pathService.fetchURL).toHaveBeenCalled();
    
    // URLContentResolver should not be used
    expect(urlContentResolver.validateURL).not.toHaveBeenCalled();
    expect(urlContentResolver.fetchURL).not.toHaveBeenCalled();
  });
});