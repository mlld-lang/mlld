import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ResolutionService } from './ResolutionService.js';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import { IPathService } from '@services/fs/PathService/IPathService.js';
import { ResolutionContext } from './IResolutionService.js';
import { ResolutionError } from './errors/ResolutionError.js';
import type { MeldNode, DirectiveNode, TextNode } from '@core/syntax/types';
// Import centralized syntax examples and helpers
import { 
  textDirectiveExamples, 
  dataDirectiveExamples,
  defineDirectiveExamples,
  pathDirectiveExamples
} from '@core/syntax/index.js';
// Import run examples directly
import runDirectiveExamplesModule from '@core/syntax/run.js';
import { createExample, createInvalidExample, createNodeFromExample } from '@core/syntax/helpers';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
// Import factory classes
import { ParserServiceClientFactory } from '@services/pipeline/ParserService/factories/ParserServiceClientFactory.js';
import { VariableReferenceResolverClientFactory } from './factories/VariableReferenceResolverClientFactory.js';
import { DirectiveServiceClientFactory } from '@services/pipeline/DirectiveService/factories/DirectiveServiceClientFactory.js';
import { FileSystemServiceClientFactory } from '@services/fs/FileSystemService/factories/FileSystemServiceClientFactory.js';
// Import client interfaces
import { IParserServiceClient } from '@services/pipeline/ParserService/interfaces/IParserServiceClient.js';
import { IVariableReferenceResolverClient } from './interfaces/IVariableReferenceResolverClient.js';
import { IDirectiveServiceClient } from '@services/pipeline/DirectiveService/interfaces/IDirectiveServiceClient.js';
import { IFileSystemServiceClient } from '@services/fs/FileSystemService/interfaces/IFileSystemServiceClient.js';

// Use the correctly imported run directive examples
const runDirectiveExamples = runDirectiveExamplesModule;

