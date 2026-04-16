import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, writeFile, readFile, rm, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { migrateStateCommand } from './migrate-state';

describe('migrate-state', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), 'mlld-migrate-test-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('renames .mlld/ to .llm/ at the project level', async () => {
    const legacy = path.join(tmp, '.mlld');
    await mkdir(path.join(legacy, 'sec'), { recursive: true });
    await writeFile(path.join(legacy, 'sec', 'audit.jsonl'), 'hello\n');

    await migrateStateCommand({ basePath: tmp, project: true, user: false });

    expect(existsSync(legacy)).toBe(false);
    const moved = path.join(tmp, '.llm', 'sec', 'audit.jsonl');
    expect(existsSync(moved)).toBe(true);
    expect(await readFile(moved, 'utf8')).toBe('hello\n');
  });

  it('defaults to migrating the project scope when no scope flag is given', async () => {
    const legacy = path.join(tmp, '.mlld');
    await mkdir(path.join(legacy, 'sec'), { recursive: true });
    await writeFile(path.join(legacy, 'sec', 'audit.jsonl'), 'payload\n');

    // no project/user flags -- must still rename the project-scope legacy dir
    await migrateStateCommand({ basePath: tmp });

    expect(existsSync(legacy)).toBe(false);
    expect(existsSync(path.join(tmp, '.llm', 'sec', 'audit.jsonl'))).toBe(true);
  });

  it('leaves things alone when no legacy dir is present', async () => {
    await migrateStateCommand({ basePath: tmp, project: true, user: false });
    expect(existsSync(path.join(tmp, '.mlld'))).toBe(false);
    expect(existsSync(path.join(tmp, '.llm'))).toBe(false);
  });

  it('refuses to overwrite an existing target', async () => {
    const legacy = path.join(tmp, '.mlld');
    const target = path.join(tmp, '.llm');
    await mkdir(legacy, { recursive: true });
    await mkdir(target, { recursive: true });

    await migrateStateCommand({ basePath: tmp, project: true, user: false });

    // both should still exist — no merge performed
    expect(existsSync(legacy)).toBe(true);
    expect(existsSync(target)).toBe(true);
  });

  it('dry-run does not rename', async () => {
    const legacy = path.join(tmp, '.mlld');
    await mkdir(path.join(legacy, 'sec'), { recursive: true });

    await migrateStateCommand({ basePath: tmp, project: true, user: false, dryRun: true });

    expect(existsSync(legacy)).toBe(true);
    expect(existsSync(path.join(tmp, '.llm'))).toBe(false);
  });
});
