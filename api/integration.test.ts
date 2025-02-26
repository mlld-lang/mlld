import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { main } from './index.js';
import { TestContext } from '@tests/utils/index.js';
import type { ProcessOptions } from '@core/types/index.js';
import { MeldFileNotFoundError } from '@core/errors/MeldFileNotFoundError.js';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import path from 'path';
import { TestDebuggerService } from '../tests/utils/debug/TestDebuggerService.js';

describe('API Integration Tests', () => {
  let context: TestContext;
  let projectRoot: string;

  beforeEach(async () => {
    context = new TestContext();
    await context.initialize();
    projectRoot = '/project';
    // Enable path test mode
    context.services.path.enableTestMode();
    context.services.path.setProjectPath(projectRoot);
    context.services.path.setHomePath('/home/user');
  });

  afterEach(async () => {
    await context.cleanup();
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('Variable Definitions and References', () => {
    it('should handle text variable definitions and references', async () => {
      // Set up the input file
      const content = `
        @text greeting = "Hello"
        @text subject = "World"
        @text message = \`{{greeting}}, {{subject}}!\`
        {{message}}
      `;
      await context.writeFile('test.meld', content);
      
      // Process the file with transformation enabled
      const result = await main('test.meld', {
        fs: context.fs,
        services: context.services,
        transformation: true,
        format: 'md'
      });
      
      // Verify output contains the resolved variable references
      expect(result.trim()).toBe('Hello, World!');
    });

    it('should handle data variable definitions and field access', async () => {
      const content = `
        @data user = { "name": "Alice", "id": 123 }
        @text greeting = \`Hello, {{user.name}}! Your ID is {{user.id}}.\`
        {{greeting}}
      `;
      await context.writeFile('test.meld', content);
      
      const result = await main('test.meld', {
        fs: context.fs,
        services: context.services,
        transformation: true,
        format: 'md'
      });
      
      expect(result.trim()).toBe('Hello, Alice! Your ID is 123.');
    });
    
    it('should handle complex nested data structures', async () => {
      const content = `
        @data config = {
          "app": {
            "name": "Meld",
            "version": "1.0.0",
            "features": ["text", "data", "path"]
          },
          "env": "test"
        }
        @text appInfo = \`{{config.app.name}} v{{config.app.version}}\`
        @text features = \`Features: {{config.app.features}}\`
        {{appInfo}}
        {{features}}
      `;
      await context.writeFile('test.meld', content);
      
      const result = await main('test.meld', {
        fs: context.fs,
        services: context.services,
        transformation: true,
        format: 'md'
      });
      
      expect(result).toContain('Meld v1.0.0');
      expect(result).toContain('Features: text,data,path');
    });
  });

  describe('Path Handling', () => {
    it('should handle path variables with special $PROJECTPATH syntax', async () => {
      const content = `
@path docs = "$PROJECTPATH/docs"
@text result = "Docs are at {{docs}}"
      `;
      
      await context.writeFile('test.meld', content);
      
      // Add a hook to log the actual AST
      const originalProcessFile = context.services.interpreter.interpretWithContext;
      context.services.interpreter.interpretWithContext = async (filePath, opts) => {
        const result = await originalProcessFile.call(context.services.interpreter, filePath, opts);
        
        // Capture a sample node for debugging
        const parse = await context.services.parser.parseWithLocations(
          await context.fs.readFile(filePath, 'utf-8'), 
          { filePath }
        );
        
        // Log the actual AST structure for debugging
        console.log('*** DEBUG AST STRUCTURE ***');
        if (parse.length > 0 && parse[0].type === 'Directive') {
          console.log(JSON.stringify(parse[0], null, 2));
        }
        
        return result;
      };
      
      // Process the file
      const result = await main('test.meld', {
        fs: context.fs,
        services: context.services,
        cwd: '/project'
      });
      
      expect(result.trim()).toBe('Docs are at /project/docs');
    });

    it('should handle path variables with special $. alias syntax', async () => {
      const content = `
        @path config = "$./config"
        @text configPath = "Config is at {{config}}"
        {{configPath}}
      `;
      await context.writeFile('test.meld', content);
      await context.fs.mkdir(`${projectRoot}/config`);
      
      const result = await main('test.meld', {
        fs: context.fs,
        services: context.services,
        transformation: true,
        format: 'md'
      });
      
      expect(result.trim()).toBe(`Config is at ${projectRoot}/config`);
    });

    it('should handle path variables with special $HOMEPATH syntax', async () => {
      const content = `
        @path home = "$HOMEPATH/meld"
        @text homePath = "Home is at {{home}}"
        {{homePath}}
      `;
      await context.writeFile('test.meld', content);
      
      const result = await main('test.meld', {
        fs: context.fs,
        services: context.services,
        transformation: true,
        format: 'md'
      });
      
      expect(result.trim()).toBe('Home is at /home/user/meld');
    });

    it('should handle path variables with special $~ alias syntax', async () => {
      const content = `
        @path data = "$~/data"
        @text dataPath = "Data is at {{data}}"
        {{dataPath}}
      `;
      await context.writeFile('test.meld', content);
      
      const result = await main('test.meld', {
        fs: context.fs,
        services: context.services,
        transformation: true,
        format: 'md'
      });
      
      expect(result.trim()).toBe('Data is at /home/user/data');
    });
    
    it('should reject invalid path formats (raw absolute paths)', async () => {
      const content = `
        @path bad = "/absolute/path"
        {{bad}}
      `;
      await context.writeFile('test.meld', content);
      
      await expect(main('test.meld', {
        fs: context.fs,
        services: context.services,
        transformation: true
      })).rejects.toThrow(/Raw absolute paths are not allowed/);
    });
    
    it('should reject invalid path formats (relative paths with dot segments)', async () => {
      const content = `
        @path bad = "../path/with/dot"
        {{bad}}
      `;
      await context.writeFile('test.meld', content);
      
      await expect(main('test.meld', {
        fs: context.fs,
        services: context.services,
        transformation: true
      })).rejects.toThrow(/Path cannot contain \. or \.\. segments/);
    });
  });

  describe('Import Handling', () => {
    it('should handle simple imports', async () => {
      // Create imported file
      const importedContent = `
        @text imported = "This content was imported"
        {{imported}}
      `;
      await context.writeFile('imported.meld', importedContent);
      
      // Create main file
      const mainContent = `
        @import [imported.meld]
        Main file content
      `;
      await context.writeFile('test.meld', mainContent);
      
      const result = await main('test.meld', {
        fs: context.fs,
        services: context.services,
        transformation: true,
        format: 'md'
      });
      
      expect(result).toContain('This content was imported');
      expect(result).toContain('Main file content');
    });

    it('should handle nested imports with proper scope inheritance', async () => {
      // Create deeply nested import structure
      await context.writeFile('level3.meld', `
        @text deep = "Level 3 imported"
        {{deep}}
      `);
      
      await context.writeFile('level2.meld', `
        @text mid = "Level 2 imported"
        @import [level3.meld]
        {{mid}}
      `);
      
      await context.writeFile('level1.meld', `
        @text top = "Level 1 imported"
        @import [level2.meld]
        {{top}}
      `);
      
      await context.writeFile('test.meld', `
        @import [level1.meld]
        @text main = "Main file"
        {{main}}
      `);
      
      const result = await main('test.meld', {
        fs: context.fs,
        services: context.services,
        transformation: true,
        format: 'md'
      });
      
      expect(result).toContain('Level 1 imported');
      expect(result).toContain('Level 2 imported');
      expect(result).toContain('Level 3 imported');
      expect(result).toContain('Main file');
    });
    
    it('should detect circular imports', async () => {
      // Create circular import structure
      await context.writeFile('circular1.meld', `
        @import [circular2.meld]
      `);
      
      await context.writeFile('circular2.meld', `
        @import [circular1.meld]
      `);
      
      await context.writeFile('test.meld', `
        @import [circular1.meld]
      `);
      
      await expect(main('test.meld', {
        fs: context.fs,
        services: context.services
      })).rejects.toThrow(/Circular import detected/);
    });
  });

  describe('Command Execution', () => {
    it('should handle @run directives', async () => {
      const content = `
        @run [echo "Hello from run"]
      `;
      await context.writeFile('test.meld', content);
      
      const result = await main('test.meld', {
        fs: context.fs,
        services: context.services,
        transformation: true,
        format: 'md'
      });
      
      expect(result.trim()).toBe('Hello from run');
    });

    it('should handle @define and command execution', async () => {
      const content = `
        @define greet = @run [echo "Hello"]
        @run [$greet]
      `;
      await context.writeFile('test.meld', content);
      
      const result = await main('test.meld', {
        fs: context.fs,
        services: context.services,
        transformation: true,
        format: 'md'
      });
      
      expect(result.trim()).toBe('Hello');
    });

    it('should handle commands with parameters', async () => {
      const content = `
        @define greet(name) = @run [echo "Hello, {{name}}!"]
        @text user = "Alice"
        @run [$greet({{user}})]
      `;
      await context.writeFile('test.meld', content);
      
      const result = await main('test.meld', {
        fs: context.fs,
        services: context.services,
        transformation: true,
        format: 'md'
      });
      
      expect(result.trim()).toBe('Hello, Alice!');
    });
  });

  describe('Embed Handling', () => {
    it('should handle @embed directives', async () => {
      // Create the file to embed
      await context.writeFile('embed.md', 'This is embedded content');
      
      const content = `
        @embed [embed.md]
      `;
      await context.writeFile('test.meld', content);
      
      const result = await main('test.meld', {
        fs: context.fs,
        services: context.services,
        transformation: true,
        format: 'md'
      });
      
      expect(result.trim()).toBe('This is embedded content');
    });

    it('should handle @embed with section extraction', async () => {
      // Create the file with sections to embed
      await context.writeFile('sections.md', `
        # Section One
        Content for section one
        
        # Section Two
        Content for section two
        
        # Section Three
        Content for section three
      `);
      
      const content = `
        @embed [sections.md # Section Two]
      `;
      await context.writeFile('test.meld', content);
      
      const result = await main('test.meld', {
        fs: context.fs,
        services: context.services,
        transformation: true,
        format: 'md'
      });
      
      expect(result.trim()).toBe('# Section Two\nContent for section two');
    });
  });

  describe('Code Fence Handling', () => {
    it('should preserve code fences exactly as written', async () => {
      const content = `
        @text variable = "This is a variable"
        
        \`\`\`python
        # This code should be preserved exactly
        def hello():
            print("Hello")
            # @text myvar = "Not interpreted"
            # \${variable} should not be replaced
        \`\`\`
      `;
      await context.writeFile('test.meld', content);
      
      const result = await main('test.meld', {
        fs: context.fs,
        services: context.services,
        transformation: true,
        format: 'md'
      });
      
      expect(result).toContain('```python');
      expect(result).toContain('# @text myvar = "Not interpreted"');
      expect(result).toContain('# ${variable} should not be replaced');
    });
    
    it('should support nested code fences', async () => {
      const content = `
        \`\`\`\`
        Outer fence
        \`\`\`
        Inner fence
        \`\`\`
        Still in outer fence
        \`\`\`\`
      `;
      await context.writeFile('test.meld', content);
      
      const result = await main('test.meld', {
        fs: context.fs,
        services: context.services,
        transformation: true,
        format: 'md'
      });
      
      expect(result).toContain('```\nInner fence\n```');
      expect(result).toContain('Still in outer fence');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid directive syntax', async () => {
      const content = `
        @invalid directive syntax
      `;
      await context.writeFile('test.meld', content);
      
      await expect(main('test.meld', {
        fs: context.fs,
        services: context.services
      })).rejects.toThrow(MeldDirectiveError);
    });
    
    it('should handle missing files gracefully', async () => {
      await expect(main('missing.meld', {
        fs: context.fs,
        services: context.services
      })).rejects.toThrow(MeldFileNotFoundError);
    });
    
    it('should handle malformed YAML/JSON in data directives', async () => {
      const content = `
        @data bad = { "unclosed": "object"
      `;
      await context.writeFile('test.meld', content);
      
      await expect(main('test.meld', {
        fs: context.fs,
        services: context.services
      })).rejects.toThrow();
    });
  });

  describe('Format Transformation', () => {
    it('should format output as markdown', async () => {
      const content = `
        # Heading
        
        @text greeting = "Hello"
        
        {{greeting}}, World!
        
        - List item 1
        - List item 2
      `;
      await context.writeFile('test.meld', content);
      
      const result = await main('test.meld', {
        fs: context.fs,
        services: context.services,
        transformation: true,
        format: 'md'
      });
      
      expect(result).toContain('# Heading');
      expect(result).toContain('Hello, World!');
      expect(result).toContain('- List item 1');
      expect(result).not.toContain('@text greeting = "Hello"');
    });
    
    it('should format output as XML', async () => {
      const content = `
        # Heading
        
        @text greeting = "Hello"
        
        {{greeting}}, World!
        
        - List item 1
        - List item 2
      `;
      await context.writeFile('test.meld', content);
      
      const result = await main('test.meld', {
        fs: context.fs,
        services: context.services,
        transformation: true,
        format: 'llm'
      });
      
      expect(result).toContain('<text>');
      expect(result).toContain('Hello, World!');
      expect(result).toContain('List item 1');
      expect(result).not.toContain('@text greeting = "Hello"');
    });
  });

  describe('State Management', () => {
    it('should maintain state across complex directive sequences', async () => {
      const content = `
        @text first = "First"
        @text second = "Second"
        @data config = { "value": 123 }
        @run [echo "Run result"]
        
        {{first}} {{second}}
        Value: {{config.value}}
      `;
      await context.writeFile('test.meld', content);
      
      // Start debug session to capture state changes
      const sessionId = await context.startDebugSession({
        captureConfig: {
          capturePoints: ['pre-transform', 'post-transform'],
          includeFields: ['variables', 'transformedNodes'],
        },
        traceOperations: true
      });
      
      await main('test.meld', {
        fs: context.fs,
        services: context.services,
        transformation: true,
        format: 'md'
      });
      
      // Analyze debug data
      const debugResult = await context.endDebugSession(sessionId);
      const finalState = debugResult.captures[debugResult.captures.length - 1].state;
      
      // Verify state contains all defined variables
      expect(finalState.textVars).toHaveProperty('first', 'First');
      expect(finalState.textVars).toHaveProperty('second', 'Second');
      expect(finalState.dataVars).toHaveProperty('config');
      expect(finalState.dataVars.config).toHaveProperty('value', 123);
      
      // Verify operations were tracked properly
      expect(debugResult.operations).toHaveLength(5); // text, text, data, run, state capture
    });
    
    it('should isolate state between different files in tests', async () => {
      // Create two different files
      await context.writeFile('file1.meld', `
        @text var1 = "Value 1"
        {{var1}}
      `);
      
      await context.writeFile('file2.meld', `
        @text var2 = "Value 2"
        {{var2}}
      `);
      
      // Process file1
      const result1 = await main('file1.meld', {
        fs: context.fs,
        services: context.services,
        transformation: true,
        format: 'md'
      });
      
      // Process file2 with new services to ensure state isolation
      const context2 = new TestContext();
      await context2.initialize();
      context2.services.path.enableTestMode();
      context2.services.path.setProjectPath(projectRoot);
      
      const result2 = await main('file2.meld', {
        fs: context2.fs,
        services: context2.services,
        transformation: true,
        format: 'md'
      });
      
      // Verify each file only contains its own variables
      expect(result1.trim()).toBe('Value 1');
      expect(result2.trim()).toBe('Value 2');
    });
  });

  describe('Multi-file Projects', () => {
    // Set up a multi-file test project
    beforeEach(async () => {
      // Create project structure
      await context.fs.mkdir(`${projectRoot}/docs`);
      await context.fs.mkdir(`${projectRoot}/templates`);
      
      // Create shared files
      await context.writeFile(`${projectRoot}/templates/header.md`, `
        # Document Header
        
        This is a common header
      `);
      
      await context.writeFile(`${projectRoot}/templates/footer.md`, `
        ---
        
        Footer content
      `);
      
      // Create variables file
      await context.writeFile(`${projectRoot}/templates/variables.meld`, `
        @text projectName = "Meld Project"
        @text version = "1.0.0"
        @data meta = {
          "author": "Test User",
          "created": "2023-01-01"
        }
      `);
    });
    
    it('should handle complex multi-file projects with imports and shared variables', async () => {
      // Create main file that imports other files
      await context.writeFile(`${projectRoot}/main.meld`, `
        @path templates = "$PROJECTPATH/templates"
        @import [{{templates}}/variables.meld]
        
        @embed [{{templates}}/header.md]
        
        ## {{projectName}} v{{version}}
        
        Created by: {{meta.author}}
        Date: {{meta.created}}
        
        This is the main content.
        
        @embed [{{templates}}/footer.md]
      `);
      
      const result = await main(`${projectRoot}/main.meld`, {
        fs: context.fs,
        services: context.services,
        transformation: true,
        format: 'md'
      });
      
      // Verify result contains all parts
      expect(result).toContain('# Document Header');
      expect(result).toContain('## Meld Project v1.0.0');
      expect(result).toContain('Created by: Test User');
      expect(result).toContain('Date: 2023-01-01');
      expect(result).toContain('Footer content');
    });
  });
});