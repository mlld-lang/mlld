import { describe, expect, it, vi } from 'vitest';
import { DiagnosticsRuntime } from './DiagnosticsRuntime';

describe('DiagnosticsRuntime', () => {
  it('delegates error collection lifecycle to collector', () => {
    const runtime = new DiagnosticsRuntime();
    const collector = {
      collectError: vi.fn(),
      getCollectedErrors: vi.fn().mockReturnValue([{ command: 'echo hi' }]),
      clearCollectedErrors: vi.fn()
    };
    const error = new Error('boom');

    runtime.collectError(collector as any, error as any, 'echo hi', 12, { filePath: 'a.mld' });
    const errors = runtime.getCollectedErrors(collector as any);
    runtime.clearCollectedErrors(collector as any);

    expect(collector.collectError).toHaveBeenCalledWith(error, 'echo hi', 12, {
      filePath: 'a.mld'
    });
    expect(errors).toEqual([{ command: 'echo hi' }]);
    expect(collector.clearCollectedErrors).toHaveBeenCalledTimes(1);
  });

  it('pushes and pops directive trace entries with sdk debug events', () => {
    const runtime = new DiagnosticsRuntime();
    const state = {
      directiveTrace: [] as any[],
      directiveTimings: [] as number[],
      traceEnabled: true,
      currentFilePath: '/repo/example.mld'
    };
    const events: any[] = [];
    const bridge = { emitSDKEvent: (event: any) => events.push(event) };

    runtime.pushDirective(
      state,
      'run',
      'cmd',
      { line: 7 } as any,
      { bridge, provenance: { labels: ['trusted'] } as any }
    );
    runtime.popDirective(state, { bridge, provenance: { labels: ['trusted'] } as any });

    expect(state.directiveTrace).toHaveLength(0);
    expect(events[0]).toMatchObject({
      type: 'debug:directive:start',
      directive: 'run',
      provenance: { labels: ['trusted'] }
    });
    expect(events[1]).toMatchObject({
      type: 'debug:directive:complete',
      directive: 'run',
      provenance: { labels: ['trusted'] }
    });
  });

  it('manages trace state, failure marking, and snapshot reads', () => {
    const runtime = new DiagnosticsRuntime();
    const state = {
      directiveTrace: [
        {
          directive: 'show',
          depth: 0,
          location: 'file:1'
        }
      ] as any[],
      directiveTimings: [],
      traceEnabled: true,
      currentFilePath: '/repo/file.mld'
    };

    runtime.markLastDirectiveFailed(state, 'failed');
    const trace = runtime.getDirectiveTrace(state);
    runtime.setTraceEnabled(state, false);

    expect(trace[0]).toMatchObject({
      directive: 'show',
      failed: true,
      errorMessage: 'failed'
    });
    expect(runtime.isTraceEnabled(state)).toBe(false);
    expect(state.directiveTrace).toEqual([]);
  });

  it('stores source cache locally and falls back to parent reads/writes', () => {
    const runtime = new DiagnosticsRuntime();
    const localCache = new Map<string, string>();
    const parent = {
      cacheSource: vi.fn(),
      getSource: vi.fn().mockReturnValue('from-parent')
    };

    runtime.cacheSource(localCache, undefined, '/repo/a.mld', 'local');
    runtime.cacheSource(localCache, parent, '/repo/b.mld', 'delegated');

    expect(runtime.getSource(localCache, undefined, '/repo/a.mld')).toBe('local');
    expect(runtime.getSource(new Map(), parent, '/repo/b.mld')).toBe('from-parent');
    expect(parent.cacheSource).toHaveBeenCalledWith('/repo/b.mld', 'delegated');
  });

  it('processes output through ErrorUtils metadata contract', () => {
    const runtime = new DiagnosticsRuntime();
    const result = runtime.processOutput('line1\nline2\n', 1);

    expect(result.processed).toBe('line1\nline2');
    expect(result.truncated).toBe(false);
    expect(result.originalLineCount).toBe('line1\nline2\n'.length);
  });
});