// Mock the logger
vi.mock('@core/utils/logger', () => ({
  resolutionLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

// Run tests using DI mode only
describe('ResolutionService', () => {
  let service: ResolutionService;
  let stateService: IStateService;
  let fileSystemService: IFileSystemService;
  let parserService: IParserService;
  let pathService: IPathService;
  let context: ResolutionContext;
  let testContext: TestContextDI;
  
  // Factory mocks
  let mockParserClient: IParserServiceClient;
  let mockParserClientFactory: ParserServiceClientFactory;
  let mockVariableResolverClient: IVariableReferenceResolverClient;
  let mockVariableResolverClientFactory: VariableReferenceResolverClientFactory;
  let mockDirectiveClient: IDirectiveServiceClient;
  let mockDirectiveClientFactory: DirectiveServiceClientFactory;
  let mockFileSystemClient: IFileSystemServiceClient;
  let mockFileSystemClientFactory: FileSystemServiceClientFactory;

  beforeEach(async () => {
    // Create mock services
    stateService = {
      getTextVar: vi.fn().mockImplementation(name => {
        if (name === 'greeting') return 'Hello World';
        return undefined;
      }),
      getDataVar: vi.fn().mockImplementation(name => {
        if (name === 'user') return { name: 'Alice', id: 123 };
        return undefined;
      }),
      getPathVar: vi.fn(),
      getCommand: vi.fn(),
      getAllTextVars: vi.fn().mockReturnValue(new Map([['greeting', 'Hello World']])),
      getAllDataVars: vi.fn().mockReturnValue(new Map([['user', { name: 'Alice', id: 123 }]])),
      getAllPathVars: vi.fn().mockReturnValue(new Map()),
    } as unknown as IStateService;

    fileSystemService = {
      exists: vi.fn().mockResolvedValue(true),
      readFile: vi.fn().mockResolvedValue('file content'),
    } as unknown as IFileSystemService;

    parserService = {
      parse: vi.fn().mockResolvedValue([{ type: 'Text', content: 'parsed content' }]),
      parseWithLocations: vi.fn().mockResolvedValue([{ type: 'Text', content: 'parsed content', location: {} }]),
    } as unknown as IParserService;

    pathService = {
      getHomePath: vi.fn().mockReturnValue('/home/user'),
      dirname: vi.fn(p => p.substring(0, p.lastIndexOf('/') || 0)),
      resolvePath: vi.fn(p => typeof p === 'string' ? p : p.raw),
      normalizePath: vi.fn(p => p),
    } as unknown as IPathService;
    
    // Create mock clients
    mockParserClient = {
      parseString: vi.fn().mockResolvedValue([{ type: 'Text', value: 'parsed content' }]),
      parseFile: vi.fn().mockResolvedValue([{ type: 'Text', value: 'parsed content' }])
    } as unknown as IParserServiceClient;
    
    mockVariableResolverClient = {
      resolve: vi.fn().mockResolvedValue('resolved value'),
      resolveFieldAccess: vi.fn().mockResolvedValue('resolved field'),
      debugFieldAccess: vi.fn().mockResolvedValue({ value: 'debug field', path: [] }),
    } as unknown as IVariableReferenceResolverClient;
    
    mockDirectiveClient = {
      // Add any methods needed for testing
    } as unknown as IDirectiveServiceClient;
    
    mockFileSystemClient = {
      exists: vi.fn().mockResolvedValue(true),
      isDirectory: vi.fn().mockResolvedValue(false)
    } as unknown as IFileSystemServiceClient;
    
    // Create mock factories
    mockParserClientFactory = {
      createClient: () => mockParserClient
    } as unknown as ParserServiceClientFactory;
    
    mockVariableResolverClientFactory = {
      createClient: () => mockVariableResolverClient
    } as unknown as VariableReferenceResolverClientFactory;
    
    mockDirectiveClientFactory = {
      createClient: () => mockDirectiveClient
    } as unknown as DirectiveServiceClientFactory;
    
    mockFileSystemClientFactory = {
      createClient: () => mockFileSystemClient
    } as unknown as FileSystemServiceClientFactory;

    // Create test context with appropriate DI mode
    testContext = TestContextDI.createIsolated();
    await testContext.initialize();
    
    // Register mock services with the container
    testContext.registerMock('IStateService', stateService);
    testContext.registerMock('IFileSystemService', fileSystemService);
    testContext.registerMock('IParserService', parserService);
    testContext.registerMock('IPathService', pathService);
    
    // Register mock factories with the container
    testContext.registerMock('ParserServiceClientFactory', mockParserClientFactory);
    testContext.registerMock('VariableReferenceResolverClientFactory', mockVariableResolverClientFactory);
    testContext.registerMock('DirectiveServiceClientFactory', mockDirectiveClientFactory);
    testContext.registerMock('FileSystemServiceClientFactory', mockFileSystemClientFactory);
    
    // Resolve service from the container
    service = testContext.container.resolve(ResolutionService);

    context = {
      currentFilePath: 'test.meld',
      allowedVariableTypes: {
        text: true,
        data: true,
        path: true,
        command: true
      },
      state: stateService
    };
  });
  
  afterEach(async () => {
    await testContext.cleanup();
  });

  describe('resolveInContext', () => {
    it('should handle text nodes', async () => {
      const textNode = {
        type: 'Text',
        value: 'simple text'
      };
      vi.mocked(mockParserClient.parseString).mockResolvedValue([textNode]);

      const result = await service.resolveInContext('simple text', context);
      expect(result).toBe('simple text');
    });

    it('should resolve text variables', async () => {
      // Use centralized syntax example for text directive
      const example = textDirectiveExamples.atomic.simpleString;
      
      // Create a node matching what the parser would return for "{{greeting}}"
      const node = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'greeting',
          value: 'Hello'
        }
      };
      
      vi.mocked(mockParserClient.parseString).mockResolvedValue([node]);
      vi.mocked(stateService.getTextVar).mockReturnValue('Hello World');

      const result = await service.resolveInContext('{{greeting}}', context);
      expect(result).toBe('Hello World');
    });

    it('should resolve data variables', async () => {
      // Use centralized syntax example for data directive
      const example = dataDirectiveExamples.atomic.simpleObject;
      
      // Create a node matching what the parser would return for "{{config}}"
      const node = {
        type: 'Directive',
        directive: {
          kind: 'data',
          identifier: 'user',
          value: '{ "name": "Alice", "id": 123 }'
        }
      };
      
      vi.mocked(mockParserClient.parseString).mockResolvedValue([node]);
      vi.mocked(stateService.getDataVar).mockReturnValue({ name: 'Alice', id: 123 });

      const result = await service.resolveInContext('{{user}}', context);
      expect(result).toBe('{"name":"Alice","id":123}');
    });

    it('should resolve system path variables', async () => {
      // System path variables like $HOMEPATH are handled differently
      // than user-defined path variables
      const node = {
        type: 'Directive',
        directive: {
          kind: 'path',
          identifier: 'HOMEPATH'
        }
      };
      
      vi.mocked(mockParserClient.parseString).mockResolvedValue([node]);
      vi.mocked(stateService.getPathVar).mockReturnValue('/home/user');

      const result = await service.resolveInContext('$HOMEPATH', context);
      expect(result).toBe('/home/user');
    });

    it('should resolve user-defined path variables', async () => {
      // Use centralized syntax example for path directive
      const example = pathDirectiveExamples.atomic.homePath;
      
      // Create a node matching what the parser would return for "$home"
      const node = {
        type: 'Directive',
        directive: {
          kind: 'path',
          identifier: 'home',
          value: '$HOMEPATH/meld'
        }
      };
      
      // Mock parser and path resolver
      vi.mocked(mockParserClient.parseString).mockResolvedValue([node]);
      vi.mocked(stateService.getPathVar).mockImplementation((name: string) => {
        if (name === 'home') return '/home/user/meld';
        if (name === 'HOMEPATH') return '/home/user';
        return undefined;
      });
      
      // Use the exposed VariableReferenceResolver for more accurate path resolution testing
      const variableResolver = service.getVariableResolver();
      const originalResolve = variableResolver.resolve;
      variableResolver.resolve = vi.fn().mockImplementation((text: string, ctx: ResolutionContext) => {
        if (text === '$home') {
          return Promise.resolve('/home/user/meld');
        }
        return originalResolve.call(variableResolver, text, ctx);
      });

      const result = await service.resolveInContext('$home', context);
      
      // After test, restore original method
      variableResolver.resolve = originalResolve;
      
      expect(result).toBe('/home/user/meld');
    });

    it('should resolve command references', async () => {
      // Use centralized syntax example for run directive
      const example = runDirectiveExamples.atomic.simple;
      
      // Create a node matching what the parser would return for "$echo(hello)"
      const node = {
        type: 'Directive',
        directive: {
          kind: 'run',
          identifier: 'echo',
          value: '$echo(test)',
          args: ['test']
        }
      };
      
      vi.mocked(mockParserClient.parseString).mockResolvedValue([node]);
      vi.mocked(stateService.getCommand).mockReturnValue({
        command: '@run [echo ${text}]'
      });

      const result = await service.resolveInContext('$echo(test)', context);
      expect(result).toBe('echo test');
    });

    it('should handle parsing failures by treating value as text', async () => {
      vi.mocked(mockParserClient.parseString).mockRejectedValue(new Error('Parse error'));

      const result = await service.resolveInContext('unparseable content', context);
      expect(result).toBe('unparseable content');
    });

    it('should concatenate multiple nodes', async () => {
      const nodes = [
        {
          type: 'Text',
          value: 'Hello '
        },
        {
          type: 'Directive',
          directive: {
            kind: 'text',
            identifier: 'name',
            value: 'World'
          }
        }
      ];
      vi.mocked(mockParserClient.parseString).mockResolvedValue(nodes);
      vi.mocked(stateService.getTextVar).mockReturnValue('World');

      const result = await service.resolveInContext('Hello {{name}}', context);
      expect(result).toBe('Hello World');
    });
  });

  describe('resolveContent', () => {
    it('should read file content', async () => {
      vi.mocked(mockFileSystemClient.exists).mockResolvedValue(true);
      
      // Spy on the fileSystemService.readFile method
      const fileSystemReadFileSpy = vi.spyOn(fileSystemService, 'readFile');
      fileSystemReadFileSpy.mockResolvedValue('file content');

      const result = await service.resolveFile('/path/to/file');
      
      expect(result).toBe('file content');
      expect(fileSystemReadFileSpy).toHaveBeenCalledWith('/path/to/file');
    });

    it('should throw when file does not exist', async () => {
      // Mock both the client and service to ensure the test passes
      vi.mocked(mockFileSystemClient.exists).mockResolvedValue(false);
      
      // Also mock the fileSystemService for fallback
      vi.spyOn(fileSystemService, 'exists').mockResolvedValue(false);
      vi.spyOn(fileSystemService, 'readFile').mockRejectedValue(new Error('File not found'));

      await expect(service.resolveFile('/missing/file'))
        .rejects
        .toThrow('Failed to read file: /missing/file');
    });
  });

  describe('extractSection', () => {
    it('should extract section by heading', async () => {
      const content = `# Title
Some content

## Section 1
Content 1

## Section 2
Content 2`;

      const result = await service.extractSection(content, 'Section 1');
      expect(result).toBe('## Section 1\n\nContent 1');
    });

    it('should include content until next heading of same or higher level', async () => {
      const content = `# Title
Some content

## Section 1
Content 1
### Subsection
Subcontent

## Section 2
Content 2`;

      const result = await service.extractSection(content, 'Section 1');
      expect(result).toBe('## Section 1\n\nContent 1\n\n### Subsection\n\nSubcontent');
    });

    it('should throw when section is not found', async () => {
      const content = '# Title\nContent';

      await expect(service.extractSection(content, 'Missing Section'))
        .rejects
        .toThrow('Section not found: Missing Section');
    });
  });

  describe('validateResolution', () => {
    it('should validate text variables are allowed', async () => {
      context.allowedVariableTypes.text = false;
      
      // Use centralized syntax example for text directive
      const example = textDirectiveExamples.atomic.simpleString;
      
      const node = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'greeting',
          value: 'Hello'
        }
      };
      
      // Mock the parse method directly on the service
      vi.spyOn(service as any, 'parseForResolution').mockResolvedValue([node]);

      await expect(service.validateResolution('{{greeting}}', context))
        .rejects
        .toThrow('Text variables are not allowed in this context');
    });

    it('should validate data variables are allowed', async () => {
      context.allowedVariableTypes.data = false;
      
      // Use centralized syntax example for data directive
      const example = dataDirectiveExamples.atomic.simpleObject;
      
      const node = {
        type: 'Directive',
        directive: {
          kind: 'data',
          identifier: 'user',
          value: '{ "name": "Alice", "id": 123 }'
        }
      };
      
      // Mock the parse method directly on the service
      vi.spyOn(service as any, 'parseForResolution').mockResolvedValue([node]);

      await expect(service.validateResolution('{{user}}', context))
        .rejects
        .toThrow('Data variables are not allowed in this context');
    });

    it('should validate path variables are allowed', async () => {
      context.allowedVariableTypes.path = false;
      
      // Use centralized syntax example for path directive
      const example = pathDirectiveExamples.atomic.homePath;
      
      const node = {
        type: 'Directive',
        directive: {
          kind: 'path',
          identifier: 'home'
        }
      };
      
      // Mock the parse method directly on the service
      vi.spyOn(service as any, 'parseForResolution').mockResolvedValue([node]);

      await expect(service.validateResolution('$home', context))
        .rejects
        .toThrow('Path variables are not allowed in this context');
    });

    it('should validate command references are allowed', async () => {
      context.allowedVariableTypes.command = false;
      
      // Use centralized syntax example for run directive with defined command
      const example = runDirectiveExamples.combinations.definedCommand;
      
      const node = {
        type: 'Directive',
        directive: {
          kind: 'run',
          identifier: 'greet',
          value: '$greet()',
          args: []
        }
      };
      
      // Mock the parse method directly on the service
      vi.spyOn(service as any, 'parseForResolution').mockResolvedValue([node]);

      await expect(service.validateResolution('$greet()', context))
        .rejects
        .toThrow('Command references are not allowed in this context');
    });
  });

  describe('detectCircularReferences', () => {
    it('should detect direct circular references', async () => {
      // For circular references, we need custom nodes
      // but we'll use naming consistent with the examples
      const nodeA = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'var1',
          value: '{{var2}}'
        }
      };
      
      const nodeB = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'var2',
          value: '{{var1}}'
        }
      };

      // Mock the parseForResolution method directly on the service
      const parseForResolutionSpy = vi.spyOn(service as any, 'parseForResolution');
      parseForResolutionSpy.mockImplementation((text: any) => {
        if (text === '{{var1}}') return Promise.resolve([nodeA]);
        if (text === '{{var2}}') return Promise.resolve([nodeB]);
        return Promise.resolve([]);
      });

      vi.spyOn(stateService, 'getTextVar')
        .mockImplementation((name) => {
          if (name === 'var1') return '{{var2}}';
          if (name === 'var2') return '{{var1}}';
          return undefined;
        });

      await expect(service.detectCircularReferences('{{var1}}'))
        .rejects
        .toThrow('Circular reference detected: var1 -> var2');
    });

    it('should handle non-circular references', async () => {
      // Use the basicInterpolation example which refers to other variables
      const example = textDirectiveExamples.combinations.basicInterpolation;
      
      const node = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'message',
          value: '`{{greeting}}, {{subject}}!`'
        }
      };
      
      // Mock the parseForResolution method directly on the service
      const parseForResolutionSpy = vi.spyOn(service as any, 'parseForResolution');
      parseForResolutionSpy.mockResolvedValue([node]);
      
      vi.spyOn(stateService, 'getTextVar')
        .mockReturnValueOnce('`{{greeting}}, {{subject}}!`')
        .mockReturnValueOnce('Hello')
        .mockReturnValueOnce('World');

      await expect(service.detectCircularReferences('{{message}}'))
        .resolves
        .not.toThrow();
    });
  });
}); 