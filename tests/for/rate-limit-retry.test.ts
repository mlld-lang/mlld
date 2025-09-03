import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('/for - Rate Limit Retry (runtime)', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;

  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
    delete process.env.FOR_RL_TRIG;
  });

  afterEach(() => {
    delete process.env.FOR_RL_TRIG;
  });

  it('retries an iteration on rate-limit error with backoff then succeeds', async () => {
    const input = `
/exe @sometimes(v) = js {
  if (!process.env.FOR_RL_TRIG) {
    process.env.FOR_RL_TRIG = '1';
    const e = new Error('rate limit');
    // Helpful hint for detector
    // @ts-ignore
    e.status = 429;
    throw e;
  }
  return v;
}

/for @x in ["a"] => show @sometimes(@x)
`;

    const t0 = Date.now();
    const out = await interpret(input, { fileSystem, pathService });
    const elapsed = Date.now() - t0;

    // Default RateLimitRetry baseDelay=500ms, one retry → wait ≈ 500ms
    expect(elapsed).toBeGreaterThanOrEqual(450);
    expect(out.trim()).toContain('a');
  });
});

