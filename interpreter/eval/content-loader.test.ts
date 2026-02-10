import { describe, it, expect, beforeEach, vi } from 'vitest';
import { processContentLoader } from './content-loader';
import { Environment } from '../env/Environment';
import { isLoadContentResult } from '@core/types/load-content';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { PathContextBuilder } from '@core/services/PathContextService';
import * as path from 'path';
import minimatch from 'minimatch';
import { glob } from 'tinyglobby';
import { unwrapStructuredForTest } from './test-helpers';
import { isStructuredValue, type StructuredValueMetadata } from '../utils/structured-value';
import { llmxmlInstance } from '../utils/llmxml-instance';

function expectLoadContentMetadata(metadata?: StructuredValueMetadata): void {
  expect(metadata?.source).toBe('load-content');
}

// Mock tinyglobby for tests
vi.mock('tinyglobby', () => ({
  glob: vi.fn()
}));

describe('Content Loader with Glob Support', () => {
  let env: Environment;
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;

  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
    env = new Environment(fileSystem, pathService, process.cwd());
    
    // Set up tinyglobby mock to work with our virtual file system
    vi.mocked(glob).mockImplementation(async (pattern: string, options: any) => {
      if (process.env.MLLD_DEBUG === 'true') {
        console.log('[glob mock] Called with pattern:', pattern, 'options:', options);
      }
      const { cwd = '/', absolute = false, ignore = [] } = options || {};
      
      // Get all files from the virtual file system
      const allFiles: string[] = [];
      const walkDir = async (dir: string) => {
        try {
          const entries = await fileSystem.readdir(dir);
          for (const entry of entries) {
            const fullPath = path.join(dir, entry);
            try {
              const stat = await fileSystem.stat(fullPath);
              if (stat.isDirectory()) {
                await walkDir(fullPath);
              } else if (stat.isFile()) {
                allFiles.push(fullPath);
              }
            } catch (statErr) {
              // File might have been deleted or is inaccessible
            }
          }
        } catch (err) {
          // Directory doesn't exist or can't be read
        }
      };
      
      await walkDir(cwd);
      
      if (process.env.MLLD_DEBUG === 'true') {
        console.log('[glob mock] Pattern:', pattern);
        console.log('[glob mock] CWD:', cwd);
        console.log('[glob mock] All files:', allFiles);
      }
      
      // Filter files by pattern and ignore patterns
      const matches = allFiles.filter(file => {
        const relativePath = path.relative(cwd, file);
        
        if (process.env.MLLD_DEBUG === 'true') {
          console.log('[glob mock] Checking:', relativePath, 'against', pattern);
        }
        
        // Check if file matches the pattern
        if (!minimatch(relativePath, pattern)) {
          return false;
        }
        
        // Check if file should be ignored
        for (const ignorePattern of ignore) {
          if (minimatch(relativePath, ignorePattern)) {
            return false;
          }
        }
        
        return true;
      });
      
      if (process.env.MLLD_DEBUG === 'true') {
        console.log('[glob mock] Matches:', matches);
        console.log('[glob mock] Absolute:', absolute);
      }
      
      // Return absolute or relative paths based on options
      const result = absolute ? matches : matches.map(file => path.relative(cwd, file));
      
      if (process.env.MLLD_DEBUG === 'true') {
        console.log('[glob mock] Returning:', result);
      }
      
      return result;
    });
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

      const rawResult = await processContentLoader(node, env);
      const { data: result, metadata } = unwrapStructuredForTest(rawResult);
      
      expect(typeof result).toBe('string');
      expect((result as string)).toContain('Test README');
      expect(metadata?.filename).toBe('README.md');
      expect(metadata?.absolute).toContain('README.md');
      expectLoadContentMetadata(metadata);
    });

    it('should handle section extraction and return LoadContentResult', async () => {
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

      const rawResult = await processContentLoader(node, env);
      const { data: result, metadata } = unwrapStructuredForTest(rawResult);
      
      expect(typeof result).toBe('string');
      expect((result as string)).toContain('Install instructions here');
      expect(metadata?.filename).toBe('README.md');
      expectLoadContentMetadata(metadata);
    });

    it('extracts sections with parentheses in the header', async () => {
      await fileSystem.writeFile(
        path.join(process.cwd(), 'README.md'),
        [
          '# Test README',
          '',
          '## Part 1: Labels (The Foundation)',
          '',
          'Content for part 1.',
          '',
          '## Part 2: Next Steps',
          '',
          'Content for part 2.'
        ].join('\n')
      );

      const node = {
        type: 'load-content',
        source: {
          type: 'path',
          segments: [{ type: 'Text', content: 'README.md' }],
          raw: 'README.md'
        },
        options: {
          section: {
            identifier: { type: 'Text', content: 'Part 1: Labels (The Foundation)' }
          }
        }
      };

      const rawResult = await processContentLoader(node, env);
      const { data: result } = unwrapStructuredForTest(rawResult);

      expect(typeof result).toBe('string');
      expect(result as string).toContain('## Part 1: Labels (The Foundation)');
      expect(result as string).toContain('Content for part 1.');
      expect(result as string).not.toContain('Content for part 2.');
    });

    it('lists headings at the requested level for section-list selectors', async () => {
      await fileSystem.writeFile(
        path.join(process.cwd(), 'sections.md'),
        [
          '# Root',
          '',
          '## Intro',
          '',
          '### Deep Intro',
          '',
          '## Usage',
          '',
          '### Deep Usage'
        ].join('\n')
      );

      const node = {
        type: 'load-content',
        source: {
          type: 'path',
          segments: [{ type: 'Text', content: 'sections.md' }],
          raw: 'sections.md'
        },
        options: {
          section: {
            identifier: { type: 'section-list', level: 2 }
          }
        }
      };

      const rawResult = await processContentLoader(node, env);
      const { data: result } = unwrapStructuredForTest<string[]>(rawResult);

      expect(result).toEqual(['Intro', 'Usage']);
    });

    it('applies rename templates when extraction falls back to heading matching', async () => {
      const getSectionSpy = vi.spyOn(llmxmlInstance, 'getSection').mockResolvedValueOnce(null as any);

      try {
        await fileSystem.writeFile(
          path.join(process.cwd(), 'fallback.md'),
          [
            '---',
            'name: fallback-doc',
            '---',
            '',
            '## Overview',
            '',
            'Fallback content.'
          ].join('\n')
        );

        const node = {
          type: 'load-content',
          source: {
            type: 'path',
            segments: [{ type: 'Text', content: 'fallback.md' }],
            raw: 'fallback.md'
          },
          options: {
            section: {
              identifier: { type: 'Text', content: 'Overview' },
              renamed: {
                type: 'rename-template',
                parts: [
                  { type: 'Text', content: '### ' },
                  {
                    type: 'FileReference',
                    source: { type: 'placeholder' },
                    fields: [{ type: 'field', value: 'fm' }, { type: 'field', value: 'name' }]
                  }
                ]
              }
            }
          }
        };

        const rawResult = await processContentLoader(node, env);
        const { data: result } = unwrapStructuredForTest<string>(rawResult);

        expect(getSectionSpy).toHaveBeenCalled();
        expect(result).toContain('### fallback-doc');
        expect(result).toContain('Fallback content.');
      } finally {
        getSectionSpy.mockRestore();
      }
    });

    it('keeps missing-section diagnostics stable', async () => {
      await fileSystem.writeFile(
        path.join(process.cwd(), 'missing.md'),
        '# Missing\n\n## Present\n\nOnly this section exists.'
      );

      const node = {
        type: 'load-content',
        source: {
          type: 'path',
          segments: [{ type: 'Text', content: 'missing.md' }],
          raw: 'missing.md'
        },
        options: {
          section: {
            identifier: { type: 'Text', content: 'NotHere' }
          }
        }
      };

      await expect(processContentLoader(node, env)).rejects.toThrow('Failed to load content: missing.md');
    });
  });

  describe('Relative path resolution', () => {
    it('uses inferred project root for @base single file metadata', async () => {
      const projectRoot = '/project';
      const scriptPath = path.join(projectRoot, 'scripts', 'main.mld');
      await fileSystem.writeFile(path.join(projectRoot, 'mlld-config.json'), '{}');
      await fileSystem.writeFile(path.join(projectRoot, 'todo', 'spec-security.md'), '# Spec');
      await fileSystem.writeFile(scriptPath, '');

      const pathContext = await PathContextBuilder.fromFile(scriptPath, fileSystem);
      const envWithContext = new Environment(fileSystem, pathService, pathContext);

      const node = {
        type: 'load-content',
        source: {
          type: 'path',
          segments: [{ type: 'Text', content: '@base/todo/spec-security.md' }],
          raw: '@base/todo/spec-security.md'
        }
      };

      const rawResult = await processContentLoader(node, envWithContext);
      const { metadata } = unwrapStructuredForTest(rawResult);

      expect(metadata?.relative).toBe('./todo/spec-security.md');
    });

    it('uses inferred project root for @base glob metadata', async () => {
      const projectRoot = '/project';
      const scriptPath = path.join(projectRoot, 'scripts', 'main.mld');
      await fileSystem.writeFile(path.join(projectRoot, 'mlld-config.json'), '{}');
      await fileSystem.writeFile(path.join(projectRoot, 'todo', 'spec-a.md'), '# A');
      await fileSystem.writeFile(path.join(projectRoot, 'todo', 'spec-b.md'), '# B');
      await fileSystem.writeFile(scriptPath, '');

      const pathContext = await PathContextBuilder.fromFile(scriptPath, fileSystem);
      const envWithContext = new Environment(fileSystem, pathService, pathContext);

      const node = {
        type: 'load-content',
        source: {
          type: 'path',
          segments: [{ type: 'Text', content: '@base/todo/*.md' }],
          raw: '@base/todo/*.md'
        }
      };

      let rawResult;
      try {
        rawResult = await processContentLoader(node, envWithContext);
      } catch (error) {
        // Surface helpful details during test failures
        // eslint-disable-next-line no-console
        console.error('load-content error details', (error as any)?.details ?? error);
        throw error;
      }
      const { data: result } = unwrapStructuredForTest(rawResult);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      // Glob results are now StructuredValues with file metadata in .mx
      expect(isStructuredValue(result[0])).toBe(true);
      expect(result.map(item => item.mx?.relative ?? item.relative).sort()).toEqual([
        './todo/spec-a.md',
        './todo/spec-b.md'
      ]);
    });
  });

  describe('Glob Pattern Loading', () => {
    it.skip('should detect and process glob patterns', async () => {
      // Create test files
      await fileSystem.writeFile(path.join(process.cwd(), 'test1.md'), '# Test 1');
      await fileSystem.writeFile(path.join(process.cwd(), 'test2.md'), '# Test 2');
      await fileSystem.writeFile(path.join(process.cwd(), 'test.txt'), 'Not markdown');
      
      if (process.env.MLLD_DEBUG === 'true') {
        console.log('[Test] Created files at:', process.cwd());
        console.log('[Test] Files exist:', {
          test1: await fileSystem.exists(path.join(process.cwd(), 'test1.md')),
          test2: await fileSystem.exists(path.join(process.cwd(), 'test2.md')),
          txt: await fileSystem.exists(path.join(process.cwd(), 'test.txt'))
        });
      }
      const node = {
        type: 'load-content',
        source: {
          type: 'path',
          segments: [{ type: 'Text', content: '*.md' }],
          raw: '*.md'
        }
      };

      const rawResult = await processContentLoader(node, env);
      const { data: result } = unwrapStructuredForTest(rawResult);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(isLoadContentResult(result[0])).toBe(true);
      expect(result[0].filename).toMatch(/\.md$/);
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

      const rawResult = await processContentLoader(node, env);
      const { data: result, metadata } = unwrapStructuredForTest(rawResult);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(isLoadContentResult(result[0])).toBe(true);
      result.forEach(file => {
        expect(file.filename).toMatch(/\.md$/);
        expect(file.relative).toContain('tests');
      });
      expectLoadContentMetadata(metadata);
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

      const rawResult = await processContentLoader(node, env);
      const { data: result } = unwrapStructuredForTest(rawResult);
      
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

      const rawResult = await processContentLoader(node, env);
      const { data: result } = unwrapStructuredForTest(rawResult);
      
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

      const rawResult = await processContentLoader(node, env);
      const { data: result } = unwrapStructuredForTest(rawResult);
      
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

      const rawResult = await processContentLoader(node, env);
      const { data: result } = unwrapStructuredForTest(rawResult);
      
      if (isLoadContentResult(result)) {
        expect(result.fm).toBeDefined();
        expect(result.fm.title).toBe('Test Document');
        expect(result.fm.author).toBe('Test Author');
      }
    });
  });

  describe('Glob + Rename (as) Functionality', () => {
    it.skip('should handle glob with section rename using as syntax', async () => {
      // Create test files with frontmatter
      await fileSystem.mkdir(path.join(process.cwd(), 'modules'));
      await fileSystem.writeFile(
        path.join(process.cwd(), 'modules', 'ai.mld.md'),
        '---\nname: ai\n---\n\n# AI Module\n\n## tldr\n\nAI integration for mlld'
      );
      await fileSystem.writeFile(
        path.join(process.cwd(), 'modules', 'array.mld.md'),
        '---\nname: array\n---\n\n# Array Module\n\n## tldr\n\nArray utilities for mlld'
      );
      
      const node = {
        type: 'load-content',
        source: {
          type: 'path',
          segments: [{ type: 'Text', content: 'modules/*.mld.md' }],
          raw: 'modules/*.mld.md'
        },
        options: {
          section: {
            identifier: { type: 'Text', content: 'tldr' },
            renamed: {
              type: 'rename-template',
              parts: [
                { type: 'Text', content: '### [' },
                {
                  type: 'FileReference',
                  source: { type: 'placeholder' },
                  fields: [{ type: 'field', value: 'fm' }, { type: 'field', value: 'name' }]
                },
                { type: 'Text', content: '](' },
                {
                  type: 'FileReference',
                  source: { type: 'placeholder' },
                  fields: [{ type: 'field', value: 'relative' }]
                },
                { type: 'Text', content: ')' }
              ]
            }
          }
        }
      };

      const rawResult = await processContentLoader(node, env);
      const { data: result } = unwrapStructuredForTest(rawResult);
      
      // With section rename, should return array of strings
      expect(Array.isArray(result)).toBe(true);
      if (Array.isArray(result)) {
        expect(result.length).toBe(2);
        expect(result[0]).toContain('### [ai](./modules/ai.mld.md)');
        expect(result[0]).toContain('AI integration for mlld');
        expect(result[1]).toContain('### [array](./modules/array.mld.md)');
        expect(result[1]).toContain('Array utilities for mlld');
      }
    });

    it('should handle single file with section rename', async () => {
      // Create test file with frontmatter
      await fileSystem.writeFile(
        path.join(process.cwd(), 'test.mld.md'),
        '---\nname: test\nauthor: Alice\n---\n\n# Test Module\n\n## Summary\n\nThis is a test summary.'
      );
      
      const node = {
        type: 'load-content',
        source: {
          type: 'path',
          segments: [{ type: 'Text', content: 'test.mld.md' }],
          raw: 'test.mld.md'
        },
        options: {
          section: {
            identifier: { type: 'Text', content: 'Summary' },
            renamed: {
              type: 'rename-template',
              parts: [
                { type: 'Text', content: '## ' },
                {
                  type: 'FileReference',
                  source: { type: 'placeholder' },
                  fields: [{ type: 'field', value: 'fm' }, { type: 'field', value: 'name' }]
                },
                { type: 'Text', content: ' by ' },
                {
                  type: 'FileReference',
                  source: { type: 'placeholder' },
                  fields: [{ type: 'field', value: 'fm' }, { type: 'field', value: 'author' }]
                }
              ]
            }
          }
        }
      };

      const rawResult = await processContentLoader(node, env);
      const { data: result, metadata } = unwrapStructuredForTest(rawResult);
      
      expect(typeof result).toBe('string');
      expect((result as string)).toContain('## test by Alice');
      expect((result as string)).toContain('This is a test summary');
      expectLoadContentMetadata(metadata);
    });

    it('should handle placeholder without field access', async () => {
      // Create test file
      await fileSystem.writeFile(
        path.join(process.cwd(), 'doc.md'),
        '# Documentation\n\n## Overview\n\nThis is the overview section.'
      );
      
      const node = {
        type: 'load-content',
        source: {
          type: 'path',
          segments: [{ type: 'Text', content: 'doc.md' }],
          raw: 'doc.md'
        },
        options: {
          section: {
            identifier: { type: 'Text', content: 'Overview' },
            renamed: {
              type: 'rename-template',
              parts: [
                { type: 'Text', content: '### File: ' },
                {
                  type: 'FileReference',
                  source: { type: 'placeholder' }
                  // No fields - should use the content
                }
              ]
            }
          }
        }
      };

      const rawResult = await processContentLoader(node, env);
      const { data: result, metadata } = unwrapStructuredForTest(rawResult);
      
      expect(typeof result).toBe('string');
      // Without fields, <> should reference the content itself
      expect((result as string)).toContain('### File: This is the overview section.');
      expectLoadContentMetadata(metadata);
    });

    it('should support backtick templates in rename', async () => {
      // Create test file
      await fileSystem.writeFile(
        path.join(process.cwd(), 'module.md'),
        '---\nname: mymodule\nversion: 1.0.0\n---\n\n# Module\n\n## Description\n\nModule description here.'
      );
      
      const node = {
        type: 'load-content',
        source: {
          type: 'path',
          segments: [{ type: 'Text', content: 'module.md' }],
          raw: 'module.md'
        },
        options: {
          section: {
            identifier: { type: 'Text', content: 'Description' },
            renamed: {
              type: 'rename-template',
              parts: [
                { type: 'Text', content: '## ' },
                {
                  type: 'FileReference',
                  source: { type: 'placeholder' },
                  fields: [{ type: 'field', value: 'fm' }, { type: 'field', value: 'name' }]
                },
                { type: 'Text', content: ' v' },
                {
                  type: 'FileReference',
                  source: { type: 'placeholder' },
                  fields: [{ type: 'field', value: 'fm' }, { type: 'field', value: 'version' }]
                }
              ]
            }
          }
        }
      };

      const rawResult = await processContentLoader(node, env);
      const { data: result, metadata } = unwrapStructuredForTest(rawResult);
      
      expect(typeof result).toBe('string');
      expect((result as string)).toContain('## mymodule v1.0.0');
      expect((result as string)).toContain('Module description here');
      expectLoadContentMetadata(metadata);
    });
  });
});
