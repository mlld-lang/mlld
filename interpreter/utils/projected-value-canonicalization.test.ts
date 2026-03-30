import { describe, expect, it } from 'vitest';
import { createHandleWrapper } from '@core/types/handle';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { wrapStructured } from './structured-value';
import { resolveValueHandles } from './handle-resolution';
import { canonicalizeProjectedValue } from './projected-value-canonicalization';

function createEnvironment(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

describe('canonicalizeProjectedValue', () => {
  it('resolves explicit handle wrappers through the handle registry', async () => {
    const env = createEnvironment();
    const liveValue = wrapStructured('ada@example.com', 'text', 'ada@example.com');
    const issued = env.issueHandle(liveValue);

    const canonical = await canonicalizeProjectedValue(
      createHandleWrapper(issued.handle),
      env
    );

    expect(canonical).toBe(liveValue);
    await expect(resolveValueHandles(createHandleWrapper(issued.handle), env)).resolves.toBe(liveValue);
  });

  it('resolves bare handle token strings through the handle registry', async () => {
    const env = createEnvironment();
    const liveValue = wrapStructured('ada@example.com', 'text', 'ada@example.com');
    const issued = env.issueHandle(liveValue);

    const canonical = await canonicalizeProjectedValue(issued.handle, env);

    expect(canonical).toBe(liveValue);
  });

  it('leaves non-handle literals unchanged', async () => {
    const env = createEnvironment();

    await expect(
      canonicalizeProjectedValue('a***@example.com', env, {
        sessionId: 'session-preview'
      })
    ).resolves.toBe('a***@example.com');
  });
});
