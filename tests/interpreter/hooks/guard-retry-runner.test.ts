import { describe, it, expect } from 'vitest';
import { runWithGuardRetry } from '@interpreter/hooks/guard-retry-runner';
import { GuardRetrySignal } from '@core/errors/GuardRetrySignal';
import { GuardError } from '@core/errors/GuardError';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { Environment } from '@interpreter/env/Environment';

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

describe('runWithGuardRetry', () => {
  it('retries when a GuardRetrySignal is thrown and the source is retryable', async () => {
    const env = createEnv();
    let attempts = 0;
    const result = await runWithGuardRetry({
      env,
      sourceRetryable: true,
      execute: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new GuardRetrySignal({
            guardName: null,
            reason: 'retry me'
          });
        }
        return 'ok';
      }
    });

    expect(result).toBe('ok');
    expect(attempts).toBe(2);
  });

  it('denies retry when the source is not retryable', async () => {
    const env = createEnv();
    let attempts = 0;
    await expect(
      runWithGuardRetry({
        env,
        sourceRetryable: false,
        execute: async () => {
          attempts += 1;
          throw new GuardRetrySignal({
            guardName: null,
            reason: 'not allowed'
          });
        }
      })
    ).rejects.toBeInstanceOf(GuardError);
    expect(attempts).toBe(1);
  });
});
