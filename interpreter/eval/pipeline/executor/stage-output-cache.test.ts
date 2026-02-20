import { describe, expect, it } from 'vitest';
import { wrapStructured } from '@interpreter/utils/structured-value';
import { StageOutputCache } from './stage-output-cache';

describe('stage output cache', () => {
  it('initializes and returns initial output for stage -1', () => {
    const cache = new StageOutputCache();
    const initial = wrapStructured('seed', 'text', 'seed');

    cache.initialize(initial);

    expect(cache.get(-1, 'fallback')).toBe(initial);
    expect(cache.getInitialOutput()).toBe(initial);
    expect(cache.getFinal()).toBe(initial);
  });

  it('stores per-stage outputs and resolves final output from latest stage', () => {
    const cache = new StageOutputCache();
    cache.initialize(wrapStructured('seed', 'text', 'seed'));

    const stage0 = wrapStructured('s0', 'text', 's0');
    const stage1 = wrapStructured('s1', 'text', 's1');
    cache.set(0, stage0);
    cache.set(1, stage1);

    expect(cache.get(0, 'fallback')).toBe(stage0);
    expect(cache.peek(1)).toBe(stage1);
    expect(cache.getFinal()).toBe(stage1);
  });

  it('clears cached outputs from a stage index forward', () => {
    const cache = new StageOutputCache();
    cache.initialize(wrapStructured('seed', 'text', 'seed'));

    const stage0 = wrapStructured('s0', 'text', 's0');
    const stage1 = wrapStructured('s1', 'text', 's1');
    cache.set(0, stage0);
    cache.set(1, stage1);

    cache.clearFrom(1);

    expect(cache.peek(0)).toBe(stage0);
    expect(cache.peek(1)).toBeUndefined();
  });

  it('builds fallback wrappers for missing stage outputs', () => {
    const cache = new StageOutputCache();
    cache.initialize(wrapStructured('seed', 'text', 'seed'));

    const generated = cache.get(2, 'fallback-value');

    expect(generated.type).toBe('text');
    expect(generated.text).toBe('fallback-value');
    expect(cache.peek(2)).toBe(generated);
  });

  it('updates initial output for synthetic source retries', () => {
    const cache = new StageOutputCache();
    cache.initialize(wrapStructured('seed', 'text', 'seed'));

    const fresh = wrapStructured('fresh', 'text', 'fresh');
    cache.updateInitialOutput(fresh);

    expect(cache.getInitialOutput()).toBe(fresh);
    expect(cache.get(-1, 'fallback')).toBe(fresh);
    expect(cache.getFinal()).toBe(fresh);
  });
});
