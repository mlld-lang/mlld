import { describe, expect, it, vi } from 'vitest';
import { createSimpleTextVariable } from '@core/types/variable';
import { ResolverVariableFacade } from './ResolverVariableFacade';

function createCache() {
  const values = new Map<string, any>();
  return {
    values,
    getResolverVariable(name: string): any {
      return values.get(name);
    },
    setResolverVariable(name: string, variable: any): void {
      values.set(name, variable);
    }
  };
}

describe('ResolverVariableFacade', () => {
  it('returns undefined for non-reserved names', async () => {
    const cache = createCache();
    const facade = new ResolverVariableFacade(cache, new Set(['debug']));

    await expect(facade.resolve('missing', { debugValue: 'dbg' })).resolves.toBeUndefined();
  });

  it('throws for direct keychain access', async () => {
    const cache = createCache();
    const facade = new ResolverVariableFacade(cache, new Set(['keychain']));

    await expect(facade.resolve('keychain', { debugValue: 'dbg' })).rejects.toThrow(
      'Direct keychain access is not available'
    );
  });

  it('returns dynamically computed debug variable', async () => {
    const cache = createCache();
    const facade = new ResolverVariableFacade(cache, new Set(['debug']));
    const debugVar = await facade.resolve('debug', { debugValue: 'debug-md' });

    expect(debugVar?.name).toBe('debug');
    expect(debugVar?.value).toBe('debug-md');
    expect(debugVar?.internal?.isReserved).toBe(true);
  });

  it('uses resolved cache values before invoking resolver manager', async () => {
    const cache = createCache();
    const source = {
      directive: 'var',
      syntax: 'quoted',
      hasInterpolation: false,
      isMultiLine: false
    } as const;
    const cached = createSimpleTextVariable('input', 'cached', source, {
      internal: {
        isResolver: true,
        needsResolution: false
      }
    });
    cache.setResolverVariable('input', cached);

    const resolve = vi.fn();
    const facade = new ResolverVariableFacade(cache, new Set(['input']));
    const result = await facade.resolve('input', {
      debugValue: 'dbg',
      resolverManager: { resolve } as any
    });

    expect(result).toBe(cached);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('resolves resolver content, projects metadata, and caches result', async () => {
    const cache = createCache();
    const resolve = vi.fn().mockResolvedValue({
      content: {
        content: '{"value":42}',
        contentType: 'data',
        metadata: {
          labels: ['secret'],
          taint: ['secret'],
          source: 'resolver:test'
        }
      }
    });
    const facade = new ResolverVariableFacade(cache, new Set(['input']));
    const result = await facade.resolve('input', {
      debugValue: 'dbg',
      resolverManager: { resolve } as any
    });

    expect(resolve).toHaveBeenCalledWith('@input', { context: 'variable' });
    expect((result as any)?.value?.value).toBe(42);
    expect((result as any)?.mx?.labels).toEqual(expect.arrayContaining(['secret']));
    expect(cache.getResolverVariable('input')).toBe(result);
  });

  it('returns pending placeholder variable when resolver manager is unavailable', async () => {
    const cache = createCache();
    const facade = new ResolverVariableFacade(cache, new Set(['later']));
    const result = await facade.resolve('later', { debugValue: 'dbg' });

    expect(result?.value).toBe('@later');
    expect(result?.internal?.needsResolution).toBe(true);
  });
});
