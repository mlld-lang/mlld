import type { NewExpression } from '@core/types';
import type { Environment } from '../env/Environment';
import type { ExecutableDefinition, PartialExecutable } from '@core/types/executable';
import { MlldInterpreterError } from '@core/errors';
import { astLocationToSourceLocation } from '@core/types';
import { isExecutableVariable } from '@core/types/variable';
import { wrapNodeValue, toJsValue } from '../utils/node-interop';

function createExecutableExport(execDef: ExecutableDefinition): Record<string, unknown> {
  return {
    __executable: true,
    value: execDef,
    executableDef: execDef,
    paramNames: execDef.paramNames
  };
}

function buildPartialExecutable(
  base: ExecutableDefinition,
  boundArgs: unknown[]
): PartialExecutable {
  const baseParams = Array.isArray(base.paramNames) ? base.paramNames : [];
  const remainingParams = baseParams.length > 0 ? baseParams.slice(boundArgs.length) : [];
  return {
    type: 'partial',
    base,
    boundArgs,
    paramNames: remainingParams,
    sourceDirective: base.sourceDirective
  };
}

function extractExecutableDefinition(value: unknown): ExecutableDefinition | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  if ((value as { __executable?: boolean }).__executable) {
    const execDef = (value as { executableDef?: ExecutableDefinition; value?: ExecutableDefinition }).executableDef
      ?? (value as { value?: ExecutableDefinition }).value;
    return execDef;
  }
  if (isExecutableVariable(value as any)) {
    return (value as any).internal?.executableDef;
  }
  return undefined;
}

async function resolveTargetValue(
  target: NewExpression['target'],
  env: Environment
): Promise<unknown> {
  const variable = env.getVariable(target.identifier) ?? await env.getResolverVariable(target.identifier);
  if (!variable) {
    throw new MlldInterpreterError(
      `Variable not found: ${target.identifier}`,
      'NewExpression',
      astLocationToSourceLocation(target.location, env.getCurrentFilePath())
    );
  }

  const { resolveVariable, ResolutionContext } = await import('../utils/variable-resolution');
  let resolved = await resolveVariable(variable, env, ResolutionContext.FieldAccess);

  if (target.fields && target.fields.length > 0) {
    const { accessFields } = await import('../utils/field-access');
    const fieldResult = await accessFields(resolved, target.fields, {
      env,
      preserveContext: false,
      returnUndefinedForMissing: true,
      sourceLocation: target.location
    });
    resolved = fieldResult;
  }

  return resolved;
}

export async function evaluateNewExpression(
  expr: NewExpression,
  env: Environment
): Promise<unknown> {
  const { evaluateDataValue } = await import('./data-value-evaluator');
  const boundArgs: unknown[] = [];
  for (const arg of expr.args || []) {
    boundArgs.push(await evaluateDataValue(arg as any, env));
  }

  const targetValue = await resolveTargetValue(expr.target, env);
  const execDef = extractExecutableDefinition(targetValue);
  if (execDef) {
    if (execDef.type === 'nodeClass') {
      const jsArgs = boundArgs.map(arg => toJsValue(arg));
      const instance = new execDef.constructorFn(...jsArgs);
      return wrapNodeValue(instance, { moduleName: execDef.moduleName });
    }
    const partial = buildPartialExecutable(execDef, boundArgs);
    return createExecutableExport(partial);
  }

  if (typeof targetValue === 'function') {
    const jsArgs = boundArgs.map(arg => toJsValue(arg));
    const instance = new (targetValue as new (...args: unknown[]) => unknown)(...jsArgs);
    return wrapNodeValue(instance);
  }

  throw new MlldInterpreterError(
    'new expression target is not executable or constructable',
    'NewExpression',
    astLocationToSourceLocation(expr.location, env.getCurrentFilePath())
  );
}
