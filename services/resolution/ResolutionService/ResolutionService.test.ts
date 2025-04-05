import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
// Import SPECIFIC types needed from ResolutionService exports
import type { IResolutionService, FieldAccessError } from '@services/resolution/ResolutionService/IResolutionService.js';
import { MeldResolutionError, PathValidationError } from '@core/errors/index.js';
import { 
  ResolutionContext, 
  VariableType, 
  MeldVariable, 
  TextVariable,
  DataVariable,
  PathVariable,
  FieldAccess
} from '@core/types'; // Import core types
import type { MeldNode, VariableReferenceNode } from '@core/types/ast-types';
// Import correct path types and unsafe creators
import { 
  MeldPath, 
  PathPurpose, 
  PathContentType, 
  ValidatedResourcePath, 
  unsafeCreateValidatedResourcePath, 
  unsafeCreateAbsolutePath, 
  unsafeCreateUrlPath 
} from '@core/types/paths.js'; 

// Import centralized syntax examples and helpers - KEEP THESE
import { 
  textDirectiveExamples, 
  dataDirectiveExamples,
  defineDirectiveExamples,
  pathDirectiveExamples
} from '@core/syntax/index.js';
// Import run examples directly
import runDirectiveExamplesModule from '@core/syntax/run.js';
import { createExample, createInvalidExample, createNodeFromExample } from '@core/syntax/helpers.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
// Import factory classes
import { ParserServiceClientFactory } from '@services/pipeline/ParserService/factories/ParserServiceClientFactory.js';
import { VariableReferenceResolverClientFactory } from '@services/resolution/ResolutionService/factories/VariableReferenceResolverClientFactory.js';
import { DirectiveServiceClientFactory } from '@services/pipeline/DirectiveService/factories/DirectiveServiceClientFactory.js';
import { FileSystemServiceClientFactory } from '@services/fs/FileSystemService/factories/FileSystemServiceClientFactory.js';
// Import client interfaces
import type { IParserServiceClient } from '@services/pipeline/ParserService/interfaces/IParserServiceClient.js';
import { IVariableReferenceResolverClient } from '@services/resolution/ResolutionService/interfaces/IVariableReferenceResolverClient.js';
import { IDirectiveServiceClient } from '@services/pipeline/DirectiveService/interfaces/IDirectiveServiceClient.js';
import type { IFileSystemServiceClient } from '@services/fs/FileSystemService/interfaces/IFileSystemServiceClient.js';
// Import the Factory we need to use
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';

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

// Helper function to create mock TextVariable
const createMockTextVariable = (name: string, value: string): TextVariable => ({
  name,
  valueType: VariableType.TEXT,
  value,
  source: { type: 'definition', filePath: 'mock.meld' }
});

// Helper function to create mock DataVariable
const createMockDataVariable = (name: string, value: any): DataVariable => ({
  name,
  valueType: VariableType.DATA,
  value,
  source: { type: 'definition', filePath: 'mock.meld' }
});

// Updated helper to create mock PathVariable using unsafe creators
const createMockPathVariable = (name: string, rawPath: string, contentType: PathContentType = PathContentType.FILESYSTEM): PathVariable => {
  let validatedPath: ValidatedResourcePath;
  let isAbsolute = false;
  if (contentType === PathContentType.FILESYSTEM) {
    validatedPath = unsafeCreateValidatedResourcePath(rawPath); // Or use unsafeCreateAbsolutePath if needed
    isAbsolute = rawPath.startsWith('/') || rawPath.startsWith('$HOMEPATH');
  } else { // URL
    validatedPath = unsafeCreateUrlPath(rawPath); 
  }
  
  const value: MeldPath = {
    contentType: contentType,
    originalValue: rawPath,
    validatedPath: validatedPath,
    isAbsolute: isAbsolute,
    isSecure: true // Assume secure for mock
  };
  
  return {
    name,
    valueType: VariableType.PATH,
    value,
    source: { type: 'definition', filePath: 'mock.meld' }
  };
};


