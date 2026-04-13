import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { execSyncMock, existsSyncMock, readFileSyncMock, homedirMock } = vi.hoisted(() => ({
  execSyncMock: vi.fn(),
  existsSyncMock: vi.fn(),
  readFileSyncMock: vi.fn(),
  homedirMock: vi.fn(() => '/Users/test')
}));

vi.mock('child_process', () => ({
  execSync: execSyncMock
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: existsSyncMock,
    readFileSync: readFileSyncMock
  };
});

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return {
    ...actual,
    homedir: homedirMock
  };
});

import {
  buildAliasPreamble,
  clearAliasCache,
  requiresHostShellExecution,
  resolveAlias
} from './alias-resolver';

describe('alias-resolver', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.SHELL = '/bin/zsh';
    process.env.NODE_ENV = 'development';
    execSyncMock.mockReset();
    existsSyncMock.mockReset();
    readFileSyncMock.mockReset();
    homedirMock.mockReset();
    homedirMock.mockReturnValue('/Users/test');
    clearAliasCache();
  });

  afterEach(() => {
    process.env = originalEnv;
    clearAliasCache();
    vi.restoreAllMocks();
  });

  it('falls back to ~/.bun/bin for opencode when shell lookup fails', () => {
    execSyncMock.mockImplementation((command: string) => {
      if (command.includes('alias opencode')) {
        return 'NOT_FOUND';
      }
      if (command.includes('command -v opencode')) {
        throw new Error('not found');
      }
      throw new Error(`unexpected command: ${command}`);
    });
    existsSyncMock.mockImplementation((candidate: string) => candidate === '/Users/test/.bun/bin/opencode');
    readFileSyncMock.mockImplementation(() => {
      throw new Error('binary');
    });

    const result = resolveAlias('opencode run "say hi"');

    expect(result.wasAlias).toBe(false);
    expect(result.resolvedCommand).toBe('/Users/test/.bun/bin/opencode run "say hi"');
  });

  it('rewrites env-shebang scripts to absolute interpreter invocation', () => {
    execSyncMock.mockImplementation((command: string) => {
      if (command.includes('alias opencode')) {
        return 'NOT_FOUND';
      }
      if (command.includes('command -v opencode')) {
        return '/Users/test/.bun/bin/opencode\n';
      }
      if (command.includes('command -v node')) {
        return '/opt/homebrew/bin/node\n';
      }
      throw new Error(`unexpected command: ${command}`);
    });
    existsSyncMock.mockImplementation((candidate: string) =>
      candidate === '/Users/test/.bun/bin/opencode' || candidate === '/opt/homebrew/bin/node'
    );
    readFileSyncMock.mockImplementation((candidate: string) => {
      if (candidate === '/Users/test/.bun/bin/opencode') {
        return '#!/usr/bin/env node\nconsole.log("hi")\n';
      }
      throw new Error(`unexpected file read: ${candidate}`);
    });

    const result = resolveAlias('opencode run "say hi"');

    expect(result.wasAlias).toBe(false);
    expect(result.resolvedCommand).toBe('/opt/homebrew/bin/node /Users/test/.bun/bin/opencode run "say hi"');
  });

  it('builds a sh preamble for env-shebang wrappers', () => {
    execSyncMock.mockImplementation((command: string) => {
      if (command.includes('alias opencode')) {
        return 'NOT_FOUND';
      }
      if (command.includes('command -v opencode')) {
        return '/Users/test/.bun/bin/opencode\n';
      }
      if (command.includes('command -v node')) {
        return '/opt/homebrew/bin/node\n';
      }
      throw new Error(`unexpected command: ${command}`);
    });
    existsSyncMock.mockImplementation((candidate: string) =>
      candidate === '/Users/test/.bun/bin/opencode' || candidate === '/opt/homebrew/bin/node'
    );
    readFileSyncMock.mockImplementation((candidate: string) => {
      if (candidate === '/Users/test/.bun/bin/opencode') {
        return '#!/usr/bin/env node\nconsole.log("hi")\n';
      }
      throw new Error(`unexpected file read: ${candidate}`);
    });

    const preamble = buildAliasPreamble('opencode run --format json');

    expect(preamble).toContain('shopt -s expand_aliases');
    expect(preamble).toContain("alias opencode='/opt/homebrew/bin/node /Users/test/.bun/bin/opencode'");
  });

  it('detects when shell code needs the host shell', () => {
    expect(requiresHostShellExecution('printf "hello" > output.txt')).toBe(false);
    expect(requiresHostShellExecution('opencode run --format json')).toBe(true);
    expect(requiresHostShellExecution('"$nodeBin" -e "console.log(1)"')).toBe(true);
  });
});
