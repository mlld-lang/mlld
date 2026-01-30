import type { BaseMlldNode, ExeReturnNode } from '@core/types';
import type { IfNode } from '@core/types/if';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { evaluate } from '../core/interpreter';
import { MlldDirectiveError } from '@core/errors';
import { evaluateCondition, evaluateAugmentedAssignment, evaluateLetAssignment } from './when';
import { isAugmentedAssignment, isLetAssignment } from '@core/types/when';
import { createExeReturnControl, isExeReturnControl, resolveExeReturnValue } from './exe-return';

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

  const conditionResult = await evaluateCondition(node.values.condition, env);
  const branch = conditionResult ? node.values.then : node.values.else;
  if (!branch || branch.length === 0) {
    return { value: '', env };
  }

  let blockEnv = env.createChild();
  let lastValue: unknown = '';

  for (const stmt of branch as BaseMlldNode[]) {
    if (isLetAssignment(stmt)) {
      blockEnv = await evaluateLetAssignment(stmt, blockEnv);
      lastValue = undefined;
      continue;
    }
    if (isAugmentedAssignment(stmt)) {
      blockEnv = await evaluateAugmentedAssignment(stmt, blockEnv);
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
      env.mergeChild(blockEnv);
      return { value: createExeReturnControl(returnResult.value), env };
    }

    const result = await evaluate(stmt, blockEnv);
    blockEnv = result.env || blockEnv;
    lastValue = result.value;

    if (isExeReturnControl(result.value)) {
      env.mergeChild(blockEnv);
      return { value: result.value, env };
    }
  }

  env.mergeChild(blockEnv);
  return { value: lastValue ?? '', env };
}
