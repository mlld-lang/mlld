import type { BaseMlldNode } from '@core/types';
import type { EvalResult } from '@interpreter/core/interpreter';
import type { Environment } from '@interpreter/env/Environment';
import { evaluate } from '@interpreter/core/interpreter';
import { isLetAssignment, isAugmentedAssignment } from '@core/types/when';
import { isExeReturnControl } from '@interpreter/eval/exe-return';
import { isLoopControlValue } from '@interpreter/eval/exe/definition-helpers';
import { evaluateLetAssignment, evaluateAugmentedAssignment } from '@interpreter/eval/when/assignment-support';

interface AssignmentStep {
  handled: boolean;
  env: Environment;
  result: EvalResult;
}

interface EvaluatedStep {
  controlBreak: boolean;
  env: Environment;
  result: EvalResult;
}

function createInitialResult(env: Environment): EvalResult {
  return { value: '', env };
}

function hasLoopControlContext(env: Environment): boolean {
  return Boolean(
    env.getExecutionContext('loop') ||
    env.getExecutionContext('while') ||
    env.getExecutionContext('for')
  );
}

async function runAssignmentStep(actionNode: BaseMlldNode, env: Environment): Promise<AssignmentStep> {
  if (isLetAssignment(actionNode)) {
    const nextEnv = await evaluateLetAssignment(actionNode, env);
    return {
      handled: true,
      env: nextEnv,
      result: { value: undefined, env: nextEnv }
    };
  }

  if (isAugmentedAssignment(actionNode)) {
    const nextEnv = await evaluateAugmentedAssignment(actionNode, env);
    return {
      handled: true,
      env: nextEnv,
      result: { value: undefined, env: nextEnv }
    };
  }

  return {
    handled: false,
    env,
    result: createInitialResult(env)
  };
}

async function runEvaluatedStep(actionNode: BaseMlldNode, env: Environment): Promise<EvaluatedStep> {
  const result = await evaluate(actionNode, env);
  const nextEnv = result.env || env;
  if (
    isExeReturnControl(result.value) ||
    (hasLoopControlContext(nextEnv) && isLoopControlValue(result.value))
  ) {
    return {
      controlBreak: true,
      env: nextEnv,
      result: { value: result.value, env: nextEnv }
    };
  }

  return {
    controlBreak: false,
    env: nextEnv,
    result
  };
}

export async function evaluateActionSequence(
  actionNodes: BaseMlldNode[],
  env: Environment
): Promise<EvalResult> {
  let currentEnv = env;
  let lastResult: EvalResult = createInitialResult(currentEnv);

  for (const actionNode of actionNodes) {
    const assignmentStep = await runAssignmentStep(actionNode, currentEnv);
    if (assignmentStep.handled) {
      currentEnv = assignmentStep.env;
      lastResult = assignmentStep.result;
      continue;
    }

    const evaluatedStep = await runEvaluatedStep(actionNode, currentEnv);
    if (evaluatedStep.controlBreak) {
      return evaluatedStep.result;
    }

    currentEnv = evaluatedStep.env;
    lastResult = evaluatedStep.result;
  }

  return { value: lastResult.value, env: currentEnv };
}
