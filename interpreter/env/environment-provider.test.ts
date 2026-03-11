import { describe, expect, it } from 'vitest';
import type { PolicyConfig } from '@core/policy/union';
import { MlldSecurityError } from '@core/errors';
import { PathService } from '@services/fs/PathService';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { Environment } from './Environment';
import {
  deriveEnvironmentConfigFromPolicy,
  resolveEnvironmentConfig
} from './environment-provider';

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

describe('environment provider policy derivation', () => {
  it('derives scoped config by attenuating tools, mcps, and network', () => {
    const policy: PolicyConfig = {
      env: {
        default: '@provider/default',
        tools: {
          allow: ['Read'],
          deny: ['Write']
        },
        mcps: {
          allow: ['stdio:alpha']
        },
        net: {
          allow: ['github.com'],
          deny: ['internal.local']
        }
      }
    };
    const localConfig = {
      tools: ['Read', 'Write'],
      mcps: ['stdio:alpha', 'stdio:beta'],
      net: {
        allow: ['github.com', 'internal.local']
      }
    };

    const derived = deriveEnvironmentConfigFromPolicy(policy, localConfig);
    expect(derived?.provider).toBe('@provider/default');
    expect(derived?.tools).toEqual(['Read']);
    expect((derived as any)?.mcps).toEqual(['stdio:alpha']);
    expect((derived as any)?.net?.allow).toEqual(['github.com']);
    expect(derived?._policyDerivedConstraints?.policyEnv).toBeDefined();
  });

  it('throws when selected provider is denied by policy', () => {
    const policy: PolicyConfig = {
      env: {
        providers: {
          '@provider/blocked': {
            allowed: false
          }
        }
      }
    };

    expect(() =>
      deriveEnvironmentConfigFromPolicy(policy, { provider: '@provider/blocked' })
    ).toThrowError(MlldSecurityError);
  });

  it('merges guard policy fragments into effective policy', () => {
    const policy: PolicyConfig = {
      env: {
        tools: {
          allow: ['Read', 'Write']
        }
      }
    };
    const localConfig = {
      tools: ['Read', 'Write'],
      _policyDerivedConstraints: {
        policyFragment: {
          env: {
            tools: {
              allow: ['Read']
            }
          }
        }
      }
    };

    const derived = deriveEnvironmentConfigFromPolicy(policy, localConfig);
    expect(derived?.tools).toEqual(['Read']);
  });
});

describe('resolveEnvironmentConfig', () => {
  it('attaches guard policy fragments to resolved config constraints', () => {
    const env = createEnv();
    env.setScopedEnvironmentConfig({ provider: '@provider/default' });

    const resolved = resolveEnvironmentConfig(env, {
      envConfig: { tools: ['Read', 'Write'] },
      policyFragment: {
        env: {
          tools: {
            allow: ['Read']
          }
        }
      }
    });

    expect(resolved?.provider).toBe('@provider/default');
    expect(resolved?.tools).toEqual(['Read', 'Write']);
    expect(resolved?._policyDerivedConstraints?.policyFragment).toMatchObject({
      env: {
        tools: {
          allow: ['Read']
        }
      }
    });
  });
});
