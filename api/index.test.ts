import { describe, it, expect, beforeEach } from 'vitest';
import { processMlld, MlldError } from './index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('Mlld API', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;

  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
  });

  describe('processMlld', () => {
    it('should process simple text assignment', async () => {
      const content = '@text greeting = "Hello, World!"';
      const result = await processMlld(content);
      // Text assignment alone doesn't produce output
      expect(result).toBe('');
    });

    it('should process text with add directive', async () => {
      const content = `
@text greeting = "Hello, World!"
@add @greeting
      `.trim();
      const result = await processMlld(content);
      expect(result.trim()).toBe('Hello, World!');
    });

    it('should process with custom options', async () => {
      const content = '@add "Hello, World!"';
      const result = await processMlld(content, {
        format: 'markdown',
        basePath: '/custom/path'
      });
      expect(result.trim()).toBe('Hello, World!');
    });

    it('should process with custom file system', async () => {
      // Set up a test file in memory
      await fileSystem.writeFile('/test.md', '# Test Content\nThis is a test file.');
      
      const content = `
@path testFile = [/test.md]
@add @testFile
      `.trim();
      const result = await processMlld(content, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      expect(result.trim()).toBe('# Test Content\nThis is a test file.');
    });

    it('should handle data directives', async () => {
      const content = '@data config = { name: "Test", version: 1.0 }';
      const result = await processMlld(content, { format: 'xml' });
      expect(result).toContain('<MLLD_OUTPUT>');
      expect(result).toContain('<CONFIG>');
      expect(result).toContain('"name": "Test"');
    });

    it('should handle template interpolation', async () => {
      const content = `
@text name = "World"
@text greeting = [[Hello, {{name}}!]]
@add @greeting
      `.trim();
      const result = await processMlld(content);
      expect(result.trim()).toBe('Hello, World!');
    });

    it('should handle import directives', async () => {
      // Set up a test file to import
      await fileSystem.writeFile('/utils.mld', '@text helper = "Helper Text"');
      
      const content = `
@import { helper } from [/utils.mld]
@add @helper
      `.trim();
      const result = await processMlld(content, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      expect(result.trim()).toBe('Helper Text');
    });

    it('should handle path directive correctly', async () => {
      // When a file doesn't exist, path directive should return the path as a string
      const content = `
@path testPath = [/nonexistent.md]
@add @testPath
      `.trim();
      const result = await processMlld(content, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      expect(result.trim()).toBe('/nonexistent.md');
    });

    it('should process add directive with sections', async () => {
      // Set up a test file with sections
      await fileSystem.writeFile('/doc.md', `# Document\n\n## Section One\nContent 1\n\n## Section Two\nContent 2`);
      
      const content = '@add "Section Two" from [/doc.md]';
      const result = await processMlld(content, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      expect(result.trim()).toBe('## Section Two\nContent 2');
    });

    it('should handle run directive', async () => {
      const content = '@run [echo "test"]';
      const result = await processMlld(content);
      // Run command directives produce output
      expect(result.trim()).toBe('test');
    });

    it('should export MlldError class', () => {
      expect(MlldError).toBeDefined();
      const error = new MlldError('Test error', { code: 'TEST_ERROR' });
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
    });

    it('should handle exec directive', async () => {
      const content = `
@exec greeting = @run [echo "Hello from exec!"]
      `.trim();
      const result = await processMlld(content, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      // Exec directive alone doesn't produce output, just stores the value
      expect(result).toBe('');
    });

    it('should handle simple literal add', async () => {
      const content = '@add "This is literal text"';
      const result = await processMlld(content);
      expect(result.trim()).toBe('This is literal text');
    });

    it('should handle multiple add directives', async () => {
      const content = `
@add "Line 1"
@add "Line 2"
@add "Line 3"
      `.trim();
      const result = await processMlld(content);
      const lines = result.trim().split('\n');
      expect(lines).toEqual(['Line 1', 'Line 2', 'Line 3']);
    });
  });
});