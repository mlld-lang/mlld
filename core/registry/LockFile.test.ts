import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { LockFile } from '@core/registry/LockFile';

describe('LockFile', () => {
  let tempDir: string;
  let lockPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlld-lockfile-test-'));
    lockPath = path.join(tempDir, 'mlld.lock.json');
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      // ignore cleanup errors in tests
    }
  });

  it('provides empty maps when lock file omits modules', () => {
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        version: '1.0',
        lockfileVersion: 1
      })
    );

    const lockFile = new LockFile(lockPath);

    expect(lockFile.getModule('@context/agents')).toBeUndefined();
    expect(lockFile.getAllModules()).toEqual({});
  });
});

