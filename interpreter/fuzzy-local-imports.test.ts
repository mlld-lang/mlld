import { describe, it, expect, beforeEach } from 'vitest';
import { interpret } from './index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('Fuzzy Local File Imports', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;
  
  beforeEach(async () => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
    
    // Set up test file structure
    await fileSystem.writeFile('/My-Utils.mld', '/var @greeting = "Hello from utils"');
    await fileSystem.writeFile('/test_config.json', '{"debug": true}');
    await fileSystem.writeFile('/My Important File.md', '# Important Content');
    await fileSystem.mkdir('/sub-folder');
    await fileSystem.writeFile('/sub-folder/nested-file.mld', '/var @value = "42"');
    
    // Create directory structure with spaces
    await fileSystem.mkdir('/My Projects');
    await fileSystem.writeFile('/My Projects/README.md', '# Project README');
    await fileSystem.writeFile('/My Projects/Todo List.mld', '/var @tasks = "Tasks to do"');
  });

  describe('Case-insensitive imports', () => {
    it('should import files with different case', async () => {
      const source = '/import { greeting } from "./my-utils.mld"\n/show @greeting';
      
      const result = await interpret(source, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      
      expect(result.trim()).toBe('Hello from utils');
    });

    it('should handle uppercase variations', async () => {
      const source = '/import { greeting } from "./MY-UTILS.MLD"\n/show @greeting';
      
      const result = await interpret(source, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      
      expect(result.trim()).toBe('Hello from utils');
    });
  });

  describe('Whitespace normalization', () => {
    it('should import files with spaces using dashes', async () => {
      const source = '/import { tasks } from "./my-projects/todo-list"\n/show @tasks';
      
      const result = await interpret(source, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      
      expect(result.trim()).toBe('Tasks to do');
    });

    it('should import files with spaces using underscores', async () => {
      const source = '/show <./my_important_file.md>';
      
      const result = await interpret(source, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      
      expect(result.trim()).toBe('# Important Content');
    });

    it('should handle nested paths with mixed separators', async () => {
      const source = '/import { value } from "./sub_folder/nested-file"\n/show :::Value: {{value}}:::';
      
      const result = await interpret(source, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      
      expect(result.trim()).toBe('Value: 42');
    });
  });

  describe('Extension inference', () => {
    it('should find .mld files without extension', async () => {
      const source = '/import { greeting } from "./my-utils"\n/show @greeting';
      
      const result = await interpret(source, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      
      expect(result.trim()).toBe('Hello from utils');
    });

    it('should find .md files without extension', async () => {
      const source = '/show <./my-important-file>';
      
      const result = await interpret(source, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      
      expect(result.trim()).toBe('# Important Content');
    });
    
    it('should fail when extension is wrong even with correct name', async () => {
      // File is .mld but we ask for .md
      const source = '/import { greeting } from "./My-Utils.md"';
      
      await expect(interpret(source, {
        fileSystem,
        pathService,
        basePath: '/'
      })).rejects.toThrow(/File not found/);
    });
  });

  describe('Error handling', () => {
    it('should provide suggestions for near matches', async () => {
      const source = '/import { greeting } from "./my-utilz"';
      
      await expect(interpret(source, {
        fileSystem,
        pathService,
        basePath: '/'
      })).rejects.toThrow(/Did you mean:[\s\S]*My-Utils\.mld/);
    });

    it('should show multiple matches when ambiguous', async () => {
      // Create files that differ only in case
      await fileSystem.writeFile('/Test-File.mld', '/var @a = "A"');
      await fileSystem.writeFile('/test-file.mld', '/var @b = "B"');
      
      // Both files match with case-insensitive matching
      const source = '/import { a } from "./TEST-FILE"';

      await expect(interpret(source, {
        fileSystem,
        pathService,
        basePath: '/'
      })).rejects.toThrow(/Ambiguous file match/);
      await expect(interpret(source, {
        fileSystem,
        pathService,
        basePath: '/'
      })).rejects.toThrow(/Test-File\.mld/);
      await expect(interpret(source, {
        fileSystem,
        pathService,
        basePath: '/'
      })).rejects.toThrow(/test-file\.mld/);
    });
  });

  describe('Configuration', () => {
    it('should respect disabled fuzzy matching', async () => {
      const source = '/import { greeting } from "./my-utils"';

      const promise = interpret(source, {
        fileSystem,
        pathService,
        basePath: '/',
        localFileFuzzyMatch: false
      });

      await expect(promise).rejects.toThrow(/File not found: \.\/my-utils/);
      await expect(promise).rejects.toThrow(/Did you mean:[\s\S]*@base\/my-utils/);
      await expect(promise).rejects.toThrow(/Paths resolve relative to the current mlld file directory/);
    });

    it('should respect case-sensitive configuration', async () => {
      const source = '/import { greeting } from "./my-utils"';
      
      await expect(interpret(source, {
        fileSystem,
        pathService,
        basePath: '/',
        localFileFuzzyMatch: {
          enabled: true,
          caseInsensitive: false,
          normalizeWhitespace: true
        }
      })).rejects.toThrow(/File not found/);
    });

    it('should work with case-correct but normalized whitespace', async () => {
      const source = '/import { greeting } from "./My_Utils"\n/show @greeting';
      
      const result = await interpret(source, {
        fileSystem,
        pathService,
        basePath: '/',
        localFileFuzzyMatch: {
          enabled: true,
          caseInsensitive: false,
          normalizeWhitespace: true
        }
      });
      
      expect(result.trim()).toBe('Hello from utils');
    });
  });

  describe('Integration with @show directive', () => {
    it('should fuzzy match files in @show', async () => {
      const source = '/show <./my-projects/readme>';
      
      const result = await interpret(source, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      
      expect(result.trim()).toBe('# Project README');
    });
  });
  
  describe('Integration with @var directive', () => {
    it('should fuzzy match files in @text assignments', async () => {
      const source = '/var @content = <./MY_IMPORTANT_FILE.MD>\n/show @content';
      
      const result = await interpret(source, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      
      expect(result.trim()).toBe('# Important Content');
    });
    
    it('should fuzzy match files with section extraction', async () => {
      await fileSystem.writeFile('/Guide.md', '# Guide\n\n## Setup\n\nInstall steps here\n\n## Usage\n\nHow to use');
      
      const source = '/var @section = <./guide # Setup>\n/show @section';
      
      const result = await interpret(source, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      
      expect(result.trim()).toBe('## Setup\n\nInstall steps here');
    });
  });

  describe('Integration with path variables', () => {
    it('should fuzzy match files in path-like assignments', async () => {
      const source = '/var @doc = "./my-important-file"\n/show <@doc>';
      
      const result = await interpret(source, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      
      expect(result.trim()).toBe('# Important Content');
    });
    
    it('should fuzzy match directories in path-like assignments', async () => {
      // TODO: This test is failing with a parse error. The fuzzy matching
      // for paths used in variable interpolation within brackets may not be
      // working correctly. Needs investigation.
      const source = '/var @folder = "./my_projects"\n/show <@folder/README.md>';
      
      const result = await interpret(source, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      
      expect(result.trim()).toBe('# Project README');
    });
  });
  
  describe('Integration with relative paths', () => {
    it('should work with current directory notation', async () => {
      const source = '/import { greeting } from "./My-Utils"\n/show @greeting';
      
      const result = await interpret(source, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      
      expect(result.trim()).toBe('Hello from utils');
    });
  });
});
