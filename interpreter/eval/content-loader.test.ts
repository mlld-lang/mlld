import { describe, it, expect, beforeEach } from 'vitest';
import { processContentLoader } from './content-loader';
import { Environment } from '../env/Environment';
import { isLoadContentResult, isLoadContentResultArray } from '@core/types/load-content';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import * as path from 'path';

describe('Content Loader with Glob Support', () => {
  let env: Environment;
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;

  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
    env = new Environment(fileSystem, pathService, process.cwd());
  });

  describe('Single File Loading', () => {
    it('should load a single file and return LoadContentResult', async () => {
      // Create test file
      await fileSystem.writeFile(path.join(process.cwd(), 'README.md'), '# Test README\n\nThis is test content.');
      
      const node = {
        type: 'load-content',
        source: {
          type: 'path',
          segments: [{ type: 'Text', content: 'README.md' }],
          raw: 'README.md'
        }
      };

      const result = await processContentLoader(node, env);
      
      expect(isLoadContentResult(result)).toBe(true);
      if (isLoadContentResult(result)) {
        expect(result.filename).toBe('README.md');
        expect(result.content).toBeDefined();
        expect(result.tokest).toBeGreaterThan(0);
        expect(result.absolute).toContain('README.md');
      }
    });

    it('should handle section extraction and return string', async () => {
      // Create test file with sections
      await fileSystem.writeFile(path.join(process.cwd(), 'README.md'), '# Test README\n\n## Installation\n\nInstall instructions here.');
      
      const node = {
        type: 'load-content',
        source: {
          type: 'path',
          segments: [{ type: 'Text', content: 'README.md' }],
          raw: 'README.md'
        },
        options: {
          section: {
            identifier: { type: 'Text', content: 'Installation' }
          }
        }
      };

      const result = await processContentLoader(node, env);
      
      // With section extraction, should return plain string for backward compatibility
      expect(typeof result).toBe('string');
    });
  });

  describe('Glob Pattern Loading', () => {
    it.skip('should detect and process glob patterns', async () => {
      // Create test files
      await fileSystem.writeFile(path.join(process.cwd(), 'test1.md'), '# Test 1');
      await fileSystem.writeFile(path.join(process.cwd(), 'test2.md'), '# Test 2');
      await fileSystem.writeFile(path.join(process.cwd(), 'test.txt'), 'Not markdown');
      const node = {
        type: 'load-content',
        source: {
          type: 'path',
          segments: [{ type: 'Text', content: '*.md' }],
          raw: '*.md'
        }
      };

      const result = await processContentLoader(node, env);
      
      expect(isLoadContentResultArray(result)).toBe(true);
      if (isLoadContentResultArray(result)) {
        expect(result.length).toBeGreaterThan(0);
        expect(result[0].filename).toMatch(/\.md$/);
      }
    });

    it.skip('should handle recursive glob patterns', async () => {
      // Create test files in subdirectories
      await fileSystem.mkdir(path.join(process.cwd(), 'tests'));
      await fileSystem.mkdir(path.join(process.cwd(), 'tests/unit'));
      await fileSystem.writeFile(path.join(process.cwd(), 'tests/test1.md'), '# Test 1');
      await fileSystem.writeFile(path.join(process.cwd(), 'tests/unit/test2.md'), '# Test 2');
      
      const node = {
        type: 'load-content',
        source: {
          type: 'path',
          segments: [{ type: 'Text', content: 'tests/**/*.md' }],
          raw: 'tests/**/*.md'
        }
      };

      const result = await processContentLoader(node, env);
      
      expect(isLoadContentResultArray(result)).toBe(true);
      if (isLoadContentResultArray(result)) {
        expect(result.length).toBeGreaterThan(0);
        result.forEach(file => {
          expect(file.filename).toMatch(/\.md$/);
          expect(file.relative).toContain('tests');
        });
      }
    });

    it.skip('should filter files by section when glob + section', async () => {
      // Create test files with and without API sections
      await fileSystem.mkdir(path.join(process.cwd(), 'docs'));
      await fileSystem.writeFile(path.join(process.cwd(), 'docs/api.md'), '# Docs\n\n## API\n\nAPI content');
      await fileSystem.writeFile(path.join(process.cwd(), 'docs/guide.md'), '# Guide\n\nNo API section here');
      
      const node = {
        type: 'load-content',
        source: {
          type: 'path',
          segments: [{ type: 'Text', content: 'docs/**/*.md' }],
          raw: 'docs/**/*.md'
        },
        options: {
          section: {
            identifier: { type: 'Text', content: 'API' }
          }
        }
      };

      const result = await processContentLoader(node, env);
      
      expect(isLoadContentResultArray(result)).toBe(true);
      // Files without the API section should be filtered out
    });
  });

  describe('Metadata Access', () => {
    it('should provide lazy token estimation', async () => {
      // Create a test JSON file
      await fileSystem.writeFile(path.join(process.cwd(), 'package.json'), JSON.stringify({ name: 'test-project', version: '1.0.0' }, null, 2));
      const node = {
        type: 'load-content',
        source: {
          type: 'path',
          segments: [{ type: 'Text', content: 'package.json' }],
          raw: 'package.json'
        }
      };

      const result = await processContentLoader(node, env);
      
      if (isLoadContentResult(result)) {
        expect(result.tokest).toBeGreaterThan(0);
        // JSON files should have ~400 tokens/KB estimation
        const kb = result.content.length / 1024;
        const expectedTokens = Math.round(kb * 400);
        expect(Math.abs(result.tokest - expectedTokens)).toBeLessThan(100);
      }
    });

    it('should parse JSON files lazily', async () => {
      // Create a test JSON file
      await fileSystem.writeFile(path.join(process.cwd(), 'package.json'), JSON.stringify({ name: 'mlld', version: '1.0.0' }, null, 2));
      
      const node = {
        type: 'load-content',
        source: {
          type: 'path',
          segments: [{ type: 'Text', content: 'package.json' }],
          raw: 'package.json'
        }
      };

      const result = await processContentLoader(node, env);
      
      if (isLoadContentResult(result)) {
        expect(result.json).toBeDefined();
        expect(result.json.name).toBe('mlld');
      }
    });

    it('should parse frontmatter lazily', async () => {
      // Create a test markdown file with frontmatter
      await fileSystem.writeFile(path.join(process.cwd(), 'test-frontmatter.md'), '---\ntitle: Test Document\nauthor: Test Author\n---\n\n# Content\n\nTest content here.');

      const node = {
        type: 'load-content',
        source: {
          type: 'path',
          segments: [{ type: 'Text', content: 'test-frontmatter.md' }],
          raw: 'test-frontmatter.md'
        }
      };

      const result = await processContentLoader(node, env);
      
      if (isLoadContentResult(result)) {
        expect(result.fm).toBeDefined();
        expect(result.fm.title).toBe('Test Document');
        expect(result.fm.author).toBe('Test Author');
      }
    });
  });
});