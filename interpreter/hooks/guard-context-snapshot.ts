import type { GuardContextSnapshot } from '../env/ContextManager';
import type { Variable } from '@core/types/variable';
import { isVariable } from '../utils/variable-resolution';
import {
  cloneVariableForGuard,
  hasSecretLabel,
  hasSecretLabelInArray,
  redactVariableForErrorOutput
} from './guard-materialization';

export function redactOrCloneGuardContextInput(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => {
      if (isVariable(item) && hasSecretLabel(item)) {
        return redactVariableForErrorOutput(item);
      }
      return isVariable(item) ? cloneVariableForGuard(item) : item;
    });
  }
  if (isVariable(value as Variable)) {
    if (hasSecretLabel(value as Variable)) {
      return redactVariableForErrorOutput(value as Variable);
    }
    return cloneVariableForGuard(value as Variable);
  }
  return value;
}

export function cloneGuardContextSnapshot(context: GuardContextSnapshot): GuardContextSnapshot {
  const cloned: GuardContextSnapshot = {
    ...context,
    tries: context.tries ? context.tries.map(entry => ({ ...entry })) : undefined,
    labels: context.labels ? [...context.labels] : undefined,
    sources: context.sources ? [...context.sources] : undefined,
    hintHistory: context.hintHistory ? [...context.hintHistory] : undefined
  };
  if (context.input !== undefined) {
    cloned.input = redactOrCloneGuardContextInput(context.input);
  }
  if (context.output !== undefined) {
    cloned.output = redactOrCloneGuardContextInput(context.output as any);
  }
  if (cloned.inputPreview !== undefined && typeof cloned.inputPreview === 'string') {
    const labels = Array.isArray(context.labels) ? context.labels : [];
    if (hasSecretLabelInArray(labels)) {
      cloned.inputPreview = '[REDACTED]';
    }
  }
  if (cloned.outputPreview !== undefined && typeof cloned.outputPreview === 'string') {
    const labels = Array.isArray(context.labels) ? context.labels : [];
    if (hasSecretLabelInArray(labels)) {
      cloned.outputPreview = '[REDACTED]';
    }
  }
  return cloned;
}
