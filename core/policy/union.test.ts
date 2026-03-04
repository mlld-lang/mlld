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

  it('expands verify_all_instructions shorthand', () => {
    const config = normalizePolicyConfig({
      verify_all_instructions: true
    } as PolicyConfig);

    expect(config.defaults?.autosign).toEqual(['instructions']);
    expect(config.defaults?.autoverify).toBe(true);
    expect((config as any).verify_all_instructions).toBeUndefined();
  });

  it('verify_all_instructions does not override explicit defaults', () => {
    const config = normalizePolicyConfig({
      verify_all_instructions: true,
      defaults: {
        autosign: { instructions: true, variables: ['@*Prompt'] },
        autoverify: 'template "./custom.att"'
      }
    } as PolicyConfig);

    expect(config.defaults?.autosign).toEqual({ instructions: true, variables: ['@*Prompt'] });
    expect(config.defaults?.autoverify).toBe('template "./custom.att"');
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

  it('supports deny_cmd shorthand for command deny rules', () => {
    const config = normalizePolicyConfig({
      deny_cmd: ['npm:run:*', 'cmd:git:*']
    } as PolicyConfig);

    const cmd = (config.deny as { cmd?: string[] })?.cmd ?? [];
    expect(cmd.sort()).toEqual(['git:*', 'npm:run:*'].sort());
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
        allow: ['mlld-box/*', '  ', 'mlld-box/*'],
        deny: 'system/*'
      }
    } as PolicyConfig);

    expect(config.keychain?.provider).toBe('system');
    expect(config.keychain?.allow).toEqual(['mlld-box/*']);
    expect(config.keychain?.deny).toEqual(['system/*']);
  });

  it('merges keychain allow by intersection and deny by union', () => {
    const base: PolicyConfig = {
      keychain: {
        provider: 'system',
        allow: ['mlld-box/*', 'company/*'],
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

describe('PolicyConfig auth', () => {
  it('normalizes short-form and bare keychain auth entries', () => {
    const config = normalizePolicyConfig({
      auth: {
        brave: 'BRAVE_API_KEY',
        claude: {
          from: 'keychain',
          as: 'ANTHROPIC_API_KEY'
        }
      }
    } as PolicyConfig);

    expect(config.auth?.brave).toEqual({
      from: 'keychain:mlld-box-{projectname}/BRAVE_API_KEY',
      as: 'BRAVE_API_KEY'
    });
    expect(config.auth?.claude).toEqual({
      from: 'keychain:mlld-box-{projectname}/ANTHROPIC_API_KEY',
      as: 'ANTHROPIC_API_KEY'
    });
  });

  it('keeps explicit auth providers unchanged', () => {
    const config = normalizePolicyConfig({
      auth: {
        gh: {
          from: 'env:GITHUB_TOKEN',
          as: 'GITHUB_TOKEN'
        }
      }
    } as PolicyConfig);

    expect(config.auth?.gh).toEqual({
      from: 'env:GITHUB_TOKEN',
      as: 'GITHUB_TOKEN'
    });
  });
});
