import { describe, expect, it } from 'vitest';
import { ContextManager } from './ContextManager';

describe('ContextManager tool call tracking', () => {
  it('does not retain raw tool call argument payloads in ambient tool history', () => {
    const manager = new ContextManager();
    const largeArgument = { payload: 'x'.repeat(100_000) };

    manager.recordToolCall({
      name: 'search',
      arguments: { query: largeArgument },
      timestamp: Date.now(),
      ok: true
    });

    expect(manager.getToolsSnapshot().calls).toEqual(['search']);
    expect(((manager as any).toolCalls[0] as any).arguments).toBeUndefined();
  });
});
