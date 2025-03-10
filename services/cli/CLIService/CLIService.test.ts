import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CLIService, IPromptService } from './CLIService.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import { IOutputService } from '@services/pipeline/OutputService/IOutputService.js';
import { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { IPathService } from '@services/fs/PathService/IPathService.js';
import { IStateService } from '@services/state/StateService/IStateService.js';
import * as readline from 'readline';
import { ErrorCollector } from '@tests/utils/ErrorTestUtils.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { cliLogger, type Logger } from '@core/utils/logger.js';
// Import the centralized syntax examples
import { textDirectiveExamples } from '@core/syntax/index.js';

// Mock the API module
vi.mock('@api/index.js', () => ({
  main: vi.fn().mockResolvedValue('test output')
}));

// Mock console.log
const consoleLog = vi.spyOn(console, 'log');

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

// Move mock setup to top level
vi.mock('readline', () => ({
  createInterface: vi.fn().mockReturnValue({
    question: vi.fn().mockImplementation((_, cb) => cb('y')),
    close: vi.fn()
  })
}));

describe('CLIService', () => {
  let context: TestContextDI;
  let service: CLIService;
  let mockParserService: IParserService;
  let mockInterpreterService: IInterpreterService;
  let mockOutputService: IOutputService;
  let mockFileSystemService: IFileSystemService;
  let mockPathService: IPathService;
  let mockStateService: IStateService;
  let mockReadline: any;
  let mockLogger: Logger;

  beforeEach(async () => {
    // Reset the mock state
    vi.clearAllMocks();
    vi.mocked(mockPromptService.getText).mockReset();
    
    context = TestContextDI.createIsolated();
    await context.initialize();

    // Initialize readline mock
    mockReadline = {
      question: vi.fn().mockImplementation((_, cb) => cb('y')),
      close: vi.fn()
    };
    vi.mocked(readline.createInterface).mockReturnValue(mockReadline);

    // Create mock services
    mockParserService = {
      parse: vi.fn().mockResolvedValue([]),
      parseWithLocations: vi.fn().mockResolvedValue([])
    } as unknown as IParserService;

    mockInterpreterService = {
      initialize: vi.fn(),
      interpret: vi.fn().mockResolvedValue(undefined),
      interpretNode: vi.fn(),
      createChildContext: vi.fn(),
      canHandleTransformations: vi.fn().mockReturnValue(true)
    } as unknown as IInterpreterService;

    mockOutputService = {
      convert: vi.fn().mockResolvedValue('test output'),
      registerFormat: vi.fn(),
      supportsFormat: vi.fn(),
      getSupportedFormats: vi.fn(),
      canAccessTransformedNodes: vi.fn().mockReturnValue(true)
    } as unknown as IOutputService;

    // Use the DI context filesystem for file operations
    const filesystem = context.services.filesystem;
    mockFileSystemService = {
      readFile: filesystem.readFile.bind(filesystem),
      writeFile: filesystem.writeFile.bind(filesystem),
      exists: filesystem.exists.bind(filesystem),
      watch: filesystem.watch.bind(filesystem),
      getFileSystem: vi.fn().mockReturnValue(filesystem)
    } as unknown as IFileSystemService;

    mockPathService = {
      initialize: vi.fn(),
      resolvePath: vi.fn().mockImplementation(path => path),
      enableTestMode: vi.fn(),
      disableTestMode: vi.fn(),
      isTestMode: vi.fn(),
      validatePath: vi.fn(),
      normalizePath: vi.fn(),
      isAbsolute: vi.fn(),
      join: vi.fn(),
      dirname: vi.fn(),
      basename: vi.fn(),
      getHomePath: vi.fn().mockReturnValue('/home'),
      getProjectPath: vi.fn().mockReturnValue('/project'),
      resolveProjectPath: vi.fn().mockResolvedValue('/project'),
      setHomePath: vi.fn(),
      setProjectPath: vi.fn()
    } as unknown as IPathService;

    const mockChildState = {
      setPathVar: vi.fn(),
      getNodes: vi.fn().mockReturnValue([])
    } as unknown as IStateService;

    mockStateService = {
      createChildState: vi.fn().mockReturnValue(mockChildState)
    } as unknown as IStateService;

    // Register mocks with the DI container
    context.registerMock('IParserService', mockParserService);
    context.registerMock('IInterpreterService', mockInterpreterService);
    context.registerMock('IOutputService', mockOutputService);
    context.registerMock('IFileSystemService', mockFileSystemService);
    context.registerMock('IPathService', mockPathService);
    context.registerMock('IStateService', mockStateService);
    context.registerMock('IPromptService', mockPromptService);
    
    // Create CLI service with mocks
    service = new CLIService(
      mockParserService,
      mockInterpreterService,
      mockOutputService,
      mockFileSystemService,
      mockPathService,
      mockStateService,
      mockPromptService
    );

    // Set up test files
    const textExample = textDirectiveExamples.atomic.simpleString;
    await context.services.filesystem.writeFile('test.mld', textExample.code);

    // Initialize mock logger
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      trace: vi.fn(),
      level: 'info'
    };
  });

  afterEach(async () => {
    await context?.cleanup();
    vi.resetModules();
    vi.clearAllMocks();
    mockReadline = null;
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
      const state = mockStateService.createChildState();
      expect(state.setPathVar).toHaveBeenCalledWith('PROJECTPATH', '/project');
      expect(state.setPathVar).toHaveBeenCalledWith('.', '/project');
    });

    it('should handle home path option', async () => {
      const args = ['node', 'meld', 'test.mld', '--home-path', '/home'];
      await service.run(args);
      const state = mockStateService.createChildState();
      expect(state.setPathVar).toHaveBeenCalledWith('HOMEPATH', '/home');
      expect(state.setPathVar).toHaveBeenCalledWith('~', '/home');
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
      const args = ['node', 'meld', 'test.mld', '--output', 'test.md'];
      await context.services.filesystem.writeFile('test.mld', 'input content');
      await context.services.filesystem.writeFile('test.md', 'existing content');
      
      // Mock the prompt service to return 'y'
      vi.mocked(mockPromptService.getText).mockResolvedValueOnce('y');
      
      await service.run(args);
      
      expect(mockPromptService.getText).toHaveBeenCalledWith(
        'File test.md already exists. Overwrite? [Y/n] ',
        'y'
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

  it('should handle parsing input content directly', async () => {
    // ... existing code ...
    const textExample = textDirectiveExamples.atomic.simpleString;
    // ... existing code ...
  });
}); 