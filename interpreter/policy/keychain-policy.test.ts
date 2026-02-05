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

  it('throws when allow.danger is missing', () => {
    fs.writeFileSync(
      path.join(tempDir, 'mlld-config.json'),
      JSON.stringify({ projectname: 'demo' }, null, 2)
    );
    const env = new Environment(new NodeFileSystem(), new PathService(), tempDir);
    env.recordPolicyConfig('policy', {});
    expect(() => enforceKeychainAccess(env)).toThrow('allow.danger');
  });

  it('allows access with allow.danger', () => {
    fs.writeFileSync(
      path.join(tempDir, 'mlld-config.json'),
      JSON.stringify({ projectname: 'demo' }, null, 2)
    );
    const env = new Environment(new NodeFileSystem(), new PathService(), tempDir);
    env.recordPolicyConfig('policy', { capabilities: { danger: ['@keychain'] } });
    expect(() => enforceKeychainAccess(env)).not.toThrow();
  });

  it('denies access when allow list does not match', () => {
    fs.writeFileSync(
      path.join(tempDir, 'mlld-config.json'),
      JSON.stringify({ projectname: 'demo' }, null, 2)
    );
    const env = new Environment(new NodeFileSystem(), new PathService(), tempDir);
    env.recordPolicyConfig('policy', {
      capabilities: { danger: ['@keychain'] },
      keychain: { allow: ['mlld-env-{projectname}/allowed'] }
    });

    expect(() => enforceKeychainAccess(env, { service: 'mlld-env-demo', account: 'blocked' }))
      .toThrow('Keychain access denied');
  });

  it('denies access when deny list matches', () => {
    fs.writeFileSync(
      path.join(tempDir, 'mlld-config.json'),
      JSON.stringify({ projectname: 'demo' }, null, 2)
    );
    const env = new Environment(new NodeFileSystem(), new PathService(), tempDir);
    env.recordPolicyConfig('policy', {
      capabilities: { danger: ['@keychain'] },
      keychain: {
        allow: ['mlld-env-{projectname}/*'],
        deny: ['mlld-env-demo/blocked']
      }
    });

    expect(() => enforceKeychainAccess(env, { service: 'mlld-env-demo', account: 'blocked' }))
      .toThrow('Keychain access denied');
  });

  it('allows access when allow list matches and deny list does not', () => {
    fs.writeFileSync(
      path.join(tempDir, 'mlld-config.json'),
      JSON.stringify({ projectname: 'demo' }, null, 2)
    );
    const env = new Environment(new NodeFileSystem(), new PathService(), tempDir);
    env.recordPolicyConfig('policy', {
      capabilities: { danger: ['@keychain'] },
      keychain: {
        allow: ['mlld-env-{projectname}/*'],
        deny: ['mlld-env-demo/blocked']
      }
    });

    expect(() => enforceKeychainAccess(env, { service: 'mlld-env-demo', account: 'ok' }))
      .not.toThrow();
  });
});