describe('ResolutionService', () => {
  let service: IResolutionService; // Use interface type
  let stateService: IStateService;
  let fileSystemService: IFileSystemService;
  let parserService: IParserService; // Keep this for potential internal use
  let pathService: IPathService;
  let defaultContext: ResolutionContext; // Use a default context
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
    // Create mock services with strict types
    stateService = {
      getTextVar: vi.fn().mockImplementation((name: string): TextVariable | undefined => {
        if (name === 'greeting') return createMockTextVariable('greeting', 'Hello World');
        if (name === 'subject') return createMockTextVariable('subject', 'Universe');
        if (name === 'message') return createMockTextVariable('message', '`{{greeting}}, {{subject}}!`');
        // For circular tests
        if (name === 'var1') return createMockTextVariable('var1', '{{var2}}');
        if (name === 'var2') return createMockTextVariable('var2', '{{var1}}');
        return undefined;
      }),
      getDataVar: vi.fn().mockImplementation((name: string): DataVariable | undefined => {
        if (name === 'user') return createMockDataVariable('user', { name: 'Alice', id: 123 });
        if (name === 'config') return createMockDataVariable('config', { version: 1, active: true });
        return undefined;
      }),
      getPathVar: vi.fn().mockImplementation((name: string): PathVariable | undefined => {
        if (name === 'home') return createMockPathVariable('home', '$HOMEPATH/meld');
        if (name === 'docs') return createMockPathVariable('docs', '$./docs');
        return undefined;
      }),
      getCommand: vi.fn().mockImplementation((name: string) => {
         if (name === 'echo') return { command: '@run echo ${text}' };
         if (name === 'greet') return { command: '@run echo Hello there' };
         return undefined;
      }),
      getAllTextVars: vi.fn().mockReturnValue(new Map<string, TextVariable>([
        ['greeting', createMockTextVariable('greeting', 'Hello World')],
        ['subject', createMockTextVariable('subject', 'Universe')],
      ])),
      getAllDataVars: vi.fn().mockReturnValue(new Map<string, DataVariable>([
        ['user', createMockDataVariable('user', { name: 'Alice', id: 123 })],
      ])),
      getAllPathVars: vi.fn().mockReturnValue(new Map<string, PathVariable>([
         ['home', createMockPathVariable('home', '$HOMEPATH/meld')]
      ])),
      // Add other necessary IStateService methods if needed by ResolutionService
      getCurrentFilePath: vi.fn().mockReturnValue('test.meld'),
      getTransformedNodes: vi.fn().mockReturnValue([]),
      isTransformationEnabled: vi.fn().mockReturnValue(true), 
      getTransformationOptions: vi.fn().mockReturnValue({}),
    } as unknown as IStateService;

    fileSystemService = {
      exists: vi.fn().mockResolvedValue(true),
      readFile: vi.fn().mockResolvedValue('file content'),
      // Add other necessary IFileSystemService methods
    } as unknown as IFileSystemService;

    // Mock parser to return VariableReferenceNodes where appropriate
    mockParserClient = {
      parseString: vi.fn().mockImplementation(async (text: string): Promise<MeldNode[]> => {
         if (text === 'simple text') return [{ type: 'Text', content: 'simple text' }];
         if (text === '{{greeting}}') return [{ type: 'VariableReference', identifier: 'greeting', valueType: VariableType.TEXT, fields: [], raw: text }];
         if (text === '{{user}}') return [{ type: 'VariableReference', identifier: 'user', valueType: VariableType.DATA, fields: [], raw: text }];
         if (text === '{{user.name}}') return [{ type: 'VariableReference', identifier: 'user', valueType: VariableType.DATA, fields: [{type: 'field', value: 'name'}], raw: text }];
         if (text === '$HOMEPATH') return [{ type: 'VariableReference', identifier: 'HOMEPATH', valueType: VariableType.PATH, fields: [], raw: text, isSpecial: true }]; // Mark special
         if (text === '$home') return [{ type: 'VariableReference', identifier: 'home', valueType: VariableType.PATH, fields: [], raw: text }];
         if (text === '$echo(test)') return [{ type: 'VariableReference', identifier: 'echo', valueType: VariableType.COMMAND, fields: [], raw: text, args: ['test'] }]; // Add args if applicable
         if (text === '$greet()') return [{ type: 'VariableReference', identifier: 'greet', valueType: VariableType.COMMAND, fields: [], raw: text, args: [] }];
         if (text === 'Hello {{name}}') return [
           { type: 'Text', content: 'Hello ' },
           { type: 'VariableReference', identifier: 'name', valueType: VariableType.TEXT, fields: [], raw: '{{name}}' }
         ];
         if (text === '{{var1}}') return [{ type: 'VariableReference', identifier: 'var1', valueType: VariableType.TEXT, fields: [], raw: text }];
         if (text === '{{var2}}') return [{ type: 'VariableReference', identifier: 'var2', valueType: VariableType.TEXT, fields: [], raw: text }];
         // Fallback for unparseable or plain text
         return [{ type: 'Text', content: text }];
      }),
      parseFile: vi.fn().mockResolvedValue([{ type: 'Text', content: 'parsed file content' }])
    } as unknown as IParserServiceClient;
    
    // Keep original parser service mock for potential internal use if needed
    parserService = {
      parse: vi.fn().mockResolvedValue([{ type: 'Text', content: 'parsed content' }]),
      parseWithLocations: vi.fn().mockResolvedValue([{ type: 'Text', content: 'parsed content', location: {} }]),
    } as unknown as IParserService;

    // Update PathService mock to return MeldPath objects constructed with unsafe creators
    pathService = {
      getHomePath: vi.fn().mockReturnValue('/home/user'),
      dirname: vi.fn(p => typeof p === 'string' ? p.substring(0, p.lastIndexOf('/') || 0) : ''),
      resolvePath: vi.fn().mockImplementation(async (p: string | MeldPath, purpose: PathPurpose, baseDir?: string): Promise<MeldPath> => {
         const rawPath = typeof p === 'string' ? p : p.originalValue; // Use originalValue from MeldPath
         let resolvedRaw = rawPath;
         let contentType = PathContentType.FILESYSTEM;
         if (rawPath === '$HOMEPATH') resolvedRaw = '/home/user';
         else if (rawPath === '$HOMEPATH/meld') resolvedRaw = '/home/user/meld';
         else if (rawPath === '$./docs' && baseDir) resolvedRaw = '/project/root/docs'; // Example baseDir usage
         else if (baseDir && !rawPath.startsWith('/') && !rawPath.startsWith('$')) resolvedRaw = baseDir + '/' + rawPath; // Simplistic relative path join
         // Assume URL if starts with http
         if (resolvedRaw.startsWith('http')) contentType = PathContentType.URL;

         // Create mock MeldPath using unsafe creators
         let validatedPath: ValidatedResourcePath;
         let isAbsolute = false;
         if (contentType === PathContentType.FILESYSTEM) {
           validatedPath = unsafeCreateValidatedResourcePath(resolvedRaw);
           isAbsolute = resolvedRaw.startsWith('/');
         } else { // URL
           validatedPath = unsafeCreateUrlPath(resolvedRaw);
         }
         const value: MeldPath = {
           contentType,
           originalValue: rawPath,
           validatedPath,
           isAbsolute,
           isSecure: true // Assume secure for mock
         };
         return value;
      }),
      normalizePath: vi.fn().mockImplementation((p: string | MeldPath): MeldPath => {
         // If already MeldPath, return it. If string, create a mock one.
         if (typeof p === 'string') { 
           const isAbsolute = p.startsWith('/');
           const validatedPath = isAbsolute ? unsafeCreateAbsolutePath(p) : unsafeCreateRelativePath(p);
           return { 
             contentType: PathContentType.FILESYSTEM, 
             originalValue: p, 
             validatedPath: validatedPath, 
             isAbsolute: isAbsolute, 
             isSecure: true 
           };
         }
         return p;
      }),
      validatePath: vi.fn().mockResolvedValue(undefined), 
    } as unknown as IPathService;
    
    // Mock VariableResolverClient - Keep simple for now
    mockVariableResolverClient = {
      resolve: vi.fn().mockResolvedValue('resolved value'),
      resolveFieldAccess: vi.fn().mockResolvedValue('resolved field'),
      debugFieldAccess: vi.fn().mockResolvedValue({ value: 'debug field', path: [] }),
      convertToString: vi.fn().mockImplementation(v => String(v)), // Simple string conversion
    } as unknown as IVariableReferenceResolverClient;
    
    mockDirectiveClient = {
      // Add any methods needed for testing
    } as unknown as IDirectiveServiceClient;
    
    mockFileSystemClient = {
      exists: vi.fn().mockResolvedValue(true),
      isDirectory: vi.fn().mockResolvedValue(false),
      readFile: vi.fn().mockResolvedValue('client file content'),
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
    // Use IResolutionService interface type for the resolved service
    service = testContext.container.resolve<IResolutionService>('IResolutionService'); 

    // Create a default ResolutionContext using the factory
    defaultContext = ResolutionContextFactory.create(stateService, 'test.meld');
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

      const result = await service.resolveInContext('simple text', defaultContext);
      expect(result).toBe('simple text');
    });

    it('should resolve text variables', async () => {
      // The beforeEach setup handles mocking:
      // - stateService.getTextVar('greeting') returns TextVariable({ value: 'Hello World' })
      // - mockParserClient.parseString('{{greeting}}') returns VariableReferenceNode({ identifier: 'greeting' })
      // We don't need to mock them again here.

      // Call the service method with the default context
      const result = await service.resolveText('{{greeting}}', defaultContext);
      
      // Assert the final resolved string value
      expect(result).toBe('Hello World');
    });

    it('should resolve data variables', async () => {
      // The beforeEach setup handles mocking:
      // - stateService.getDataVar('user') returns DataVariable({ value: { name: 'Alice', id: 123 } })
      // - mockParserClient.parseString('{{user}}') returns VariableReferenceNode({ identifier: 'user' })
      // We don't need to mock them again here.

      // Call the service method with the default context
      // Assuming resolveData is the correct method for getting the raw data value
      const result = await service.resolveData('user', defaultContext);

      // Assert the final resolved JSON value
      expect(result).toEqual({ name: 'Alice', id: 123 });
    });

    it('should resolve system path variables', async () => {
      const result: MeldPath = await service.resolvePath('$HOMEPATH', defaultContext);

      expect(result).toBeInstanceOf(Object); // Check it's an object
      expect(result.contentType).toBe(PathContentType.FILESYSTEM);
      expect(result.originalValue).toBe('$HOMEPATH');
      expect(result.validatedPath).toBe('/home/user'); 
      expect(result.isAbsolute).toBe(true);
    });

    it('should resolve user-defined path variables', async () => {
      const result: MeldPath = await service.resolvePath('$home', defaultContext);

      expect(result).toBeInstanceOf(Object); 
      expect(result.contentType).toBe(PathContentType.FILESYSTEM);
      expect(result.originalValue).toBe('$HOMEPATH/meld'); // originalValue from state mock
      expect(result.validatedPath).toBe('/home/user/meld'); // resolved value from pathService mock
      expect(result.isAbsolute).toBe(true);
    });

    it('should resolve command references', async () => {
      // The beforeEach setup handles mocking:
      // - stateService.getCommand('echo') returns { command: '@run echo ${text}' }
      // - mockParserClient.parseString('$echo(test)') returns VariableReferenceNode({ identifier: 'echo', args: ['test'] })
      
      // We expect the CommandResolver (used internally by ResolutionService) 
      // to execute the command definition.
      // For this test, we assume a simple echo-like behavior is mocked or handled internally.
      // The actual command execution logic isn't tested here, only the resolution part.

      // Let's use resolveText as commands are often embedded in text
      const result = await service.resolveText('$echo(test)', defaultContext);

      // Assert the final string result expected from the command resolver/execution
      // This depends heavily on how the internal CommandResolver is implemented/mocked
      // Assuming a simple mock that returns "echo [args]"
      expect(result).toBe('echo test'); 
    });

    it('should handle parsing failures by treating value as text', async () => {
      vi.mocked(mockParserClient.parseString).mockRejectedValue(new Error('Parse error'));

      const result = await service.resolveInContext('unparseable content', defaultContext);
      expect(result).toBe('unparseable content');
    });

    it('should concatenate multiple nodes', async () => {
      // The beforeEach setup handles mocking:
      // - stateService.getTextVar('name') returns TextVariable({ value: 'Alice' }) // Assuming 'name' resolves to Alice
      // - mockParserClient.parseString('Hello {{name}}') returns [TextNode, VariableReferenceNode]
      
      // Mock stateService specifically for 'name' if not covered in beforeEach
      vi.mocked(stateService.getTextVar).mockImplementation((name: string): TextVariable | undefined => {
        if (name === 'name') return createMockTextVariable('name', 'Alice');
        // Delegate to original mock for other vars like 'greeting' if needed
        const originalMock = stateService.getTextVar.getMockImplementation();
        if (originalMock) return originalMock(name);
        return undefined;
      });

      // Call the service method
      const result = await service.resolveText('Hello {{name}}', defaultContext);
      
      // Assert the final concatenated string
      expect(result).toBe('Hello Alice');
    });
  });

  // This suite actually tests resolveFile
  describe('resolveFile', () => { 
    it('should read file content', async () => {
      const filePathString = '/path/to/file';
      // Create a mock MeldPath object for input
      const filePath: MeldPath = { 
        contentType: PathContentType.FILESYSTEM, 
        originalValue: filePathString, 
        validatedPath: unsafeCreateAbsolutePath(filePathString), 
        isAbsolute: true, 
        isSecure: true 
      };
      
      vi.mocked(fileSystemService.readFile).mockResolvedValue('file content');

      const result = await service.resolveFile(filePath);
      
      expect(result).toBe('file content');
      expect(fileSystemService.readFile).toHaveBeenCalledWith(filePathString); 
    });

    it('should throw when file does not exist', async () => {
      const filePathString = '/missing/file';
      const filePath: MeldPath = { 
        contentType: PathContentType.FILESYSTEM, 
        originalValue: filePathString, 
        validatedPath: unsafeCreateAbsolutePath(filePathString), 
        isAbsolute: true, 
        isSecure: true 
      };
      
      const error = new Error('File not found');
      vi.mocked(fileSystemService.readFile).mockRejectedValue(error);

      await expect(service.resolveFile(filePath))
        .rejects
        .toThrowError(MeldResolutionError); 
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
      // Modify the default context to disallow text variables
      const modifiedContext = defaultContext.withAllowedTypes([
         VariableType.DATA, // Keep others allowed for isolation
         VariableType.PATH,
         VariableType.COMMAND
      ]);
      
      // The beforeEach setup mocks mockParserClient.parseString('{{greeting}}') 
      // to return a VariableReferenceNode { valueType: TEXT }
      // Remove the outdated spy on the internal parseForResolution method
      // vi.spyOn(service as any, 'parseForResolution').mockResolvedValue([node]);

      // Call validateResolution with the modified context
      await expect(service.validateResolution('{{greeting}}', modifiedContext))
        .rejects
        .toThrow('Text variables are not allowed in this context'); // Assuming error message is unchanged
    });

    it('should validate data variables are allowed', async () => {
      // Modify context to disallow data variables
      const modifiedContext = defaultContext.withAllowedTypes([
         VariableType.TEXT,
         VariableType.PATH,
         VariableType.COMMAND
      ]);
      
      // beforeEach mocks parser for '{{user}}' -> VariableReferenceNode { valueType: DATA }
      // Remove outdated spy
      // vi.spyOn(service as any, 'parseForResolution').mockResolvedValue([node]);

      // Call validateResolution with the modified context
      await expect(service.validateResolution('{{user}}', modifiedContext))
        .rejects
        .toThrow('Data variables are not allowed in this context');
    });

    it('should validate path variables are allowed', async () => {
      // Modify context to disallow path variables
      const modifiedContext = defaultContext.withAllowedTypes([
         VariableType.TEXT,
         VariableType.DATA,
         VariableType.COMMAND
      ]);

      // beforeEach mocks parser for '$home' -> VariableReferenceNode { valueType: PATH }
      // Remove outdated spy
      // vi.spyOn(service as any, 'parseForResolution').mockResolvedValue([node]);

      // Call validateResolution with the modified context
      await expect(service.validateResolution('$home', modifiedContext))
        .rejects
        .toThrow('Path variables are not allowed in this context');
    });

    it('should validate command references are allowed', async () => {
      // Modify context to disallow command variables
      const modifiedContext = defaultContext.withAllowedTypes([
         VariableType.TEXT,
         VariableType.DATA,
         VariableType.PATH
      ]);

      // beforeEach mocks parser for '$greet()' -> VariableReferenceNode { valueType: COMMAND }
      // Remove outdated spy
      // vi.spyOn(service as any, 'parseForResolution').mockResolvedValue([node]);

      // Call validateResolution with the modified context
      await expect(service.validateResolution('$greet()', modifiedContext))
        .rejects
        .toThrow('Command references are not allowed in this context');
    });
  });

  describe('detectCircularReferences', () => {
    it('should detect direct circular references', async () => {
      // The beforeEach mocks stateService for var1 -> {{var2}} and var2 -> {{var1}}
      // The beforeEach also mocks the parser client for {{var1}} and {{var2}}
      // Remove the outdated spy on internal parse method
      // const parseForResolutionSpy = vi.spyOn(service as any, 'parseForResolution');
      // ... mockImplementation removed ...

      // Call detectCircularReferences with the appropriate context
      await expect(service.detectCircularReferences('{{var1}}', defaultContext))
        .rejects
        .toThrow(/Circular reference detected: var1 -> var2/); // Use regex to be flexible with exact message format
    });

    it('should handle non-circular references', async () => {
      // The beforeEach setup mocks stateService for 'message', 'greeting', 'subject'
      // It also mocks the parser for '{{message}}' etc. if needed by the implementation
      // Remove the outdated spy on internal parse method
      // const parseForResolutionSpy = vi.spyOn(service as any, 'parseForResolution');
      // parseForResolutionSpy.mockResolvedValue([node]); // Node definition removed as irrelevant
      
      // Call detectCircularReferences with the appropriate context
      await expect(service.detectCircularReferences('{{message}}', defaultContext))
        .resolves
        .not.toThrow();
    });
  });

  // ADD tests for resolveFieldAccess
  describe('resolveFieldAccess', () => {
    it('should resolve a simple field access', async () => {
      // beforeEach mocks stateService.getDataVar('user') -> { name: 'Alice', id: 123 }
      const fieldPath: FieldAccess[] = [{ type: 'field', value: 'name' }];
      
      const result = await service.resolveFieldAccess('user', fieldPath, defaultContext);
      
      // Expect a successful result with the correct value
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('Alice');
      }
    });

    it('should resolve a nested field access', async () => {
      // Mock data variable with nested structure
      vi.mocked(stateService.getDataVar).mockImplementation((name: string): DataVariable | undefined => {
        if (name === 'nested') return createMockDataVariable('nested', { data: { info: { status: 'active' } } });
        return undefined;
      });

      const fieldPath: FieldAccess[] = [
        { type: 'field', value: 'data' }, 
        { type: 'field', value: 'info' }, 
        { type: 'field', value: 'status' }
      ];
      
      const result = await service.resolveFieldAccess('nested', fieldPath, defaultContext);
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('active');
      }
    });

    it('should resolve an array index access', async () => {
      vi.mocked(stateService.getDataVar).mockImplementation((name: string): DataVariable | undefined => {
        if (name === 'items') return createMockDataVariable('items', ['first', 'second', 'third']);
        return undefined;
      });

      const fieldPath: FieldAccess[] = [{ type: 'index', value: 1 }]; // Access 'second'
      
      const result = await service.resolveFieldAccess('items', fieldPath, defaultContext);
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('second');
      }
    });

    it('should return FieldAccessError for invalid field', async () => {
      // beforeEach mocks user -> { name: 'Alice', id: 123 }
      const fieldPath: FieldAccess[] = [{ type: 'field', value: 'invalidField' }];
      
      const result = await service.resolveFieldAccess('user', fieldPath, defaultContext);
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(FieldAccessError);
        expect(result.error.code).toBe('FIELD_NOT_FOUND'); // Or similar code
        expect(result.error.message).toContain('invalidField');
      }
    });

    it('should return FieldAccessError for invalid index', async () => {
       vi.mocked(stateService.getDataVar).mockImplementation((name: string): DataVariable | undefined => {
        if (name === 'items') return createMockDataVariable('items', ['first']);
        return undefined;
      });
      const fieldPath: FieldAccess[] = [{ type: 'index', value: 5 }]; // Index out of bounds
      
      const result = await service.resolveFieldAccess('items', fieldPath, defaultContext);
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(FieldAccessError);
        expect(result.error.code).toBe('INDEX_OUT_OF_BOUNDS'); // Or similar code
        expect(result.error.message).toContain('index 5');
      }
    });

    it('should return FieldAccessError for accessing field on non-object', async () => {
      // Mock 'primitive' as a text variable
      vi.mocked(stateService.getTextVar).mockImplementation((name: string): TextVariable | undefined => {
        if (name === 'primitive') return createMockTextVariable('primitive', 'some string');
        return undefined;
      });
      // Ensure getDataVar doesn't return it
      vi.mocked(stateService.getDataVar).mockImplementation((name: string): DataVariable | undefined => {
        if (name === 'primitive') return undefined; 
        // Delegate for others if needed
        const originalMock = stateService.getDataVar.getMockImplementation();
        if (originalMock) return originalMock(name);
        return undefined;
      });

      const fieldPath: FieldAccess[] = [{ type: 'field', value: 'length' }]; 
      
      // Pass context that allows TEXT resolution for the base variable
      const textFieldContext = defaultContext.withAllowedTypes([VariableType.TEXT, VariableType.DATA]);
      const result = await service.resolveFieldAccess('primitive', fieldPath, textFieldContext);
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(FieldAccessError);
        expect(result.error.code).toBe('INVALID_BASE_TYPE'); // Or similar code
        expect(result.error.message).toContain("Cannot access field 'length' on type 'string'");
      }
    });
  });
}); 