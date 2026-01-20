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
});
