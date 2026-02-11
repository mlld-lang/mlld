import type { ToolCollection } from '@core/types/tools';
import { isExecutableVariable } from '@core/types/variable';
import type { EvaluationContext } from '@interpreter/core/interpreter';
import type { Environment } from '@interpreter/env/Environment';
import { asData, isStructuredValue } from '@interpreter/utils/structured-value';

export type ToolScopeValue = {
  tools: string[];
  hasTools: boolean;
  isWildcard: boolean;
};

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export async function resolveWithClauseToolsValue(
  toolsValue: unknown,
  env: Environment,
  context?: EvaluationContext
): Promise<unknown> {
  if (!toolsValue || typeof toolsValue !== 'object' || !('type' in (toolsValue as any))) {
    return toolsValue;
  }

  const { evaluate } = await import('@interpreter/core/interpreter');
  const result = await evaluate(toolsValue as any, env, { ...(context ?? {}), isExpression: true });
  let value = result.value;

  const { extractVariableValue, isVariable } = await import('@interpreter/utils/variable-resolution');
  if (isVariable(value)) {
    value = await extractVariableValue(value, env);
  }
  if (isStructuredValue(value)) {
    value = asData(value);
  }

  return value;
}

export function normalizeToolScopeValue(value: unknown): ToolScopeValue {
  if (value === undefined) {
    return { tools: [], hasTools: false, isWildcard: false };
  }
  if (value === null) {
    throw new Error('tools must be an array or object.');
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return { tools: [], hasTools: true, isWildcard: false };
    }
    if (trimmed === '*') {
      return { tools: [], hasTools: false, isWildcard: true };
    }
    const tools = trimmed
      .split(',')
      .map(part => part.trim())
      .filter(Boolean);
    return { tools, hasTools: true, isWildcard: false };
  }
  if (Array.isArray(value)) {
    const tools: string[] = [];
    for (const entry of value) {
      if (typeof entry !== 'string') {
        throw new Error('tools entries must be strings.');
      }
      const trimmed = entry.trim();
      if (trimmed.length > 0) {
        tools.push(trimmed);
      }
    }
    return { tools, hasTools: true, isWildcard: false };
  }
  if (isPlainObject(value)) {
    return { tools: Object.keys(value), hasTools: true, isWildcard: false };
  }
  throw new Error('tools must be an array or object.');
}

export function enforceToolSubset(baseTools: string[], childTools: string[]): void {
  const baseSet = new Set(baseTools);
  const invalid = childTools.filter(tool => !baseSet.has(tool));
  if (invalid.length > 0) {
    throw new Error(`Tool scope cannot add tools outside parent: ${invalid.join(', ')}`);
  }
}

export function normalizeToolCollection(raw: unknown, env: Environment): ToolCollection {
  if (!isPlainObject(raw)) {
    throw new Error('Tool collections must be object literals');
  }

  const collection: ToolCollection = {};

  for (const [toolName, toolValue] of Object.entries(raw)) {
    if (!isPlainObject(toolValue)) {
      throw new Error(`Tool '${toolName}' must be an object`);
    }

    const mlldRef = (toolValue as Record<string, unknown>).mlld;
    if (mlldRef === undefined || mlldRef === null) {
      throw new Error(`Tool '${toolName}' is missing 'mlld' reference`);
    }

    const mlldName = resolveToolMlldName(mlldRef, toolName);
    const execVar = env.getVariable(mlldName);
    if (!execVar || !isExecutableVariable(execVar)) {
      throw new Error(`Tool '${toolName}' references non-executable '@${mlldName}'`);
    }

    const paramNames = Array.isArray(execVar.paramNames) ? execVar.paramNames : [];
    const paramSet = new Set(paramNames);

    const description = toolValue.description;
    if (description !== undefined && typeof description !== 'string') {
      throw new Error(`Tool '${toolName}' description must be a string`);
    }

    const labels = normalizeStringArray(toolValue.labels, toolName, 'labels');
    const expose = normalizeStringArray(toolValue.expose, toolName, 'expose');
    const bind = toolValue.bind;
    const boundKeys =
      bind && isPlainObject(bind)
        ? Object.keys(bind)
        : [];

    if (bind !== undefined) {
      if (!isPlainObject(bind)) {
        throw new Error(`Tool '${toolName}' bind must be an object`);
      }
      const invalidKeys = Object.keys(bind).filter(key => !paramSet.has(key));
      if (invalidKeys.length > 0) {
        throw new Error(
          `Tool '${toolName}' bind keys must match parameters of '@${mlldName}': ${invalidKeys.join(', ')}`
        );
      }
    }

    if (expose) {
      const invalidExpose = expose.filter(name => !paramSet.has(name));
      if (invalidExpose.length > 0) {
        throw new Error(
          `Tool '${toolName}' expose values must match parameters of '@${mlldName}': ${invalidExpose.join(', ')}`
        );
      }
    }

    if (expose) {
      const overlap = boundKeys.filter(key => expose.includes(key));
      if (overlap.length > 0) {
        throw new Error(
          `Tool '${toolName}' expose values cannot include bound parameters: ${overlap.join(', ')}`
        );
      }

      const covered = new Set([...boundKeys, ...expose]);
      let lastCoveredIndex = -1;
      for (let i = 0; i < paramNames.length; i++) {
        if (covered.has(paramNames[i])) {
          lastCoveredIndex = i;
        }
      }
      if (lastCoveredIndex >= 0) {
        const missing: string[] = [];
        for (let i = 0; i <= lastCoveredIndex; i++) {
          const paramName = paramNames[i];
          if (!covered.has(paramName)) {
            missing.push(paramName);
          }
        }
        if (missing.length > 0) {
          throw new Error(
            `Tool '${toolName}' bind and expose must cover required parameters: ${missing.join(', ')}`
          );
        }
      }
    }

    collection[toolName] = {
      mlld: mlldName,
      ...(labels ? { labels } : {}),
      ...(description ? { description } : {}),
      ...(bind ? { bind } : {}),
      ...(expose ? { expose } : {})
    };
  }

  return collection;
}

function resolveToolMlldName(value: unknown, toolName: string): string {
  if (typeof value === 'string') {
    return value.startsWith('@') ? value.slice(1) : value;
  }
  if (value && typeof value === 'object' && isExecutableVariable(value as any)) {
    return (value as any).name;
  }
  if (value && typeof value === 'object' && '__executable' in (value as any)) {
    const name = (value as any).name;
    if (typeof name === 'string' && name.length > 0) {
      return name.startsWith('@') ? name.slice(1) : name;
    }
  }
  throw new Error(`Tool '${toolName}' has invalid 'mlld' reference`);
}

function normalizeStringArray(
  value: unknown,
  toolName: string,
  field: 'labels' | 'expose'
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`Tool '${toolName}' ${field} must be an array of strings`);
  }
  return value;
}
