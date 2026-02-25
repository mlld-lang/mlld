import type { GuardResult } from '@core/types/guard';
import type { Variable, VariableSource } from '@core/types/variable';
import type { Environment } from '../env/Environment';
import {
  ensurePrefixHelper,
  ensureTagHelper,
  injectGuardHelpers
} from './guard-helper-injection';
import {
  evaluateGuardRuntime,
  type EvaluateGuardRuntimeOptions
} from './guard-runtime-evaluator';
import { evaluateGuardBlock } from './guard-block-evaluator';
import {
  buildDecisionMetadata,
  evaluateGuardReplacement,
  resolveGuardEnvConfig
} from './guard-action-evaluator';
import {
  logGuardDecisionEvent,
  logGuardEvaluationStart,
  logGuardHelperAvailability
} from './guard-pre-logging';

export const DEFAULT_GUARD_MAX = 3;

export const GUARD_INPUT_SOURCE: VariableSource = {
  directive: 'var',
  syntax: 'object',
  hasInterpolation: false,
  isMultiLine: false
};

export async function evaluatePreHookGuard(
  options: EvaluateGuardRuntimeOptions
): Promise<GuardResult> {
  return evaluateGuardRuntime(options, {
    defaultGuardMax: DEFAULT_GUARD_MAX,
    guardInputSource: GUARD_INPUT_SOURCE,
    prepareGuardEnvironment: (sourceEnv, guardEnv, guard) => {
      if (guard.capturedModuleEnv) {
        guardEnv.setCapturedModuleEnv(guard.capturedModuleEnv);
      }
      inheritParentVariables(sourceEnv, guardEnv);
      logGuardHelperAvailability(sourceEnv, guardEnv, guard);
      ensurePrefixHelper(sourceEnv, guardEnv);
      ensureTagHelper(sourceEnv, guardEnv);
    },
    injectGuardHelpers,
    evaluateGuardBlock,
    evaluateGuardReplacement,
    resolveGuardEnvConfig,
    buildDecisionMetadata,
    logGuardEvaluationStart,
    logGuardDecisionEvent
  });
}

export function inheritParentVariables(parent: Environment, child: Environment): void {
  const aggregated = new Map<string, Variable>();
  const capturedModuleEnv = child.getCapturedModuleEnv();
  const addVars = (env: Environment) => {
    for (const [name, variable] of env.getAllVariables()) {
      if (!aggregated.has(name)) {
        aggregated.set(name, variable);
      }
    }
  };

  let current: Environment | undefined = parent;
  while (current) {
    addVars(current);
    current = current.getParent();
  }

  for (const [name, variable] of aggregated) {
    if (capturedModuleEnv?.has(name)) {
      continue;
    }
    if (!child.hasVariable(name)) {
      child.setVariable(name, variable);
    }
  }
}
