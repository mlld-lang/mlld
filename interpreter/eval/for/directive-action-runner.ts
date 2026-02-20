import type {
  Environment,
  ForDirective
} from '@core/types';
import { MlldDirectiveError } from '@core/errors';
import { evaluate, type EvalResult } from '@interpreter/core/interpreter';
import { isAugmentedAssignment, isLetAssignment } from '@core/types/when';
import { evaluateAugmentedAssignment, evaluateLetAssignment } from '@interpreter/eval/when';
import { evaluateWhenExpression } from '@interpreter/eval/when-expression';
import { isExeReturnControl } from '@interpreter/eval/exe-return';
import { isControlCandidate } from '@interpreter/eval/loop';
import { RateLimitRetry, isRateLimitError } from '@interpreter/eval/pipeline/rate-limit-retry';
import { materializeDisplayValue } from '@interpreter/utils/display-materialization';
import type { ForParallelOptions } from './parallel-options';
import type { ForControlKindResolver } from './types';

type DirectiveActionControl = {
  shouldBreak: boolean;
  returnControl: unknown;
};

type NonBlockActionSequenceResult = {
  childEnv: Environment;
  returnControl: unknown;
  actionResult: EvalResult;
};

export type DirectiveActionRunnerParams = {
  directive: ForDirective;
  env: Environment;
  childEnv: Environment;
  iterationRoot: Environment;
  effective: ForParallelOptions | undefined;
  extractControlKind: ForControlKindResolver;
};

export type DirectiveActionRunnerResult = {
  childEnv: Environment;
  returnControl: unknown;
};

function findVariableOwner(env: Environment, name: string): Environment | undefined {
  let current: Environment | undefined = env;
  while (current) {
    if (current.getCurrentVariables().has(name)) return current;
    current = current.getParent();
  }
  return undefined;
}

function isDescendantEnvironment(env: Environment, ancestor: Environment): boolean {
  let current: Environment | undefined = env;
  while (current) {
    if (current === ancestor) return true;
    current = current.getParent();
  }
  return false;
}

function resolveDirectiveActionControl(
  value: unknown,
  extractControlKind: ForControlKindResolver
): DirectiveActionControl {
  if (isExeReturnControl(value)) {
    return { shouldBreak: true, returnControl: value };
  }
  if (isControlCandidate(value)) {
    const controlKind = extractControlKind(value);
    if (controlKind === 'done') {
      return { shouldBreak: true, returnControl: { __forDone: true } };
    }
    return { shouldBreak: true, returnControl: null };
  }
  return { shouldBreak: false, returnControl: null };
}

async function evaluateDirectiveActionNode(
  actionNode: unknown,
  childEnv: Environment
): Promise<EvalResult> {
  if ((actionNode as any).type === 'WhenExpression') {
    return await evaluateWhenExpression(actionNode as any, childEnv);
  }
  return await evaluate(actionNode as any, childEnv);
}

async function executeDirectiveBlockActions(
  params: DirectiveActionRunnerParams
): Promise<DirectiveActionRunnerResult> {
  let blockEnv = params.childEnv;
  let returnControl: unknown = null;
  for (const actionNode of params.directive.values.action) {
    if (isLetAssignment(actionNode)) {
      blockEnv = await evaluateLetAssignment(actionNode, blockEnv);
      continue;
    }

    if (isAugmentedAssignment(actionNode)) {
      if (params.effective?.parallel) {
        const owner = findVariableOwner(blockEnv, actionNode.identifier);
        if (!owner || !isDescendantEnvironment(owner, params.iterationRoot)) {
          throw new MlldDirectiveError(
            `Parallel for block cannot mutate outer variable @${actionNode.identifier}.`,
            'for',
            { location: actionNode.location }
          );
        }
      }
      blockEnv = await evaluateAugmentedAssignment(actionNode, blockEnv);
      continue;
    }

    const actionResult = await evaluateDirectiveActionNode(actionNode, blockEnv);
    blockEnv = actionResult.env || blockEnv;
    const control = resolveDirectiveActionControl(actionResult.value, params.extractControlKind);
    if (control.shouldBreak) {
      returnControl = control.returnControl;
      break;
    }
  }

  return { childEnv: blockEnv, returnControl };
}

async function executeDirectiveNonBlockActions(
  params: DirectiveActionRunnerParams
): Promise<NonBlockActionSequenceResult> {
  let currentEnv = params.childEnv;
  let actionResult: EvalResult = { value: undefined, env: currentEnv };
  let returnControl: unknown = null;

  for (const actionNode of params.directive.values.action) {
    actionResult = await evaluateDirectiveActionNode(actionNode, currentEnv);
    currentEnv = actionResult.env || currentEnv;
    const control = resolveDirectiveActionControl(actionResult.value, params.extractControlKind);
    if (control.shouldBreak) {
      returnControl = control.returnControl;
      break;
    }
  }

  return { childEnv: currentEnv, returnControl, actionResult };
}

function emitBareExecInvocationEffect(
  directive: ForDirective,
  env: Environment,
  actionResult: EvalResult
): void {
  if (
    directive.values.action.length !== 1 ||
    directive.values.action[0].type !== 'ExecInvocation' ||
    actionResult.value === undefined ||
    actionResult.value === null
  ) {
    return;
  }

  const materialized = materializeDisplayValue(
    actionResult.value,
    undefined,
    actionResult.value
  );
  let outputContent = materialized.text;
  if (!outputContent.endsWith('\n')) {
    outputContent += '\n';
  }
  if (materialized.descriptor) {
    env.recordSecurityDescriptor(materialized.descriptor);
  }
  env.emitEffect('both', outputContent, { source: directive.values.action[0].location });
}

export async function executeDirectiveActions(
  params: DirectiveActionRunnerParams
): Promise<DirectiveActionRunnerResult> {
  const retry = new RateLimitRetry();
  let childEnv = params.childEnv;

  while (true) {
    try {
      if (params.directive.meta?.actionType === 'block') {
        const blockResult = await executeDirectiveBlockActions({
          ...params,
          childEnv
        });
        retry.reset();
        return blockResult;
      }

      const sequenceResult = await executeDirectiveNonBlockActions({
        ...params,
        childEnv
      });
      childEnv = sequenceResult.childEnv;
      if (!sequenceResult.returnControl) {
        emitBareExecInvocationEffect(params.directive, params.env, sequenceResult.actionResult);
      }
      retry.reset();
      return {
        childEnv,
        returnControl: sequenceResult.returnControl
      };
    } catch (error) {
      if (isRateLimitError(error)) {
        const again = await retry.wait();
        if (again) {
          continue;
        }
      }
      throw error;
    }
  }
}
