import { describe, it, expect, beforeEach } from 'vitest';
import { processMlld, MlldError } from './index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('Mlld API', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;
  const originalStrict = process.env.MLLD_STRICT;

  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
    process.env.MLLD_STRICT = '1';
  });

  afterAll(() => {
    process.env.MLLD_STRICT = originalStrict;
  });

  describe('processMlld', () => {
    it('should process simple text assignment', async () => {
      const content = '/var @greeting = "Hello, World!"';
      const result = await processMlld(content);
      // Text assignment alone doesn't produce output (just trailing newline from normalizer)
      expect(result).toBe('\n');
    });

    it('should process text with show directive', async () => {
      const content = `
/var @greeting = "Hello, World!"
/show @greeting
      `.trim();
      const result = await processMlld(content);
      expect(result.trim()).toBe('Hello, World!');
    });

    it('should process with custom options', async () => {
      const content = '/show "Hello, World!"';
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
/show </test.md>
      `.trim();
      const result = await processMlld(content, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      // Markdown formatting adds blank line after header
      expect(result.trim()).toBe('# Test Content\n\nThis is a test file.');
    });

    it.skip('should handle data directives', async () => {
      const content = '/var @config = { name: "Test", version: 1.0 }\n/show @config';
      const result = await processMlld(content, { format: 'xml' });
      expect(result).toContain('<MLLD_OUTPUT>');
      // Should only show content that is explicitly output
      expect(result).toContain('"name": "Test"');
      expect(result).toContain('"version": 1');
    });

    it('should handle template interpolation', async () => {
      const content = `
/var @name = "World"
/var @greeting = :::Hello, {{name}}!:::
/show @greeting
      `.trim();
      const result = await processMlld(content);
      expect(result.trim()).toBe('Hello, World!');
    });

    it('should handle import directives', async () => {
      // Set up a test file to import
      await fileSystem.writeFile('/utils.mld', '/var @helper = "Helper Text"');
      
      const content = `
/import { helper } from "/utils.mld"
/show @helper
      `.trim();
      const result = await processMlld(content, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      expect(result.trim()).toBe('Helper Text');
    });

    it('should keep path-like values as text via var assignment', async () => {
      const content = `
/var @testPath = "/nonexistent.md"
/show @testPath
      `.trim();
      const result = await processMlld(content, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      expect(result.trim()).toBe('/nonexistent.md');
    });

    it('should process show directive with sections', async () => {
      // Set up a test file with sections
      await fileSystem.writeFile('/doc.md', `# Document\n\n## Section One\nContent 1\n\n## Section Two\nContent 2`);
      
      const content = '/show </doc.md # Section Two>';
      const result = await processMlld(content, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      expect(result.trim()).toBe('## Section Two\n\nContent 2');
    });

    it('should handle run directive', async () => {
      const content = '/run cmd {echo "test"}';
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

    it('should handle exe directive', async () => {
      const content = `
/exe @greeting = run {echo "Hello from exe!"}
      `.trim();
      const result = await processMlld(content, {
        fileSystem,
        pathService,
        basePath: '/'
      });
      // Exe directive alone doesn't produce output (just trailing newline from normalizer)
      expect(result).toBe('\n');
    });

    it('should handle simple literal show', async () => {
      const content = '/show "This is literal text"';
      const result = await processMlld(content);
      expect(result.trim()).toBe('This is literal text');
    });

    it('should handle multiple show directives', async () => {
      const content = `
/show "Line 1"
/show "Line 2"
/show "Line 3"
      `.trim();
      const result = await processMlld(content);
      const lines = result.trim().split('\n').filter(l => l.length > 0);
      expect(lines).toEqual(['Line 1', 'Line 2', 'Line 3']);
    });

    it('defaults raw strings to strict mode', async () => {
      await expect(processMlld('plain text')).rejects.toThrow('Text content not allowed in strict mode (.mld). Use .mld.md for prose.');
    });

    it('allows markdown mode override for raw strings', async () => {
      const result = await processMlld('plain text', { mode: 'markdown' });
      expect(result.trim()).toBe('plain text');
    });

    it('infers strict mode for .mld files and runs bare directives', async () => {
      const content = `
var @name = "World"
show @name
      `.trim();
      await fileSystem.writeFile('/module.mld', content);
      const result = await processMlld(content, {
        filePath: '/module.mld',
        fileSystem,
        pathService
      });
      expect(result.trim()).toBe('World');
    });

    it('treats bare directives as text in markdown mode for .mld.md files', async () => {
      const content = `
var @name = "World"
show @name
      `.trim();
      await fileSystem.writeFile('/module.mld.md', content);
      const result = await processMlld(content, {
        filePath: '/module.mld.md',
        fileSystem,
        pathService
      });
      expect(result.trim()).not.toBe('World');
      expect(result).toContain('show @name');
    });
  });
});
