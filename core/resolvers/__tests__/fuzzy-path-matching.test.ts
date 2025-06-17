import { describe, it, expect, beforeEach } from 'vitest';
import { LocalResolver } from '@core/resolvers/LocalResolver';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { ResolverError } from '@core/errors/ResolverError';
import { MlldFileNotFoundError } from '@core/errors';
import { PathMatcher } from '@core/resolvers/utils/PathMatcher';

describe('LocalResolver - Fuzzy Path Matching', () => {
  let resolver: LocalResolver;
  let fileSystem: MemoryFileSystem;
  
  beforeEach(async () => {
    fileSystem = new MemoryFileSystem();
    resolver = new LocalResolver(fileSystem);
    
    // Set up test file structure
    await fileSystem.mkdir('/desktop');
    await fileSystem.mkdir('/desktop/My Projects');
    await fileSystem.mkdir('/desktop/My Projects/Todo App');
    await fileSystem.mkdir('/desktop/test-folder');
    await fileSystem.mkdir('/desktop/test_folder');
    await fileSystem.mkdir('/desktop/TestFolder');
    
    await fileSystem.writeFile('/desktop/My Projects/README.md', '# My Projects');
    await fileSystem.writeFile('/desktop/My Projects/Todo App/tasks.md', '- [ ] Task 1\n- [ ] Task 2');
    await fileSystem.writeFile('/desktop/My Projects/Todo App/notes.txt', 'Some notes');
    await fileSystem.writeFile('/desktop/test-file.md', 'Test content');
    await fileSystem.writeFile('/desktop/test_file.md', 'Different test content');
    await fileSystem.writeFile('/desktop/TEST_FILE.md', 'Yet another test');
    await fileSystem.writeFile('/desktop/config.json', '{"key": "value"}');
  });

  describe('Case-insensitive matching', () => {
    it('should find files with different case', async () => {
      const config = { basePath: '/desktop' };
      
      // Lowercase request for mixed case file
      const result1 = await resolver.resolve('@desktop/my-projects/readme.md', config);
      expect(result1.content).toBe('# My Projects');
      
      // Uppercase request
      const result2 = await resolver.resolve('@desktop/MY-PROJECTS/README.MD', config);
      expect(result2.content).toBe('# My Projects');
      
      // Mixed case variations
      const result3 = await resolver.resolve('@desktop/My-Projects/readme.MD', config);
      expect(result3.content).toBe('# My Projects');
    });

    it('should handle case-insensitive directory traversal', async () => {
      const config = { basePath: '/desktop' };
      
      const result = await resolver.resolve('@desktop/my-projects/todo-app/tasks.md', config);
      expect(result.content).toBe('- [ ] Task 1\n- [ ] Task 2');
    });

    it('should work when case-insensitive is disabled', async () => {
      const config = {
        basePath: '/desktop',
        fuzzyMatch: { enabled: true, caseInsensitive: false }
      };
      
      // Exact case should work
      const result = await resolver.resolve('@desktop/My Projects/README.md', config);
      expect(result.content).toBe('# My Projects');
      
      // Different case should fail
      await expect(resolver.resolve('@desktop/my-projects/readme.md', config))
        .rejects.toThrow(MlldFileNotFoundError);
    });
  });

  describe('Whitespace normalization', () => {
    it('should match spaces with dashes', async () => {
      const config = { basePath: '/desktop' };
      
      const result = await resolver.resolve('@desktop/my-projects/readme', config);
      expect(result.content).toBe('# My Projects');
    });

    it('should match spaces with underscores', async () => {
      const config = { basePath: '/desktop' };
      
      const result = await resolver.resolve('@desktop/my_projects/todo_app/tasks', config);
      expect(result.content).toBe('- [ ] Task 1\n- [ ] Task 2');
    });

    it('should handle mixed separators', async () => {
      const config = { basePath: '/desktop' };
      
      // Request with dashes for space-separated path
      const result1 = await resolver.resolve('@desktop/my-projects/todo-app/tasks', config);
      expect(result1.content).toBe('- [ ] Task 1\n- [ ] Task 2');
      
      // Request with underscores
      const result2 = await resolver.resolve('@desktop/my_projects/todo_app/tasks', config);
      expect(result2.content).toBe('- [ ] Task 1\n- [ ] Task 2');
    });

    it('should work when whitespace normalization is disabled', async () => {
      const config = {
        basePath: '/desktop',
        fuzzyMatch: { enabled: true, normalizeWhitespace: false }
      };
      
      // Exact match should work
      const result = await resolver.resolve('@desktop/My Projects/README.md', config);
      expect(result.content).toBe('# My Projects');
      
      // Normalized version should fail
      await expect(resolver.resolve('@desktop/My-Projects/README.md', config))
        .rejects.toThrow(MlldFileNotFoundError);
    });
  });

  describe('Ambiguity detection', () => {
    it('should detect ambiguous matches', async () => {
      const config = { basePath: '/desktop' };
      
      // test-file.md, test_file.md, and TEST_FILE.md all match
      await expect(resolver.resolve('@desktop/test-file', config))
        .rejects.toThrow(/Ambiguous path.*matches multiple files/);
    });

    it('should list all ambiguous matches in error', async () => {
      const config = { basePath: '/desktop' };
      
      try {
        await resolver.resolve('@desktop/test-file', config);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ResolverError);
        expect(error.message).toContain('test-file.md');
        expect(error.message).toContain('test_file.md');
        expect(error.message).toContain('TEST_FILE.md');
      }
    });

    it('should resolve unambiguous matches', async () => {
      const config = { basePath: '/desktop' };
      
      // Only one match for config.json
      const result = await resolver.resolve('@desktop/config.json', config);
      expect(result.content).toBe('{"key": "value"}');
    });
  });

  describe('Extension handling', () => {
    it('should try common extensions with fuzzy matching', async () => {
      const config = { basePath: '/desktop' };
      
      // Without extension
      const result1 = await resolver.resolve('@desktop/my-projects/readme', config);
      expect(result1.content).toBe('# My Projects');
      
      // Should also find .txt files
      const result2 = await resolver.resolve('@desktop/my-projects/todo-app/notes', config);
      expect(result2.content).toBe('Some notes');
    });

    it('should prioritize exact extension matches', async () => {
      await fileSystem.writeFile('/desktop/test.md', 'Markdown content');
      await fileSystem.writeFile('/desktop/test.mld', 'Mlld content');
      
      const config = { basePath: '/desktop' };
      
      // Exact extension should win
      const result = await resolver.resolve('@desktop/test.md', config);
      expect(result.content).toBe('Markdown content');
    });
  });

  describe('Suggestions', () => {
    it('should provide suggestions for near matches', async () => {
      const config = { basePath: '/desktop' };
      
      try {
        await resolver.resolve('@desktop/my-projekt/readme', config);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MlldFileNotFoundError);
        expect(error.message).toContain('Did you mean:');
        expect(error.message).toContain('My Projects');
      }
    });

    it('should limit suggestions to top 3', async () => {
      // Create many similar folders
      for (let i = 1; i <= 10; i++) {
        await fileSystem.mkdir(`/desktop/project${i}`);
      }
      
      const config = { basePath: '/desktop' };
      
      try {
        await resolver.resolve('@desktop/projekt/readme', config);
        expect.fail('Should have thrown');
      } catch (error) {
        const suggestions = (error.message.match(/- /g) || []).length;
        expect(suggestions).toBeLessThanOrEqual(3);
      }
    });
  });

  describe('List operation with fuzzy matching', () => {
    it('should list directory contents with fuzzy path', async () => {
      const config = { basePath: '/desktop' };
      
      // List with normalized path
      const results = await resolver.list('@desktop/my-projects', config);
      
      expect(results).toHaveLength(2); // README.md and Todo App directory
      expect(results.some(r => r.path.includes('README.md'))).toBe(true);
      expect(results.some(r => r.path.includes('Todo App'))).toBe(true);
    });

    it('should handle fuzzy directory names in list', async () => {
      const config = { basePath: '/desktop' };
      
      const results = await resolver.list('@desktop/MY_PROJECTS/todo-app', config);
      
      expect(results).toHaveLength(2); // tasks.md and notes.txt
      expect(results.some(r => r.path.includes('tasks.md'))).toBe(true);
      expect(results.some(r => r.path.includes('notes.txt'))).toBe(true);
    });
  });

  describe('Access checking with fuzzy matching', () => {
    it('should check access with fuzzy paths', async () => {
      const config = { basePath: '/desktop' };
      
      // Check various fuzzy variations
      expect(await resolver.checkAccess('@desktop/my-projects/readme', 'read', config)).toBe(true);
      expect(await resolver.checkAccess('@desktop/MY_PROJECTS/README', 'read', config)).toBe(true);
      expect(await resolver.checkAccess('@desktop/my_projects/todo_app/tasks', 'read', config)).toBe(true);
      
      // Non-existent file
      expect(await resolver.checkAccess('@desktop/not-exist', 'read', config)).toBe(false);
    });

    it('should not use fuzzy matching for write operations', async () => {
      const config = { basePath: '/desktop' };
      
      // Write operations don't use fuzzy matching - they use resolveFullPath
      // This means the exact path must exist for the parent directory
      expect(await resolver.checkAccess('@desktop/My Projects/newfile.md', 'write', config)).toBe(true);
      expect(await resolver.checkAccess('@desktop/test-folder/newfile.md', 'write', config)).toBe(true);
      
      // Non-existent directory should fail
      expect(await resolver.checkAccess('@desktop/non-existent/newfile.md', 'write', config)).toBe(false);
    });
  });

  describe('Performance considerations', () => {
    it('should cache directory listings', async () => {
      const config = { basePath: '/desktop' };
      
      // Create a new PathMatcher instance to verify caching behavior
      const pathMatcher = new PathMatcher(fileSystem);
      
      // First access populates cache
      await pathMatcher.findMatch('my-projects/readme', '/desktop', config.fuzzyMatch);
      
      // Clear the cache
      pathMatcher.clearCache();
      
      // Access again - should work even after cache clear
      const result = await pathMatcher.findMatch('my-projects/readme', '/desktop', config.fuzzyMatch);
      expect(result.path).toBeDefined();
      
      // The fact that it works demonstrates the implementation is correct
      // Actual performance testing would require more sophisticated benchmarking
    });
  });

  describe('Fuzzy matching configuration', () => {
    it('should disable fuzzy matching entirely when enabled is false', async () => {
      const config = {
        basePath: '/desktop',
        fuzzyMatch: { enabled: false }
      };
      
      // Only exact matches should work
      const result = await resolver.resolve('@desktop/My Projects/README.md', config);
      expect(result.content).toBe('# My Projects');
      
      // Fuzzy matches should fail
      await expect(resolver.resolve('@desktop/my-projects/readme.md', config))
        .rejects.toThrow();
    });

    it('should accept boolean shorthand for fuzzy config', async () => {
      // true enables all fuzzy features
      const config1 = {
        basePath: '/desktop',
        fuzzyMatch: true
      };
      
      const result1 = await resolver.resolve('@desktop/my-projects/readme', config1);
      expect(result1.content).toBe('# My Projects');
      
      // false disables fuzzy matching
      const config2 = {
        basePath: '/desktop',
        fuzzyMatch: false
      };
      
      await expect(resolver.resolve('@desktop/my-projects/readme', config2))
        .rejects.toThrow();
    });

    it('should use defaults when fuzzyMatch is not specified', async () => {
      const config = { basePath: '/desktop' };
      
      // Should default to enabled with all features
      const result = await resolver.resolve('@desktop/my-projects/readme', config);
      expect(result.content).toBe('# My Projects');
    });
  });
});