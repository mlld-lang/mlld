import type { ExeBlockNode, ExeReturnNode } from '@core/types';
import { isAugmentedAssignment, isLetAssignment } from '@core/types/when';
import type { EvalResult } from '@interpreter/core/interpreter';
import { evaluate } from '@interpreter/core/interpreter';
import type { Environment } from '@interpreter/env/Environment';
import {
  appendExeToolReturnValue,
  createExeReturnControl,
  createExeToolReturnState,
  finalizeExeToolReturn,
  getExeReturnKind,
  isExeReturnControl,
  resolveExeReturnValue,
  type ExeExecutionContext
} from '@interpreter/eval/exe-return';
import { VariableImporter } from '@interpreter/eval/import/VariableImporter';
import { evaluateAugmentedAssignment, evaluateLetAssignment } from '@interpreter/eval/when';
import { isLoopControlValue } from './definition-helpers';
import { analyzeReturnChannels } from './return-channel-analysis';

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
    | ExeExecutionContext
    | undefined;
  const hasFunctionBoundary =
    scope === 'function'
      ? true
      : Boolean(parentExeContext?.hasFunctionBoundary || parentExeContext?.scope === 'function');
  const shouldBubbleReturn = scope === 'block' && hasFunctionBoundary;
  const localToolReturnState = parentExeContext?.toolReturnState ?? (
    scope === 'function' ? createExeToolReturnState(analyzeReturnChannels(block)) : undefined
  );

  let blockEnv = env.createChild();
  const createBlockResult = (value: unknown, targetEnv: Environment): EvalResult => ({
    value,
    env: targetEnv,
    metadata: {
      blockEnv,
      ...(scope === 'function' && !parentExeContext?.toolReturnState
        ? { toolReturn: finalizeExeToolReturn(localToolReturnState) }
        : {})
    }
  });

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

  blockEnv.pushExecutionContext('exe', {
    allowReturn: true,
    scope,
    hasFunctionBoundary,
    ...(localToolReturnState ? { toolReturnState: localToolReturnState } : {})
  });
  try {
    const statements = block.values?.statements ?? [];
    const hasTrailingReturn = Boolean(block.values?.return);
    for (const [index, stmt] of statements.entries()) {
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
        const returnKind = getExeReturnKind(stmt as ExeReturnNode);
        if (returnKind === 'tool' || returnKind === 'dual') {
          appendExeToolReturnValue(blockEnv, returnResult.value);
        }
        if (returnKind === 'tool') {
          continue;
        }
        env.mergeChild(blockEnv);
        if (shouldBubbleReturn) {
          return createBlockResult(createExeReturnControl(returnResult.value), env);
        }
        return createBlockResult(returnResult.value, env);
      }

      if (stmt.type === 'WhenExpression') {
        const { evaluateWhenExpression } = await import('@interpreter/eval/when-expression');
        const whenResult = await evaluateWhenExpression(stmt as any, blockEnv);
        blockEnv = whenResult.env || blockEnv;

        if (whenResult.value === null || whenResult.value === undefined) {
          continue;
        }

        if (typeof whenResult.value === 'object' && (whenResult.value as any).__whenEffect) {
          continue;
        }

        if (isExeReturnControl(whenResult.value)) {
          env.mergeChild(blockEnv);
          if (shouldBubbleReturn) {
            return createBlockResult(whenResult.value, env);
          }
          return createBlockResult(whenResult.value.value, env);
        }

        const hasLoopContext = Boolean(
          blockEnv.getExecutionContext('loop') ||
          blockEnv.getExecutionContext('while') ||
          blockEnv.getExecutionContext('for')
        );
        if (hasLoopContext && isLoopControlValue(whenResult.value)) {
          env.mergeChild(blockEnv);
          return createBlockResult(whenResult.value, env);
        }

        const preservesMidBlockReturn = stmt.meta?.form === 'inline' || stmt.meta?.form === 'bound-list';
        const isLastStatement = !hasTrailingReturn && index === statements.length - 1;
        if (!preservesMidBlockReturn && !isLastStatement) {
          continue;
        }

        env.mergeChild(blockEnv);
        if (shouldBubbleReturn) {
          return createBlockResult(createExeReturnControl(whenResult.value), env);
        }
        return createBlockResult(whenResult.value, env);
      }

      const result = await evaluate(stmt, blockEnv);
      blockEnv = result.env || blockEnv;
      if (isExeReturnControl(result.value)) {
        env.mergeChild(blockEnv);
        if (shouldBubbleReturn) {
          return createBlockResult(result.value, env);
        }
        return createBlockResult(result.value.value, env);
      }

      const hasLoopContext = Boolean(
        blockEnv.getExecutionContext('loop') ||
        blockEnv.getExecutionContext('while') ||
        blockEnv.getExecutionContext('for')
      );
      if (hasLoopContext && isLoopControlValue(result.value)) {
        env.mergeChild(blockEnv);
        return createBlockResult(result.value, env);
      }
    }

    let returnValue: unknown = undefined;
    const returnNode = block.values?.return;
    if (returnNode) {
      const returnResult = await resolveExeReturnValue(returnNode, blockEnv);
      blockEnv = returnResult.env;
      const returnKind = getExeReturnKind(returnNode);
      if (returnKind === 'tool' || returnKind === 'dual') {
        appendExeToolReturnValue(blockEnv, returnResult.value);
      }
      if (returnKind !== 'tool') {
        returnValue = returnResult.value;
        if (shouldBubbleReturn) {
          env.mergeChild(blockEnv);
          return createBlockResult(createExeReturnControl(returnValue), env);
        }
      }
    }

    env.mergeChild(blockEnv);
    return createBlockResult(returnValue, env);
  } finally {
    blockEnv.popExecutionContext('exe');
  }
}
