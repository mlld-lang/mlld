import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const VISITOR_ROOT = join(process.cwd(), 'services/lsp/visitors');
const EXPLICIT_ANY_PATTERN = /:\s*any\b|as any\b|Record<[^>]*any[^>]*>/g;

function collectTsFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      files.push(...collectTsFiles(fullPath));
      continue;
    }

    if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

describe('LSP visitor typing regression', () => {
  it('does not use explicit any in visitor sources', () => {
    const files = collectTsFiles(VISITOR_ROOT);
    const offenders: string[] = [];

    for (const filePath of files) {
      const source = readFileSync(filePath, 'utf8');
      if (EXPLICIT_ANY_PATTERN.test(source)) {
        offenders.push(relative(process.cwd(), filePath));
      }
      EXPLICIT_ANY_PATTERN.lastIndex = 0;
    }

    expect(offenders).toEqual([]);
  });
});
