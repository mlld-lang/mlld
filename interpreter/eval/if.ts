import type { BaseMlldNode, ExeReturnNode } from '@core/types';
import type { IfNode } from '@core/types/if';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { evaluate } from '../core/interpreter';
import { MlldDirectiveError } from '@core/errors';
import { evaluateCondition, evaluateAugmentedAssignment, evaluateLetAssignment } from './when';
import { isAugmentedAssignment, isLetAssignment } from '@core/types/when';
import { createExeReturnControl, isExeReturnControl, resolveExeReturnValue } from './exe-return';
import {
  applySecurityDescriptorToCurrentVariables,
  attachSecurityDescriptorToValue
} from './control-flow-security';

export async function evaluateIf(
  node: IfNode,
  env: Environment
): Promise<EvalResult> {
  const hasReturn = node.meta?.hasReturn === true;
  const exeContext = env.getExecutionContext('exe');
  if (!exeContext && hasReturn) {
    throw new MlldDirectiveError(
      'Return statements are only allowed inside exe blocks.',
      'if',
      { location: node.location }
    );
  }

  const conditionEnv = env.createChild();
  const conditionResult = await evaluateCondition(node.values.condition, conditionEnv);
  const conditionDescriptor = conditionEnv.getLocalSecurityDescriptor();
  const branch = conditionResult ? node.values.then : node.values.else;
  if (!branch || branch.length === 0) {
    return { value: '', env };
  }

  let blockEnv = env.createChild();
  if (conditionDescriptor) {
    blockEnv.recordSecurityDescriptor(conditionDescriptor);
  }
  let lastValue: unknown = '';

  for (const stmt of branch as BaseMlldNode[]) {
    if (isLetAssignment(stmt)) {
      blockEnv = await evaluateLetAssignment(stmt, blockEnv);
      applySecurityDescriptorToCurrentVariables(blockEnv, conditionDescriptor);
      lastValue = undefined;
      continue;
    }
    if (isAugmentedAssignment(stmt)) {
      blockEnv = await evaluateAugmentedAssignment(stmt, blockEnv);
      applySecurityDescriptorToCurrentVariables(blockEnv, conditionDescriptor);
      lastValue = undefined;
      continue;
    }
    if (stmt.type === 'ExeReturn') {
      if (!exeContext) {
        throw new MlldDirectiveError(
          'Return statements are only allowed inside exe blocks.',
          'if',
          { location: stmt.location }
        );
      }
      const returnResult = await resolveExeReturnValue(stmt as ExeReturnNode, blockEnv);
      blockEnv = returnResult.env;
      applySecurityDescriptorToCurrentVariables(blockEnv, conditionDescriptor);
      env.mergeChild(blockEnv);
      return {
        value: createExeReturnControl(
          attachSecurityDescriptorToValue(returnResult.value, conditionDescriptor)
        ),
        env
      };
    }

    const result = await evaluate(stmt, blockEnv);
    blockEnv = result.env || blockEnv;
    applySecurityDescriptorToCurrentVariables(blockEnv, conditionDescriptor);
    lastValue = attachSecurityDescriptorToValue(result.value, conditionDescriptor);

    if (isExeReturnControl(result.value)) {
      env.mergeChild(blockEnv);
      return {
        value: attachSecurityDescriptorToValue(result.value, conditionDescriptor),
        env
      };
    }
  }

  applySecurityDescriptorToCurrentVariables(blockEnv, conditionDescriptor);
  env.mergeChild(blockEnv);
  return {
    value: attachSecurityDescriptorToValue(lastValue ?? '', conditionDescriptor),
    env
  };
}
