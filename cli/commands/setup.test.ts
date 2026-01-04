import { describe, it, expect } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import { findNearestConfigDir } from './setup';

describe('setup helpers', () => {
  it('finds nearest parent config', async () => {
    const base = await fs.mkdtemp(path.join(tmpdir(), 'mlld-setup-'));
    const parent = path.join(base, 'parent');
    const child = path.join(parent, 'child');
    await fs.mkdir(child, { recursive: true });
    await fs.writeFile(path.join(parent, 'mlld-config.json'), '{}');

    const result = findNearestConfigDir(child);
    expect(result).toBe(parent);
  });

  it('returns null when no config exists', async () => {
    const base = await fs.mkdtemp(path.join(tmpdir(), 'mlld-setup-'));
    const child = path.join(base, 'child');
    await fs.mkdir(child, { recursive: true });

    const result = findNearestConfigDir(child);
    expect(result).toBeNull();
  });
});
