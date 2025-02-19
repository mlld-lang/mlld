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

describe('CLI Integration Tests', () => {
  let context: TestContext;
  let originalArgv: string[];
  let originalNodeEnv: string | undefined;
  let fsAdapter: MemfsTestFileSystemAdapter;
  let pathService: PathService;

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
    
    // Create test files in the mock filesystem
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
      await expect(main(fsAdapter)).rejects.toThrow('Referenced file not found: nonexistent.md');
    });

    it('should halt on invalid syntax', async () => {
      await context.fs.writeFile('/project/test.meld', '@text = invalid syntax');
      await expect(main(fsAdapter)).rejects.toThrow('Invalid syntax');
    });

    it('should halt on circular imports', async () => {
      await context.fs.writeFile('/project/a.meld', '@import [b.meld]');
      await context.fs.writeFile('/project/b.meld', '@import [a.meld]');
      process.argv = ['node', 'meld', '/project/a.meld', '--stdout'];
      await expect(main(fsAdapter)).rejects.toThrow('Circular import detected');
    });

    it('should halt on type mismatches', async () => {
      await context.fs.writeFile('/project/test.meld', '@path wrongtype = ${textvar}');
      await expect(main(fsAdapter)).rejects.toThrow('Type mismatch');
    });
  });

  describe('Warning Errors', () => {
    it('should warn but continue on missing data fields', async () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      await context.fs.writeFile('/project/test.meld', '@text test = #{data.nonexistent}');
      await expect(main(fsAdapter)).resolves.not.toThrow();
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should warn but continue on missing env vars', async () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      await context.fs.writeFile('/project/test.meld', '@text test = ${ENV_NONEXISTENT}');
      await expect(main(fsAdapter)).resolves.not.toThrow();
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('Silent Operation', () => {
    it('should not warn on expected stderr from commands', async () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      await context.fs.writeFile('/project/test.meld', '@run [npm test]');  // Example command that uses stderr
      
      await expect(main(fsAdapter)).resolves.not.toThrow();
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should handle type coercion silently', async () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      await context.fs.writeFile('/project/test.meld', '@text test = "string" ++ #{numberData}');
      
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
      const sourceContent = `
# Section One
Content for section one

# Section Two
Content for section two
      `;
      await context.fs.writeFile('/project/source.md', sourceContent);
      await context.fs.writeFile('/project/test.meld', '@embed [source.md # Section One]');
      
      // Capture stdout to verify content
      const stdoutSpy = vi.spyOn(console, 'log');
      process.argv = ['node', 'meld', '/project/test.meld', '--stdout'];
      await main(fsAdapter);

      // Verify only Section One content is included
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Content for section one'));
      expect(stdoutSpy).not.toHaveBeenCalledWith(expect.stringContaining('Content for section two'));
      
      stdoutSpy.mockRestore();
    });

    it('should handle header text', async () => {
      const sourceContent = 'Source content';
      await context.fs.writeFile('/project/source.md', sourceContent);
      await context.fs.writeFile('/project/test.meld', '@embed [source.md] under Custom Header');
      
      // Capture stdout to verify content
      const stdoutSpy = vi.spyOn(console, 'log');
      process.argv = ['node', 'meld', '/project/test.meld', '--stdout'];
      await main(fsAdapter);

      // Verify header and content
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Custom Header'));
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Source content'));
      
      stdoutSpy.mockRestore();
    });
  });

  describe('@define directive', () => {
    it('should handle command parameters', async () => {
      const meldContent = `
@define greet(name) = @run [echo "Hello \${name}"]
@run [$greet("World")]
      `;
      await context.fs.writeFile('/project/test.meld', meldContent);
      
      // Capture stdout to verify command execution
      const stdoutSpy = vi.spyOn(console, 'log');
      process.argv = ['node', 'meld', '/project/test.meld', '--stdout'];
      await main(fsAdapter);

      // Verify parameter was correctly substituted and command executed
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Hello World'));
      
      stdoutSpy.mockRestore();
    });

    it('should handle multiple parameters', async () => {
      const meldContent = `
@define greet(first, last) = @run [echo "Hello \${first} \${last}"]
@run [$greet("John", "Doe")]
      `;
      await context.fs.writeFile('/project/test.meld', meldContent);
      
      const stdoutSpy = vi.spyOn(console, 'log');
      process.argv = ['node', 'meld', '/project/test.meld', '--stdout'];
      await main(fsAdapter);

      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Hello John Doe'));
      
      stdoutSpy.mockRestore();
    });

    it('should validate parameter count', async () => {
      const meldContent = `
@define greet(name) = @run [echo "Hello \${name}"]
@run [$greet()]  // Missing parameter
      `;
      await context.fs.writeFile('/project/test.meld', meldContent);
      
      process.argv = ['node', 'meld', '/project/test.meld', '--stdout'];
      await expect(main(fsAdapter)).rejects.toThrow(/Invalid parameter count/);
    });
  });

  describe('@path directive', () => {
    it('should handle special variables', async () => {
      const meldContent = `
@path home = "$HOMEPATH/test"
@path project = "$PROJECTPATH/src"
@path tilde = "$~/config"
@path dot = "$./lib"
@text paths = \`
Home: \${home}
Project: \${project}
Tilde: \${tilde}
Dot: \${dot}
\`
      `;
      await context.fs.writeFile('/project/test.meld', meldContent);
      
      // Set up path service with test paths
      pathService.setHomePath('/home/user');
      pathService.setProjectPath('/project');
      
      // Capture stdout to verify path resolution
      const stdoutSpy = vi.spyOn(console, 'log');
      process.argv = ['node', 'meld', '/project/test.meld', '--stdout'];
      await main(fsAdapter);

      // Verify each path was correctly resolved
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Home: /home/user/test'));
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Project: /project/src'));
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Tilde: /home/user/config'));
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Dot: /project/lib'));
      
      stdoutSpy.mockRestore();
    });

    it('should reject invalid path variables', async () => {
      const meldContent = '@path invalid = "$INVALID/path"';
      await context.fs.writeFile('/project/test.meld', meldContent);
      
      process.argv = ['node', 'meld', '/project/test.meld', '--stdout'];
      await expect(main(fsAdapter)).rejects.toThrow(/Invalid path variable/);
    });

    it('should reject paths with directory traversal', async () => {
      const meldContent = '@path escape = "$PROJECTPATH/../outside"';
      await context.fs.writeFile('/project/test.meld', meldContent);
      
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
\`\`\`
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
      const meldContent = `
\`\`\`
@text greeting = "Hello"
@run [echo test]
\`\`\`
@text outside = "This should be executed"
      `;
      await context.fs.writeFile('/project/test.meld', meldContent);
      
      // Spy on console.log to verify output
      const stdoutSpy = vi.spyOn(console, 'log');
      
      // Spy on command execution to verify it's not called
      const execSpy = vi.spyOn(fsAdapter, 'executeCommand');
      
      process.argv = ['node', 'meld', '/project/test.meld', '--stdout'];
      await main(fsAdapter);

      // Verify directives inside fence were not executed
      expect(execSpy).not.toHaveBeenCalled();
      
      // Verify the fence content is preserved as literal text
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('@text greeting = "Hello"'));
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('@run [echo test]'));
      
      // Verify directive outside fence was executed
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('This should be executed'));
      
      stdoutSpy.mockRestore();
      execSpy.mockRestore();
    });
  });

  describe('Variable Types', () => {
    it('should handle data to text conversion', async () => {
      await context.fs.writeFile('/project/test.meld', `
@data config = {{ name: "test", version: 1 }}
@text simple = \`Name: #{config.name}\`
@text object = \`Config: #{config}\`
      `);
      process.argv = ['node', 'meld', '/project/test.meld', '--stdout'];
      await expect(main(fsAdapter)).resolves.not.toThrow();
    });

    it('should handle text variables in data contexts', async () => {
      await context.fs.writeFile('/project/test.meld', `
@text name = "Alice"
@text key = "username"
@data user = {{
  \${key}: \${name},
  settings: {
    displayName: \${name}
  }
}}
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
}); 