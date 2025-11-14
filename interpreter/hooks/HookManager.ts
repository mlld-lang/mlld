import type { DirectiveNode } from '@core/types';
import type { Variable } from '@core/types/variable';
import type { Environment } from '../env/Environment';
import type { OperationContext } from '../env/ContextManager';
import type { EvalResult } from '../core/interpreter';
import { isVariable } from '../utils/variable-resolution';
import {
  createGuardInputHelper,
  type GuardInputHelper
} from '@core/types/variable/ArrayHelpers';

export type HookDecisionAction = 'continue' | 'abort' | 'retry';

export interface HookDecision {
  action: HookDecisionAction;
  metadata?: Record<string, unknown>;
}

export interface HookInputHelpers {
  guard?: GuardInputHelper;
}

export type PreHook = (
  directive: DirectiveNode,
  inputs: readonly unknown[],
  env: Environment,
  operation?: OperationContext,
  helpers?: HookInputHelpers
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
      const helpers = this.buildInputHelpers(inputs);
      const decision = await hook(directive, inputs, env, operation, helpers);
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

  private buildInputHelpers(inputs: readonly unknown[]): HookInputHelpers | undefined {
    if (!Array.isArray(inputs) || inputs.length === 0) {
      return undefined;
    }
    if (inputs.every(isVariable)) {
      return {
        guard: createGuardInputHelper(inputs as readonly Variable[])
      };
    }
    return undefined;
  }
}
