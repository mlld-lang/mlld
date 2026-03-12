import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { parseStateOptions } from './state-parser';

describe('parseStateOptions', () => {
  let tempDir: string;
  let fileSystem: NodeFileSystem;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-state-test-'));
    fileSystem = new NodeFileSystem();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('loads a JSON object from file', async () => {
    const dataPath = path.join(tempDir, 'state.json');
    await fs.writeFile(dataPath, JSON.stringify({ messages: [], count: 2 }));

    const result = await parseStateOptions(['@state.json'], fileSystem, tempDir);

    expect(result).toEqual({ messages: [], count: 2 });
  });

  it('merges JSON object and KEY=VALUE forms into one state object', async () => {
    const result = await parseStateOptions(
      ['{"messages":[],"count":1}', 'conversationId=abc123'],
      fileSystem,
      tempDir
    );

    expect(result).toEqual({
      messages: [],
      count: 1,
      conversationId: 'abc123'
    });
  });
});
