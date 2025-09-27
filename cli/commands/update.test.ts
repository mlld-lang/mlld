import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { updateCommand } from './update';
import { outdatedCommand } from './outdated';

describe('Update and Outdated Commands', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(process.cwd(), 'test-update-'));
    // Create minimal config structure so findProjectRoot resolves
    await fs.writeFile(path.join(tempDir, 'mlld-config.json'), '{}', 'utf8');
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('performs dry-run update without throwing', async () => {
    await expect(updateCommand([], { basePath: tempDir, dryRun: true, verbose: false })).resolves.toBeUndefined();
  });

  it('lists outdated modules with no entries', async () => {
    await expect(outdatedCommand([], { basePath: tempDir, format: 'list' })).resolves.toBeUndefined();
  });
});
