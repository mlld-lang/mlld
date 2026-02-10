import { describe, expect, it } from 'vitest';
import { parseSync } from '@grammar/parser';
import { isDirectiveNode, type DirectiveNode } from '@core/types';
import type { SecurityDescriptor } from '@core/types/security';
import { makeSecurityDescriptor } from '@core/types/security';
import type { Variable } from '@core/types/variable';
import { createSimpleTextVariable } from '@core/types/variable';
import { updateVarMxFromDescriptor } from '@core/types/variable/VarMxHelpers';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { Environment } from '@interpreter/env/Environment';
import { evaluateDirective } from '@interpreter/eval/directive';
import {
  evaluatePostGuardBlock,
  evaluatePostGuardReplacement
} from '@interpreter/hooks/guard-post-runtime-actions';

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

function createSecretInput(name: string, value: string): Variable {
  return createSimpleTextVariable(
    name,
    value,
    {
      directive: 'var',
      syntax: 'quoted',
      hasInterpolation: false,
      isMultiLine: false
    },
    {
      security: makeSecurityDescriptor({ labels: ['secret'], sources: ['test'] })
    }
  );
}

function cloneVariableWithDescriptor(
  variable: Variable,
  descriptor: SecurityDescriptor
): Variable {
  const clone: Variable = {
    ...variable,
    mx: {
      ...(variable.mx ?? {})
    },
    internal: {
      ...(variable.internal ?? {})
    }
  };
  if (!clone.mx) {
    clone.mx = {} as any;
  }
  updateVarMxFromDescriptor(clone.mx, descriptor);
  if (clone.mx?.mxCache) {
    delete clone.mx.mxCache;
  }
  return clone;
}

function toVariableText(value: unknown): string {
  if (!value || typeof value !== 'object') {
    return String(value ?? '');
  }
  const variable = value as { value?: unknown };
  return String(variable.value ?? '');
}

describe('guard post runtime actions', () => {
  it('evaluates after-guard block rules and returns retry actions from matched conditions', async () => {
    const env = createEnv();
    const guardDirective = parseSync(`
/guard after @retryBlock for secret = when [
  let @decision = "retry"
  @decision == "retry" => retry "retry-from-block"
  * => deny "unexpected"
]
    `).filter(isDirectiveNode)[0] as DirectiveNode;

    await evaluateDirective(guardDirective, env);
    const guard = env.getGuardRegistry().getByName('retryBlock');

    expect(guard).toBeDefined();
    if (!guard) {
      return;
    }

    const action = await evaluatePostGuardBlock(guard.block, env.createChild());
    expect(action?.decision).toBe('retry');
    expect(action?.message).toBe('retry-from-block');
  });

  it('materializes allow-value replacements for after-guard output transforms', async () => {
    const env = createEnv();
    const guardDirective = parseSync(
      '/guard after @rewrite for secret = when [ * => allow "sanitized-output" ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);

    const guard = env.getGuardRegistry().getByName('rewrite');
    expect(guard).toBeDefined();
    if (!guard) {
      return;
    }

    const action = guard.block.rules[0]?.action;
    expect(action).toBeDefined();
    if (!action) {
      return;
    }

    const replacement = await evaluatePostGuardReplacement(
      action,
      env.createChild(),
      guard,
      createSecretInput('secretVar', 'raw-secret'),
      { cloneVariableWithDescriptor }
    );

    expect(toVariableText(replacement)).toBe('sanitized-output');
  });

  it('preserves label-only allow replacements with descriptor updates', async () => {
    const env = createEnv();
    const guardDirective = parseSync(
      '/guard after @labelOnly for secret = when [ * => allow with { addLabels: ["blessed"] } ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);

    const guard = env.getGuardRegistry().getByName('labelOnly');
    expect(guard).toBeDefined();
    if (!guard) {
      return;
    }

    const action = guard.block.rules[0]?.action;
    expect(action).toBeDefined();
    if (!action) {
      return;
    }

    const replacement = await evaluatePostGuardReplacement(
      action,
      env.createChild(),
      guard,
      createSecretInput('secretVar', 'raw-secret'),
      { cloneVariableWithDescriptor }
    );

    expect(replacement).toBeDefined();
    expect(toVariableText(replacement)).toBe('raw-secret');
    expect(replacement?.mx?.labels ?? []).toEqual(
      expect.arrayContaining(['secret', 'blessed'])
    );
    expect(replacement?.mx?.sources ?? []).toEqual(
      expect.arrayContaining(['guard:labelOnly'])
    );
  });
});
