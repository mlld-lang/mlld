import { describe, expect, it } from 'vitest';
import type { GuardResult } from '@core/types/guard';
import type { HookDecision } from '@interpreter/hooks/HookManager';
import type { OperationContext } from '@interpreter/env/ContextManager';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { emitResolvedAuthorizationTrace } from './authorization-trace';

function createEnvironment(basePath = '/tmp/mlld-auth-trace'): Environment {
  const env = new Environment(new MemoryFileSystem(), new PathService(), basePath);
  env.setRuntimeTrace('effects');
  return env;
}

function createOperationContext(): OperationContext {
  return {
    type: 'exe',
    name: 'send_email',
    named: 'op:named:send_email',
    metadata: {
      authorizationTrace: {
        tool: 'send_email',
        args: { recipient: 'approved@example.com' },
        controlArgs: ['recipient']
      }
    }
  };
}

function createAuthorizationGuardResult(
  decision: 'allow' | 'deny',
  overrides?: Record<string, unknown>
): GuardResult {
  return {
    guardName: '__policy_authorizations__',
    decision,
    metadata: {
      authorizationGuard: true,
      authorizationMatched: true,
      authorizationCode: decision === 'deny' ? 'unlisted' : null,
      authorizationReason: decision === 'deny'
        ? 'operation not authorized by policy.authorizations'
        : null,
      authorizationMatchedAttestationCount: decision === 'allow' ? 1 : 0,
      ...(overrides ?? {})
    }
  };
}

async function emitTrace(options: {
  preDecision: HookDecision;
  operationContext?: OperationContext;
}): Promise<Environment> {
  const env = createEnvironment();
  const operationContext = options.operationContext ?? createOperationContext();
  await env.withOpContext(operationContext, async () => {
    emitResolvedAuthorizationTrace({
      env,
      operationContext,
      preDecision: options.preDecision
    });
  });
  return env;
}

describe('authorization trace emission', () => {
  it('skips auth traces when no authorization guard participated', async () => {
    const env = await emitTrace({
      preDecision: {
        action: 'continue',
        metadata: {
          guardResults: [
            {
              guardName: '__policy_cmd_access',
              decision: 'allow',
              metadata: { policyGuard: true }
            }
          ]
        }
      }
    });

    expect(env.getRuntimeTraceEvents()).toEqual([]);
  });

  it('emits auth.check and auth.allow from the resolved authorization guard result', async () => {
    const env = await emitTrace({
      preDecision: {
        action: 'continue',
        metadata: {
          guardResults: [
            createAuthorizationGuardResult('allow')
          ]
        }
      }
    });

    expect(env.getRuntimeTraceEvents()).toEqual([
      expect.objectContaining({
        event: 'auth.check',
        data: expect.objectContaining({
          tool: 'send_email',
          controlArgs: ['recipient']
        })
      }),
      expect.objectContaining({
        event: 'auth.allow',
        data: expect.objectContaining({
          tool: 'send_email',
          matchedAttestationCount: 1
        })
      })
    ]);
  });

  it('emits auth.check and auth.deny only when the final guard decision aborts', async () => {
    const env = await emitTrace({
      preDecision: {
        action: 'abort',
        metadata: {
          guardResults: [
            createAuthorizationGuardResult('deny')
          ]
        }
      }
    });

    expect(env.getRuntimeTraceEvents()).toEqual([
      expect.objectContaining({
        event: 'auth.check',
        data: expect.objectContaining({
          tool: 'send_email'
        })
      }),
      expect.objectContaining({
        event: 'auth.deny',
        data: expect.objectContaining({
          tool: 'send_email',
          code: 'unlisted'
        })
      })
    ]);
  });

  it('suppresses auth.deny when an authorization deny is later overridden', async () => {
    const env = await emitTrace({
      preDecision: {
        action: 'continue',
        metadata: {
          guardResults: [
            createAuthorizationGuardResult('deny')
          ]
        }
      }
    });

    expect(env.getRuntimeTraceEvents()).toEqual([]);
  });
});
