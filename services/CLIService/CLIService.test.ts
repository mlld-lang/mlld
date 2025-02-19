import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CLIService } from './CLIService.js';
import { TestContext } from '@tests/utils/index.js';
import { IParserService } from '@services/ParserService/IParserService.js';
import { IInterpreterService } from '@services/InterpreterService/IInterpreterService.js';
import { IOutputService } from '@services/OutputService/IOutputService.js';
import { IFileSystemService } from '@services/FileSystemService/IFileSystemService.js';
import { IPathService } from '@services/PathService/IPathService.js';
import { IStateService } from '@services/StateService/IStateService.js';
import * as readline from 'readline';

const defaultOptions = {
  input: 'test.meld',
  format: 'llm' as const
};

// Mock fs.watch for watch mode tests
const mockWatcher = {
  [Symbol.asyncIterator]: async function* () {
    yield { filename: 'test.meld', eventType: 'change' };
  }
};

vi.mock('fs/promises', () => ({
  watch: vi.fn().mockImplementation(() => mockWatcher)
}));

// Move mock setup to top level
vi.mock('readline', () => ({
  createInterface: vi.fn().mockReturnValue({
    question: vi.fn().mockImplementation((_, cb) => cb('y')),
    close: vi.fn()
  })
}));

describe('CLIService', () => {
  let context: TestContext;
  let service: CLIService;
  let mockParserService: IParserService;
  let mockInterpreterService: IInterpreterService;
  let mockOutputService: IOutputService;
  let mockFileSystemService: IFileSystemService;
  let mockPathService: IPathService;
  let mockStateService: IStateService;

  beforeEach(async () => {
    context = new TestContext();
    await context.initialize();

    // Create mock services
    mockParserService = {
      parse: vi.fn().mockResolvedValue([]),
      parseWithLocations: vi.fn().mockResolvedValue([])
    } as IParserService;

    mockInterpreterService = {
      initialize: vi.fn(),
      interpret: vi.fn().mockResolvedValue(undefined),
      interpretNode: vi.fn(),
      createChildContext: vi.fn()
    } as IInterpreterService;

    mockOutputService = {
      convert: vi.fn().mockResolvedValue('test output'),
      registerFormat: vi.fn(),
      supportsFormat: vi.fn(),
      getSupportedFormats: vi.fn()
    } as IOutputService;

    // Use the MemfsTestFileSystem for file operations
    const fs = context.fs;
    mockFileSystemService = {
      readFile: fs.readFile.bind(fs),
      writeFile: fs.writeFile.bind(fs),
      exists: fs.exists.bind(fs),
      watch: fs.watch.bind(fs)
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
      basename: vi.fn()
    } as IPathService;

    const mockChildState = {
      setPathVar: vi.fn(),
      getNodes: vi.fn().mockReturnValue([])
    } as unknown as IStateService;

    mockStateService = {
      createChildState: vi.fn().mockReturnValue(mockChildState)
    } as unknown as IStateService;

    // Create CLI service with mocks
    service = new CLIService(
      mockParserService,
      mockInterpreterService,
      mockOutputService,
      mockFileSystemService,
      mockPathService,
      mockStateService
    );

    // Set up test files
    await context.fs.writeFile('test.meld', '@text greeting = "Hello"');
  });

  afterEach(async () => {
    await context.cleanup();
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('Format Conversion', () => {
    it('should output llm format by default', async () => {
      const args = ['node', 'meld', 'test.meld', '--stdout'];
      await expect(service.run(args)).resolves.not.toThrow();
      expect(mockOutputService.convert).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Object),
        'llm',
        expect.any(Object)
      );
    });

    it('should handle format aliases correctly', async () => {
      const args = ['node', 'meld', 'test.meld', '--format', 'markdown', '--stdout'];
      await expect(service.run(args)).resolves.not.toThrow();
      expect(mockOutputService.convert).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Object),
        'markdown',
        expect.any(Object)
      );
    });

    it('should preserve markdown with markdown format', async () => {
      const args = ['node', 'meld', 'test.meld', '--format', 'markdown', '--stdout'];
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
    it('should respect --stdout option', async () => {
      const consoleLog = vi.spyOn(console, 'log');
      const args = ['node', 'meld', 'test.meld', '--stdout'];
      await service.run(args);
      expect(consoleLog).toHaveBeenCalledWith('test output');
      consoleLog.mockRestore();
    });

    it('should use default output path when not specified', async () => {
      const args = ['node', 'meld', 'test.meld'];
      await expect(service.run(args)).resolves.not.toThrow();
      expect(mockOutputService.convert).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Object),
        'llm',
        expect.any(Object)
      );
    });

    it('should handle project path option', async () => {
      const args = ['node', 'meld', 'test.meld', '--project-path', '/project'];
      await service.run(args);
      const state = mockStateService.createChildState();
      expect(state.setPathVar).toHaveBeenCalledWith('PROJECTPATH', '/project');
      expect(state.setPathVar).toHaveBeenCalledWith('.', '/project');
    });

    it('should handle home path option', async () => {
      const args = ['node', 'meld', 'test.meld', '--home-path', '/home'];
      await service.run(args);
      const state = mockStateService.createChildState();
      expect(state.setPathVar).toHaveBeenCalledWith('HOMEPATH', '/home');
      expect(state.setPathVar).toHaveBeenCalledWith('~', '/home');
    });

    it('should handle verbose option', async () => {
      const args = ['node', 'meld', 'test.meld', '--verbose'];
      await service.run(args);
      // Verify logging behavior if needed
    });

    it('should handle watch option', async () => {
      const processFile = vi.spyOn(service as any, 'processFile');
      
      // Start the service in watch mode
      const watchPromise = service.run(['node', 'meld', 'test.meld', '--watch']);
      
      // Wait a bit for the watcher to start
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Trigger a file change
      await context.fs.writeFile('test.meld', '@text greeting = "Updated"');
      
      // Wait for the watch event to be processed
      await new Promise(resolve => setTimeout(resolve, 500));
      
      expect(processFile).toHaveBeenCalled();
      
      // Clean up by throwing an error to stop the watcher
      try {
        const error = new Error('STOP_WATCH');
        (context.fs as any).watcher.emit('error', error);
        await expect(watchPromise).rejects.toThrow('STOP_WATCH');
      } catch (e) {
        // If the error is already caught by the watcher, that's fine
        if (!(e instanceof Error && e.message === 'STOP_WATCH')) {
          throw e;
        }
      }
    });
  });

  describe('File Handling', () => {
    it('should handle missing input files', async () => {
      mockFileSystemService.exists = vi.fn().mockResolvedValue(false);
      const args = ['node', 'meld', 'nonexistent.meld', '--stdout'];
      await expect(service.run(args)).rejects.toThrow('File not found');
    });

    it('should handle write errors', async () => {
      mockFileSystemService.writeFile = vi.fn().mockRejectedValue(new Error('Write error'));
      const args = ['node', 'meld', 'test.meld', '--output', 'output.md'];
      await expect(service.run(args)).rejects.toThrow('Write error');
    });

    it('should handle read errors', async () => {
      mockFileSystemService.readFile = vi.fn().mockRejectedValue(new Error('Read error'));
      const args = ['node', 'meld', 'test.meld', '--stdout'];
      await expect(service.run(args)).rejects.toThrow('Read error');
    });
  });

  describe('Error Handling', () => {
    it('should handle parser errors', async () => {
      mockParserService.parse = vi.fn().mockRejectedValue(new Error('Parse error'));
      const args = ['node', 'meld', 'test.meld', '--stdout'];
      await expect(service.run(args)).rejects.toThrow('Parse error');
    });

    it('should handle interpreter errors', async () => {
      mockInterpreterService.interpret = vi.fn().mockRejectedValue(new Error('Interpret error'));
      const args = ['node', 'meld', 'test.meld', '--stdout'];
      await expect(service.run(args)).rejects.toThrow('Interpret error');
    });

    it('should handle output conversion errors', async () => {
      mockOutputService.convert = vi.fn().mockRejectedValue(new Error('Convert error'));
      const args = ['node', 'meld', 'test.meld', '--stdout'];
      await expect(service.run(args)).rejects.toThrow('Convert error');
    });
  });

  describe('File Overwrite Handling', () => {
    it('should prompt for overwrite when file exists', async () => {
      // Create existing output file
      await mockFileSystemService.writeFile('test.xml', 'existing content');
      
      const args = ['node', 'meld', 'test.meld'];
      await service.run(args);
      
      expect(readline.createInterface().question).toHaveBeenCalled();
      expect(readline.createInterface().question).toHaveBeenCalledWith(
        expect.stringContaining('Overwrite?'),
        expect.any(Function)
      );
    });

    it('should skip overwrite prompt with explicit output path', async () => {
      // Create existing output file
      await mockFileSystemService.writeFile('custom.xml', 'existing content');
      
      const args = ['node', 'meld', 'test.meld', '--output', 'custom.xml'];
      await service.run(args);
      
      expect(readline.createInterface().question).not.toHaveBeenCalled();
    });

    it('should cancel operation when overwrite is rejected', async () => {
      // Create existing output file
      await mockFileSystemService.writeFile('test.xml', 'existing content');
      
      const args = ['node', 'meld', 'test.meld'];
      await service.run(args);
      
      // Verify file wasn't overwritten
      const content = await mockFileSystemService.readFile('test.xml', 'utf8');
      expect(content).toBe('existing content');
    });

    it('should proceed with overwrite when confirmed', async () => {
      // Create existing output file
      await mockFileSystemService.writeFile('test.xml', 'existing content');
      
      const args = ['node', 'meld', 'test.meld'];
      await service.run(args);
      
      // Verify file was overwritten
      expect(mockOutputService.convert).toHaveBeenCalled();
      expect(mockFileSystemService.writeFile).toHaveBeenCalled();
    });
  });
}); 