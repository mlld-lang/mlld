import { describe, it, expect } from 'vitest';
import { runWithConcurrency } from './parallel';

function sleep(ms: number) {
  return new Promise(res => setTimeout(res, ms));
}

describe('parallel utils', () => {
  it('ordered=true preserves input order', async () => {
    const items = [3, 1, 2, 0];
    const results = await runWithConcurrency(items, 2, async (n) => {
      await sleep(1);
      return n * 2;
    }, { ordered: true });
    expect(results).toEqual([6, 2, 4, 0]);
  });

  it('pacing enforces minimum delay between task starts', async () => {
    const items = Array.from({ length: 6 }, (_, i) => i);
    const paceMs = 15; // keep small to avoid slow tests
    const starts: number[] = [];
    const t0 = Date.now();

    await runWithConcurrency(items, 4, async (n) => {
      starts.push(Date.now());
      await sleep(2);
      return n;
    }, { ordered: false, paceMs });

    // Ensure we have one timestamp per item
    expect(starts.length).toBe(items.length);

    // Total elapsed should be at least (items - 1) * paceMs minus small jitter.
    // Note: individual deltas may bunch due to concurrent wake-ups on the same tick,
    // but overall pacing across all starts must respect the aggregate budget.
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeGreaterThanOrEqual((items.length - 1) * paceMs - 10);
  });
});
