import { describe, it, expect } from 'vitest';
import { DynamicModuleResolver } from './DynamicModuleResolver';

describe('DynamicModuleResolver', () => {
  it('resolves provided module content with taint metadata', async () => {
    const resolver = new DynamicModuleResolver({
      '@user/context': '/export\n@name = "Ada"'
    });

    const result = await resolver.resolve('@user/context');

    expect(result.content).toContain('@name = "Ada"');
    expect(result.contentType).toBe('module');
    expect(result.ctx?.source).toBe('dynamic://@user/context');
    expect(result.ctx?.taintLevel).toBe('resolver');
  });

  it('throws when module is missing', async () => {
    const resolver = new DynamicModuleResolver({});

    await expect(resolver.resolve('@missing')).rejects.toThrow('Dynamic module not found');
  });

  it('validates module content types', () => {
    expect(
      () =>
        new DynamicModuleResolver({
          '@bad/context': 123 as unknown as string
        })
    ).toThrow('Dynamic module content must be string');
  });

  it('lists available modules', async () => {
    const resolver = new DynamicModuleResolver({
      '@user/context': '...',
      '@project/context': '...'
    });

    const modules = await resolver.list('');
    const paths = modules.map(entry => entry.path);

    expect(paths).toContain('@user/context');
    expect(paths).toContain('@project/context');
  });

  it('canResolve checks exact keys only', () => {
    const resolver = new DynamicModuleResolver({
      '@user/context': '...'
    });

    expect(resolver.canResolve('@user/context')).toBe(true);
    expect(resolver.canResolve('@user/context.mld')).toBe(false);
  });
});
