import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CLIService, IPromptService, ICLIService } from '@services/cli/CLIService/CLIService.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import type { IOutputService } from '@services/pipeline/OutputService/IOutputService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import { ErrorCollector } from '@tests/utils/ErrorTestUtils.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { cliLogger, type Logger } from '@core/utils/logger.js';
// Import the centralized syntax examples
import { textDirectiveExamples } from '@core/syntax/index.js';
import { VariableType, createPathVariable, type IPathVariable, PathContentType, type IFilesystemPathState } from '@core/types';
import { VariableOrigin } from '@core/types';
import { container, type DependencyContainer } from 'tsyringe'; // Import container and DependencyContainer
import { mockDeep, DeepMockProxy } from 'vitest-mock-extended'; // Import mockDeep

// Set test environment flag
process.env.NODE_ENV = 'test';

// Mock the API module
vi.mock('@api/index.js', () => ({
  main: vi.fn().mockResolvedValue('test output')
}));

// Create a mock prompt service
const mockPromptService: IPromptService = {
  getText: vi.fn()
};

const defaultOptions = {
  input: 'test.mld',
  format: 'xml' as const
};

// Create a proper async iterator implementation for watching
const createAsyncIterable = () => {
  let callCount = 0;
  return {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          if (callCount === 0) {
            callCount++;
            return { 
              done: false, 
              value: { filename: 'test.mld', eventType: 'change' } 
            };
          }
          
          // Simulate an infinite wait to keep the watcher running
          // This won't block because we'll interrupt it with an error
          await new Promise(resolve => setTimeout(resolve, 1000000));
          return { done: true };
        }
      };
    }
  };
};

// Mock fs.watch to return a proper async iterable
vi.mock('fs/promises', async () => {
  const actual = await vi.importActual('fs/promises');
  return {
    ...actual,
    watch: vi.fn().mockImplementation(() => createAsyncIterable())
  };
});

