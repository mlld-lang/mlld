import type { HookableNode } from '@core/types/hooks';
import type { Variable } from '@core/types/variable';
import type { Environment } from '../env/Environment';
import type { OperationContext } from '../env/ContextManager';
import type { EvalResult } from '../core/interpreter';
import { isVariable } from '../utils/variable-resolution';
import {
  createGuardInputHelper,
  type GuardInputHelper
} from '@core/types/variable/ArrayHelpers';

export type HookDecisionAction = 'continue' | 'abort' | 'retry' | 'deny';

export interface HookDecision {
  action: HookDecisionAction;
  metadata?: Record<string, unknown>;
}

export interface HookInputHelpers {
  guard?: GuardInputHelper;
}

export type PreHook = (
  node: HookableNode,
  inputs: readonly unknown[],
  env: Environment,
  operation?: OperationContext,
  helpers?: HookInputHelpers
) => Promise<HookDecision>;

export type PostHook = (
  node: HookableNode,
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
    node: HookableNode,
    inputs: readonly unknown[],
    env: Environment,
    operation?: OperationContext
  ): Promise<HookDecision> {
    let aggregatedMetadata: Record<string, unknown> | undefined;
    for (const hook of this.preHooks) {
      const helpers = this.buildInputHelpers(inputs);
      const decision = await hook(node, inputs, env, operation, helpers);
      if (decision.metadata) {
        aggregatedMetadata = aggregatedMetadata
          ? { ...aggregatedMetadata, ...decision.metadata }
          : decision.metadata;
      }
      if (decision.action !== 'continue') {
        const metadata =
          decision.metadata && aggregatedMetadata
            ? { ...aggregatedMetadata, ...decision.metadata }
            : decision.metadata ?? aggregatedMetadata;
        return metadata ? { ...decision, metadata } : decision;
      }
    }
    return aggregatedMetadata ? { action: 'continue', metadata: aggregatedMetadata } : { action: 'continue' };
  }

  async runPost(
    node: HookableNode,
    result: EvalResult,
    inputs: readonly unknown[],
    env: Environment,
    operation?: OperationContext
  ): Promise<EvalResult> {
    let current = result;
    for (const hook of this.postHooks) {
      current = await hook(node, current, inputs, env, operation);
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
