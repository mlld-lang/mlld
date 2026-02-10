import type { HookableNode } from '@core/types/hooks';
import type { Variable } from '@core/types/variable/VariableTypes';
import type { WhenExpressionNode } from '@core/types/when';
import type { OperationContext } from '@interpreter/env/ContextManager';
import type { Environment } from '@interpreter/env/Environment';
import type { HookDecision } from '@interpreter/hooks/HookManager';
import { handleGuardDecision } from '@interpreter/hooks/hook-decision-handler';
import { materializeGuardInputs } from '@interpreter/utils/guard-inputs';
import { handleExecGuardDenial } from '@interpreter/eval/guard-denial-handler';

export interface GuardPreflightContext {
  guardInputs: unknown[];
}

export interface BuildGuardPreflightContextOptions {
  env: Environment;
  execEnv: Environment;
  stageInputs: readonly unknown[];
  baseParamNames: readonly string[];
}

export function buildGuardPreflightContext(
  options: BuildGuardPreflightContextOptions
): GuardPreflightContext {
  const { env, execEnv, stageInputs, baseParamNames } = options;
  const guardInputCandidates: unknown[] = [];
  const stageInputVar = env.getVariable?.('input');
  if (stageInputVar) {
    guardInputCandidates.push(stageInputVar);
  }
  if (stageInputs.length > 0) {
    guardInputCandidates.push(...stageInputs);
  }
  if (baseParamNames.length > 0) {
    for (const paramName of baseParamNames) {
      const paramVar = execEnv.getVariable(paramName);
      if (paramVar) {
        guardInputCandidates.push(paramVar);
      }
    }
  }

  return {
    guardInputs: materializeGuardInputs(guardInputCandidates, { nameHint: '__pipeline_stage_input__' })
  };
}

export interface ExecuteGuardPreflightOptions {
  env: Environment;
  execEnv: Environment;
  guardInputs: readonly unknown[];
  hookNode?: HookableNode;
  operationContext?: OperationContext;
  whenExprNode?: WhenExpressionNode | null;
}

export interface ExecuteGuardPreflightResult {
  preDecision: HookDecision | undefined;
  hasFallbackResult: boolean;
  fallbackValue?: unknown;
}

function injectGuardInputIfMissing(execEnv: Environment, guardInputVariable: unknown): void {
  const existingInput = execEnv.getVariable('input');
  if (existingInput) {
    return;
  }

  const clonedInput: Variable = {
    ...(guardInputVariable as Variable),
    name: 'input',
    mx: { ...((guardInputVariable as Variable).mx ?? {}) },
    internal: {
      ...((guardInputVariable as Variable).internal ?? {}),
      isSystem: true,
      isParameter: true
    }
  };
  execEnv.setParameterVariable('input', clonedInput);
}

export async function executeGuardPreflight(
  options: ExecuteGuardPreflightOptions
): Promise<ExecuteGuardPreflightResult> {
  const { env, execEnv, guardInputs, hookNode, operationContext, whenExprNode } = options;
  let preDecision: HookDecision | undefined;

  if (!hookNode || !operationContext) {
    return {
      preDecision,
      hasFallbackResult: false
    };
  }

  const hookManager = env.getHookManager();
  preDecision = await hookManager.runPre(hookNode, guardInputs, env, operationContext);
  const guardInputVariable =
    preDecision && preDecision.metadata && (preDecision.metadata as Record<string, unknown>).guardInput;

  try {
    await handleGuardDecision(preDecision, hookNode, env, operationContext);
  } catch (error) {
    if (guardInputVariable) {
      injectGuardInputIfMissing(execEnv, guardInputVariable);
    }
    if (whenExprNode) {
      const handled = await handleExecGuardDenial(error, {
        execEnv,
        env,
        whenExprNode
      });
      if (handled) {
        return {
          preDecision,
          hasFallbackResult: true,
          fallbackValue: handled.value ?? handled.stdout ?? ''
        };
      }
    }
    throw error;
  }

  return {
    preDecision,
    hasFallbackResult: false
  };
}
