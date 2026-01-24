import type { BaseMlldNode } from '@core/types';
import type { EnvDirectiveNode } from '@core/types/env';
import type { Environment } from '../env/Environment';
import type { EvalResult, EvaluationContext } from '../core/interpreter';
import type { EnvironmentConfig } from '@core/types/environment';
import { evaluate } from '../core/interpreter';
import { MlldDirectiveError } from '@core/errors';
import { isVariable, extractVariableValue } from '../utils/variable-resolution';
import { asData, isStructuredValue } from '../utils/structured-value';
import { evaluateExeBlock } from './exe';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

async function resolveExpressionValue(
  nodes: BaseMlldNode[],
  env: Environment,
  context?: EvaluationContext
): Promise<unknown> {
  const exprContext = context ? { ...context, isExpression: true } : { isExpression: true };
  const result = await evaluate(nodes, env, exprContext);
  let value = result.value;
  if (isVariable(value)) {
    value = await extractVariableValue(value, env);
  }
  if (isStructuredValue(value)) {
    value = asData(value);
  }
  return value;
}

async function resolveEnvConfig(
  nodes: BaseMlldNode[] | undefined,
  env: Environment,
  context?: EvaluationContext,
  location?: any
): Promise<EnvironmentConfig> {
  if (!nodes || nodes.length === 0) {
    throw new MlldDirectiveError('env config is required.', 'env', {
      location,
      env
    });
  }
  const value = await resolveExpressionValue(nodes, env, context);
  if (!isPlainObject(value)) {
    throw new MlldDirectiveError('env config must be an object.', 'env', {
      location,
      env,
      context: { value }
    });
  }
  return value as EnvironmentConfig;
}

async function resolveToolsValue(
  value: unknown,
  env: Environment,
  context?: EvaluationContext
): Promise<unknown> {
  if (!value || typeof value !== 'object' || !('type' in (value as any))) {
    return value;
  }
  return resolveExpressionValue([value as BaseMlldNode], env, context);
}

function normalizeToolScope(
  value: unknown,
  env: Environment,
  location?: any
): { tools?: string[]; hasTools: boolean } {
  if (value === undefined) {
    return { hasTools: false };
  }
  if (value === null) {
    throw new MlldDirectiveError('tools must be an array or object.', 'env', {
      location,
      env
    });
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '*') {
      return { hasTools: false };
    }
    const parts = trimmed.length > 0
      ? trimmed.split(',').map(part => part.trim()).filter(Boolean)
      : [];
    return { tools: parts, hasTools: true };
  }
  if (Array.isArray(value)) {
    const tools: string[] = [];
    for (const entry of value) {
      if (typeof entry !== 'string') {
        throw new MlldDirectiveError('tools entries must be strings.', 'env', {
          location,
          env,
          context: { entry }
        });
      }
      const trimmed = entry.trim();
      if (trimmed.length > 0) {
        tools.push(trimmed);
      }
    }
    return { tools, hasTools: true };
  }
  if (isPlainObject(value)) {
    return { tools: Object.keys(value), hasTools: true };
  }
  throw new MlldDirectiveError('tools must be an array or object.', 'env', {
    location,
    env,
    context: { value }
  });
}

export async function evaluateEnv(
  directive: EnvDirectiveNode,
  env: Environment,
  context?: EvaluationContext
): Promise<EvalResult> {
  const config = await resolveEnvConfig(directive.values?.config, env, context, directive.location);
  const withClauseTools = directive.values?.withClause?.tools;
  const resolvedTools =
    withClauseTools !== undefined
      ? await resolveToolsValue(withClauseTools, env, context)
      : config.tools;

  const mergedConfig =
    withClauseTools !== undefined
      ? { ...config, tools: resolvedTools }
      : config;

  const scopedEnv = env.createChild();
  scopedEnv.setScopedEnvironmentConfig(mergedConfig);

  const toolScope = normalizeToolScope(resolvedTools, env, directive.location);
  if (toolScope.hasTools) {
    scopedEnv.setAllowedTools(toolScope.tools);
  }

  const block = directive.values?.block;
  if (!block) {
    return { value: undefined, env };
  }

  const result = await evaluateExeBlock(block, scopedEnv);
  env.mergeChild(scopedEnv);
  return { value: result.value, env };
}
