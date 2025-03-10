import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ResolutionService } from './ResolutionService.js';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import { IPathService } from '@services/fs/PathService/IPathService.js';
import { IServiceMediator } from '@services/mediator/IServiceMediator.js';
import { ResolutionContext } from './IResolutionService.js';
import { ResolutionError } from './errors/ResolutionError.js';
import type { MeldNode, DirectiveNode, TextNode } from 'meld-spec';
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
import { container } from 'tsyringe';

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
  let serviceMediator: IServiceMediator;
  let context: ResolutionContext;
  let testContext: TestContextDI;

  beforeEach(() => {
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
    
    // Create mock service mediator
    serviceMediator = {
      setParserService: vi.fn(),
      setResolutionService: vi.fn(),
      setFileSystemService: vi.fn(),
      setPathService: vi.fn(),
      setStateService: vi.fn(),
      resolveVariableForParser: vi.fn().mockResolvedValue('resolved value'),
      parseForResolution: vi.fn().mockResolvedValue([{ type: 'Text', content: 'parsed content' }]),
      parseWithLocationsForResolution: vi.fn().mockResolvedValue([{ type: 'Text', content: 'parsed content', location: {} }]),
      resolvePath: vi.fn(p => p),
      normalizePath: vi.fn(p => p),
      isDirectory: vi.fn().mockResolvedValue(false),
      exists: vi.fn().mockResolvedValue(true),
      getTextVar: vi.fn().mockImplementation(name => {
        if (name === 'greeting') return 'Hello World';
        if (name === 'name') return 'World';
        return undefined;
      }),
      getDataVar: vi.fn().mockImplementation(name => {
        if (name === 'user') return { name: 'Alice', id: 123 };
        return undefined;
      }),
      getPathVar: vi.fn().mockReturnValue('/path/value'),
      getAllTextVars: vi.fn().mockReturnValue(new Map([['greeting', 'Hello World']])),
      getAllDataVars: vi.fn().mockReturnValue(new Map([['user', { name: 'Alice', id: 123 }]])),
      getAllPathVars: vi.fn().mockReturnValue(new Map()),
    } as unknown as IServiceMediator;

    // Create test context with appropriate DI mode
    testContext = TestContextDI.create({ isolatedContainer: true });
    
    // Register mock services with the container
    container.registerInstance('IStateService', stateService);
    container.registerInstance('IFileSystemService', fileSystemService);
    container.registerInstance('IParserService', parserService);
    container.registerInstance('IPathService', pathService);
    container.registerInstance('IServiceMediator', serviceMediator);
    container.registerInstance('ServiceMediator', serviceMediator);
    
    // Resolve service from the container
    service = container.resolve(ResolutionService);

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
    container.clearInstances();
    await testContext.cleanup();
  });

  describe('resolveInContext', () => {
    it('should handle text nodes', async () => {
      const textNode: TextNode = {
        type: 'Text',
        content: 'simple text'
      };
      vi.mocked(parserService.parse).mockResolvedValue([textNode]);

      const result = await service.resolveInContext('simple text', context);
      expect(result).toBe('simple text');
    });

    it('should resolve text variables', async () => {
      // Use centralized syntax example for text directive
      const example = textDirectiveExamples.atomic.simpleString;
      
      // Create a node matching what the parser would return for "{{greeting}}"
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'greeting',
          value: 'Hello'
        }
      };
      
      vi.mocked(parserService.parse).mockResolvedValue([node]);
      vi.mocked(stateService.getTextVar).mockReturnValue('Hello World');

      const result = await service.resolveInContext('{{greeting}}', context);
      expect(result).toBe('Hello World');
    });

    it('should resolve data variables', async () => {
      // Use centralized syntax example for data directive
      const example = dataDirectiveExamples.atomic.simpleObject;
      
      // Create a node matching what the parser would return for "{{config}}"
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'data',
          identifier: 'user',
          value: '{ "name": "Alice", "id": 123 }'
        }
      };
      
      vi.mocked(parserService.parse).mockResolvedValue([node]);
      vi.mocked(stateService.getDataVar).mockReturnValue({ name: 'Alice', id: 123 });

      const result = await service.resolveInContext('{{user}}', context);
      expect(result).toBe('{"name":"Alice","id":123}');
    });

    it('should resolve system path variables', async () => {
      // System path variables like $HOMEPATH are handled differently
      // than user-defined path variables
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          identifier: 'HOMEPATH'
        }
      };
      
      vi.mocked(parserService.parse).mockResolvedValue([node]);
      vi.mocked(stateService.getPathVar).mockReturnValue('/home/user');

      const result = await service.resolveInContext('$HOMEPATH', context);
      expect(result).toBe('/home/user');
    });

    it('should resolve user-defined path variables', async () => {
      // Use centralized syntax example for path directive
      const example = pathDirectiveExamples.atomic.homePath;
      
      // Create a node matching what the parser would return for "$home"
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          identifier: 'home',
          value: '$HOMEPATH/meld'
        }
      };
      
      // Mock parser and path resolver
      vi.mocked(parserService.parse).mockResolvedValue([node]);
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
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'run',
          identifier: 'echo',
          value: '$echo(test)',
          args: ['test']
        }
      };
      
      vi.mocked(parserService.parse).mockResolvedValue([node]);
      vi.mocked(stateService.getCommand).mockReturnValue({
        command: '@run [echo ${text}]'
      });

      const result = await service.resolveInContext('$echo(test)', context);
      expect(result).toBe('echo test');
    });

    it('should handle parsing failures by treating value as text', async () => {
      vi.mocked(parserService.parse).mockRejectedValue(new Error('Parse error'));

      const result = await service.resolveInContext('unparseable content', context);
      expect(result).toBe('unparseable content');
    });

    it('should concatenate multiple nodes', async () => {
      const nodes: MeldNode[] = [
        {
          type: 'Text',
          content: 'Hello '
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
      vi.mocked(parserService.parse).mockResolvedValue(nodes);
      vi.mocked(stateService.getTextVar).mockReturnValue('World');

      const result = await service.resolveInContext('Hello {{name}}', context);
      expect(result).toBe('Hello World');
    });
  });

  describe('resolveContent', () => {
    it('should read file content', async () => {
      vi.mocked(fileSystemService.exists).mockResolvedValue(true);
      vi.mocked(fileSystemService.readFile).mockResolvedValue('file content');

      const result = await service.resolveContent('/path/to/file');
      expect(result).toBe('file content');
      expect(fileSystemService.readFile).toHaveBeenCalledWith('/path/to/file');
    });

    it('should throw when file does not exist', async () => {
      vi.mocked(fileSystemService.exists).mockResolvedValue(false);

      await expect(service.resolveContent('/missing/file'))
        .rejects
        .toThrow('File not found: /missing/file');
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
      
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'greeting',
          value: 'Hello'
        }
      };
      
      // Mock the parseForResolution method directly on the service
      vi.spyOn(service, 'parseForResolution').mockResolvedValue([node]);

      await expect(service.validateResolution('{{greeting}}', context))
        .rejects
        .toThrow('Text variables are not allowed in this context');
    });

    it('should validate data variables are allowed', async () => {
      context.allowedVariableTypes.data = false;
      
      // Use centralized syntax example for data directive
      const example = dataDirectiveExamples.atomic.simpleObject;
      
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'data',
          identifier: 'user',
          value: '{ "name": "Alice", "id": 123 }'
        }
      };
      
      // Mock the parseForResolution method directly on the service
      vi.spyOn(service, 'parseForResolution').mockResolvedValue([node]);

      await expect(service.validateResolution('{{user}}', context))
        .rejects
        .toThrow('Data variables are not allowed in this context');
    });

    it('should validate path variables are allowed', async () => {
      context.allowedVariableTypes.path = false;
      
      // Use centralized syntax example for path directive
      const example = pathDirectiveExamples.atomic.homePath;
      
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          identifier: 'home'
        }
      };
      
      // Mock the parseForResolution method directly on the service
      vi.spyOn(service, 'parseForResolution').mockResolvedValue([node]);

      await expect(service.validateResolution('$home', context))
        .rejects
        .toThrow('Path variables are not allowed in this context');
    });

    it('should validate command references are allowed', async () => {
      context.allowedVariableTypes.command = false;
      
      // Use centralized syntax example for run directive with defined command
      const example = runDirectiveExamples.combinations.definedCommand;
      
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'run',
          identifier: 'greet',
          value: '$greet()',
          args: []
        }
      };
      
      // Mock the parseForResolution method directly on the service
      vi.spyOn(service, 'parseForResolution').mockResolvedValue([node]);

      await expect(service.validateResolution('$greet()', context))
        .rejects
        .toThrow('Command references are not allowed in this context');
    });
  });

  describe('detectCircularReferences', () => {
    it('should detect direct circular references', async () => {
      // For circular references, we need custom nodes
      // but we'll use naming consistent with the examples
      const nodeA: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'var1',
          value: '{{var2}}'
        }
      };
      
      const nodeB: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'var2',
          value: '{{var1}}'
        }
      };

      // Mock the parseForResolution method directly on the service
      const parseForResolutionSpy = vi.spyOn(service, 'parseForResolution');
      parseForResolutionSpy.mockImplementation((text) => {
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
      
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'message',
          value: '`{{greeting}}, {{subject}}!`'
        }
      };
      
      // Mock the parseForResolution method directly on the service
      const parseForResolutionSpy = vi.spyOn(service, 'parseForResolution');
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