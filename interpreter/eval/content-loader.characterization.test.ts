import { describe, it, expect, beforeEach, vi } from 'vitest';
import { processContentLoader } from './content-loader';
import { Environment } from '../env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { MlldSecurityError } from '@core/errors';
import { unwrapStructuredForTest } from './test-helpers';
import { glob } from 'tinyglobby';
import path from 'path';
import minimatch from 'minimatch';
import { isStructuredValue } from '../utils/structured-value';

vi.mock('tinyglobby', () => ({
  glob: vi.fn()
}));

describe('processContentLoader characterization', () => {
  let env: Environment;
  let fileSystem: MemoryFileSystem;
  const baseDir = '/project';

  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    env = new Environment(fileSystem, new PathService(), baseDir);
    env.setCurrentFilePath('/project/main.mld');

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
              // ignore unreadable entries
            }
          }
        } catch {
          // ignore missing directories
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

  it('keeps glob + section-list behavior stable with per-file heading buckets', async () => {
    await fileSystem.mkdir('/project/docs', { recursive: true });
    await fileSystem.writeFile(
      '/project/docs/a.md',
      '# A\n\n## Intro\n\nA intro.\n\n## API\n\nA api.'
    );
    await fileSystem.writeFile(
      '/project/docs/b.md',
      '# B\n\n## Usage\n\nB usage.'
    );

    const node = {
      type: 'load-content',
      source: {
        type: 'path',
        segments: [{ type: 'Text', content: 'docs/*.md' }],
        raw: 'docs/*.md'
      },
      options: {
        section: {
          identifier: { type: 'section-list', level: 2 }
        }
      }
    };

    const rawResult = await processContentLoader(node as any, env);
    expect(isStructuredValue(rawResult)).toBe(true);
    const { data: result, metadata } = unwrapStructuredForTest<Array<any>>(rawResult);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'a.md',
          names: expect.arrayContaining(['Intro', 'API']),
          relative: './docs/a.md'
        }),
        expect.objectContaining({
          file: 'b.md',
          names: expect.arrayContaining(['Usage']),
          relative: './docs/b.md'
        })
      ])
    );
    expect(metadata?.source).toBe('load-content');
  });

  it('keeps AST + transform branch behavior stable for single-file extraction', async () => {
    await fileSystem.mkdir('/project/src', { recursive: true });
    await fileSystem.writeFile(
      '/project/src/service.ts',
      [
        'export function createUser() {',
        '  return 1;',
        '}'
      ].join('\n')
    );

    const node = {
      type: 'load-content',
      source: {
        type: 'path',
        segments: [{ type: 'Text', content: 'src/service.ts' }],
        raw: 'src/service.ts'
      },
      ast: [{ type: 'definition', name: 'createUser' }],
      options: {
        transform: {
          type: 'template',
          parts: [
            { type: 'Text', content: 'name=' },
            { type: 'placeholder', fields: [{ value: 'name' }] },
            { type: 'Text', content: ';kind=' },
            { type: 'placeholder', fields: [{ value: 'type' }] }
          ]
        }
      }
    };

    const rawResult = await processContentLoader(node as any, env);
    const { data: result, metadata } = unwrapStructuredForTest<string>(rawResult);

    expect(typeof result).toBe('string');
    expect(result).toContain('name=createUser');
    expect(result).toContain('kind=function');
    expect(metadata?.source).toBe('load-content');
  });

  it('keeps URL HTML conversion behavior stable through markdown output finalization', async () => {
    env.fetchURLWithMetadata = vi.fn().mockResolvedValue({
      content: [
        '<!DOCTYPE html>',
        '<html><head><title>Converted</title></head>',
        '<body>',
        '<article>',
        '<h1>Main Title</h1>',
        '<p>Main body text.</p>',
        '</article>',
        '</body></html>'
      ].join(''),
      headers: { 'content-type': 'text/html; charset=utf-8' },
      status: 200
    } as any);

    const node = {
      type: 'load-content',
      source: {
        type: 'url',
        raw: 'https://example.com/page'
      }
    };

    const rawResult = await processContentLoader(node as any, env);
    const { data: result, metadata } = unwrapStructuredForTest<string>(rawResult);

    expect(typeof result).toBe('string');
    expect(result).toContain('Main body text.');
    expect(result).toContain('Main Title');
    expect(result).not.toContain('<article>');
    expect(metadata?.url).toBe('https://example.com/page');
    expect(metadata?.source).toBe('load-content');
  });

  it('keeps optional-loader behavior stable for missing single-file sources', async () => {
    const node = {
      type: 'load-content',
      optional: true,
      source: {
        type: 'path',
        segments: [{ type: 'Text', content: 'missing.md' }],
        raw: 'missing.md'
      }
    };

    const result = await processContentLoader(node as any, env);
    expect(result).toBeNull();
  });

  it('keeps optional-loader behavior stable for glob failures by returning an empty array', async () => {
    vi.mocked(glob).mockRejectedValueOnce(new Error('glob failure'));

    const node = {
      type: 'load-content',
      optional: true,
      source: {
        type: 'path',
        segments: [{ type: 'Text', content: '*.md' }],
        raw: '*.md'
      }
    };

    const rawResult = await processContentLoader(node as any, env);
    const { data: result, metadata } = unwrapStructuredForTest<Array<any>>(rawResult);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([]);
    expect(metadata?.source).toBe('load-content');
  });

  it('keeps security-error passthrough behavior stable for file reads', async () => {
    const securityError = new MlldSecurityError('Access denied: blocked');
    vi.spyOn(env, 'resolvePath').mockResolvedValue('/project/blocked.md');
    vi.spyOn(env, 'readFile').mockRejectedValue(securityError);

    const node = {
      type: 'load-content',
      source: {
        type: 'path',
        segments: [{ type: 'Text', content: 'blocked.md' }],
        raw: 'blocked.md'
      }
    };

    await expect(processContentLoader(node as any, env)).rejects.toBe(securityError);
  });
});
