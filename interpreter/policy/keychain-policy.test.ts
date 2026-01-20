import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Environment } from '@interpreter/env/Environment';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { enforceKeychainAccess } from '@interpreter/policy/keychain-policy';

describe('enforceKeychainAccess', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlld-keychain-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('throws when projectname is missing', () => {
    const env = new Environment(new NodeFileSystem(), new PathService(), tempDir);
    expect(() => enforceKeychainAccess(env)).toThrow('projectname');
  });

});
