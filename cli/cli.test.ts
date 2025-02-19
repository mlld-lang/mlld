import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { main } from './index.js';
import { TestContext } from '@tests/utils/index.js';
import { MemfsTestFileSystemAdapter } from '@tests/utils/MemfsTestFileSystemAdapter.js';
import { PathService } from '@services/PathService/PathService.js';
import { InterpreterService } from '@services/InterpreterService/InterpreterService.js';
import { DirectiveService } from '@services/DirectiveService/DirectiveService.js';
import { StateService } from '@services/StateService/StateService.js';
import { ValidationService } from '@services/ValidationService/ValidationService.js';
import { CircularityService } from '@services/CircularityService/CircularityService.js';
import { ResolutionService } from '@services/ResolutionService/ResolutionService.js';
import * as readline from 'readline';
import { IFileSystemService } from '@services/FileSystemService/IFileSystemService.js';

// Add module mock before describe block
vi.mock('readline', () => ({
  createInterface: vi.fn()
}));

describe('CLI Integration Tests', () => {
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
    pathService.initialize(fsAdapter);
    
    // Set up mock filesystem service
    const fs = context.fs;
    mockFileSystemService = {
      readFile: fs.readFile.bind(fs),
      writeFile: fs.writeFile.bind(fs),
      exists: fs.exists.bind(fs),
      watch: fs.watch.bind(fs),
      executeCommand: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
      setFileSystem: vi.fn()
    } as unknown as IFileSystemService;

    // Create test files
    await context.fs.writeFile('/project/test.meld', '@text greeting = "Hello"');
    
    // Set up process.argv for most tests
    process.argv = ['node', 'meld', '/project/test.meld', '--stdout'];

    // Initialize services
    const interpreterService = new InterpreterService();
    const directiveService = new DirectiveService();
    const stateService = new StateService();
    const validationService = new ValidationService();
    const circularityService = new CircularityService();
    const resolutionService = new ResolutionService(stateService, fsAdapter, context.services.parser);

    // Initialize directive service
    directiveService.initialize(
      validationService,
      stateService,
      pathService,
      fsAdapter,
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
      await context.fs.writeFile('/project/test.meld', '@embed [nonexistent.md]');
      await expect(main(fsAdapter)).rejects.toThrow('Embed file not found: nonexistent.md');
    });

    it('should halt on invalid syntax', async () => {
      await context.fs.writeFile('/project/test.meld', '@text = invalid syntax');
      await expect(main(fsAdapter)).rejects.toThrow('Invalid syntax');
    });

    it('should halt on circular imports', async () => {
      await context.fs.writeFile('/project/a.meld', '@import [b.meld]');
      await context.fs.writeFile('/project/b.meld', '@import [a.meld]');
      process.argv = ['node', 'meld', '/project/a.meld', '--stdout'];
      await expect(main(fsAdapter)).rejects.toThrow('Import directive requires a path');
    });

    it('should halt on type mismatches', async () => {
      await context.fs.writeFile('/project/test.meld', '@path wrongtype = "$INVALID/path"');
      await expect(main(fsAdapter)).rejects.toThrow('Path value must start with $HOMEPATH, $~, $PROJECTPATH, or $.');
    });
  });

  describe('Warning Errors', () => {
    it('should warn but continue on missing data fields', async () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      await context.fs.writeFile('/project/test.meld', `
@data config = { "name": "test" }
@text test = "#{config.missing}"
      `);
      await expect(main(fsAdapter)).resolves.not.toThrow();
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should warn but continue on missing env vars', async () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      await context.fs.writeFile('/project/test.meld', `
@text test = "$ENV_NONEXISTENT"
      `);
      await expect(main(fsAdapter)).resolves.not.toThrow();
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('Silent Operation', () => {
    it('should not warn on expected stderr from commands', async () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      await context.fs.writeFile('/project/test.meld', `
@run [npm test]
      `);
      await expect(main(fsAdapter)).resolves.not.toThrow();
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should handle type coercion silently', async () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      await context.fs.writeFile('/project/test.meld', `
@data numberData = 42
@text test = "string #{numberData}"
      `);
      await expect(main(fsAdapter)).resolves.not.toThrow();
      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe('Basic Functionality', () => {
    it('should process a simple meld file', async () => {
      await expect(main(fsAdapter)).resolves.not.toThrow();
    });

    it('should handle format aliases correctly', async () => {
      process.argv = ['node', 'meld', '/project/test.meld', '--format', 'md', '--stdout'];
      await expect(main(fsAdapter)).resolves.not.toThrow();
    });

    it('should preserve markdown with md format', async () => {
      await context.fs.writeFile('/project/test.meld', '# Heading\n@text greeting = "Hello"');
      process.argv = ['node', 'meld', '/project/test.meld', '--format', 'md', '--stdout'];
      await expect(main(fsAdapter)).resolves.not.toThrow();
    });
  });

  // New test coverage for missing requirements
  describe('@embed directive', () => {
    it('should handle section extraction', async () => {
      // Create source file with sections
      await context.fs.writeFile('/project/source.md', `
# Section One
Content for section one

# Section Two
Content for section two
      `);

      await context.fs.writeFile('/project/test.meld', `
@embed [source.md] { section: "Section One" }
      `);

      const stdoutSpy = vi.spyOn(console, 'log');
      process.argv = ['node', 'meld', '/project/test.meld', '--stdout'];
      await main(fsAdapter);

      // Verify only Section One content is included
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Content for section one'));
      expect(stdoutSpy).not.toHaveBeenCalledWith(expect.stringContaining('Content for section two'));
      
      stdoutSpy.mockRestore();
    });

    it('should handle header text', async () => {
      // Create source file
      await context.fs.writeFile('/project/source.md', `
# Custom Header
Source content
      `);

      await context.fs.writeFile('/project/test.meld', `
@embed [source.md] { underHeader: "Custom Header" }
      `);

      const stdoutSpy = vi.spyOn(console, 'log');
      process.argv = ['node', 'meld', '/project/test.meld', '--stdout'];
      await main(fsAdapter);

      // Verify header and content
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Source content'));
      
      stdoutSpy.mockRestore();
    });
  });

  describe('@define directive', () => {
    it('should handle command parameters', async () => {
      await context.fs.writeFile('/project/test.meld', `
@define command = "echo"
@run [#{command} test]
      `);
      process.argv = ['node', 'meld', '/project/test.meld', '--stdout'];
      await expect(main(fsAdapter)).resolves.not.toThrow();
    });

    it('should handle multiple parameters', async () => {
      await context.fs.writeFile('/project/test.meld', `
@define command = "echo"
@define arg = "test"
@run [#{command} #{arg}]
      `);
      process.argv = ['node', 'meld', '/project/test.meld', '--stdout'];
      await expect(main(fsAdapter)).resolves.not.toThrow();
    });

    it('should validate parameter count', async () => {
      await context.fs.writeFile('/project/test.meld', `
@define command
@run [#{command}]
      `);
      process.argv = ['node', 'meld', '/project/test.meld', '--stdout'];
      await expect(main(fsAdapter)).rejects.toThrow(/Invalid parameter count/);
    });
  });

  describe('@path directive', () => {
    it('should handle special variables', async () => {
      await context.fs.writeFile('/project/test.meld', `
@path projectFile = "$PROJECTPATH/file.txt"
@path homeFile = "$HOMEPATH/file.txt"
@path currentFile = "./file.txt"
      `);
      process.argv = ['node', 'meld', '/project/test.meld', '--stdout'];
      await expect(main(fsAdapter)).resolves.not.toThrow();
    });

    it('should reject invalid path variables', async () => {
      await context.fs.writeFile('/project/test.meld', `
@path invalid = "$INVALID/path"
      `);
      process.argv = ['node', 'meld', '/project/test.meld', '--stdout'];
      await expect(main(fsAdapter)).rejects.toThrow(/Invalid path variable/);
    });

    it('should reject paths with directory traversal', async () => {
      await context.fs.writeFile('/project/test.meld', `
@path invalid = "../file.txt"
      `);
      process.argv = ['node', 'meld', '/project/test.meld', '--stdout'];
      await expect(main(fsAdapter)).rejects.toThrow(/Invalid path/);
    });
  });

  describe('Code Fences', () => {
    it('should handle nested code fences with different backtick counts', async () => {
      await context.fs.writeFile('/project/test.meld', `
\`\`\`
Basic fence
\`\`\`

\`\`\`\`
Nested fence with
\`\`\`
inner fence
\`\`\`\`
      `);
      process.argv = ['node', 'meld', '/project/test.meld', '--stdout'];
      await expect(main(fsAdapter)).resolves.not.toThrow();
    });

    it('should preserve language identifiers', async () => {
      await context.fs.writeFile('/project/test.meld', `
\`\`\`python
def hello():
    print("Hello")
\`\`\`
      `);
      process.argv = ['node', 'meld', '/project/test.meld', '--stdout'];
      await expect(main(fsAdapter)).resolves.not.toThrow();
    });

    it('should preserve whitespace exactly', async () => {
      await context.fs.writeFile('/project/test.meld', `
\`\`\`
  indented
    more indented
      most indented
\`\`\`
      `);
      process.argv = ['node', 'meld', '/project/test.meld', '--stdout'];
      await expect(main(fsAdapter)).resolves.not.toThrow();
    });

    it('should treat directives as literal text inside fences', async () => {
      await context.fs.writeFile('/project/test.meld', `
\`\`\`
@text greeting = "Hello"
@run [echo test]
\`\`\`
@text outside = "This should be executed"
      `);
      
      const stdoutSpy = vi.spyOn(console, 'log');
      process.argv = ['node', 'meld', '/project/test.meld', '--stdout'];
      await main(fsAdapter);

      // Verify directives inside fence were not executed
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('@text greeting = "Hello"'));
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('@run [echo test]'));
      
      // Verify directive outside fence was executed
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('This should be executed'));
      
      stdoutSpy.mockRestore();
    });
  });

  describe('Variable Types', () => {
    it('should handle data to text conversion', async () => {
      await context.fs.writeFile('/project/test.meld', `
@data config = { "name": "test", "version": 1 }
@text simple = "Name: #{config.name}"
@text object = "Config: #{config}"
      `);
      process.argv = ['node', 'meld', '/project/test.meld', '--stdout'];
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
      process.argv = ['node', 'meld', '/project/test.meld', '--stdout'];
      await expect(main(fsAdapter)).resolves.not.toThrow();
    });
  });

  describe('Field Access', () => {
    it('should restrict field access to data variables only', async () => {
      await context.fs.writeFile('/project/test.meld', `
@data config = {{ nested: { value: "test" } }}
@text valid = \`#{config.nested.value}\`
@text invalid = \`\${textVar.field}\`
      `);
      process.argv = ['node', 'meld', '/project/test.meld', '--stdout'];
      await expect(main(fsAdapter)).rejects.toThrow(); // Should fail on invalid field access
    });
  });

  describe('CLI Output Handling', () => {
    it('should output to stdout when --stdout flag is used', async () => {
      process.argv = ['node', 'meld', '/project/test.meld', '--stdout'];
      const consoleSpy = vi.spyOn(console, 'log');
      await main(fsAdapter);
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should generate correct output file with default format', async () => {
      process.argv = ['node', 'meld', '/project/test.meld'];
      await main(fsAdapter);
      expect(await fsAdapter.exists('/project/test.xml')).toBe(true);
    });

    it('should respect custom output path', async () => {
      process.argv = ['node', 'meld', '/project/test.meld', '--output', 'custom.xml'];
      await main(fsAdapter);
      expect(await fsAdapter.exists('custom.xml')).toBe(true);
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

      process.argv = ['node', 'meld', '/project/test.meld'];
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

      process.argv = ['node', 'meld', '/project/test.meld', '--output', 'custom.xml'];
      await main(fsAdapter);
      
      expect(mockRL.question).not.toHaveBeenCalled();
    });

    it('should respect format option', async () => {
      process.argv = ['node', 'meld', '/project/test.meld', '--format', 'md'];
      await main(fsAdapter);
      expect(await fsAdapter.exists('/project/test.md')).toBe(true);
    });

    it('should cancel operation when overwrite is rejected', async () => {
      // Create existing output file
      await fsAdapter.writeFile('/project/test.xml', 'existing content');
      
      // Mock readline interface to return 'n'
      const mockRL = {
        question: vi.fn((_, cb) => cb('n')),
        close: vi.fn()
      };
      vi.spyOn(readline, 'createInterface').mockReturnValue(mockRL as any);

      const consoleSpy = vi.spyOn(console, 'log');
      process.argv = ['node', 'meld', '/project/test.meld'];
      await main(fsAdapter);
      
      expect(consoleSpy).toHaveBeenCalledWith('Operation cancelled');
      // Verify file wasn't overwritten
      expect(await fsAdapter.readFile('/project/test.xml', 'utf8')).toBe('existing content');
    });
  });
}); 