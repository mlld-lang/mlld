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
    expect(result.ctx?.taint).toContain('src:dynamic');
    expect(result.ctx?.labels).toContain('dynamic');
  });

  it('serializes object modules deterministically', async () => {
    const resolver = new DynamicModuleResolver({
      '@state': { b: 1, a: { c: 2 }, arr: ['x', 'y'] }
    });

    const result = await resolver.resolve('@state');

    expect(result.content).toBe('/export\n@a = {"c":2}\n@arr = ["x","y"]\n@b = 1');
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
    ).toThrow('Dynamic module');
  });

  it('rejects non-plain objects', () => {
    expect(
      () =>
        new DynamicModuleResolver({
          '@bad/context': { when: new Date() } as any
        })
    ).toThrow('unsupported object type');
  });

  it('enforces depth and node limits', () => {
    const deep: any = { level1: {} };
    let cursor = deep.level1;
    for (let i = 2; i <= 11; i++) {
      cursor[`level${i}`] = {};
      cursor = cursor[`level${i}`];
    }

    expect(() => new DynamicModuleResolver({ '@deep': deep })).toThrow('maximum depth');

    const largeArray = Array.from({ length: 10001 }, () => 1);
    expect(() => new DynamicModuleResolver({ '@tooMany': { items: largeArray } as any })).toThrow(/array exceeds maximum length/i);
  });

  it('enforces size limits', () => {
    const bigString = 'x'.repeat(1024 * 1024);
    expect(() => new DynamicModuleResolver({ '@big': { value: bigString } })).toThrow('maximum serialized size');
  });

  it('enforces array length and key limits', () => {
    const tooManyKeys = Object.fromEntries(Array.from({ length: 1001 }, (_, i) => [`k${i}`, i]));
    expect(() => new DynamicModuleResolver({ '@keys': tooManyKeys })).toThrow('maximum keys');

    const tooLongArray = Array.from({ length: 1001 }, () => 1);
    expect(() => new DynamicModuleResolver({ '@arr': { list: tooLongArray } as any })).toThrow('array exceeds maximum length');
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
