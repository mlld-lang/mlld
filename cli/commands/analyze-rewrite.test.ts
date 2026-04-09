import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { analyze } from './analyze';

describe('analyze rewrite freshness', () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it('returns fresh results after a file is rewritten', async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-analyze-rewrite-'));
    const filePath = path.join(tempDir, 'rewrite.mld');

    await fs.writeFile(filePath, 'show "before" "after"\n', 'utf8');
    const invalidResult = await analyze(filePath);
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.errors?.[0]?.message).toContain('show accepts only a single argument');

    await fs.writeFile(filePath, 'show "after"\n', 'utf8');
    const validResult = await analyze(filePath);
    expect(validResult.valid).toBe(true);
    expect(validResult.errors ?? []).toHaveLength(0);
  });
});