describe('CLIService', () => {
  let context: TestContextDI; // Remove if TestContextDI is fully unused after refactor
  let testContainer: DependencyContainer; // Manual child container
  let service: ICLIService;
  let mockParserService: DeepMockProxy<IParserService>;
  let mockInterpreterService: DeepMockProxy<IInterpreterService>;
  let mockOutputService: DeepMockProxy<IOutputService>;
  let mockFileSystemService: DeepMockProxy<IFileSystemService>;
  let mockPathService: DeepMockProxy<IPathService>;
  let mockStateService: DeepMockProxy<IStateService>; // Ensure this is DeepMockProxy
  let mockPromptService: DeepMockProxy<IPromptService>; // Ensure this is DeepMockProxy
  let mockChildState: DeepMockProxy<IStateService>; // Child state mock
  let mockLogger: Logger;
  // Remove mockStateService if it's now mockStateServiceProxy

  beforeEach(async () => {
    // Reset the mock state
    vi.clearAllMocks();
    // mockPromptService?.getText.mockReset(); // Reset only if mockPromptService is already created

    // --- 1. Create Manual Child Container ---
    testContainer = container.createChildContainer();

    // --- 2. Create Mocks ---
    mockParserService = mockDeep<IParserService>();
    mockInterpreterService = mockDeep<IInterpreterService>();
    mockOutputService = mockDeep<IOutputService>();
    mockFileSystemService = mockDeep<IFileSystemService>();
    mockPathService = mockDeep<IPathService>();
    mockStateService = mockDeep<IStateService>(); // Parent State mock
    mockChildState = mockDeep<IStateService>(); // Child State mock
    mockPromptService = mockDeep<IPromptService>();

    // --- 3. Configure Mocks ---
    // ParserService
    const sampleNodes = [{ type: 'Text', content: 'parsed content' }]; // Example node array
    mockParserService.parse.mockResolvedValue(sampleNodes);
    mockParserService.parseFile.mockResolvedValue(sampleNodes); // Also mock parseFile if used

    // InterpreterService
    // Mock interpret to return the nodes and the *child* state
    mockInterpreterService.interpret.mockImplementation(async (nodes, options, state) => {
      // Important: Return the *child* state mock that CLIService creates
      return { 
        nodes: nodes, // Pass through the nodes received
        state: mockChildState, // Return the CHILD state mock
        errors: [] 
      };
    });

    // OutputService
    mockOutputService.convert.mockResolvedValue('test output');
    mockOutputService.getAvailableFormats.mockReturnValue(['xml', 'json', 'markdown']);
    mockOutputService.getFormatAliases.mockReturnValue({ md: 'markdown', yml: 'yaml' });

    // PathService
    mockPathService.resolvePath.mockImplementation(path => path);
    mockPathService.enableTestMode.mockReturnThis(); // Chainable
    mockPathService.disableTestMode.mockReturnThis(); // Chainable
    mockPathService.isTestMode.mockReturnValue(true);
    mockPathService.normalizePath.mockImplementation(path => path);
    mockPathService.isAbsolute.mockReturnValue(true);
    mockPathService.join.mockImplementation((...paths) => paths.join('/'));
    mockPathService.dirname.mockImplementation(path => {
      const parts = path.split('/');
      return parts.slice(0, -1).join('/') || '/';
    });
    mockPathService.basename.mockImplementation(path => {
      const parts = path.split('/');
      return parts[parts.length - 1];
    });
    mockPathService.getHomePath.mockReturnValue('/home');
    mockPathService.getProjectPath.mockReturnValue('/project');
    mockPathService.resolveProjectPath.mockResolvedValue('/project');

    // Child State Mock Configuration
    mockChildState.setVariable.mockReturnThis(); // Assume chainable or void
    mockChildState.getVariable.mockReturnValue(undefined); // Default behavior
    mockChildState.getNodes.mockReturnValue([]);
    mockChildState.getStateId.mockReturnValue('test-child-state-id');
    mockChildState.getCurrentFilePath.mockReturnValue('/test/file.meld');
    mockChildState.isTransformationEnabled.mockReturnValue(false);

    // Parent StateService Mock Configuration (crucially, mock createChildState)
    mockStateService.createChildState.mockReturnValue(mockChildState);
    // Add other parent state mocks if CLIService interacts with it directly
    mockStateService.getCurrentFilePath.mockReturnValue('/project/test.mld'); // Example

    // FileSystemService (Basic setup, specific file behaviors below)
    mockFileSystemService.writeFile.mockResolvedValue(undefined);
    mockFileSystemService.readFile.mockResolvedValue(''); // Default empty content
    mockFileSystemService.exists.mockResolvedValue(false); // Default not exists

    // PromptService (already mocked at top-level)
    // mockPromptService.getText.mockResolvedValue('y'); // Default prompt value

    // --- 4. Register Mocks in testContainer ---
    testContainer.registerInstance<IParserService>('IParserService', mockParserService);
    testContainer.registerInstance<IInterpreterService>('IInterpreterService', mockInterpreterService);
    testContainer.registerInstance<IOutputService>('IOutputService', mockOutputService);
    testContainer.registerInstance<IFileSystemService>('IFileSystemService', mockFileSystemService);
    testContainer.registerInstance<IPathService>('IPathService', mockPathService);
    testContainer.registerInstance<IStateService>('IStateService', mockStateService); // Register the main state service mock
    testContainer.registerInstance<IPromptService>('IPromptService', mockPromptService);

    // --- 5. Register Real Service Implementation ---
    testContainer.register('ICLIService', { useClass: CLIService });

    // --- 6. Register the Container itself (if needed by dependencies) ---
    testContainer.registerInstance('DependencyContainer', testContainer);

    // --- 7. Resolve Service Under Test ---
    service = testContainer.resolve<ICLIService>('ICLIService');

    // --- 8. Setup Test-Specific File System State ---
    const textExample = textDirectiveExamples.atomic.simpleString;
    // Use the registered mock FS service for file operations
    await mockFileSystemService.writeFile('test.mld', textExample.code);

    // Configure exists specifically AFTER writing the file
    // Ensure this mock handles all paths expected by the tests
    mockFileSystemService.exists.mockImplementation(async (path) => {
      return path === 'test.mld' || 
             path === '/project/input.mld' || 
             path === 'test.md' ||
             path === '/project/test.mld'; // Add parent state path
    });
    // Mock readFile specifically for the test file
    mockFileSystemService.readFile.mockImplementation(async (path) => {
        if (path === 'test.mld' || path === '/project/test.mld') {
            return textExample.code;
        }
        if (path === 'test.md') {
            return 'existing markdown';
        }
        if (path === 'nonexistent.mld') {
            const error = new Error(`Mock readFile error: File not found ${path}`);
            (error as any).code = 'ENOENT'; // Simulate file not found error code
            throw error;
        }
        throw new Error(`Mock readFile error: Unhandled path ${path}`);
    });

    // Initialize mock logger (this is external, not DI typically)
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      trace: vi.fn(),
      level: 'info'
    };
    // If logger is injected, mock and register it
    // testContainer.registerInstance<Logger>('Logger', mockLogger);
    
    // Reset mocks used across tests before each run
    vi.mocked(mockPromptService.getText).mockReset();
  });

  afterEach(async () => {
    // Dispose container first
    testContainer?.dispose();
    // Cleanup TestContextDI if used
    // await context?.cleanup(); 
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('Format Conversion', () => {
    it('should output xml format by default', async () => {
      const args = ['node', 'meld', 'test.mld', '--stdout'];
      await expect(service.run(args)).resolves.not.toThrow();
      expect(mockOutputService.convert).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Object),
        'xml',
        expect.any(Object)
      );
    });

    it('should handle format aliases correctly', async () => {
      const args = ['node', 'meld', 'test.mld', '--format', 'markdown', '--stdout'];
      await expect(service.run(args)).resolves.not.toThrow();
      expect(mockOutputService.convert).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Object),
        'markdown',
        expect.any(Object)
      );
    });

    it('should preserve markdown with markdown format', async () => {
      const args = ['node', 'meld', 'test.mld', '--format', 'markdown', '--stdout'];
      await expect(service.run(args)).resolves.not.toThrow();
      expect(mockOutputService.convert).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Object),
        'markdown',
        expect.any(Object)
      );
    });
  });

  describe('Command Line Options', () => {
    it('should display version when --version flag is used', async () => {
      const consoleLog = vi.spyOn(console, 'log');
      const args = ['node', 'meld', '--version'];
      await service.run(args);
      expect(consoleLog).toHaveBeenCalledWith(expect.stringMatching(/^meld version \d+\.\d+\.\d+$/));
      consoleLog.mockRestore();
    });

    it('should respect --stdout option', async () => {
      const consoleLog = vi.spyOn(console, 'log');
      const args = ['node', 'meld', 'test.mld', '--stdout'];
      await service.run(args);
      expect(consoleLog).toHaveBeenCalledWith('test output');
      consoleLog.mockRestore();
    });

    it('should use default output path when not specified', async () => {
      const args = ['node', 'meld', 'test.mld'];
      await expect(service.run(args)).resolves.not.toThrow();
      expect(mockOutputService.convert).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Object),
        'xml',
        expect.any(Object)
      );
    });

    it('should handle project path option', async () => {
      // We no longer support --project-path option for security reasons
      // Instead, we test that the project path is resolved correctly
      const args = ['node', 'meld', 'test.mld'];
      await service.run(args);
      expect(mockPathService.resolveProjectPath).toHaveBeenCalled();
      // const state = mockStateService.createChildState();
      const state = mockChildState; // Use the direct mock
      // Update to use setVariable with createPathVariable
      const projectPathVar = createPathVariable('PROJECTPATH', {
        contentType: PathContentType.FILESYSTEM,
        originalValue: "/project", 
        isValidSyntax: true, isSecure: true, isAbsolute: true, // Removed exists
        validatedPath: "/project" as any // Cast needed
      }, { origin: VariableOrigin.SYSTEM_DEFINED }); // Correct origin
      const dotPathVar = createPathVariable('.', {
        contentType: PathContentType.FILESYSTEM,
        originalValue: "/project", 
        isValidSyntax: true, isSecure: true, isAbsolute: true, // Removed exists
        validatedPath: "/project" as any // Cast needed
      }, { origin: VariableOrigin.SYSTEM_DEFINED }); // Correct origin
      
      // Use expect.objectContaining with expect.any(Number) for timestamps
      expect(state.setVariable).toHaveBeenCalledWith(expect.objectContaining({
        name: 'PROJECTPATH',
        type: VariableType.PATH,
        value: expect.objectContaining({ originalValue: "/project" }),
        metadata: expect.objectContaining({
            origin: VariableOrigin.SYSTEM_DEFINED,
            createdAt: expect.any(Number),
            modifiedAt: expect.any(Number)
        })
      }));
      expect(state.setVariable).toHaveBeenCalledWith(expect.objectContaining({
        name: '.', // Use single quotes for consistency
        type: VariableType.PATH,
        value: expect.objectContaining({ originalValue: "/project" }),
        metadata: expect.objectContaining({
            origin: VariableOrigin.SYSTEM_DEFINED,
            createdAt: expect.any(Number),
            modifiedAt: expect.any(Number)
        })
      }));
    });

    it('should handle home path option', async () => {
      const args = ['node', 'meld', 'test.mld', '--home-path', '/home'];
      await service.run(args);
      // const state = mockStateService.createChildState();
      const state = mockChildState; // Use the direct mock
      // Update to use setVariable with createPathVariable
      const homePathVar = createPathVariable('HOMEPATH', {
        contentType: PathContentType.FILESYSTEM,
        originalValue: "/home", 
        isValidSyntax: true, isSecure: true, isAbsolute: true, // Removed exists
        validatedPath: "/home" as any // Cast needed
      }, { origin: VariableOrigin.SYSTEM_DEFINED }); // Correct origin
       const tildePathVar = createPathVariable('~', {
        contentType: PathContentType.FILESYSTEM,
        originalValue: "/home", 
        isValidSyntax: true, isSecure: true, isAbsolute: true, // Removed exists
        validatedPath: "/home" as any // Cast needed
      }, { origin: VariableOrigin.SYSTEM_DEFINED }); // Correct origin
      
      // Use expect.objectContaining with expect.any(Number) for timestamps
      expect(state.setVariable).toHaveBeenCalledWith(expect.objectContaining({
          name: 'HOMEPATH',
          type: VariableType.PATH,
          value: expect.objectContaining({ originalValue: "/home" }),
          metadata: expect.objectContaining({
            origin: VariableOrigin.SYSTEM_DEFINED,
            createdAt: expect.any(Number),
            modifiedAt: expect.any(Number)
          })
      }));
      expect(state.setVariable).toHaveBeenCalledWith(expect.objectContaining({
          name: '~', // Use single quotes for consistency
          type: VariableType.PATH,
          value: expect.objectContaining({ originalValue: "/home" }),
          metadata: expect.objectContaining({
            origin: VariableOrigin.SYSTEM_DEFINED,
            createdAt: expect.any(Number),
            modifiedAt: expect.any(Number)
          })
      }));
    });

    it('should handle verbose option', async () => {
      const args = ['node', 'meld', 'test.mld', '--verbose'];
      await service.run(args);
      // Verify logging behavior if needed
    });
  });

  describe('File Handling', () => {
    it('should handle missing input files', async () => {
      mockFileSystemService.exists = vi.fn().mockResolvedValue(false);
      const args = ['node', 'meld', 'nonexistent.mld', '--stdout'];
      await expect(service.run(args)).rejects.toThrow('File not found');
    });

    it('should handle write errors', async () => {
      mockFileSystemService.writeFile = vi.fn().mockRejectedValue(new Error('Write error'));
      const args = ['node', 'meld', 'test.mld', '--output', 'output.md'];
      await expect(service.run(args)).rejects.toThrow('Write error');
    });

    it('should handle read errors', async () => {
      mockFileSystemService.readFile = vi.fn().mockRejectedValue(new Error('Read error'));
      const args = ['node', 'meld', 'test.mld', '--stdout'];
      await expect(service.run(args)).rejects.toThrow('Read error');
    });
  });

  describe('Error Handling', () => {
    it('should handle parser errors', async () => {
      mockParserService.parse = vi.fn().mockRejectedValue(new Error('Parse error'));
      const args = ['node', 'meld', 'test.mld', '--stdout'];
      await expect(service.run(args)).rejects.toThrow('Parse error');
    });

    it('should handle interpreter errors', async () => {
      mockInterpreterService.interpret = vi.fn().mockRejectedValue(new Error('Interpret error'));
      const args = ['node', 'meld', 'test.mld', '--stdout'];
      await expect(service.run(args)).rejects.toThrow('Interpret error');
    });

    it('should handle output conversion errors', async () => {
      mockOutputService.convert = vi.fn().mockRejectedValue(new Error('Convert error'));
      const args = ['node', 'meld', 'test.mld', '--stdout'];
      await expect(service.run(args)).rejects.toThrow('Convert error');
    });
  });

  describe('File Overwrite Handling', () => {
    it('should prompt for overwrite when file exists', async () => {
      // Setup file system mocks
      mockFileSystemService.exists = vi.fn().mockImplementation(async (path) => {
        return path === 'test.md' || path === 'test.mld';
      });
      mockFileSystemService.readFile = vi.fn().mockResolvedValue('test content');
      mockFileSystemService.writeFile = vi.fn().mockResolvedValue(undefined);
      
      const args = ['node', 'meld', 'test.mld', '--output', 'test.md'];
      
      // Mock the prompt service to return 'y'
      vi.mocked(mockPromptService.getText).mockResolvedValueOnce('y');
      
      await service.run(args);
      
      expect(mockPromptService.getText).toHaveBeenCalledWith(
        'File test.md already exists. Overwrite? [Y/n] ',
        'y'
      );
      
      // Verify the file was written after confirmation
      expect(mockFileSystemService.writeFile).toHaveBeenCalledWith(
        'test.md',
        'test output'
      );
    });

    it('should handle explicit output paths appropriately', async () => {
      // Create a mock input file path
      const inputPath = '/project/input.mld';
      
      // Mock the exists function to return true for the input path
      mockFileSystemService.exists = vi.fn().mockImplementation(async (path) => {
        return path === inputPath;
      });
      
      // Mock the readFile function to return content for the input path
      mockFileSystemService.readFile = vi.fn().mockResolvedValue('test content');
      
      // Mock the writeFile function
      mockFileSystemService.writeFile = vi.fn().mockResolvedValue(undefined);
      
      // Set up the args with an explicit output path
      const args = ['node', 'meld', inputPath, '--output', 'custom/output.md'];
      
      // Run the CLI with the explicit output path
      await service.run(args);
      
      // Verify the output was written to the correct path
      expect(mockFileSystemService.writeFile).toHaveBeenCalledWith(
        'custom/output.md',
        'test output'
      );
    });
  });

  /* // Temporarily comment out - relies on unsupported --content flag
  it('should handle parsing input content directly', async () => {
    const args = ['node', 'meld', '--content', '@text myvar=\"Hello Content\"', '--stdout'];
    mockStateService.getCurrentFilePath.mockReturnValue(undefined); // Indicate content mode
    await service.run(args);
    // Verify that interpret was called with the parsed content node(s)
    // This requires mocking the parser's behavior for the content string
    const parsedNode = { type: 'Directive', directive: { kind: 'text', identifier: 'myvar', value: 'Hello Content'} }; // Example node
    mockParserService.parse.mockResolvedValue([parsedNode]); // Assume parse returns an array

    expect(mockInterpreterService.interpret).toHaveBeenCalledWith([parsedNode], expect.any(Object), mockChildState);
    expect(mockOutputService.convert).toHaveBeenCalledWith(
      expect.any(Array),
      mockChildState, // Expect the child state to be passed
      'xml',
      expect.any(Object)
    );
  });
  */
}); 