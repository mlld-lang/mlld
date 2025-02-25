import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { main } from './index.js';
import { TestContext } from '@tests/utils/TestContext.js';
import { MemfsTestFileSystemAdapter } from '@tests/utils/MemfsTestFileSystemAdapter.js';
import { FileSystemService } from '@services/fs/FileSystemService/FileSystemService.js';
import { PathService } from '@services/fs/PathService/PathService.js';
import { PathOperationsService } from '@services/fs/FileSystemService/PathOperationsService.js';
import { ParserService } from '@services/pipeline/ParserService/ParserService.js';
import { OutputService } from '@services/pipeline/OutputService/OutputService.js';
import { InterpreterService } from '@services/pipeline/InterpreterService/InterpreterService.js';
import { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService.js';
import { StateService } from '@services/state/StateService/StateService.js';
import { ValidationService } from '@services/resolution/ValidationService/ValidationService.js';
import { CircularityService } from '@services/resolution/CircularityService/CircularityService.js';
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService.js';
import * as readline from 'readline';
import { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';

// Add module mock before describe block
vi.mock('readline', () => ({
  createInterface: vi.fn()
}));

describe.skip('CLI Integration Tests', () => {
  let context: TestContext;
  let originalArgv: string[];
  let originalNodeEnv: string | undefined;
  let fsAdapter: MemfsTestFileSystemAdapter;
  let pathService: PathService;
  let mockFileSystemService: IFileSystemService;

  beforeEach(async () => {
    context = new TestContext();
    await context.initialize();
    originalArgv = process.argv;
    originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    fsAdapter = new MemfsTestFileSystemAdapter(context.fs);
    
    // Set up PathService for testing
    pathService = new PathService();
    pathService.enableTestMode();
    pathService.setProjectPath('/project');
    
    // Set up mock filesystem service
    const fs = context.fs;
    mockFileSystemService = {
      readFile: fs.readFile.bind(fs),
      writeFile: fs.writeFile.bind(fs),
      exists: fs.exists.bind(fs),
      watch: fs.watch.bind(fs),
      executeCommand: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
      setFileSystem: vi.fn(),
      ensureDir: vi.fn(),
      getCwd: () => '/project'
    } as unknown as IFileSystemService;

    pathService.initialize(mockFileSystemService);

    // Create test files
    await context.fs.writeFile('/project/test.meld', '@text greeting = "Hello"');
    
    // Set up process.argv for most tests
    process.argv = ['node', 'meld', '$./test.meld', '--stdout'];

    // Initialize services
    const interpreterService = new InterpreterService();
    const directiveService = new DirectiveService();
    const stateService = new StateService();
    const validationService = new ValidationService();
    const circularityService = new CircularityService();
    const resolutionService = new ResolutionService(stateService, mockFileSystemService, context.services.parser);

    // Initialize directive service
    directiveService.initialize(
      validationService,
      stateService,
      pathService,
      mockFileSystemService,
      context.services.parser,
      interpreterService,
      circularityService,
      resolutionService
    );

    // Initialize interpreter service
    interpreterService.initialize(directiveService, stateService);
  });

  afterEach(async () => {
    await context.cleanup();
    process.argv = originalArgv;
    process.env.NODE_ENV = originalNodeEnv;
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('Fatal Errors', () => {
    it('should halt on missing referenced files', async () => {
      await context.fs.writeFile('/project/test.meld', '@embed [$./nonexistent.md]');
      await expect(main(fsAdapter)).rejects.toThrow('Embed file not found: nonexistent.md');
    });

    it('should halt on invalid syntax', async () => {
      await context.fs.writeFile('/project/test.meld', '@text = invalid syntax');
      await expect(main(fsAdapter)).rejects.toThrow(/Parse error/);
    });

    it('should halt on circular imports', async () => {
      await context.fs.writeFile('/project/a.meld', '@import [$./b.meld]');
      await context.fs.writeFile('/project/b.meld', '@import [$./a.meld]');
      process.argv = ['node', 'meld', '$./a.meld', '--stdout'];
      await expect(main(fsAdapter)).rejects.toThrow('Import directive requires a path');
    });

    it('should halt on type mismatches', async () => {
      await context.fs.writeFile('/project/test.meld', '@path wrongtype = "$INVALID/path"');
      await expect(main(fsAdapter)).rejects.toThrow('Path value must start with $HOMEPATH, $~, $PROJECTPATH, or $.');
    });
  });

  describe('Warning Errors', () => {
    it.todo('should handle missing data fields appropriately (pending new error system)');

    it.todo('should handle missing env vars appropriately (pending new error system)');
  });

  describe('Silent Operation', () => {
    // TODO: These tests will be updated as part of the error handling overhaul
    // See dev/ERRORS.md - tests will be updated to handle both strict/permissive modes
    it.todo('should not warn on expected stderr from commands');
    it.todo('should handle type coercion silently');
  });

  describe('Basic Functionality', () => {
    it('should process a simple meld file', async () => {
      await expect(main(fsAdapter)).resolves.not.toThrow();
    });

    it('should handle format aliases correctly', async () => {
      process.argv = ['node', 'meld', '$./test.meld', '--format', 'md', '--stdout'];
      await expect(main(fsAdapter)).resolves.not.toThrow();
    });

    it('should preserve markdown with md format', async () => {
      await context.fs.writeFile('/project/test.meld', '# Heading\n@text greeting = "Hello"');
      process.argv = ['node', 'meld', '$./test.meld', '--format', 'md', '--stdout'];
      await expect(main(fsAdapter)).resolves.not.toThrow();
    });
  });

  // New test coverage for missing requirements
  describe('@embed directive', () => {
    // TODO: These tests will be updated as part of the error handling overhaul
    // See dev/ERRORS.md - will be reclassified as recoverable errors
    it.todo('should handle section extraction');
    it.todo('should handle header text');
  });

  describe('@define directive', () => {
    // TODO: These tests will be updated as part of the error handling overhaul
    // See dev/ERRORS.md - will be reclassified as fatal errors with improved messaging
    it.todo('should handle command parameters');
    it.todo('should handle multiple parameters');
    it.todo('should validate parameter count');
  });

  describe('@path directive', () => {
    // These tests have been updated as part of the path structure integration
    it('should handle special variables', async () => {
      const ctx = new TestContext();
      
      // Set up the state service with path variables
      ctx.stateService.setPathVar('PROJECTPATH', '/project');
      ctx.stateService.setPathVar('HOMEPATH', '/home/user');
      
      // Create test file with special path variables
      await ctx.fs.writeFile('/project/test.meld', `
        @path homePath = "$HOMEPATH/test.txt"
        @path projectPath = "$PROJECTPATH/test.txt"
        @path tildePath = "$~/other.txt"
        @path dotPath = "$./other.txt"
      `);
      
      // Parse and interpret
      const nodes = await ctx.parserService.parseWithLocations('/project/test.meld');
      await ctx.interpreterService.interpret(nodes, {
        currentFilePath: '/project/test.meld'
      });
      
      // Check if special variables are correctly resolved
      const homePath = ctx.stateService.getPathVar('homePath');
      const projectPath = ctx.stateService.getPathVar('projectPath');
      const tildePath = ctx.stateService.getPathVar('tildePath');
      const dotPath = ctx.stateService.getPathVar('dotPath');
      
      // For structured paths, check the normalized value
      if (typeof homePath === 'object' && 'normalized' in homePath) {
        expect(homePath.normalized).toBe('/home/user/test.txt');
        expect(homePath.structured.base).toBe('HOMEPATH');
      } else {
        expect(homePath).toBe('/home/user/test.txt');
      }
      
      if (typeof projectPath === 'object' && 'normalized' in projectPath) {
        expect(projectPath.normalized).toBe('/project/test.txt');
        expect(projectPath.structured.base).toBe('PROJECTPATH');
      } else {
        expect(projectPath).toBe('/project/test.txt');
      }
      
      if (typeof tildePath === 'object' && 'normalized' in tildePath) {
        expect(tildePath.normalized).toBe('/home/user/other.txt');
        expect(tildePath.structured.base).toBe('HOMEPATH');
      } else {
        expect(tildePath).toBe('/home/user/other.txt');
      }
      
      if (typeof dotPath === 'object' && 'normalized' in dotPath) {
        expect(dotPath.normalized).toBe('/project/other.txt');
        expect(dotPath.structured.base).toBe('PROJECTPATH');
      } else {
        expect(dotPath).toBe('/project/other.txt');
      }
    });
    
    it('should reject invalid path variables', async () => {
      const ctx = new TestContext();
      
      // Set up the state service with path variables
      ctx.stateService.setPathVar('PROJECTPATH', '/project');
      ctx.stateService.setPathVar('HOMEPATH', '/home/user');
      
      // Create test file with invalid path variable
      await ctx.fs.writeFile('/project/test.meld', `
        @path invalidPath = "relative/path"
      `);
      
      // Parse and interpret
      const nodes = await ctx.parserService.parseWithLocations('/project/test.meld');
      
      // Should throw an error for invalid path
      await expect(
        ctx.interpreterService.interpret(nodes, {
          currentFilePath: '/project/test.meld'
        })
      ).rejects.toThrow(/path must be absolute/i);
    });
    
    it('should reject paths with directory traversal', async () => {
      const ctx = new TestContext();
      
      // Set up the state service with path variables
      ctx.stateService.setPathVar('PROJECTPATH', '/project');
      ctx.stateService.setPathVar('HOMEPATH', '/home/user');
      
      // Create test file with directory traversal
      await ctx.fs.writeFile('/project/test.meld', `
        @path traversalPath = "$PROJECTPATH/../etc/passwd"
      `);
      
      // Parse and interpret
      const nodes = await ctx.parserService.parseWithLocations('/project/test.meld');
      
      // Should throw an error for directory traversal
      await expect(
        ctx.interpreterService.interpret(nodes, {
          currentFilePath: '/project/test.meld'
        })
      ).rejects.toThrow(/path must start with/i);
    });
  });

  describe('Code Fences', () => {
    // TODO: These tests will be updated as part of the error handling overhaul
    // See dev/ERRORS.md - will be reclassified as fatal parse errors
    it.todo('should handle nested code fences with different backtick counts');
    it.todo('should preserve language identifiers');
    it.todo('should preserve whitespace exactly');
    it.todo('should treat directives as literal text inside fences');
  });

  describe('Variable Types', () => {
    it('should handle data to text conversion', async () => {
      await context.fs.writeFile('/project/test.meld', `
@data config = { "name": "test", "version": 1 }
@text simple = "Name: #{config.name}"
@text object = "Config: #{config}"
      `);
      process.argv = ['node', 'meld', '$./test.meld', '--stdout'];
      await expect(main(fsAdapter)).resolves.not.toThrow();
    });

    it('should handle text variables in data contexts', async () => {
      await context.fs.writeFile('/project/test.meld', `
@text name = "Alice"
@text key = "username"
@data user = {
  "#{key}": "#{name}",
  "settings": {
    "displayName": "#{name}"
  }
}
      `);
      process.argv = ['node', 'meld', '$./test.meld', '--stdout'];
      await expect(main(fsAdapter)).resolves.not.toThrow();
    });
  });

  describe('Field Access', () => {
    // TODO: These tests will be updated as part of the error handling overhaul
    // See dev/ERRORS.md - will be reclassified as recoverable errors
    it.todo('should restrict field access to data variables only');
  });

  describe('CLI Output Handling', () => {
    // TODO: These tests will be updated as part of the error handling overhaul
    // See dev/ERRORS.md - will be reclassified as recoverable errors with improved UX
    it.todo('should respect custom output path');
    it.todo('should cancel operation when overwrite is rejected');

    it('should output to stdout when --stdout flag is used', async () => {
      process.argv = ['node', 'meld', '$./test.meld', '--stdout'];
      const consoleSpy = vi.spyOn(console, 'log');
      await main(fsAdapter);
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should generate correct output file with default format', async () => {
      process.argv = ['node', 'meld', '$./test.meld'];
      await main(fsAdapter);
      expect(await fsAdapter.exists('/project/test.xml')).toBe(true);
    });

    it('should prompt for overwrite without --output flag', async () => {
      // Create existing output file
      await fsAdapter.writeFile('/project/test.xml', 'existing content');
      
      // Mock readline interface
      const mockRL = {
        question: vi.fn((_, cb) => cb('y')),
        close: vi.fn()
      };
      vi.spyOn(readline, 'createInterface').mockReturnValue(mockRL as any);

      process.argv = ['node', 'meld', '$./test.meld'];
      await main(fsAdapter);
      
      expect(mockRL.question).toHaveBeenCalled();
    });

    it('should skip overwrite prompt with --output flag', async () => {
      // Create existing output file
      await fsAdapter.writeFile('custom.xml', 'existing content');
      
      const mockRL = {
        question: vi.fn(),
        close: vi.fn()
      };
      vi.spyOn(readline, 'createInterface').mockReturnValue(mockRL as any);

      process.argv = ['node', 'meld', '$./test.meld', '--output', 'custom.xml'];
      await main(fsAdapter);
      
      expect(mockRL.question).not.toHaveBeenCalled();
    });

    it('should respect format option', async () => {
      process.argv = ['node', 'meld', '$./test.meld', '--format', 'md'];
      await main(fsAdapter);
      expect(await fsAdapter.exists('/project/test.md')).toBe(true);
    });
  });
}); 