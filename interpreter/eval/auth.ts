import type { AuthDirectiveNode } from '@core/types/auth';
import type { EvalResult } from '@interpreter/core/interpreter';
import type { Environment } from '@interpreter/env/Environment';
import { MlldInterpreterError } from '@core/errors';
import { normalizeAuthConfig } from '@core/policy/union';
import { getTextContent } from '@interpreter/utils/type-guard-helpers';

export async function evaluateAuth(
  directive: AuthDirectiveNode,
  env: Environment
): Promise<EvalResult> {
  const nameNode = directive.values.name?.[0];
  const authName = getTextContent(nameNode) || directive.raw?.name;
  if (!authName) {
    throw new MlldInterpreterError('Auth directive is missing a name', {
      code: 'INVALID_AUTH_NAME'
    });
  }

  const expr = directive.values?.expr;
  const evaluated = await evaluateAuthExpression(expr, env);
  const config = normalizeAuthConfig(evaluated);
  if (!config) {
    throw new MlldInterpreterError(
      `Auth directive '@${authName}' expects either "ENV_VAR" or { from, as }`,
      { code: 'AUTH_CONFIG_INVALID' }
    );
  }

  env.recordStandaloneAuthConfig(authName, config);
  return {
    value: config,
    env
  };
}

async function evaluateAuthExpression(expr: unknown, env: Environment): Promise<unknown> {
  if (typeof expr === 'string') {
    return expr;
  }

  const { evaluateDataValue } = await import('@interpreter/eval/data-value-evaluator');
  return evaluateDataValue(expr as any, env);
}
