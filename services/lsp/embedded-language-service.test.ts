import path from 'path';
import { describe, expect, it } from 'vitest';
import { resolveEmbeddedLanguageModuleDir } from '@services/lsp/embedded/EmbeddedLanguageService';

describe('resolveEmbeddedLanguageModuleDir', () => {
  it('prefers an explicit currentDir when available', () => {
    expect(resolveEmbeddedLanguageModuleDir({
      currentDir: '/tmp/mlld/dist'
    })).toBe('/tmp/mlld/dist');
  });

  it('falls back to importMetaUrl for ESM environments', () => {
    expect(resolveEmbeddedLanguageModuleDir({
      currentDir: undefined,
      importMetaUrl: 'file:///tmp/mlld/dist/EmbeddedLanguageService.js'
    })).toBe('/tmp/mlld/dist');
  });

  it('falls back to argvPath when bundle metadata is unavailable', () => {
    const cliPath = path.join('/opt', 'homebrew', 'lib', 'node_modules', 'mlld', 'dist', 'cli.cjs');
    expect(resolveEmbeddedLanguageModuleDir({
      currentDir: undefined,
      importMetaUrl: undefined,
      argvPath: cliPath
    })).toBe(path.dirname(cliPath));
  });

  it('falls back to cwd as a last resort', () => {
    expect(resolveEmbeddedLanguageModuleDir({
      currentDir: undefined,
      importMetaUrl: undefined,
      argvPath: undefined,
      cwd: '/tmp/mlld-project'
    })).toBe('/tmp/mlld-project');
  });
});
