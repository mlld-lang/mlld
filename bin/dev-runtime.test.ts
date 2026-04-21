import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { resolveTsxImportSpecifier } = require('./dev-runtime.cjs') as {
  resolveTsxImportSpecifier: () => string;
};
const {
  buildNodeRuntimeArgs,
  extractWrapperRuntimeArgs,
  parseMemoryToMb
} = require('./runtime-options.cjs') as {
  buildNodeRuntimeArgs: (options?: {
    heap?: string;
    heapSnapshotNearLimit?: string;
    cwd?: string;
  }) => string[];
  extractWrapperRuntimeArgs: (args: string[]) => {
    args: string[];
    heap?: string;
    heapSnapshotNearLimit?: string;
  };
  parseMemoryToMb: (raw: string) => number | undefined;
};

const restoreEnv: Record<string, string | undefined> = {};

function setEnv(name: string, value: string | undefined): void {
  if (!(name in restoreEnv)) {
    restoreEnv[name] = process.env[name];
  }
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

afterEach(() => {
  for (const [name, value] of Object.entries(restoreEnv)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
    delete restoreEnv[name];
  }
});

describe('dev runtime helpers', () => {
  it('resolves the tsx loader from the package install location instead of process.cwd()', () => {
    const originalCwd = process.cwd();
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'mlld-wrapper-cwd-'));

    try {
      process.chdir(tempDir);
      const specifier = resolveTsxImportSpecifier();

      expect(specifier.startsWith('file://')).toBe(true);
      expect(decodeURIComponent(specifier)).toMatch(/tsx[\\/].*esm/i);
    } finally {
      process.chdir(originalCwd);
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('wrapper runtime options', () => {
  it('parses heap sizes to megabytes', () => {
    expect(parseMemoryToMb('8192')).toBe(8192);
    expect(parseMemoryToMb('8192m')).toBe(8192);
    expect(parseMemoryToMb('8g')).toBe(8192);
    expect(parseMemoryToMb('1.5gb')).toBe(1536);
  });

  it('strips wrapper-only heap flags before CLI parsing', () => {
    expect(
      extractWrapperRuntimeArgs([
        '--mlld-heap=8g',
        '--heap-snapshot-near-limit',
        '3',
        '-e',
        'show "ok"'
      ])
    ).toEqual({
      args: ['-e', 'show "ok"'],
      heap: '8g',
      heapSnapshotNearLimit: '3'
    });

    expect(extractWrapperRuntimeArgs(['--mlld-heap', '8192', 'script.mld'])).toEqual({
      args: ['script.mld'],
      heap: '8192',
      heapSnapshotNearLimit: undefined
    });
  });

  it('builds node args using CLI, env, project config, then global config precedence', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'mlld-wrapper-runtime-'));
    const globalConfigHome = path.join(tempDir, 'global');
    mkdirSync(globalConfigHome, { recursive: true });
    writeFileSync(
      path.join(globalConfigHome, 'mlld-config.json'),
      JSON.stringify({ runtime: { heap: '6g' } })
    );
    writeFileSync(
      path.join(tempDir, 'mlld-config.json'),
      JSON.stringify({ runtime: { heap: '7g' } })
    );

    try {
      setEnv('MLLD_CONFIG_HOME', globalConfigHome);
      setEnv('MLLD_HEAP', undefined);

      expect(buildNodeRuntimeArgs({ cwd: tempDir })).toContain('--max-old-space-size=7168');

      setEnv('MLLD_HEAP', '8g');
      expect(buildNodeRuntimeArgs({ cwd: tempDir })).toContain('--max-old-space-size=8192');

      expect(buildNodeRuntimeArgs({ cwd: tempDir, heap: '9g' })).toContain('--max-old-space-size=9216');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('includes heap snapshot args when requested', () => {
    expect(buildNodeRuntimeArgs({ heap: '8g', heapSnapshotNearLimit: '3' })).toEqual([
      '--max-old-space-size=8192',
      '--heapsnapshot-near-heap-limit=3'
    ]);
  });
});
