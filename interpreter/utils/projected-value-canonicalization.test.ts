import { describe, expect, it } from 'vitest';
import { createHandleWrapper } from '@core/types/handle';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { asText, wrapStructured } from './structured-value';
import { resolveValueHandles } from './handle-resolution';
import { canonicalizeProjectedValue } from './projected-value-canonicalization';

function createEnvironment(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

describe('canonicalizeProjectedValue', () => {
  it('still resolves explicit handle wrappers through the existing handle registry', async () => {
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

  it('resolves bare handle token strings through the existing handle registry', async () => {
    const env = createEnvironment();
    const liveValue = wrapStructured('ada@example.com', 'text', 'ada@example.com');
    const issued = env.issueHandle(liveValue);

    const canonical = await canonicalizeProjectedValue(issued.handle, env);

    expect(canonical).toBe(liveValue);
  });

  it('resolves a unique emitted preview back to the live value', async () => {
    const env = createEnvironment();
    const liveValue = wrapStructured('ada@example.com', 'text', 'ada@example.com');

    env.recordProjectionExposure({
      sessionId: 'session-preview',
      value: liveValue,
      kind: 'mask',
      handle: 'h_abc123',
      field: 'email',
      record: 'contact',
      emittedPreview: 'a***@example.com',
      issuedAt: 1
    });

    const canonical = await canonicalizeProjectedValue('a***@example.com', env, {
      sessionId: 'session-preview'
    });

    expect(canonical).toBe(liveValue);
    expect(asText(canonical)).toBe('ada@example.com');
  });

  it('resolves a unique emitted bare literal back to the live value', async () => {
    const env = createEnvironment();
    const liveValue = wrapStructured('Ada Lovelace', 'text', 'Ada Lovelace');

    env.recordProjectionExposure({
      sessionId: 'session-literal',
      value: liveValue,
      kind: 'bare',
      field: 'name',
      record: 'contact',
      emittedLiteral: 'Ada Lovelace',
      issuedAt: 1
    });

    const canonical = await canonicalizeProjectedValue('Ada Lovelace', env, {
      sessionId: 'session-literal'
    });

    expect(canonical).toBe(liveValue);
    expect(asText(canonical)).toBe('Ada Lovelace');
  });

  it('throws on ambiguous projected previews with handle guidance', async () => {
    const env = createEnvironment();

    env.recordProjectionExposure({
      sessionId: 'session-ambiguous',
      value: wrapStructured('sarah@company.com', 'text', 'sarah@company.com'),
      kind: 'mask',
      handle: 'h_sarah1',
      emittedPreview: 's***@company.com',
      issuedAt: 1
    });
    env.recordProjectionExposure({
      sessionId: 'session-ambiguous',
      value: wrapStructured('steve@company.com', 'text', 'steve@company.com'),
      kind: 'mask',
      handle: 'h_steve1',
      emittedPreview: 's***@company.com',
      issuedAt: 2
    });

    await expect(
      canonicalizeProjectedValue('s***@company.com', env, {
        sessionId: 'session-ambiguous'
      })
    ).rejects.toThrow(/use the handle wrapper from the tool result/i);
  });

  it('keeps ambiguous projected literals when all matches collapse to the same canonical value', async () => {
    const env = createEnvironment();

    env.recordProjectionExposure({
      sessionId: 'session-ambiguous',
      value: wrapStructured('Ada Lovelace', 'text', 'Ada Lovelace'),
      kind: 'bare',
      emittedLiteral: 'Ada Lovelace',
      issuedAt: 1
    });
    env.recordProjectionExposure({
      sessionId: 'session-ambiguous',
      value: wrapStructured('Ada Lovelace', 'text', 'Ada Lovelace'),
      kind: 'bare',
      emittedLiteral: 'Ada Lovelace',
      issuedAt: 2
    });

    const canonical = await canonicalizeProjectedValue('Ada Lovelace', env, {
      sessionId: 'session-ambiguous',
      collapseEquivalentMatches: true
    });

    expect(asText(canonical)).toBe('Ada Lovelace');
  });

  it('leaves unmatched emitted strings unchanged', async () => {
    const env = createEnvironment();

    await expect(
      canonicalizeProjectedValue('nobody@example.com', env, {
        sessionId: 'session-none'
      })
    ).resolves.toBe('nobody@example.com');
  });

  it('leaves unknown bare handle-looking strings unchanged', async () => {
    const env = createEnvironment();

    await expect(
      canonicalizeProjectedValue('h_missing', env, {
        sessionId: 'session-none'
      })
    ).resolves.toBe('h_missing');
  });

  it('canonicalizes arrays of projected strings element-by-element', async () => {
    const env = createEnvironment();
    const first = wrapStructured('ada@example.com', 'text', 'ada@example.com');
    const second = wrapStructured('grace@example.com', 'text', 'grace@example.com');

    env.recordProjectionExposure({
      sessionId: 'session-array',
      value: first,
      kind: 'mask',
      handle: 'h_first1',
      emittedPreview: 'a***@example.com',
      issuedAt: 1
    });
    env.recordProjectionExposure({
      sessionId: 'session-array',
      value: second,
      kind: 'mask',
      handle: 'h_second1',
      emittedPreview: 'g***@example.com',
      issuedAt: 2
    });

    const canonical = await canonicalizeProjectedValue(
      ['a***@example.com', 'g***@example.com'],
      env,
      { sessionId: 'session-array' }
    );

    expect(canonical).toEqual([first, second]);
    expect(asText((canonical as unknown[])[0])).toBe('ada@example.com');
    expect(asText((canonical as unknown[])[1])).toBe('grace@example.com');
  });

  it('can resolve emitted aliases globally when no active session is provided', async () => {
    const env = createEnvironment();
    const liveValue = wrapStructured('ada@example.com', 'text', 'ada@example.com');

    env.recordProjectionExposure({
      sessionId: 'planner-session',
      value: liveValue,
      kind: 'mask',
      handle: 'h_planner1',
      emittedPreview: 'a***@example.com',
      issuedAt: 1
    });

    const canonical = await canonicalizeProjectedValue('a***@example.com', env, {
      matchScope: 'global'
    });

    expect(canonical).toBe(liveValue);
    expect(asText(canonical)).toBe('ada@example.com');
  });
});
