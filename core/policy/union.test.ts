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

  it('normalizes defaults rule objects and collapses duplicate taintFacts overrides', () => {
    const config = normalizePolicyConfig({
      defaults: {
        rules: [
          'no-untrusted-destructive',
          { rule: ' no-untrusted-destructive ', taintFacts: true },
          { rule: 'no-untrusted-privileged', taintFacts: false }
        ]
      }
    } as PolicyConfig);

    expect(config.defaults?.rules).toEqual([
      { rule: 'no-untrusted-destructive', taintFacts: true },
      'no-untrusted-privileged'
    ]);
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

  it('merges defaults rules conservatively when incoming policy enables taintFacts', () => {
    const base: PolicyConfig = {
      defaults: {
        rules: ['no-untrusted-destructive']
      }
    };
    const incoming: PolicyConfig = {
      defaults: {
        rules: [{ rule: 'no-untrusted-destructive', taintFacts: true }]
      }
    };

    const merged = mergePolicyConfigs(base, incoming);
    expect(merged.defaults?.rules).toEqual([
      { rule: 'no-untrusted-destructive', taintFacts: true }
    ]);
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

  it('preserves locked and merges it as sticky', () => {
    const normalized = normalizePolicyConfig({
      locked: true,
      defaults: {
        rules: ['no-untrusted-destructive']
      }
    } as PolicyConfig);
    expect(normalized.locked).toBe(true);

    const merged = mergePolicyConfigs(
      {
        defaults: {
          rules: ['no-secret-exfil']
        }
      },
      {
        locked: true
      }
    );
    expect(merged.locked).toBe(true);
  });
});

describe('PolicyConfig authorizable', () => {
  it('normalizes source authorizable metadata separately from runtime allow and deny', () => {
    const config = normalizePolicyConfig({
      authorizations: {
        deny: ['delete_file'],
        authorizable: {
          'role:planner': ['@sendEmail', '@sendEmail', 'create_file']
        }
      } as any
    } as PolicyConfig);

    expect(config.authorizable).toEqual({
      'role:planner': ['sendEmail', 'create_file']
    });
    expect(config.authorizations).toEqual({
      deny: ['delete_file']
    });
  });

  it('intersects shared authorizable roles while preserving distinct roles', () => {
    const merged = mergePolicyConfigs(
      {
        authorizable: {
          'role:planner': ['send_email', 'create_file'],
          'role:reviewer': ['search_contacts']
        }
      },
      {
        authorizable: {
          'role:planner': ['send_email'],
          'role:worker': ['send_email']
        }
      }
    );

    expect(merged.authorizable).toEqual({
      'role:planner': ['send_email'],
      'role:reviewer': ['search_contacts'],
      'role:worker': ['send_email']
    });
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

  it('preserves base-only allow families while intersecting shared entries', () => {
    const merged = mergePolicyConfigs(
      {
        allow: {
          cmd: ['echo', 'git'],
          js: ['*']
        }
      },
      {
        allow: {
          cmd: ['echo'],
          filesystem: {
            read: ['@base/tmp/**']
          }
        }
      }
    );

    expect((merged.allow as { cmd?: string[] })?.cmd).toEqual(['echo']);
    expect((merged.allow as { js?: string[] })?.js).toEqual(['*']);
    expect((merged.allow as { filesystem?: { read?: string[] } })?.filesystem).toEqual({
      read: ['@base/tmp/**']
    });
  });

  it('unions deny families across composed policies', () => {
    const merged = mergePolicyConfigs(
      {
        deny: {
          cmd: ['curl']
        }
      },
      {
        deny: {
          cmd: ['git'],
          filesystem: {
            write: ['@base/tmp/**']
          }
        }
      }
    );

    expect(((merged.deny as { cmd?: string[] })?.cmd ?? []).sort()).toEqual(['curl', 'git']);
    expect((merged.deny as { filesystem?: { read?: string[]; write?: string[] } })?.filesystem).toEqual({
      read: ['@base/tmp/**'],
      write: ['@base/tmp/**']
    });
  });
});

describe('PolicyConfig env', () => {
  it('normalizes policy env provider/tool/mcp/network rules', () => {
    const config = normalizePolicyConfig({
      env: {
        default: ' @docker ',
        providers: {
          '@docker': {
            allowed: false,
            auth: ['token-a', 'token-a', 'token-b'],
            taint: ['src:provider', 'src:provider'],
            profiles: { mode: 'strict' }
          }
        },
        tools: {
          allow: ['Read', 'Write', 'Read'],
          deny: ['Write']
        },
        mcps: {
          allow: ['stdio:alpha', 'stdio:alpha']
        },
        net: {
          allow: ['github.com'],
          deny: ['internal.local']
        }
      }
    } as PolicyConfig);

    expect(config.env?.default).toBe('@docker');
    expect(config.env?.providers?.['@docker']).toEqual({
      allowed: false,
      auth: ['token-a', 'token-b'],
      taint: ['src:provider'],
      profiles: { mode: 'strict' }
    });
    expect(config.env?.tools).toEqual({
      allow: ['Read', 'Write'],
      deny: ['Write']
    });
    expect(config.env?.mcps).toEqual({
      allow: ['stdio:alpha']
    });
    expect(config.env?.net).toEqual({
      allow: ['github.com'],
      deny: ['internal.local']
    });
  });

  it('merges env rules with default attenuation semantics', () => {
    const base: PolicyConfig = {
      env: {
        default: '@provider/base',
        providers: {
          '@provider/base': {
            auth: 'token-a',
            taint: ['src:base']
          }
        },
        tools: {
          allow: ['Read', 'Write'],
          deny: ['DangerTool']
        },
        mcps: {
          allow: ['stdio:alpha', 'stdio:beta']
        },
        net: {
          allow: ['github.com', 'api.openai.com']
        }
      }
    };
    const incoming: PolicyConfig = {
      env: {
        default: '@provider/child',
        providers: {
          '@provider/base': {
            allowed: false,
            auth: ['token-b']
          }
        },
        tools: {
          allow: ['Read'],
          deny: ['Write']
        },
        mcps: {
          allow: ['stdio:beta']
        },
        net: {
          deny: ['api.openai.com']
        }
      }
    };

    const merged = mergePolicyConfigs(base, incoming);
    expect(merged.env?.default).toBe('@provider/child');
    expect(merged.env?.providers?.['@provider/base']).toEqual({
      allowed: false,
      auth: ['token-a', 'token-b'],
      taint: ['src:base']
    });
    expect(merged.env?.tools).toEqual({
      allow: ['Read'],
      deny: ['DangerTool', 'Write'],
      attenuation: 'intersection'
    });
    expect(merged.env?.mcps).toEqual({
      allow: ['stdio:beta'],
      attenuation: 'intersection'
    });
    expect(merged.env?.net).toEqual({
      allow: ['github.com', 'api.openai.com'],
      deny: ['api.openai.com']
    });
  });
});

describe('PolicyConfig urls', () => {
  it('normalizes url construction allowlists', () => {
    const config = normalizePolicyConfig({
      urls: {
        allowConstruction: ['google.com', ' google.com ', '*.internal.corp']
      }
    } as PolicyConfig);

    expect(config.urls).toEqual({
      allowConstruction: ['google.com', '*.internal.corp']
    });
  });

  it('merges url construction allowlists by union', () => {
    const merged = mergePolicyConfigs(
      {
        urls: {
          allowConstruction: ['google.com']
        }
      },
      {
        urls: {
          allowConstruction: ['*.internal.corp', 'google.com']
        }
      }
    );

    expect(merged.urls).toEqual({
      allowConstruction: ['google.com', '*.internal.corp']
    });
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

describe('PolicyConfig filesystem integrity', () => {
  it('normalizes signers and filesystem_integrity rules', () => {
    const config = normalizePolicyConfig({
      signers: {
        ' agent:* ': ['trusted', ' trusted ', 'internal']
      },
      filesystem_integrity: {
        ' @base/config/** ': {
          mutable: false,
          authorizedIdentities: [' user:* ', 'user:*', 'agent:deploy']
        }
      }
    } as PolicyConfig);

    expect(config.signers).toEqual({
      'agent:*': ['trusted', 'internal']
    });
    expect(config.filesystem_integrity).toEqual({
      '@base/config/**': {
        mutable: false,
        authorizedIdentities: ['user:*', 'agent:deploy']
      }
    });
  });

  it('merges signer labels by union and filesystem_integrity fields by override', () => {
    const base: PolicyConfig = {
      signers: {
        'agent:*': ['trusted'],
        'user:*': ['reviewed']
      },
      filesystem_integrity: {
        '@base/config/**': {
          mutable: false,
          authorizedIdentities: ['user:*']
        }
      }
    };
    const incoming: PolicyConfig = {
      signers: {
        'agent:*': ['internal'],
        'system:*': ['trusted']
      },
      filesystem_integrity: {
        '@base/config/**': {
          authorizedIdentities: ['user:*', 'agent:release']
        },
        '@base/tmp/**': {
          mutable: true
        }
      }
    };

    const merged = mergePolicyConfigs(base, incoming);
    expect(merged.signers).toEqual({
      'agent:*': ['trusted', 'internal'],
      'user:*': ['reviewed'],
      'system:*': ['trusted']
    });
    expect(merged.filesystem_integrity).toEqual({
      '@base/config/**': {
        mutable: false,
        authorizedIdentities: ['user:*', 'agent:release']
      },
      '@base/tmp/**': {
        mutable: true
      }
    });
  });
});
