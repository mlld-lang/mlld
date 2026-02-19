import { describe, expect, it } from 'vitest';
import { createHookLifecycleTrace } from '@tests/helpers/hook-lifecycle-trace';

describe('hook lifecycle trace helper', () => {
  it('records deterministic lifecycle ordering', () => {
    const trace = createHookLifecycleTrace();

    trace.record('hook', 'before', 'run');
    trace.record('guard', 'before', 'run');
    trace.record('guard', 'after', 'run');
    trace.record('hook', 'after', 'run');

    expect(trace.sequence()).toEqual([
      'hook:before:run',
      'guard:before:run',
      'guard:after:run',
      'hook:after:run'
    ]);
  });

  it('formats traces with stable ids and details', () => {
    const trace = createHookLifecycleTrace();
    trace.record('hook', 'error', 'for:iteration', 'hook body failed');

    expect(trace.format()).toContain('1. hook:error:for:iteration (hook body failed)');
  });

  it('clears buffered events', () => {
    const trace = createHookLifecycleTrace();
    trace.record('operation', 'decision', 'for:batch');
    expect(trace.snapshot()).toHaveLength(1);

    trace.clear();

    expect(trace.snapshot()).toEqual([]);
    expect(trace.sequence()).toEqual([]);
  });
});
