import { beforeEach, describe, expect, it, vi } from 'vitest';
import { glob } from 'tinyglobby';
import { buildFileSigningMetadata, SigService } from '@core/security';
import { processContentLoader } from './eval/content-loader';
import { Environment } from './env/Environment';
import { isStructuredValue } from './utils/structured-value';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { minimatch } from 'minimatch';
import { execute } from '@sdk/execute';

vi.mock('tinyglobby', () => ({
  glob: vi.fn()
}));

describe('filesystem integrity Phase 2', () => {
  let fileSystem: MemoryFileSystem;
  let env: Environment;
  let sigService: SigService;

  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    env = new Environment(fileSystem, new PathService(), '/project');
    env.setCurrentFilePath('/project/main.mld');
    sigService = new SigService('/project', fileSystem);
    env.setSigService(sigService);

    vi.mocked(glob).mockImplementation(async (pattern: string, options: any) => {
      const { cwd = '/', absolute = false, ignore = [] } = options || {};
      const allFiles: string[] = [];

      const walk = async (dir: string) => {
        try {
          const entries = await fileSystem.readdir(dir);
          for (const entry of entries) {
            const fullPath = path.join(dir, entry);
            const stat = await fileSystem.stat(fullPath).catch(() => null);
            if (!stat) {
              continue;
            }
            if (stat.isDirectory()) {
              await walk(fullPath);
              continue;
            }
            if (stat.isFile()) {
              allFiles.push(fullPath);
            }
          }
        } catch {
          // Ignore missing directories in tests.
        }
      };

      await walk(cwd);

      const matches = allFiles.filter((filePath) => {
        const relative = path.relative(cwd, filePath);
        if (!minimatch(relative, pattern)) {
          return false;
        }
        return !ignore.some((ignorePattern: string) => minimatch(relative, ignorePattern));
      });

      return absolute ? matches.sort() : matches.map((match) => path.relative(cwd, match)).sort();
    });
  });

  it('stores verified sig metadata on single-file reads and prefers sig taint over audit fallback', async () => {
    await fileSystem.writeFile('/project/docs/note.txt', 'hello world');
    await fileSystem.writeFile(
      '/project/.mlld/sec/audit.jsonl',
      JSON.stringify({
        event: 'write',
        path: '/project/docs/note.txt',
        taint: ['audit-only'],
        writer: 'user:audit'
      }) + '\n'
    );
    await sigService.sign(
      '/project/docs/note.txt',
      'user:alice',
      buildFileSigningMetadata(['sig-only'])
    );

    const result = await processContentLoader(
      {
        type: 'load-content',
        source: {
          type: 'path',
          segments: [{ type: 'Text', content: 'docs/note.txt' }],
          raw: 'docs/note.txt'
        }
      } as any,
      env
    );

    expect(isStructuredValue(result)).toBe(true);
    const wrapper = result as any;
    expect(wrapper.metadata?.sig).toMatchObject({
      status: 'verified',
      signer: 'user:alice',
      metadata: {
        taint: ['sig-only']
      }
    });
    expect(wrapper.mx.taint).toContain('sig-only');
    expect(wrapper.mx.taint).not.toContain('audit-only');
  });

  it('reuses the verification cache across repeated reads and attaches sig metadata to glob items', async () => {
    await fileSystem.writeFile('/project/docs/a.txt', 'alpha');
    await fileSystem.writeFile('/project/docs/b.txt', 'beta');
    await sigService.sign('/project/docs/a.txt', 'user:reader', buildFileSigningMetadata(['trusted-a']));
    await sigService.sign('/project/docs/b.txt', 'user:reader', buildFileSigningMetadata(['trusted-b']));

    const singleNode = {
      type: 'load-content',
      source: {
        type: 'path',
        segments: [{ type: 'Text', content: 'docs/a.txt' }],
        raw: 'docs/a.txt'
      }
    };

    await processContentLoader(singleNode as any, env);
    await processContentLoader(singleNode as any, env);

    expect(Object.keys(sigService.getVerificationCacheSnapshot())).toEqual(['/project/docs/a.txt']);

    const globResult = await processContentLoader(
      {
        type: 'load-content',
        source: {
          type: 'path',
          segments: [{ type: 'Text', content: 'docs/*.txt' }],
          raw: 'docs/*.txt'
        }
      } as any,
      env
    );

    expect(isStructuredValue(globResult)).toBe(true);
    const items = (globResult as any).data;
    expect(Array.isArray(items)).toBe(true);
    expect(items).toHaveLength(2);
    expect(items[0].metadata?.sig).toMatchObject({
      status: 'verified',
      signer: 'user:reader'
    });
    expect(items[1].metadata?.sig).toMatchObject({
      status: 'verified',
      signer: 'user:reader'
    });
  });

  it('defaults SDK execution writes to agent:{script}', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'mlld-fs-int-'));
    try {
      await writeFile(path.join(root, 'package.json'), '{}');
      await mkdir(path.join(root, 'routes'), { recursive: true });

      const routePath = path.join(root, 'routes', 'route.mlld');
      const outputPath = path.join(root, 'routes', 'out.txt');
      await writeFile(
        routePath,
        [
          '/output "signed" to "out.txt"',
          '/show "ok"'
        ].join('\n')
      );

      const result = await execute(routePath, undefined, {
        fileSystem: new NodeFileSystem(),
        pathService: new PathService()
      });
      const executionEnv = (result as any).environment;

      expect(executionEnv.getSignerIdentity()).toBe('agent:route');
      await expect(executionEnv.getSigService().verify(outputPath)).resolves.toMatchObject({
        status: 'verified',
        signer: 'agent:route'
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
