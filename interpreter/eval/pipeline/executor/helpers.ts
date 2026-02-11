import type { Environment } from '@interpreter/env/Environment';
import type { SecurityDescriptor } from '@core/types/security';
import type { StructuredValue } from '@interpreter/utils/structured-value';
import {
  asData,
  isStructuredValue,
  stringifyStructured,
  wrapStructured
} from '@interpreter/utils/structured-value';
import { isPipelineInput } from '@core/types/variable/TypeGuards';
import { varMxToSecurityDescriptor } from '@core/types/variable/VarMxHelpers';
import { inheritExpressionProvenance } from '@interpreter/utils/expression-provenance';
import type { ParallelStageError } from './types';

export function formatParallelStageError(error: unknown): string {
  if (error instanceof Error) {
    let message = error.message;
    if (message.startsWith('Directive error (')) {
      const prefixEnd = message.indexOf(': ');
      if (prefixEnd >= 0) {
        message = message.slice(prefixEnd + 2);
      }
      const lineIndex = message.indexOf(' at line ');
      if (lineIndex >= 0) {
        message = message.slice(0, lineIndex);
      }
    }
    return message;
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function resetParallelErrorsContext(env: Environment, errors: ParallelStageError[]): void {
  const mxManager = env.getContextManager?.();
  if (!mxManager) {
    return;
  }

  while (mxManager.popGenericContext('parallel')) {
    // clear previous parallel context
  }

  mxManager.pushGenericContext('parallel', { errors, timestamp: Date.now() });
  mxManager.setLatestErrors(errors);
}

export function safeJSONStringify(value: unknown): string {
  try {
    return stringifyStructured(value);
  } catch {
    return String(value ?? '');
  }
}

export function extractStageValue(value: unknown): unknown {
  if (isStructuredValue(value)) {
    return asData(value);
  }

  if (isPipelineInput(value)) {
    return value.data;
  }

  return value;
}

export function snippet(text: string | undefined, max: number = 120): string | undefined {
  if (!text) {
    return text;
  }

  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

export function previewValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (isStructuredValue(value)) {
    return {
      type: value.type,
      textSnippet: snippet(value.text, 60)
    };
  }

  if (Array.isArray(value)) {
    return {
      length: value.length,
      sample: value.slice(0, 3).map(item => (
        isStructuredValue(item)
          ? { type: item.type, text: snippet(item.text, 40) }
          : item
      ))
    };
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    return {
      keys: keys.slice(0, 5),
      size: keys.length
    };
  }

  return value;
}

export function getStructuredSecurityDescriptor(
  value: StructuredValue | undefined
): SecurityDescriptor | undefined {
  if (!value) {
    return undefined;
  }

  if (value.mx) {
    return varMxToSecurityDescriptor(value.mx as any);
  }

  return undefined;
}

export function cloneStructuredValue<T>(value: StructuredValue<T>): StructuredValue<T> {
  const cloned = wrapStructured(value);
  inheritExpressionProvenance(cloned, value);
  return cloned;
}
