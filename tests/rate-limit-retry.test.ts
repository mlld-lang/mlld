import { describe, it, expect, vi } from 'vitest';
import { RateLimitRetry } from '@interpreter/eval/pipeline/rate-limit-retry';

describe('RateLimitRetry', () => {
  it('backs off exponentially and stops after max attempts', async () => {
    vi.useFakeTimers();
    const retry = new RateLimitRetry(3, 10);

    const r1 = retry.wait();
    await vi.advanceTimersByTimeAsync(10);
    expect(await r1).toBe(true);

    const r2 = retry.wait();
    await vi.advanceTimersByTimeAsync(20);
    expect(await r2).toBe(true);

    const r3 = retry.wait();
    await vi.advanceTimersByTimeAsync(40);
    expect(await r3).toBe(true);

    const r4 = retry.wait();
    await vi.advanceTimersByTimeAsync(80);
    expect(await r4).toBe(false);

    vi.useRealTimers();
  });
});
