import type { Environment } from '@interpreter/env/Environment';
import type { NodeFunctionExecutable } from '@core/types/executable';
import {
  createExecutableVariable,
  createObjectVariable,
  type VariableSource
} from '@core/types/variable';
import { evaluateFyiKnown } from '@interpreter/fyi/facts-runtime';

const FYI_SOURCE: VariableSource = {
  directive: 'var',
  syntax: 'object',
  hasInterpolation: false,
  isMultiLine: false
};

function looksLikeEnvironment(value: unknown): value is Environment {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as Environment).getScopedEnvironmentConfig === 'function' &&
      typeof (value as Environment).issueHandle === 'function' &&
      typeof (value as Environment).resolveHandle === 'function'
  );
}

export function createFyiVariable(env: Environment) {
  const knownDefinition: NodeFunctionExecutable = {
    type: 'nodeFunction',
    name: 'known',
    fn: async (queryOrEnv?: unknown, argOrEnv?: unknown, boundEnv?: Environment) => {
      const executionEnv = boundEnv
        ?? (looksLikeEnvironment(argOrEnv) ? argOrEnv : undefined)
        ?? (looksLikeEnvironment(queryOrEnv) ? queryOrEnv : undefined)
        ?? env;
      const query = boundEnv || !looksLikeEnvironment(queryOrEnv) ? queryOrEnv : undefined;
      const arg = boundEnv || !looksLikeEnvironment(argOrEnv) ? argOrEnv : undefined;
      return evaluateFyiKnown(query, executionEnv, arg);
    },
    bindExecutionEnv: true,
    sourceDirective: 'exec',
    paramNames: ['query'],
    optionalParams: ['query'],
    description: 'List handle-backed known and fact-bearing candidates from the root handle registry'
  };

  const knownExecutable = createExecutableVariable('known', 'command', '', ['query'], undefined, FYI_SOURCE, {
    internal: {
      executableDef: knownDefinition,
      isReserved: true,
      isSystem: true
    }
  });

  return createObjectVariable(
    'fyi',
    {
      known: knownExecutable
    },
    false,
    FYI_SOURCE,
    {
      internal: {
        isReserved: true,
        isSystem: true
      }
    }
  );
}
