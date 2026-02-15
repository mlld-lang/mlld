import { describe, it, expect } from 'vitest';
import { normalizeNeedsDeclaration } from './needs';

describe('normalizeNeedsDeclaration', () => {
  it('accepts supported keys and aliases', () => {
    const normalized = normalizeNeedsDeclaration({
      bash: true,
      net: true,
      fs: true,
      cmd: ['git'],
      __commands: ['curl'],
      js: ['lodash'],
      py: ['requests'],
      rb: ['rake'],
      go: ['cobra'],
      rust: ['serde']
    });

    expect(normalized.sh).toBe(true);
    expect(normalized.network).toBe(true);
    expect(normalized.filesystem).toBe(true);
    expect(normalized.cmd).toEqual({ type: 'list', commands: ['git', 'curl'] });
    expect(normalized.packages.node?.map(pkg => pkg.name)).toEqual(['lodash']);
    expect(normalized.packages.python?.map(pkg => pkg.name)).toEqual(['requests']);
    expect(normalized.packages.ruby?.map(pkg => pkg.name)).toEqual(['rake']);
    expect(normalized.packages.go?.map(pkg => pkg.name)).toEqual(['cobra']);
    expect(normalized.packages.rust?.map(pkg => pkg.name)).toEqual(['serde']);
  });

  it('rejects unsupported keys', () => {
    expect(() => normalizeNeedsDeclaration({ keychain: true })).toThrow(/unsupported key 'keychain'/i);
  });
});
