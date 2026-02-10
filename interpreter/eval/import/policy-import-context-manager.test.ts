import { describe, expect, it } from 'vitest';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { PolicyImportContextManager } from './PolicyImportContextManager';

function createEnv(): Environment {
  const env = new Environment(new MemoryFileSystem(), new PathService(), '/project');
  env.setCurrentFilePath('/project/main.mld');
  return env;
}

describe('PolicyImportContextManager', () => {
  it('keeps policy override context restoration behavior stable', async () => {
    const env = createEnv();
    const manager = new PolicyImportContextManager();
    env.setPolicyContext({
      tier: null,
      configs: { io: { mode: 'strict' } as any },
      activePolicies: ['baseline']
    } as any);
    const baseline = env.getPolicyContext();
    const directive = {
      values: {
        withClause: {
          policy: { io: { allow: ['read'] } }
        }
      }
    } as any;

    const expectedError = new Error('fail');
    let observedDuringOverride: unknown;
    await expect(
      manager.withPolicyOverride(directive, env, async () => {
        observedDuringOverride = env.getPolicyContext();
        throw expectedError;
      })
    ).rejects.toBe(expectedError);

    expect(observedDuringOverride).not.toEqual(baseline);
    expect(env.getPolicyContext()).toEqual(baseline);
  });

  it('keeps policy import alias tracking behavior stable', () => {
    const env = createEnv();
    const manager = new PolicyImportContextManager();
    env.setPolicyContext({
      tier: null,
      configs: {},
      activePolicies: ['baseline']
    });
    const directive = {
      subtype: 'importPolicy',
      values: {
        namespace: [{ identifier: 'production' }]
      },
      meta: {}
    } as any;

    manager.applyPolicyImportContext(directive, env, '/project/policies.mld');
    manager.applyPolicyImportContext(directive, env, '/project/policies.mld');

    expect(env.getPolicyContext()).toMatchObject({
      activePolicies: ['baseline', 'production']
    });
  });
});
