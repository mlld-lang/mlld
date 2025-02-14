import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CLIService } from './CLIService';
import { TestContext } from '../../tests/utils';
import { IParserService } from '../ParserService/IParserService';
import { IInterpreterService } from '../InterpreterService/IInterpreterService';
import { IOutputService } from '../OutputService/IOutputService';
import { IFileSystemService } from '../FileSystemService/IFileSystemService';
import { IPathService } from '../PathService/IPathService';
import { IStateService } from '../StateService/IStateService';

describe('CLIService', () => {
  let context: TestContext;
  let cliService: CLIService;
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
    };

    mockInterpreterService = {
      interpret: vi.fn().mockResolvedValue(undefined)
    };

    mockOutputService = {
      convert: vi.fn().mockResolvedValue('test output')
    };

    mockFileSystemService = {
      readFile: vi.fn().mockResolvedValue('test content'),
      writeFile: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn().mockResolvedValue(true)
    };

    mockPathService = {
      resolvePath: vi.fn().mockImplementation(path => path)
    };

    mockStateService = {
      createState: vi.fn().mockReturnValue({}),
      createChildState: vi.fn().mockReturnValue({}),
      mergeStates: vi.fn().mockResolvedValue(undefined)
    };

    // Create CLI service with mocks
    cliService = new CLIService(
      mockParserService,
      mockInterpreterService,
      mockOutputService,
      mockFileSystemService,
      mockPathService,
      mockStateService
    );

    // Set up test files
    await context.writeFile('test.meld', '@text greeting = "Hello"');
  });

  afterEach(async () => {
    await context.cleanup();
    vi.resetAllMocks();
  });

  describe('Format Conversion', () => {
    it('should output llm format by default', async () => {
      const args = ['node', 'meld', 'test.meld', '--stdout'];
      await expect(cliService.run(args)).resolves.not.toThrow();
      expect(mockOutputService.convert).toHaveBeenCalledWith(expect.any(Object), { format: 'llm' });
    });

    it('should handle format aliases correctly', async () => {
      const args = ['node', 'meld', 'test.meld', '--format', 'md', '--stdout'];
      await expect(cliService.run(args)).resolves.not.toThrow();
      expect(mockOutputService.convert).toHaveBeenCalledWith(expect.any(Object), { format: 'md' });
    });

    it('should preserve markdown with md format', async () => {
      const args = ['node', 'meld', 'test.meld', '--format', 'md', '--stdout'];
      await expect(cliService.run(args)).resolves.not.toThrow();
      expect(mockOutputService.convert).toHaveBeenCalledWith(expect.any(Object), { format: 'md' });
    });
  });

  describe('Command Line Options', () => {
    it('should respect --stdout option', async () => {
      const consoleLog = vi.spyOn(console, 'log');
      const args = ['node', 'meld', 'test.meld', '--stdout'];
      await cliService.run(args);
      expect(consoleLog).toHaveBeenCalledWith('test output');
      consoleLog.mockRestore();
    });

    it('should use default output path when not specified', async () => {
      const args = ['node', 'meld', 'test.meld'];
      await expect(cliService.run(args)).resolves.not.toThrow();
      expect(mockOutputService.convert).toHaveBeenCalledWith(expect.any(Object), { format: 'llm' });
    });

    it('should handle multiple format options correctly', async () => {
      const args = ['node', 'meld', 'test.meld', '--format', 'md,llm', '--stdout'];
      await expect(cliService.run(args)).rejects.toThrow('Format must be either "md" or "llm"');
    });
  });

  describe('File Handling', () => {
    it('should handle missing input files', async () => {
      mockFileSystemService.exists = vi.fn().mockResolvedValue(false);
      const args = ['node', 'meld', 'nonexistent.meld', '--stdout'];
      await expect(cliService.run(args)).rejects.toThrow('File not found');
    });

    it('should handle write errors', async () => {
      mockFileSystemService.writeFile = vi.fn().mockRejectedValue(new Error('Write error'));
      const args = ['node', 'meld', 'test.meld', '--output', 'output.md'];
      await expect(cliService.run(args)).rejects.toThrow('Write error');
    });
  });
}); 