import { describe, it, expect } from 'vitest';
import { mergePolicyConfigs, normalizePolicyConfig, type PolicyConfig } from './union';

describe('PolicyConfig defaults', () => {
  it('normalizes defaults rules and unlabeled', () => {
    const config = normalizePolicyConfig({
      defaults: {
        unlabeled: 'untrusted',
        rules: ['no-secret-exfil', '  ', 'no-secret-exfil']
      }
    } as PolicyConfig);

    expect(config.defaults?.unlabeled).toBe('untrusted');
    expect(config.defaults?.rules).toEqual(['no-secret-exfil']);
  });

  it('merges defaults with untrusted winning and rule union', () => {
    const base: PolicyConfig = {
      defaults: {
        unlabeled: 'trusted',
        rules: ['no-secret-exfil']
      }
    };
    const incoming: PolicyConfig = {
      defaults: {
        unlabeled: 'untrusted',
        rules: ['no-untrusted-destructive']
      }
    };

    const merged = mergePolicyConfigs(base, incoming);
    expect(merged.defaults?.unlabeled).toBe('untrusted');
    expect(merged.defaults?.rules?.sort()).toEqual(
      ['no-secret-exfil', 'no-untrusted-destructive'].sort()
    );
  });

  it('normalizes autosign autoverify and trustconflict', () => {
    const config = normalizePolicyConfig({
      defaults: {
        autosign: ['templates', '  ', 'templates'],
        autoverify: true,
        trustconflict: 'warn'
      }
    } as PolicyConfig);

    expect(config.defaults?.autosign).toEqual(['templates']);
    expect(config.defaults?.autoverify).toBe(true);
    expect(config.defaults?.trustconflict).toBe('warn');
  });
});

describe('PolicyConfig capabilities', () => {
  it('expands allow list shorthand entries', () => {
    const config = normalizePolicyConfig({
      allow: ['cmd', 'js']
    } as PolicyConfig);

    expect(config.allow).toEqual({
      cmd: ['*'],
      js: ['*']
    });
  });

  it('intersects allow with capabilities allow', () => {
    const config = normalizePolicyConfig({
      allow: ['cmd:git:*', 'cmd:npm:*'],
      capabilities: { allow: ['cmd:git:*'] }
    } as PolicyConfig);

    expect((config.allow as { cmd?: string[] })?.cmd).toEqual(['git:*']);
  });

  it('unions deny with capabilities deny', () => {
    const config = normalizePolicyConfig({
      deny: ['cmd:npm:*'],
      capabilities: { deny: ['cmd:git:*'] }
    } as PolicyConfig);

    const cmd = (config.deny as { cmd?: string[] })?.cmd ?? [];
    expect(cmd.sort()).toEqual(['git:*', 'npm:*'].sort());
  });

  it('parses fs patterns into filesystem rules', () => {
    const config = normalizePolicyConfig({
      allow: ['fs:r:@base/tmp/**', 'fs:w:@base/dist/**']
    } as PolicyConfig);

    const filesystem = (config.allow as { filesystem?: { read?: string[]; write?: string[] } })?.filesystem ?? {};
    expect(filesystem.read).toEqual(expect.arrayContaining(['@base/tmp/**', '@base/dist/**']));
    expect(filesystem.write).toEqual(expect.arrayContaining(['@base/dist/**']));
  });
});

describe('PolicyConfig keychain', () => {
  it('normalizes keychain provider and pattern lists', () => {
    const config = normalizePolicyConfig({
      keychain: {
        provider: ' system ',
        allow: ['mlld-env/*', '  ', 'mlld-env/*'],
        deny: 'system/*'
      }
    } as PolicyConfig);

    expect(config.keychain?.provider).toBe('system');
    expect(config.keychain?.allow).toEqual(['mlld-env/*']);
    expect(config.keychain?.deny).toEqual(['system/*']);
  });

  it('merges keychain allow by intersection and deny by union', () => {
    const base: PolicyConfig = {
      keychain: {
        provider: 'system',
        allow: ['mlld-env/*', 'company/*'],
        deny: ['system/*']
      }
    };
    const incoming: PolicyConfig = {
      keychain: {
        allow: ['company/*', 'other/*'],
        deny: ['company/private/*']
      }
    };

    const merged = mergePolicyConfigs(base, incoming);
    expect(merged.keychain?.provider).toBe('system');
    expect(merged.keychain?.allow).toEqual(['company/*']);
    expect(merged.keychain?.deny?.sort()).toEqual(['company/private/*', 'system/*'].sort());
  });
});
