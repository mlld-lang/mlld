import type { Environment } from '@interpreter/env/Environment';

/**
 * Resolve stream flags from literals or expression nodes.
 * Only strict boolean true enables streaming.
 */
export async function resolveStreamFlag(source: unknown, env: Environment): Promise<boolean> {
  if (source === true) {
    return true;
  }
  if (source === false || source === undefined || source === null) {
    return false;
  }

  let value: unknown = source;

  if (
    typeof value === 'object' &&
    value !== null &&
    ((value as any).type || Array.isArray(value))
  ) {
    const { evaluate } = await import('@interpreter/core/interpreter');
    const result = await evaluate(value as any, env, { isExpression: true });
    value = result.value;
  }

  const { isVariable, resolveValue, ResolutionContext } = await import('@interpreter/utils/variable-resolution');
  if (isVariable(value)) {
    value = await resolveValue(value, env, ResolutionContext.Display);
  }

  return value === true;
}

export async function resolveAnyStreamFlag(
  sources: readonly unknown[],
  env: Environment
): Promise<boolean> {
  for (const source of sources) {
    if (await resolveStreamFlag(source, env)) {
      return true;
    }
  }
  return false;
}
