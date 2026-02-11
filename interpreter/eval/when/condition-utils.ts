import type { BaseMlldNode } from '@core/types';
import type { Environment } from '@interpreter/env/Environment';
import type { Variable } from '@core/types/variable';
import {
  isTextLike,
  isArray as isArrayVariable,
  isObject as isObjectVariable,
  isCommandResult,
  isPipelineInput
} from '@core/types/variable';
import { isStructuredValue, asData, asText, assertStructuredValue } from '@interpreter/utils/structured-value';

const DENIED_KEYWORD = 'denied';

export async function compareValues(
  expressionValue: unknown,
  conditionValue: unknown,
  env: Environment
): Promise<boolean> {
  const { resolveValue, ResolutionContext } = await import('@interpreter/utils/variable-resolution');
  const resolvedExpression = await resolveValue(expressionValue, env, ResolutionContext.Equality);
  const resolvedCondition = await resolveValue(conditionValue, env, ResolutionContext.Equality);

  if ((resolvedExpression === null || resolvedExpression === undefined) &&
      (resolvedCondition === null || resolvedCondition === undefined)) {
    return true;
  }

  if (typeof resolvedExpression === 'string' && typeof resolvedCondition === 'string') {
    return resolvedExpression === resolvedCondition;
  }

  if (typeof resolvedExpression === 'boolean' && typeof resolvedCondition === 'boolean') {
    return resolvedExpression === resolvedCondition;
  }

  if (typeof resolvedExpression === 'number' && typeof resolvedCondition === 'number') {
    return resolvedExpression === resolvedCondition;
  }

  if (typeof resolvedExpression === 'string' && typeof resolvedCondition === 'boolean') {
    return (resolvedExpression === 'true' && resolvedCondition === true) ||
      (resolvedExpression === 'false' && resolvedCondition === false);
  }

  if (typeof resolvedExpression === 'boolean' && typeof resolvedCondition === 'string') {
    return (resolvedExpression === true && resolvedCondition === 'true') ||
      (resolvedExpression === false && resolvedCondition === 'false');
  }

  if (typeof resolvedCondition === 'boolean') {
    return isTruthy(resolvedExpression) === resolvedCondition;
  }

  return resolvedExpression === resolvedCondition;
}

export function isDeniedLiteralNode(node: BaseMlldNode | undefined): boolean {
  if (!node) {
    return false;
  }

  if (node.type === 'Literal' && typeof (node as any).value === 'string') {
    return (node as any).value.toLowerCase() === DENIED_KEYWORD;
  }

  if (node.type === 'Text' && typeof (node as any).content === 'string') {
    return (node as any).content.trim().toLowerCase() === DENIED_KEYWORD;
  }

  if (
    node.type === 'VariableReference' &&
    typeof (node as any).identifier === 'string' &&
    (node as any).identifier.toLowerCase() === DENIED_KEYWORD
  ) {
    return true;
  }

  return false;
}

export function conditionTargetsDenied(condition: BaseMlldNode[]): boolean {
  const visited = new Set<BaseMlldNode>();
  const stack = [...condition];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') {
      continue;
    }

    if (visited.has(node)) {
      continue;
    }
    visited.add(node);

    if (isDeniedLiteralNode(node)) {
      return true;
    }

    if ((node as any).type === 'VariableReference') {
      const identifier = typeof (node as any).identifier === 'string'
        ? (node as any).identifier.toLowerCase()
        : '';

      if (identifier === DENIED_KEYWORD) {
        return true;
      }

      if (
        identifier === 'mx' &&
        Array.isArray((node as any).fields) &&
        (node as any).fields.some(isDeniedField)
      ) {
        return true;
      }
    }

    for (const value of Object.values(node as any)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === 'object' && 'type' in item) {
            stack.push(item as BaseMlldNode);
          }
        }
      } else if (value && typeof value === 'object' && 'type' in value) {
        stack.push(value as BaseMlldNode);
      }
    }
  }

  return false;
}

export function isTruthy(value: unknown): boolean {
  if (value && typeof value === 'object' && 'type' in value && 'name' in value) {
    const variable = value as Variable;

    if (isTextLike(variable)) {
      const str = variable.value;
      if (str === '' || str.toLowerCase() === 'false' || str === '0') {
        return false;
      }
      return true;
    }

    if (isArrayVariable(variable)) {
      return variable.value.length > 0;
    }

    if (isObjectVariable(variable)) {
      return Object.keys(variable.value).length > 0;
    }

    if (isCommandResult(variable)) {
      return variable.value.trim().length > 0;
    }

    if (isPipelineInput(variable)) {
      assertStructuredValue(variable.value, 'when:isTruthy:pipeline-input');
      return asText(variable.value).length > 0;
    }

    return isTruthy(variable.value);
  }

  if (isStructuredValue(value)) {
    try {
      const structuredData = asData(value);
      return isTruthy(structuredData);
    } catch {
      return isTruthy(asText(value));
    }
  }

  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    if (value === '') {
      return false;
    }

    if (value.toLowerCase() === 'false') {
      return false;
    }

    if (value === '0') {
      return false;
    }

    return true;
  }

  if (typeof value === 'number') {
    return value !== 0 && !isNaN(value);
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === 'object') {
    return Object.keys(value).length > 0;
  }

  return true;
}

function isDeniedField(field: any): boolean {
  if (!field) {
    return false;
  }

  if (typeof field.name === 'string' && field.name.toLowerCase() === DENIED_KEYWORD) {
    return true;
  }

  if (typeof field.identifier === 'string' && field.identifier.toLowerCase() === DENIED_KEYWORD) {
    return true;
  }

  return false;
}
