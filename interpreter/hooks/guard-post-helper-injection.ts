import type { DataLabel } from '@core/types/security';
import type { ExecutableVariable } from '@core/types/executable';
import type { GuardInputHelper } from '@core/types/variable/ArrayHelpers';
import type { Variable, VariableSource } from '@core/types/variable';
import { createExecutableVariable } from '@core/types/variable/VariableFactories';
import type { OperationContext } from '../env/ContextManager';
import type { Environment } from '../env/Environment';
import { isVariable } from '../utils/variable-resolution';
import { buildOperationKeys } from './guard-operation-keys';
import { resolvePostGuardValue } from './guard-post-materialization';

export type PostGuardHelperImplementation =
  (args: readonly unknown[]) => unknown | Promise<unknown>;

const GUARD_HELPER_SOURCE: VariableSource = {
  directive: 'var',
  syntax: 'code',
  hasInterpolation: false,
  isMultiLine: false
};

export function attachPostGuardInputHelper(target: Variable, helper: GuardInputHelper): void {
  const apply = (key: string, value: unknown) => {
    Object.defineProperty(target as any, key, {
      value,
      enumerable: false,
      configurable: true,
      writable: false
    });
  };

  apply('any', helper.any);
  apply('all', helper.all);
  apply('none', helper.none);
  apply('totalTokens', helper.totalTokens);
  apply('maxTokens', helper.maxTokens);
}

export function injectPostGuardHelpers(
  guardEnv: Environment,
  options: {
    operation: OperationContext;
    labels: readonly DataLabel[];
    operationLabels: readonly string[];
  }
): void {
  const opKeys = new Set(buildOperationKeys(options.operation).map(key => key.toLowerCase()));
  const opLabels = new Set(options.operationLabels.map(label => label.toLowerCase()));
  const inputLabels = new Set(options.labels.map(label => label.toLowerCase()));

  const helperVariables: ExecutableVariable[] = [
    createPostGuardHelperExecutable('opIs', ([target]) => {
      if (typeof target !== 'string') return false;
      return opKeys.has(target.toLowerCase());
    }),
    createPostGuardHelperExecutable('opHas', ([label]) => {
      if (typeof label !== 'string') return false;
      return opLabels.has(label.toLowerCase());
    }),
    createPostGuardHelperExecutable('opHasAny', ([value]) => {
      const labels = Array.isArray(value) ? value : [value];
      return labels.some(item => typeof item === 'string' && opLabels.has(item.toLowerCase()));
    }),
    createPostGuardHelperExecutable('opHasAll', ([value]) => {
      const labels = Array.isArray(value) ? value : [value];
      if (labels.length === 0) {
        return false;
      }
      return labels.every(item => typeof item === 'string' && opLabels.has(item.toLowerCase()));
    }),
    createPostGuardHelperExecutable('inputHas', ([label]) => {
      if (typeof label !== 'string') return false;
      return inputLabels.has(label.toLowerCase());
    })
  ];

  for (const variable of helperVariables) {
    guardEnv.setVariable(variable.name, variable);
  }
}

export function createPostGuardHelperExecutable(
  name: string,
  implementation: PostGuardHelperImplementation
): ExecutableVariable {
  const execVar = createExecutableVariable(
    name,
    'code',
    '',
    [],
    'javascript',
    GUARD_HELPER_SOURCE,
    {
      mx: {},
      internal: { isSystem: true }
    }
  );
  execVar.internal = {
    ...(execVar.internal ?? {}),
    executableDef: execVar.value,
    isGuardHelper: true,
    guardHelperImplementation: implementation
  };
  return execVar;
}

export function ensurePostPrefixHelper(sourceEnv: Environment, targetEnv: Environment): void {
  const execVar = createPostGuardHelperExecutable('prefixWith', ([label, value]) => {
    const normalize = (candidate: unknown, fallback: Variable | undefined) => {
      if (isVariable(candidate as Variable)) {
        return resolvePostGuardValue(
          candidate as Variable,
          (candidate as Variable) ?? fallback ?? (label as Variable)
        );
      }
      if (Array.isArray(candidate)) {
        const [head] = candidate;
        if (head !== undefined) {
          return normalize(head, head as Variable);
        }
        return '';
      }
      if (candidate && typeof candidate === 'object') {
        const asObj = candidate as any;
        if (typeof asObj.text === 'string') {
          return asObj.text;
        }
        if (typeof asObj.data === 'string') {
          return asObj.data;
        }
      }
      return candidate;
    };

    if (process.env.MLLD_DEBUG_GUARDS === '1') {
      try {
        console.error('[guard-prefixWith]', {
          labelType: typeof label,
          valueType: typeof value,
          labelKeys: label && typeof label === 'object' ? Object.keys(label as any) : null,
          valueKeys: value && typeof value === 'object' ? Object.keys(value as any) : null
        });
      } catch {
        // ignore debug logging errors
      }
    }

    const normalized = normalize(value, value as Variable);
    const normalizedLabel = normalize(label, label as Variable);
    return `${normalizedLabel}:${normalized}`;
  });
  targetEnv.setVariable(execVar.name, execVar);
}

export function ensurePostTagHelper(sourceEnv: Environment, targetEnv: Environment): void {
  if (targetEnv.hasVariable('tagValue')) {
    return;
  }
  const existing = sourceEnv.getVariable('tagValue');
  if (existing) {
    targetEnv.setVariable('tagValue', existing);
    return;
  }
  const execVar = createPostGuardHelperExecutable('tagValue', ([timing, value, input]) => {
    const normalize = (candidate: unknown): unknown => {
      if (isVariable(candidate as Variable)) {
        return resolvePostGuardValue(candidate as Variable, candidate as Variable);
      }
      if (Array.isArray(candidate)) {
        const [head] = candidate;
        return head !== undefined ? normalize(head) : '';
      }
      if (candidate && typeof candidate === 'object') {
        const asObj = candidate as any;
        if (typeof asObj.text === 'string') {
          return asObj.text;
        }
        if (typeof asObj.data === 'string') {
          return asObj.data;
        }
      }
      return candidate;
    };
    const base = normalize(value) ?? normalize(input) ?? '';
    return timing === 'before' ? `before:${base}` : `after:${base}`;
  });
  targetEnv.setVariable(execVar.name, execVar);
}
