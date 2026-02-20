import type { ExeBlockNode, ExeReturnNode } from '@core/types';
import { isAugmentedAssignment, isLetAssignment } from '@core/types/when';
import type { EvalResult } from '@interpreter/core/interpreter';
import { evaluate } from '@interpreter/core/interpreter';
import type { Environment } from '@interpreter/env/Environment';
import { createExeReturnControl, isExeReturnControl, resolveExeReturnValue } from '@interpreter/eval/exe-return';
import { VariableImporter } from '@interpreter/eval/import/VariableImporter';
import { evaluateAugmentedAssignment, evaluateLetAssignment } from '@interpreter/eval/when';
import { isLoopControlValue } from './definition-helpers';

export interface ExeBlockOptions {
  scope?: 'function' | 'block';
}

export async function evaluateExeBlock(
  block: ExeBlockNode,
  env: Environment,
  args: Record<string, unknown> = {},
  options: ExeBlockOptions = {}
): Promise<EvalResult> {
  const scope = options.scope ?? 'function';
  const parentExeContext = env.getExecutionContext('exe') as
    | { scope?: 'function' | 'block'; hasFunctionBoundary?: boolean }
    | undefined;
  const hasFunctionBoundary =
    scope === 'function'
      ? true
      : Boolean(parentExeContext?.hasFunctionBoundary || parentExeContext?.scope === 'function');
  const shouldBubbleReturn = scope === 'block' && hasFunctionBoundary;

  let blockEnv = env.createChild();

  if (args && Object.keys(args).length > 0) {
    const importer = new VariableImporter();
    for (const [param, value] of Object.entries(args)) {
      const variable = importer.createVariableFromValue(
        param,
        value,
        'exe-param',
        undefined,
        { env: blockEnv }
      );
      blockEnv.setVariable(param, variable);
    }
  }

  blockEnv.pushExecutionContext('exe', { allowReturn: true, scope, hasFunctionBoundary });
  try {
    for (const stmt of block.values?.statements ?? []) {
      if (isLetAssignment(stmt)) {
        blockEnv = await evaluateLetAssignment(stmt, blockEnv);
        continue;
      }
      if (isAugmentedAssignment(stmt)) {
        blockEnv = await evaluateAugmentedAssignment(stmt, blockEnv);
        continue;
      }
      if (stmt.type === 'ExeReturn') {
        const returnResult = await resolveExeReturnValue(stmt as ExeReturnNode, blockEnv);
        blockEnv = returnResult.env;
        env.mergeChild(blockEnv);
        if (shouldBubbleReturn) {
          return { value: createExeReturnControl(returnResult.value), env };
        }
        return { value: returnResult.value, env };
      }

      if (stmt.type === 'WhenExpression') {
        const { evaluateWhenExpression } = await import('@interpreter/eval/when-expression');
        const whenResult = await evaluateWhenExpression(stmt as any, blockEnv);
        blockEnv = whenResult.env || blockEnv;
        if (whenResult.value !== null && whenResult.value !== undefined) {
          if (typeof whenResult.value === 'object' && (whenResult.value as any).__whenEffect) {
            continue;
          }
          const value = isExeReturnControl(whenResult.value) ? whenResult.value.value : whenResult.value;
          env.mergeChild(blockEnv);
          if (shouldBubbleReturn) {
            return { value: createExeReturnControl(value), env };
          }
          return { value, env };
        }
        continue;
      }

      const result = await evaluate(stmt, blockEnv);
      blockEnv = result.env || blockEnv;
      if (isExeReturnControl(result.value)) {
        env.mergeChild(blockEnv);
        if (shouldBubbleReturn) {
          return { value: result.value, env };
        }
        return { value: result.value.value, env };
      }

      const hasLoopContext = Boolean(
        blockEnv.getExecutionContext('loop') ||
        blockEnv.getExecutionContext('while') ||
        blockEnv.getExecutionContext('for')
      );
      if (hasLoopContext && isLoopControlValue(result.value)) {
        env.mergeChild(blockEnv);
        return { value: result.value, env };
      }
    }

    let returnValue: unknown = undefined;
    const returnNode = block.values?.return;
    if (returnNode) {
      const returnResult = await resolveExeReturnValue(returnNode, blockEnv);
      returnValue = returnResult.value;
      blockEnv = returnResult.env;
      if (shouldBubbleReturn) {
        env.mergeChild(blockEnv);
        return { value: createExeReturnControl(returnValue), env };
      }
    }

    env.mergeChild(blockEnv);
    return { value: returnValue, env };
  } finally {
    blockEnv.popExecutionContext('exe');
  }
}
