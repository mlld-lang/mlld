import { describe, expect, it } from 'vitest';
import type { SessionDefinition } from '@core/types/session';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { Environment } from '@interpreter/env/Environment';
import { applyInvocationScopedRuntimeConfig } from './scoped-runtime-config';

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

function createSessionDefinition(name: string): SessionDefinition {
  return {
    id: `${name}-decl`,
    canonicalName: name,
    originPath: '/sessions.mld',
    slots: {
      count: {
        name: 'count',
        type: {
          kind: 'primitive',
          name: 'number',
          isArray: false,
          optional: true
        }
      }
    }
  };
}

describe('applyInvocationScopedRuntimeConfig session merge', () => {
  it('keeps the wrapper-owned session by default and appends caller seed', async () => {
    const env = createEnv();
    const wrapper = createSessionDefinition('wrapper');

    const nextEnv = await applyInvocationScopedRuntimeConfig({
      runtimeEnv: env.createChild(),
      env,
      definition: {
        withClause: {
          session: wrapper,
          seed: { count: 1 }
        }
      } as any,
      node: {} as any,
      invocationWithClause: {
        seed: { count: 2 }
      }
    });

    const scoped = nextEnv.getLocalScopedEnvironmentConfig();
    expect((scoped?.session as any)?.definition).toBe(wrapper);
    expect(scoped?.seed).toEqual([{ count: 1 }, { count: 2 }]);
  });

  it('rejects a conflicting caller session without override: \"session\"', async () => {
    const env = createEnv();
    const wrapper = createSessionDefinition('wrapper');
    const caller = createSessionDefinition('caller');

    await expect(applyInvocationScopedRuntimeConfig({
      runtimeEnv: env.createChild(),
      env,
      definition: {
        withClause: {
          session: wrapper
        }
      } as any,
      node: {} as any,
      invocationWithClause: {
        session: caller
      }
    })).rejects.toMatchObject({
      code: 'SESSION_OVERRIDE_REQUIRED'
    });
  });

  it('allows an explicit caller override and replaces the wrapper attachment', async () => {
    const env = createEnv();
    const wrapper = createSessionDefinition('wrapper');
    const caller = createSessionDefinition('caller');

    const nextEnv = await applyInvocationScopedRuntimeConfig({
      runtimeEnv: env.createChild(),
      env,
      definition: {
        withClause: {
          session: wrapper,
          seed: { count: 1 }
        }
      } as any,
      node: {} as any,
      invocationWithClause: {
        session: caller,
        seed: { count: 9 },
        override: 'session'
      }
    });

    const scoped = nextEnv.getLocalScopedEnvironmentConfig();
    expect((scoped?.session as any)?.definition).toBe(caller);
    expect(scoped?.seed).toEqual({ count: 9 });
  });
});
