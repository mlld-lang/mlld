import type {
  PolicyDirectiveNode,
  PolicyExpression,
  PolicyReferenceNode,
  PolicyUnionExpression
} from '@core/types/policy';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { mergePolicyConfigs, normalizePolicyConfig, type PolicyConfig } from '@core/policy/union';
import { generatePolicyGuards } from '@core/policy/guards';
import { MlldInterpreterError } from '@core/errors';
import { extractVariableValue } from '../utils/variable-resolution';
import { getTextContent } from '../utils/type-guard-helpers';
import { createObjectVariable, type VariableSource } from '@core/types/variable';
import { astLocationToSourceLocation } from '@core/types';

export async function evaluatePolicy(
  directive: PolicyDirectiveNode,
  env: Environment
): Promise<EvalResult> {
  const expr = directive.values.expr;
  const merged =
    expr && expr.type === 'union'
      ? mergePolicyConfigsFromArray(await evaluateUnionExpression(expr, env))
      : normalizePolicyConfig(await evaluatePolicyObject(expr, env));

  const nameNode = directive.values.name?.[0];
  const policyName = getTextContent(nameNode) || directive.raw?.name;
  if (!policyName) {
    throw new MlldInterpreterError('Policy directive is missing a name', {
      code: 'INVALID_POLICY_NAME'
    });
  }

  const source: VariableSource = {
    directive: 'policy',
    syntax: 'object',
    hasInterpolation: false,
    isMultiLine: false
  };

  const variable = createObjectVariable(
    policyName,
    merged,
    false,
    source,
    {
      definedAt: astLocationToSourceLocation(directive.location, env.getCurrentFilePath())
    }
  );

  env.setVariable(policyName, variable);
  env.recordPolicyConfig(policyName, merged);

  const policyGuards = generatePolicyGuards(merged);
  const registry = env.getGuardRegistry();
  for (const guard of policyGuards) {
    registry.registerPolicyGuard(guard);
  }

  return {
    value: merged,
    env,
    stdout: '',
    stderr: '',
    exitCode: 0
  };
}

async function evaluatePolicyObject(
  expr: PolicyExpression,
  env: Environment
): Promise<PolicyConfig> {
  if (!expr || typeof expr !== 'object' || (expr as any).type !== 'object') {
    throw new MlldInterpreterError('Policy expression expects an object literal', {
      code: 'INVALID_POLICY_EXPRESSION'
    });
  }

  const { evaluateDataValue } = await import('@interpreter/eval/data-value-evaluator');
  const rawValue = await evaluateDataValue(expr as any, env);
  const candidate = resolvePolicyConfigSource(rawValue);
  if (!candidate) {
    throw new MlldInterpreterError('Policy expression is not a policy configuration', {
      code: 'INVALID_POLICY_EXPRESSION'
    });
  }

  return candidate;
}

async function evaluateUnionExpression(
  expr: PolicyUnionExpression,
  env: Environment
): Promise<PolicyConfig[]> {
  if (!expr || expr.type !== 'union') {
    throw new MlldInterpreterError('Only union expressions are supported in /policy', {
      code: 'INVALID_POLICY_EXPRESSION'
    });
  }

  if (!expr.args || expr.args.length === 0) {
    throw new MlldInterpreterError('Policy union requires at least one reference', {
      code: 'INVALID_POLICY_EXPRESSION'
    });
  }

  const configs: PolicyConfig[] = [];
  for (const arg of expr.args) {
    configs.push(await resolvePolicyReference(arg, env));
  }
  return configs;
}

async function resolvePolicyReference(
  arg: PolicyReferenceNode,
  env: Environment
): Promise<PolicyConfig> {
  if (!arg || arg.type !== 'ref') {
    throw new MlldInterpreterError('Unsupported policy expression argument', {
      code: 'INVALID_POLICY_REFERENCE'
    });
  }

  const refName = arg.name;
  const variable = env.getVariable(refName);
  if (!variable) {
    throw new MlldInterpreterError(`Policy reference '@${refName}' is not defined`, {
      code: 'POLICY_REFERENCE_NOT_FOUND'
    });
  }

  const rawValue = await extractVariableValue(variable, env);
  const candidate = resolvePolicyConfigSource(rawValue);
  if (!candidate) {
    throw new MlldInterpreterError(`Policy reference '@${refName}' is not a policy configuration`, {
      code: 'INVALID_POLICY_REFERENCE'
    });
  }

  return normalizePolicyConfig(candidate);
}

function resolvePolicyConfigSource(value: any): PolicyConfig | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  if (value.config && typeof value.config === 'object') {
    return value.config as PolicyConfig;
  }

  return value as PolicyConfig;
}

function mergePolicyConfigsFromArray(configs: PolicyConfig[]): PolicyConfig {
  return configs.reduce<PolicyConfig | undefined>(
    (acc, current) => mergePolicyConfigs(acc, current),
    undefined
  ) ?? {};
}
