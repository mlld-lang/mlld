import { describe, it, expect, beforeEach, vi } from 'vitest';
import { processContentLoader } from './content-loader';
import { Environment } from '../env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { MlldSecurityError } from '@core/errors';
import { unwrapStructuredForTest } from './test-helpers';
import { glob } from 'tinyglobby';
import path from 'path';
import { minimatch } from 'minimatch';
import { isStructuredValue } from '../utils/structured-value';
import { createSimpleTextVariable, type VariableSource } from '@core/types/variable';
import { llmxmlInstance } from '../utils/llmxml-instance';

vi.mock('tinyglobby', () => ({
  glob: vi.fn()
}));

const VARIABLE_SOURCE: VariableSource = {
  directive: 'var',
  syntax: 'quoted',
  hasInterpolation: false,
  isMultiLine: false
};

function extractResultText(value: any): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value && typeof value === 'object') {
    if (typeof value.text === 'string') {
      return value.text;
    }
    if (value.mx && typeof value.mx.content === 'string') {
      return value.mx.content;
    }
    if (typeof value.content === 'string') {
      return value.content;
    }
    if (value.data && typeof value.data.content === 'string') {
      return value.data.content;
    }
  }

  return String(value ?? '');
}

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

  it('keeps glob section extraction ordering and filtering stable', async () => {
    await fileSystem.mkdir('/project/docs', { recursive: true });
    await fileSystem.writeFile('/project/docs/z-missing.md', '# Z\n\n## Intro\n\nNo API.');
    await fileSystem.writeFile('/project/docs/a-api.md', '# A\n\n## API\n\nA api.');
    await fileSystem.writeFile('/project/docs/m-api.md', '# M\n\n## API\n\nM api.');

    vi.mocked(glob).mockResolvedValueOnce([
      '/project/docs/z-missing.md',
      '/project/docs/m-api.md',
      '/project/docs/a-api.md'
    ]);

    const node = {
      type: 'load-content',
      source: {
        type: 'path',
        segments: [{ type: 'Text', content: 'docs/*.md' }],
        raw: 'docs/*.md'
      },
      options: {
        section: {
          identifier: { type: 'Text', content: 'API' }
        }
      }
    };

    const rawResult = await processContentLoader(node as any, env);
    const { data: result, metadata } = unwrapStructuredForTest<Array<any>>(rawResult);
    const filenames = result.map(item => item.mx?.filename ?? item.filename);
    const relatives = result.map(item => item.mx?.relative ?? item.relative);
    const contents = result.map(item => item.text ?? item.mx?.content ?? item.content ?? item.data?.content);

    expect(Array.isArray(result)).toBe(true);
    expect(filenames).toEqual(['a-api.md', 'm-api.md']);
    expect(relatives).toEqual(['./docs/a-api.md', './docs/m-api.md']);
    expect(contents).toEqual(
      expect.arrayContaining([
        expect.stringContaining('## API'),
        expect.stringContaining('## API')
      ])
    );
    expect(metadata?.source).toBe('load-content');
  });

  it('keeps glob section extraction skip behavior stable when every file misses the requested section', async () => {
    await fileSystem.mkdir('/project/docs', { recursive: true });
    await fileSystem.writeFile('/project/docs/a.md', '# A\n\n## Intro\n\nOnly intro.');
    await fileSystem.writeFile('/project/docs/b.md', '# B\n\n## Usage\n\nOnly usage.');

    vi.mocked(glob).mockResolvedValueOnce([
      '/project/docs/b.md',
      '/project/docs/a.md'
    ]);

    const node = {
      type: 'load-content',
      source: {
        type: 'path',
        segments: [{ type: 'Text', content: 'docs/*.md' }],
        raw: 'docs/*.md'
      },
      options: {
        section: {
          identifier: { type: 'Text', content: 'API' }
        }
      }
    };

    const rawResult = await processContentLoader(node as any, env);
    const { data: result, metadata } = unwrapStructuredForTest<Array<any>>(rawResult);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([]);
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

  it('keeps integrated source reconstruction + AST transform + finalization behavior stable', async () => {
    await fileSystem.mkdir('/project/src', { recursive: true });
    await fileSystem.writeFile(
      '/project/src/profile.ts',
      [
        'export function createProfile() {',
        '  return 42;',
        '}'
      ].join('\n')
    );

    env.setVariable(
      'targetFile',
      createSimpleTextVariable('targetFile', 'profile.ts', VARIABLE_SOURCE)
    );

    const node = {
      type: 'load-content',
      source: {
        type: 'path',
        segments: [
          { type: 'Text', content: 'src/' },
          { type: 'VariableReference', identifier: 'targetFile' }
        ],
        raw: 'src/@targetFile'
      },
      ast: [{ type: 'definition', name: 'createProfile' }],
      options: {
        transform: {
          type: 'template',
          parts: [
            { type: 'Text', content: 'fn=' },
            { type: 'placeholder', fields: [{ value: 'name' }] },
            { type: 'Text', content: ';type=' },
            { type: 'placeholder', fields: [{ value: 'type' }] }
          ]
        }
      }
    };

    const rawResult = await processContentLoader(node as any, env);
    expect(isStructuredValue(rawResult)).toBe(true);

    if (isStructuredValue(rawResult)) {
      expect(rawResult.type).toBe('text');
      expect(typeof rawResult.data).toBe('string');
      expect(rawResult.data).toContain('fn=createProfile');
      expect(rawResult.data).toContain('type=function');
      expect(rawResult.metadata?.source).toBe('load-content');
    }
  });

  it('keeps mixed transform and structured-output finalization shape stable', async () => {
    await fileSystem.mkdir('/project/docs', { recursive: true });
    await fileSystem.mkdir('/project/data', { recursive: true });
    await fileSystem.writeFile('/project/docs/mixed.md', '# Mixed\n\nBody');
    await fileSystem.writeFile('/project/data/mixed.json', '[{"id":1}]');

    const transformedNode = {
      type: 'load-content',
      source: {
        type: 'path',
        segments: [{ type: 'Text', content: 'docs/mixed.md' }],
        raw: 'docs/mixed.md'
      },
      options: {
        transform: {
          type: 'template',
          parts: [
            { type: 'Text', content: 'rendered=' },
            { type: 'placeholder' }
          ]
        }
      }
    };

    const structuredNode = {
      type: 'load-content',
      source: {
        type: 'path',
        segments: [{ type: 'Text', content: 'data/mixed.json' }],
        raw: 'data/mixed.json'
      }
    };

    const [transformedRaw, structuredRaw] = await Promise.all([
      processContentLoader(transformedNode as any, env),
      processContentLoader(structuredNode as any, env)
    ]);

    expect(isStructuredValue(transformedRaw)).toBe(true);
    expect(isStructuredValue(structuredRaw)).toBe(true);

    const { data: transformed, metadata: transformedMeta } = unwrapStructuredForTest<string>(transformedRaw);
    const { data: structured, metadata: structuredMeta } = unwrapStructuredForTest<Array<{ id: number }>>(structuredRaw);

    expect(typeof transformed).toBe('string');
    expect(transformed).toContain('rendered=# Mixed');
    expect(transformedMeta?.source).toBe('load-content');

    expect(Array.isArray(structured)).toBe(true);
    expect(structured).toEqual([{ id: 1 }]);
    expect(structuredMeta?.source).toBe('load-content');
  });

  it('keeps glob + AST + template wrapper/type inference behavior stable', async () => {
    await fileSystem.mkdir('/project/src', { recursive: true });
    await fileSystem.writeFile(
      '/project/src/only.ts',
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
        segments: [{ type: 'Text', content: 'src/*.ts' }],
        raw: 'src/*.ts'
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
    expect(isStructuredValue(rawResult)).toBe(true);

    if (isStructuredValue(rawResult)) {
      expect(rawResult.type).toBe('text');
      expect(Array.isArray(rawResult.data)).toBe(true);
      expect(rawResult.data).toEqual(['name=createUser;kind=function']);
      expect(rawResult.text).toContain('name=createUser;kind=function');
      expect(rawResult.metadata?.source).toBe('load-content');
    }
  });

  it('keeps path interpolation behavior stable for variable-based sources', async () => {
    await fileSystem.mkdir('/project/docs', { recursive: true });
    await fileSystem.writeFile('/project/docs/interpolated.md', '# Interpolated\n\nok');
    env.setVariable(
      'targetPath',
      createSimpleTextVariable('targetPath', 'docs/interpolated.md', VARIABLE_SOURCE)
    );

    const node = {
      type: 'load-content',
      source: {
        type: 'path',
        segments: [{ type: 'VariableReference', identifier: 'targetPath' }],
        raw: '@targetPath'
      }
    };

    const rawResult = await processContentLoader(node as any, env);
    const { data: result, metadata } = unwrapStructuredForTest<string>(rawResult);

    expect(typeof result).toBe('string');
    expect(result).toContain('Interpolated');
    expect(metadata?.filename).toBe('interpolated.md');
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

  it('keeps URL/HTML and file/glob parity stable for equivalent section requests', async () => {
    await fileSystem.mkdir('/project/parity', { recursive: true });
    const htmlDocument = [
      '<!DOCTYPE html>',
      '<html><head><title>Parity</title></head>',
      '<body>',
      '<article>',
      '<h1>Guide</h1>',
      '<h2>Overview</h2>',
      '<p>Parity body text.</p>',
      '</article>',
      '</body></html>'
    ].join('');
    await fileSystem.writeFile('/project/parity/guide.html', htmlDocument);

    env.fetchURLWithMetadata = vi.fn().mockResolvedValue({
      content: htmlDocument,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      status: 200
    } as any);

    const sharedSectionOption = {
      section: {
        identifier: { type: 'Text', content: 'Overview' }
      }
    };

    const urlNode = {
      type: 'load-content',
      source: {
        type: 'url',
        raw: 'https://example.com/guide'
      },
      options: sharedSectionOption
    };

    const fileNode = {
      type: 'load-content',
      source: {
        type: 'path',
        segments: [{ type: 'Text', content: 'parity/guide.html' }],
        raw: 'parity/guide.html'
      },
      options: sharedSectionOption
    };

    const globNode = {
      type: 'load-content',
      source: {
        type: 'path',
        segments: [{ type: 'Text', content: 'parity/*.html' }],
        raw: 'parity/*.html'
      },
      options: sharedSectionOption
    };

    const [urlRaw, fileRaw, globRaw] = await Promise.all([
      processContentLoader(urlNode as any, env),
      processContentLoader(fileNode as any, env),
      processContentLoader(globNode as any, env)
    ]);

    const { data: urlData, metadata: urlMetadata } = unwrapStructuredForTest<string>(urlRaw);
    const { data: fileData, metadata: fileMetadata } = unwrapStructuredForTest<string>(fileRaw);
    const { data: globData, metadata: globMetadata } = unwrapStructuredForTest<Array<any>>(globRaw);

    const globText = Array.isArray(globData) && globData.length > 0 ? extractResultText(globData[0]) : '';

    expect(typeof urlData).toBe('string');
    expect(typeof fileData).toBe('string');
    expect(Array.isArray(globData)).toBe(true);
    expect(globData.length).toBe(1);

    expect(urlData).toContain('Overview');
    expect(urlData).toContain('Parity body text.');
    expect(fileData).toContain('Overview');
    expect(fileData).toContain('Parity body text.');
    expect(globText).toContain('Overview');
    expect(globText).toContain('Parity body text.');

    expect(urlMetadata?.source).toBe('load-content');
    expect(fileMetadata?.source).toBe('load-content');
    expect(globMetadata?.source).toBe('load-content');
  });

  it('keeps llmxml and regex fallback section matching stable through finalization', async () => {
    await fileSystem.mkdir('/project/fallback', { recursive: true });
    await fileSystem.writeFile(
      '/project/fallback/guide.md',
      [
        '# Guide',
        '',
        '## Deep Dive',
        '',
        'Fallback content body.',
        '',
        '### Nested',
        '',
        'Nested details.'
      ].join('\n')
    );

    const sectionNode = {
      type: 'load-content',
      source: {
        type: 'path',
        segments: [{ type: 'Text', content: 'fallback/guide.md' }],
        raw: 'fallback/guide.md'
      },
      options: {
        section: {
          identifier: { type: 'Text', content: 'Deep Dive' }
        }
      }
    };

    const llmxmlRaw = await processContentLoader(sectionNode as any, env);
    const { data: llmxmlData, metadata: llmxmlMetadata } = unwrapStructuredForTest<string>(llmxmlRaw);

    const getSectionSpy = vi.spyOn(llmxmlInstance, 'getSection').mockRejectedValueOnce(new Error('llmxml unavailable'));
    const fallbackRaw = await processContentLoader(sectionNode as any, env);
    const { data: fallbackData, metadata: fallbackMetadata } = unwrapStructuredForTest<string>(fallbackRaw);
    getSectionSpy.mockRestore();

    expect(typeof llmxmlData).toBe('string');
    expect(typeof fallbackData).toBe('string');
    expect(llmxmlData).toContain('Deep Dive');
    expect(fallbackData).toContain('Deep Dive');
    expect(fallbackData).toContain('Fallback content body.');
    expect(fallbackData).toBe(llmxmlData);
    expect(llmxmlMetadata?.source).toBe('load-content');
    expect(fallbackMetadata?.source).toBe('load-content');
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

  it('keeps nullable suffix behavior stable by stripping trailing ? before resolution', async () => {
    const node = {
      type: 'load-content',
      optional: true,
      source: {
        type: 'path',
        segments: [{ type: 'Text', content: 'missing.md?' }],
        raw: 'missing.md?'
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

  it('keeps policy-denied and optional-loader variants stable for final return contracts', async () => {
    const deniedNode = {
      type: 'load-content',
      optional: true,
      source: {
        type: 'path',
        segments: [{ type: 'Text', content: 'blocked.md' }],
        raw: 'blocked.md'
      }
    };

    const securityError = new MlldSecurityError('Access denied: blocked');
    const resolveSpy = vi.spyOn(env, 'resolvePath').mockResolvedValue('/project/blocked.md');
    const readSpy = vi.spyOn(env, 'readFile').mockRejectedValue(securityError);
    await expect(processContentLoader(deniedNode as any, env)).rejects.toBe(securityError);
    resolveSpy.mockRestore();
    readSpy.mockRestore();

    const optionalMissingNode = {
      type: 'load-content',
      optional: true,
      source: {
        type: 'path',
        segments: [{ type: 'Text', content: 'missing-optional.md' }],
        raw: 'missing-optional.md'
      }
    };
    const optionalMissingResult = await processContentLoader(optionalMissingNode as any, env);
    expect(optionalMissingResult).toBeNull();

    vi.mocked(glob).mockRejectedValueOnce(new Error('glob failure'));
    const optionalGlobNode = {
      type: 'load-content',
      optional: true,
      source: {
        type: 'path',
        segments: [{ type: 'Text', content: '*.md' }],
        raw: '*.md'
      }
    };
    const optionalGlobRaw = await processContentLoader(optionalGlobNode as any, env);
    const { data: optionalGlobData, metadata: optionalGlobMetadata } = unwrapStructuredForTest<Array<any>>(optionalGlobRaw);

    expect(Array.isArray(optionalGlobData)).toBe(true);
    expect(optionalGlobData).toEqual([]);
    expect(optionalGlobMetadata?.source).toBe('load-content');
  });

  it('keeps downstream pipeline compatibility stable for text, array, and object finalization families', async () => {
    await fileSystem.mkdir('/project/families', { recursive: true });
    await fileSystem.writeFile('/project/families/text.md', '  # Heading\n\nText body.  ');
    await fileSystem.writeFile('/project/families/a.md', '  alpha  ');
    await fileSystem.writeFile('/project/families/b.md', '  beta  ');
    await fileSystem.writeFile('/project/families/object.md', '  object payload  ');

    const trimPipe = [
      {
        type: 'CondensedPipe',
        transform: 'trim',
        hasAt: true,
        args: [],
        location: null
      }
    ];

    const textNode = {
      type: 'load-content',
      source: {
        type: 'path',
        segments: [{ type: 'Text', content: 'families/text.md' }],
        raw: 'families/text.md'
      },
      options: {
        section: {
          identifier: { type: 'Text', content: 'Heading' }
        }
      },
      pipes: trimPipe
    };

    const arrayNode = {
      type: 'load-content',
      source: {
        type: 'path',
        segments: [{ type: 'Text', content: 'families/{a,b}.md' }],
        raw: 'families/{a,b}.md'
      },
      pipes: trimPipe
    };

    const objectNode = {
      type: 'load-content',
      source: {
        type: 'path',
        segments: [{ type: 'Text', content: 'families/object.md' }],
        raw: 'families/object.md'
      },
      pipes: trimPipe
    };

    const [textRaw, arrayRaw, objectRaw] = await Promise.all([
      processContentLoader(textNode as any, env),
      processContentLoader(arrayNode as any, env),
      processContentLoader(objectNode as any, env)
    ]);

    const { data: textResult, metadata: textMetadata } = unwrapStructuredForTest<string>(textRaw);
    const { data: arrayResult, metadata: arrayMetadata } = unwrapStructuredForTest<Array<any>>(arrayRaw);
    const { data: objectResult, metadata: objectMetadata } = unwrapStructuredForTest<string>(objectRaw);

    expect(typeof textResult).toBe('string');
    expect(textResult).toContain('Heading');
    expect(textResult).toContain('Text body.');
    expect(textMetadata?.source).toBe('load-content');

    expect(Array.isArray(arrayResult)).toBe(true);
    expect(arrayResult.length).toBe(2);
    expect(arrayMetadata?.source).toBe('load-content');

    expect(typeof objectResult).toBe('string');
    expect(objectResult).toBe('object payload');
    expect(objectMetadata?.source).toBe('load-content');
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
