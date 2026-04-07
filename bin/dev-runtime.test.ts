import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { resolveTsxImportSpecifier } = require('./dev-runtime.cjs') as {
  resolveTsxImportSpecifier: () => string;
};

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
