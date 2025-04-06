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
import { MeldPath, PathPurpose, createMeldPath } from '@core/types';

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
// Import error testing utility
import { expectToThrowWithConfig } from '@tests/utils/errorTestUtils.js';

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

// Helper function to create mock PathVariable
const createMockPathVariable = (name: string, value: MeldPath): PathVariable => ({
  name,
  valueType: VariableType.PATH,
  value,
  source: { type: 'definition', filePath: 'mock.meld' }
});


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
        if (name === 'nested') return createMockDataVariable('nested', { data: { level1: { value: 'deep' } } });
        return undefined;
      }),
      getPathVar: vi.fn().mockImplementation((name: string): PathVariable | undefined => {
        if (name === 'home') return createMockPathVariable('home', createMeldPath('$HOMEPATH/meld'));
        if (name === 'docs') return createMockPathVariable('docs', createMeldPath('$./docs'));
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
         ['home', createMockPathVariable('home', createMeldPath('$HOMEPATH/meld'))]
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
      // Add executeCommand mock
      executeCommand: vi.fn().mockImplementation(async (command: string, options?: { cwd?: string }) => {
        // Simple mock: return command string as stdout
        return { stdout: command, stderr: '' };
      }),
      // Add other necessary IFileSystemService methods
      dirname: vi.fn(p => typeof p === 'string' ? p.substring(0, p.lastIndexOf('/') || 0) : ''), // Needed by CommandResolver
      getCwd: vi.fn().mockReturnValue('/mock/cwd'), // Needed by CommandResolver
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

    // Update PathService mock to handle MeldPath potentially
    pathService = {
      getHomePath: vi.fn().mockReturnValue('/home/user'),
      dirname: vi.fn(p => typeof p === 'string' ? p.substring(0, p.lastIndexOf('/') || 0) : ''),
      resolvePath: vi.fn().mockImplementation(async (p: string | MeldPath, purpose: PathPurpose, baseDir?: string): Promise<MeldPath> => {
         const rawPath = typeof p === 'string' ? p : p.raw;
         if (rawPath === '$HOMEPATH') return createMeldPath('/home/user');
         if (rawPath === '$HOMEPATH/meld') return createMeldPath('/home/user/meld');
         // Simple resolution for testing
         return createMeldPath(rawPath, baseDir);
      }),
      normalizePath: vi.fn().mockImplementation((p: string | MeldPath): MeldPath => {
        return typeof p === 'string' ? createMeldPath(p) : p; // Return MeldPath
      }),
      validatePath: vi.fn().mockImplementation(async (resolvedPath: MeldPath, context: PathValidationContext): Promise<MeldPath> => {
        // Simulate failure if context requires validation and path is marked invalid for test
        if (context.validation?.required && resolvedPath?.raw?.includes('invalid-for-test')) {
          throw new PathValidationError('Simulated validation failure', { 
            code: 'E_PATH_VALIDATION_FAILED', 
            details: { pathString: resolvedPath.raw, validationContext: context }
          });
        }
        // Basic mock: Assume valid and return the resolved path object
        if (!resolvedPath) throw new Error('Mock validatePath received undefined path');
        return resolvedPath;
      }),
      getProjectPath: vi.fn().mockReturnValue('/mock/project/root'),
      isAbsolute: vi.fn().mockImplementation(p => typeof p === 'string' && p.startsWith('/')),
    };
    
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
    
    // Instantiate the service using the DI container
    service = await testContext.resolve<IResolutionService>('IResolutionService');

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
      // The beforeEach setup handles mocking:
      // - pathService.resolvePath('$HOMEPATH') returns MeldPath({ raw: '/home/user' })
      // - mockParserClient.parseString('$HOMEPATH') returns VariableReferenceNode({ identifier: 'HOMEPATH', isSpecial: true })

      // Call the service method with the default context
      const result: MeldPath = await service.resolvePath('$HOMEPATH', defaultContext);

      // Assert the resolved MeldPath object
      // We might need to adjust the expected object based on createMeldPath implementation
      expect(result).toBeInstanceOf(MeldPath);
      expect(result.raw).toBe('/home/user');
      expect(result.normalized).toBe('/home/user'); // Assuming simple normalization for this test
      // Add more specific checks if needed (isAbsolute, etc.)
    });

    it('should resolve user-defined path variables', async () => {
      // The beforeEach setup handles mocking:
      // - stateService.getPathVar('home') returns PathVariable({ value: MeldPath('$HOMEPATH/meld') })
      // - pathService.resolvePath('$HOMEPATH/meld') returns MeldPath('/home/user/meld')
      // - mockParserClient.parseString('$home') returns VariableReferenceNode({ identifier: 'home' })

      // Call the service method with the default context
      const result: MeldPath = await service.resolvePath('$home', defaultContext);

      // Assert the resolved MeldPath object
      expect(result).toBeInstanceOf(MeldPath);
      expect(result.raw).toBe('/home/user/meld'); // pathService mock should resolve this
      expect(result.normalized).toBe('/home/user/meld');
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
      const filePath = createMeldPath(filePathString);
      
      // Mock the underlying FileSystemService readFile
      vi.mocked(fileSystemService.readFile).mockResolvedValue('file content');

      // Call resolveFile with the MeldPath object
      const result = await service.resolveFile(filePath);
      
      expect(result).toBe('file content');
      // Verify the correct method was called on the underlying service
      expect(fileSystemService.readFile).toHaveBeenCalledWith(filePathString); // Assuming readFile still takes string internally
    });

    it('should throw when file does not exist', async () => {
      const filePathString = '/missing/file';
      const filePath = createMeldPath(filePathString);
      vi.mocked(fileSystemService.readFile).mockRejectedValue(new Error('File not found'));

      // Use expectToThrowWithConfig
      await expectToThrowWithConfig(async () => {
        await service.resolveFile(filePath);
      }, {
        // Assuming resolveFile wraps the fs error in a MeldResolutionError or similar
        errorType: MeldResolutionError, // Or a more specific error type if available
        // code: 'E_FILE_NOT_FOUND', // If a specific code is used
        messageContains: 'Failed to resolve file content' // Adjust message as needed
      });
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

    it('should handle non-existent variable', async () => {
      // Use expectToThrowWithConfig
      await expectToThrowWithConfig(async () => {
        await service.resolveFieldAccess('nonexistent', ['field'], defaultContext);
      }, {
        errorType: VariableResolutionError,
        code: 'E_VAR_NOT_FOUND', // VariableReferenceResolver should throw this first
        messageContains: 'Variable not found: nonexistent'
      });
    });

    it('should handle invalid field access in strict mode', async () => {
      const strictContext = ResolutionContextFactory.create(stateService, 'test.meld', { strict: true });
      // Mock getDataVar to return 'user' which has { name, id }
      vi.mocked(stateService.getDataVar).mockImplementation((name: string): DataVariable | undefined => {
        if (name === 'user') return createMockDataVariable('user', { name: 'Alice', id: 123 });
        return undefined;
      });
      // Use expectToThrowWithConfig
      await expectToThrowWithConfig(async () => {
        // Accessing 'address' which doesn't exist on the user object
        await service.resolveFieldAccess('user', ['address'], strictContext);
      }, {
        errorType: FieldAccessError, // Expecting FieldAccessError from VariableReferenceResolver
        // code might depend on the specific FieldAccessError subclass used
        messageContains: 'Field 'address' not found' // Or similar message from accessFields
      });
    });

    it('should return empty string for invalid field access in non-strict mode', async () => {
      // Mock getDataVar to return 'user'
      vi.mocked(stateService.getDataVar).mockImplementation((name: string): DataVariable | undefined => {
        if (name === 'user') return createMockDataVariable('user', { name: 'Alice', id: 123 });
        return undefined;
      });
      // Accessing 'address' which doesn't exist on the user object
      const result = await service.resolveFieldAccess('user', ['address'], defaultContext); // non-strict
      // VariableReferenceResolver returns empty string in non-strict mode on field access failure
      expect(result).toBe('');
    });
  });

  describe('resolveData', () => {
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

    it('should handle non-existent variable', async () => {
      // Use expectToThrowWithConfig
      await expectToThrowWithConfig(async () => {
        await service.resolveData('nonexistent', defaultContext);
      }, {
        errorType: VariableResolutionError, // Expecting VariableResolutionError
        code: 'E_VAR_NOT_FOUND', // Specific code for not found
        messageContains: 'Data variable 'nonexistent' not found'
      });
    });

    it('should handle context disallowing data vars', async () => {
      const contextWithoutData = ResolutionContextFactory.create(
        stateService, 
        'test.meld', 
        { allowedVariableTypes: [VariableType.TEXT] } // Only allow TEXT
      );
      // Use expectToThrowWithConfig
      await expectToThrowWithConfig(async () => {
        await service.resolveData('user', contextWithoutData);
      }, {
        errorType: MeldResolutionError, // Expecting MeldResolutionError
        code: 'E_RESOLVE_TYPE_NOT_ALLOWED', // Specific code
        messageContains: 'Data variables are not allowed'
      });
    });
  });

  describe('resolvePath', () => {
    it('should return MeldPath object', async () => {
      const result = await service.resolvePath('$HOMEPATH', defaultContext);
      expect(result).toBeInstanceOf(MeldPath);
      expect(result.raw).toBe('/home/user');
    });

    it('should handle validation failures', async () => {
      const invalidPathString = '$invalid-for-test';
      const validationContext = ResolutionContextFactory.create(
        stateService, 
        'test.meld', 
        { 
          pathContext: { 
            purpose: PathPurpose.INCLUDE, 
            validation: { required: true } // Ensure validation runs
          } 
        }
      );

      // Use expectToThrowWithConfig
      await expectToThrowWithConfig(async () => {
        await service.resolvePath(invalidPathString, validationContext);
      }, {
        errorType: PathValidationError, // Expecting PathValidationError from the mock
        code: 'E_PATH_VALIDATION_FAILED',
        messageContains: 'Simulated validation failure'
      });
    });

    it('should handle non-existent variable', async () => {
      // Use expectToThrowWithConfig
      await expectToThrowWithConfig(async () => {
        await service.resolvePath('$nonexistent', defaultContext);
      }, {
        errorType: VariableResolutionError,
        code: 'E_VAR_NOT_FOUND',
        messageContains: 'Path variable 'nonexistent' not found'
      });
    });

    it('should handle context disallowing path vars', async () => {
      const contextWithoutPath = ResolutionContextFactory.create(
        stateService, 
        'test.meld', 
        { allowedVariableTypes: [VariableType.TEXT] } // Only allow TEXT
      );
      // Use expectToThrowWithConfig
      await expectToThrowWithConfig(async () => {
        await service.resolvePath('$home', contextWithoutPath);
      }, {
        errorType: MeldResolutionError,
        code: 'E_RESOLVE_TYPE_NOT_ALLOWED',
        messageContains: 'Path variables are not allowed'
      });
    });
  });

  describe('resolveCommand', () => {
    it('should execute basic command', async () => {
      // Mock stateService to return a basic command definition
      const basicCommandDef = {
        name: 'testcmd',
        commandTemplate: 'echo {{arg1}}',
        parameters: [{ name: 'arg1', position: 0, required: true }],
        variableResolutionMode: 'none'
      };
      vi.mocked(stateService.getCommandVar).mockReturnValue({
        name: 'testcmd',
        valueType: VariableType.COMMAND,
        value: basicCommandDef,
        source: { type: 'definition', filePath: 'mock.meld' }
      });
      
      // Mock file system execution
      vi.mocked(fileSystemService.executeCommand).mockResolvedValue({ stdout: 'echo Hello', stderr: '' });
      
      const result = await service.resolveCommand('testcmd', ['Hello'], defaultContext);
      expect(result).toBe('echo Hello');
      expect(fileSystemService.executeCommand).toHaveBeenCalledWith('echo Hello', expect.any(Object));
    });

    it('should handle non-existent command', async () => {
      vi.mocked(stateService.getCommandVar).mockReturnValue(undefined);
      // Use expectToThrowWithConfig
      await expectToThrowWithConfig(async () => {
        await service.resolveCommand('nonexistent', [], defaultContext);
      }, {
        errorType: VariableResolutionError,
        code: 'E_VAR_NOT_FOUND',
        messageContains: 'Command 'nonexistent' not found'
      });
    });

    it('should handle context disallowing command vars', async () => {
      const contextWithoutCommand = ResolutionContextFactory.create(
        stateService, 
        'test.meld', 
        { allowedVariableTypes: [VariableType.TEXT] } // Only allow TEXT
      );
      // Use expectToThrowWithConfig
      await expectToThrowWithConfig(async () => {
        // Need to ensure a command exists for this test case
        vi.mocked(stateService.getCommandVar).mockReturnValue({
          name: 'testcmd',
          valueType: VariableType.COMMAND,
          value: { name: 'testcmd', commandTemplate: 'echo', parameters: [] }, // Dummy basic def
          source: { type: 'definition', filePath: 'mock.meld' }
        });
        await service.resolveCommand('testcmd', [], contextWithoutCommand);
      }, {
        errorType: MeldResolutionError,
        code: 'E_RESOLVE_TYPE_NOT_ALLOWED',
        messageContains: 'Command variables are not allowed'
      });
    });

    it('should handle command execution error', async () => {
      // Mock stateService to return a basic command definition
      const basicCommandDef = {
        name: 'failcmd',
        commandTemplate: 'exit 1',
        parameters: [],
        variableResolutionMode: 'none'
      };
      vi.mocked(stateService.getCommandVar).mockReturnValue({
        name: 'failcmd',
        valueType: VariableType.COMMAND,
        value: basicCommandDef,
        source: { type: 'definition', filePath: 'mock.meld' }
      });
      // Mock file system execution to throw an error
      vi.mocked(fileSystemService.executeCommand).mockRejectedValue(new Error('Execution failed'));
      
      // Use expectToThrowWithConfig
      await expectToThrowWithConfig(async () => {
        await service.resolveCommand('failcmd', [], defaultContext);
      }, {
        errorType: MeldResolutionError,
        code: 'E_COMMAND_EXEC_FAILED',
        messageContains: 'Command execution failed: failcmd'
      });
    });
  });

  describe('resolveText', () => {
    it('should resolve simple text variable', async () => {
      const result = await service.resolveText('{{greeting}}', defaultContext);
      expect(result).toBe('Hello World');
    });

    it('should handle nested text variables', async () => {
      // Ensure stateService mock handles the nesting correctly in beforeEach
      const result = await service.resolveText('{{message}}', defaultContext);
      expect(result).toBe('`Hello World, Universe!`'); // Based on mock var values
    });

    it('should handle non-existent variable in strict mode', async () => {
      const strictContext = ResolutionContextFactory.create(stateService, 'test.meld', { strict: true });
      // Use expectToThrowWithConfig
      await expectToThrowWithConfig(async () => {
        await service.resolveText('{{nonexistent}}', strictContext);
      }, {
        errorType: VariableResolutionError,
        code: 'E_VAR_NOT_FOUND',
        messageContains: 'Variable not found: nonexistent' // Message from VariableReferenceResolver
      });
    });

    it('should return empty string for non-existent variable in non-strict mode', async () => {
      const result = await service.resolveText('{{nonexistent}}', defaultContext); // defaultContext is non-strict
      expect(result).toBe('');
    });

    it('should detect circular references', async () => {
      // Ensure stateService mock handles the circular vars in beforeEach
      // Use expectToThrowWithConfig
      await expectToThrowWithConfig(async () => {
        await service.resolveText('{{var1}}', defaultContext);
      }, {
        errorType: VariableResolutionError,
        code: 'MaxDepth', // Code set by VariableReferenceResolver
        messageContains: 'Maximum resolution depth exceeded'
      });
    });
  });
}); 