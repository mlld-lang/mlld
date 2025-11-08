import type { DirectiveNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { OperationContext } from '../env/ContextManager';
import type { EvalResult } from '../core/interpreter';

export type HookDecisionAction = 'continue' | 'abort' | 'retry';

export interface HookDecision {
  action: HookDecisionAction;
  metadata?: Record<string, unknown>;
}

export type PreHook = (
  directive: DirectiveNode,
  inputs: readonly unknown[],
  env: Environment,
  operation?: OperationContext
) => Promise<HookDecision>;

export type PostHook = (
  directive: DirectiveNode,
  result: EvalResult,
  inputs: readonly unknown[],
  env: Environment,
  operation?: OperationContext
) => Promise<EvalResult>;

/**
 * Minimal hook manager with fixed registration order.
 * Interpreter-owned infrastructure (no userland registration).
 */
export class HookManager {
  private readonly preHooks: PreHook[] = [];
  private readonly postHooks: PostHook[] = [];

  registerPre(hook: PreHook): void {
    this.preHooks.push(hook);
  }

  registerPost(hook: PostHook): void {
    this.postHooks.push(hook);
  }

  async runPre(
    directive: DirectiveNode,
    inputs: readonly unknown[],
    env: Environment,
    operation?: OperationContext
  ): Promise<HookDecision> {
    for (const hook of this.preHooks) {
      const decision = await hook(directive, inputs, env, operation);
      if (decision.action !== 'continue') {
        return decision;
      }
    }
    return { action: 'continue' };
  }

  async runPost(
    directive: DirectiveNode,
    result: EvalResult,
    inputs: readonly unknown[],
    env: Environment,
    operation?: OperationContext
  ): Promise<EvalResult> {
    let current = result;
    for (const hook of this.postHooks) {
      current = await hook(directive, current, inputs, env, operation);
    }
    return current;
  }
}
