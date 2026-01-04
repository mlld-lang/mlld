import type { Environment } from '@interpreter/env/Environment';
import type { AdapterConfig, StreamAdapter } from './adapters/base';
import { createNDJSONAdapter } from './adapters/ndjson';
import { getAdapter } from './adapter-registry';

function isStreamAdapter(value: unknown): value is StreamAdapter {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as StreamAdapter).processChunk === 'function' &&
    typeof (value as StreamAdapter).flush === 'function'
  );
}

function isAdapterConfig(value: unknown): value is AdapterConfig {
  return Boolean(
    value &&
    typeof value === 'object' &&
    Array.isArray((value as AdapterConfig).schemas)
  );
}

/**
 * Resolve a streamFormat value from a withClause.
 * Accepts literal objects, VariableReferences, or expressions.
 */
export async function resolveStreamFormatValue(
  source: unknown,
  env: Environment
): Promise<unknown> {
  if (source === undefined || source === null) {
    return source;
  }

  let value: unknown = source;

  // Evaluate expression nodes (VariableReference, expressions, etc.)
  if (
    typeof value === 'object' &&
    value !== null &&
    ((value as any).type || Array.isArray(value))
  ) {
    const { evaluate } = await import('@interpreter/core/interpreter');
    const result = await evaluate(value as any, env, { isExpression: true });
    value = result.value;
  }

  // Unwrap Variables to raw values
  const { isVariable, resolveValue, ResolutionContext } = await import('@interpreter/utils/variable-resolution');
  if (isVariable(value)) {
    value = await resolveValue(value, env, ResolutionContext.Display);
  }

  return value;
}

/**
 * Create a StreamAdapter from a string name or config object.
 * Returns undefined when the value cannot be converted.
 */
export async function loadStreamAdapter(
  value: unknown
): Promise<StreamAdapter | undefined> {
  if (!value) {
    return undefined;
  }

  if (typeof value === 'string') {
    return getAdapter(value);
  }

  if (isStreamAdapter(value)) {
    return value;
  }

  if (isAdapterConfig(value)) {
    const config: AdapterConfig = {
      name: typeof value.name === 'string' ? value.name : 'custom-stream-adapter',
      format: 'ndjson',
      schemas: value.schemas,
      defaultSchema: value.defaultSchema
    };
    return createNDJSONAdapter(config);
  }

  return undefined;
}
