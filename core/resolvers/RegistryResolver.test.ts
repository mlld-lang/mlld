import { describe, it, expect, beforeEach } from 'vitest';
import { RegistryResolver } from './RegistryResolver';

describe('RegistryResolver', () => {
  let resolver: RegistryResolver;

  beforeEach(() => {
    resolver = new RegistryResolver();
  });

  describe('canResolve', () => {
    it('handles @user/module format', () => {
      expect(resolver.canResolve('@test/mymodule')).toBe(true);
    });

    it('handles @user/module@version format', () => {
      expect(resolver.canResolve('@test/mymodule@1.0.0')).toBe(true);
      expect(resolver.canResolve('@test/mymodule@^1.0.0')).toBe(true);
    });

    it('handles @user/module@tag format', () => {
      expect(resolver.canResolve('@test/mymodule@latest')).toBe(true);
      expect(resolver.canResolve('@test/mymodule@beta')).toBe(true);
    });

    it('rejects invalid formats', () => {
      expect(resolver.canResolve('test/mymodule')).toBe(false);
      expect(resolver.canResolve('@test')).toBe(false);
      expect(resolver.canResolve('mymodule')).toBe(false);
      expect(resolver.canResolve('./local/path')).toBe(false);
    });
  });

  describe('capabilities', () => {
    it('has correct resolver type', () => {
      expect(resolver.type).toBe('input');
    });

    it('supports import context', () => {
      expect(resolver.capabilities.contexts.import).toBe(true);
    });

    it('supports module content type', () => {
      expect(resolver.capabilities.supportedContentTypes).toContain('module');
    });
  });

  describe('validateConfig', () => {
    it('accepts valid config', () => {
      const errors = resolver.validateConfig({
        registryRepo: 'test/registry',
        branch: 'main'
      });
      expect(errors).toEqual([]);
    });

    it('accepts empty config', () => {
      const errors = resolver.validateConfig({});
      expect(errors).toEqual([]);
    });

    it('rejects invalid registryRepo type', () => {
      const errors = resolver.validateConfig({ registryRepo: 123 });
      expect(errors).toContain('registryRepo must be a string');
    });

    it('rejects invalid branch type', () => {
      const errors = resolver.validateConfig({ branch: ['main'] });
      expect(errors).toContain('branch must be a string');
    });
  });
});
