import type { DirectiveNode } from '@core/types';
import type { Environment } from '@interpreter/env/Environment';
import { evaluateForeachAsText, parseForeachOptions } from '@interpreter/utils/foreach';
import { convertEntriesToProperties } from '@interpreter/utils/object-compat';

export interface ShowForeachResult {
  content: string;
}

export function extractForeachWithClause(foreachExpression: any): Record<string, any> | undefined {
  if (foreachExpression?.with && typeof foreachExpression.with === 'object') {
    return foreachExpression.with;
  }

  const withClause = foreachExpression?.execInvocation?.withClause;
  if (!withClause || !Array.isArray(withClause) || withClause.length === 0) {
    return undefined;
  }

  const inlineValue = withClause[0];
  if (inlineValue?.type !== 'inlineValue' || inlineValue?.value?.type !== 'object') {
    return undefined;
  }

  return convertEntriesToProperties(inlineValue.value.entries);
}

function getForeachMissingMessage(subtype: string): string {
  if (subtype === 'showForeach') {
    return 'Show foreach directive missing foreach expression';
  }
  return 'Add foreach directive missing foreach expression';
}

export async function evaluateShowForeach(
  directive: DirectiveNode,
  env: Environment
): Promise<ShowForeachResult> {
  const foreachExpression = directive.values?.foreach;
  if (!foreachExpression) {
    throw new Error(getForeachMissingMessage(directive.subtype || 'addForeach'));
  }

  const options = parseForeachOptions(extractForeachWithClause(foreachExpression));
  if (!options.separator) {
    options.separator = '\n';
  }

  const content = await evaluateForeachAsText(foreachExpression, env, options);
  return { content };
}

export async function evaluateShowForeachSection(
  directive: DirectiveNode,
  env: Environment
): Promise<ShowForeachResult> {
  const foreachExpression = directive.values?.foreach;
  if (!foreachExpression) {
    throw new Error('Add foreach section directive missing foreach expression');
  }

  const { ForeachSectionEvaluator } = await import('@interpreter/eval/data-values/ForeachSectionEvaluator');
  const { evaluateDataValue } = await import('@interpreter/eval/data-value-evaluator');
  const foreachSectionEvaluator = new ForeachSectionEvaluator(evaluateDataValue);
  const result = await foreachSectionEvaluator.evaluate(foreachExpression, env);

  if (Array.isArray(result)) {
    return { content: result.join('\n\n') };
  }
  return { content: String(result) };
}
