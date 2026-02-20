import { describe, it, expect, beforeEach, vi } from 'vitest';
import { processContentLoader } from './content-loader';
import { Environment } from '../env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { isStructuredValue } from '../utils/structured-value';
import { unwrapStructuredForTest } from './test-helpers';
import * as path from 'path';
import { minimatch } from 'minimatch';
import { glob } from 'tinyglobby';

// Mock tinyglobby for tests
vi.mock('tinyglobby', () => ({
  glob: vi.fn()
}));

describe('Glob nullable suffix (?)', () => {
  let env: Environment;
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;

  beforeEach(async () => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
    env = new Environment(fileSystem, pathService, '/test');

    // Create test files for glob matching
    await fileSystem.writeFile('/test/a.md', '# File A\nContent A');
    await fileSystem.writeFile('/test/b.md', '# File B\nContent B');
    await fileSystem.writeFile('/test/c.md', '# File C\nContent C');
    await fileSystem.writeFile('/test/d.json', '{"name": "d"}');

    // Set up glob mock
    vi.mocked(glob).mockImplementation(async (pattern: string, options: any) => {
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
            } catch {
              // File inaccessible
            }
          }
        } catch {
          // Directory doesn't exist
        }
      };

      await walkDir(cwd);

      // Filter files by pattern
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

  it('should strip trailing ? from glob pattern and return matched files', async () => {
    // Pattern with ? suffix: "*.md?" should be treated as "*.md" (optional/nullable)
    const node = {
      type: 'load-content',
      source: {
        type: 'path',
        segments: [{ type: 'Text', content: '*.md?' }],
        raw: '*.md?'
      }
    };

    const rawResult = await processContentLoader(node, env);
    const { data: result } = unwrapStructuredForTest(rawResult);

    // Should return array of matching files
    expect(Array.isArray(result)).toBe(true);
    // Should match a.md, b.md, c.md (3 files)
    expect(result.length).toBe(3);
  });

  it('should return same results with and without ? suffix', async () => {
    const nodeWithSuffix = {
      type: 'load-content',
      source: {
        type: 'path',
        segments: [{ type: 'Text', content: '*.md?' }],
        raw: '*.md?'
      }
    };

    const nodeWithoutSuffix = {
      type: 'load-content',
      source: {
        type: 'path',
        segments: [{ type: 'Text', content: '*.md' }],
        raw: '*.md'
      }
    };

    const rawResultWith = await processContentLoader(nodeWithSuffix, env);
    const rawResultWithout = await processContentLoader(nodeWithoutSuffix, env);
    const { data: resultWith } = unwrapStructuredForTest(rawResultWith);
    const { data: resultWithout } = unwrapStructuredForTest(rawResultWithout);

    // Both should return arrays with the same number of elements
    expect(Array.isArray(resultWith)).toBe(true);
    expect(Array.isArray(resultWithout)).toBe(true);
    expect(resultWith.length).toBe(resultWithout.length);
  });

  it('should return empty array for non-matching glob with ? suffix', async () => {
    const node = {
      type: 'load-content',
      source: {
        type: 'path',
        segments: [{ type: 'Text', content: '*.xyz?' }],
        raw: '*.xyz?'
      }
    };

    const rawResult = await processContentLoader(node, env);
    const { data: result } = unwrapStructuredForTest(rawResult);

    // Should return empty array (not error)
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it('glob pattern ending with ? should not be passed to glob library as-is', async () => {
    const node = {
      type: 'load-content',
      source: {
        type: 'path',
        segments: [{ type: 'Text', content: '*.json?' }],
        raw: '*.json?'
      }
    };

    await processContentLoader(node, env);

    // The glob library should have been called with "*.json" (without the trailing ?)
    expect(glob).toHaveBeenCalled();
    const calls = vi.mocked(glob).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall[0]).toBe('*.json'); // Pattern without trailing ?
  });
});
