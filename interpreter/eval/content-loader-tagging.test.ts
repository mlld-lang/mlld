import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Environment } from '@interpreter/env/Environment';
import { processContentLoader } from './content-loader';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import path from 'path';
import { unwrapStructuredForTest } from './test-helpers';
import { isStructuredValue } from '@interpreter/utils/structured-value';
import minimatch from 'minimatch';
import { glob } from 'tinyglobby';

vi.mock('tinyglobby', () => ({
  glob: vi.fn()
}));

describe('Content Loader StructuredValue Tagging', () => {
  let env: Environment;
  let fileSystem: MemoryFileSystem;

  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    env = new Environment(fileSystem, new PathService(), '/test-project');

    vi.mocked(glob).mockImplementation(async (pattern: string, options: any) => {
      const { cwd = '/', absolute = false, ignore = [] } = options || {};

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
            } catch {
              // ignore
            }
          }
        } catch {
          // ignore
        }
      };

      await walkDir(cwd);

      const matches = allFiles.filter(file => {
        const relativePath = path.relative(cwd, file);
        if (!minimatch(relativePath, pattern)) {
          return false;
        }
        for (const ignorePattern of ignore) {
          if (minimatch(relativePath, ignorePattern)) {
            return false;
          }
        }
        return true;
      });

      return absolute ? matches : matches.map(file => path.relative(cwd, file));
    });
  });

  it('should return StructuredValue with array type for glob pattern results', async () => {
    // Set up test files in memory file system
    await fileSystem.mkdir('/test-project/tests/cases/files', { recursive: true });
    await fileSystem.writeFile('/test-project/tests/cases/files/file1.txt', 'Content of file 1');
    await fileSystem.writeFile('/test-project/tests/cases/files/file2.txt', 'Content of file 2');

    // Create a load-content node (glob pattern without section)
    const loadContentNode = {
      type: 'load-content',
      source: {
        type: 'path',
        segments: [{ type: 'Text', content: 'tests/cases/files/*.txt' }],
        raw: 'tests/cases/files/*.txt'
      }
    };

    // Process the content loader
    const result = await processContentLoader(loadContentNode, env);

    // Check that result is a StructuredValue
    expect(isStructuredValue(result)).toBe(true);

    // Check the type is array
    expect(result.type).toBe('array');

    // Check metadata source
    expect(result.metadata?.source).toBe('load-content');

    // Check mx.source
    expect(result.mx.source).toBe('load-content');

    // Check that data is an array with 2 items (LoadContentResult objects)
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBe(2);
  });
  
  it('should preserve StructuredValue type through string coercion', async () => {
    // Set up test files in memory file system
    await fileSystem.mkdir('/test-project/tests/cases/files', { recursive: true });
    await fileSystem.writeFile('/test-project/tests/cases/files/file1.txt', 'Content of file 1');
    await fileSystem.writeFile('/test-project/tests/cases/files/file2.txt', 'Content of file 2');

    // Create a load-content node (glob pattern)
    const loadContentNode = {
      type: 'load-content',
      source: {
        type: 'path',
        segments: [{ type: 'Text', content: 'tests/cases/files/*.txt' }],
        raw: 'tests/cases/files/*.txt'
      }
    };

    // Process the content loader
    const result = await processContentLoader(loadContentNode, env);

    // Check that result is a StructuredValue
    expect(isStructuredValue(result)).toBe(true);

    // Verify that toString works
    expect(typeof result.toString()).toBe('string');

    // Verify that text property exists
    expect(typeof result.text).toBe('string');

    // Verify that data is an array
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBe(2);
  });
  
  it('should preserve StructuredValue metadata through operations', async () => {
    // Set up test files
    await fileSystem.mkdir('/test-project/test', { recursive: true });
    await fileSystem.writeFile('/test-project/test/file1.txt', 'Content 1');
    await fileSystem.writeFile('/test-project/test/file2.txt', 'Content 2');

    // Create a load-content node
    const loadContentNode = {
      type: 'load-content',
      source: {
        type: 'path',
        segments: [{ type: 'Text', content: 'test/*.txt' }],
        raw: 'test/*.txt'
      }
    };

    const result = await processContentLoader(loadContentNode, env);

    // Verify it's a StructuredValue
    expect(isStructuredValue(result)).toBe(true);
    expect(result.type).toBe('array');
    expect(result.metadata?.source).toBe('load-content');

    // Verify that the StructuredValue can be accessed as text
    expect(typeof result.text).toBe('string');
    expect(typeof result.toString()).toBe('string');
  });
});
