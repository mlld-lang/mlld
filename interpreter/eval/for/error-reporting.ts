import type { Environment, SourceLocation } from '@core/types';
import { logger } from '@core/utils/logger';
import type { ForIterationError } from './types';

export function formatForIterationError(error: unknown): string {
  if (error instanceof Error) {
    let message = error.message;
    // Strip directive wrapper noise for user-facing markers.
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

export function publishForErrorsContext(env: Environment, errors: ForIterationError[]): void {
  const contextManager = env.getContextManager?.();
  if (!contextManager) {
    return;
  }
  while (contextManager.popGenericContext('for')) {
    // Clear previous loop context before publishing new iteration errors.
  }
  contextManager.pushGenericContext('for', { errors, timestamp: Date.now() });
  contextManager.setLatestErrors(errors);
}

export function createForIterationError(params: {
  index: number;
  key?: string | number | null;
  error: unknown;
  value?: unknown;
}): ForIterationError {
  const message = formatForIterationError(params.error);
  return {
    index: params.index,
    key: params.key ?? null,
    message,
    error: message,
    value: params.value
  };
}

export function recordParallelExpressionIterationError(params: {
  env: Environment;
  errors: ForIterationError[];
  index: number;
  key?: string | number | null;
  error: unknown;
  value?: unknown;
  sourceLocation?: SourceLocation;
}): ForIterationError {
  const marker = createForIterationError({
    index: params.index,
    key: params.key,
    error: params.error,
    value: params.value
  });
  logger.warn(`for parallel iteration ${params.index} error: ${marker.message}`);
  params.env.emitEffect(
    'stderr',
    `  \u26a0 for iteration ${params.index} error: ${marker.message}\n`,
    { source: params.sourceLocation }
  );
  params.errors.push(marker);
  return marker;
}
