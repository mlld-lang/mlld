import type { Environment } from '@interpreter/env/Environment';
import type { NodeFunctionExecutable } from '@core/types/executable';
import {
  createExecutableVariable,
  createObjectVariable,
  type VariableSource
} from '@core/types/variable';
import { evaluateFyiFacts } from '@interpreter/fyi/facts-runtime';

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
  const factsDefinition: NodeFunctionExecutable = {
    type: 'nodeFunction',
    name: 'facts',
    fn: async (queryOrEnv?: unknown, argOrEnv?: unknown, boundEnv?: Environment) => {
      const executionEnv = boundEnv
        ?? (looksLikeEnvironment(argOrEnv) ? argOrEnv : undefined)
        ?? (looksLikeEnvironment(queryOrEnv) ? queryOrEnv : undefined)
        ?? env;
      const query = boundEnv || !looksLikeEnvironment(queryOrEnv) ? queryOrEnv : undefined;
      const arg = boundEnv || !looksLikeEnvironment(argOrEnv) ? argOrEnv : undefined;
      return evaluateFyiFacts(query, executionEnv, arg);
    },
    bindExecutionEnv: true,
    sourceDirective: 'exec',
    paramNames: ['query'],
    description: 'List fact-bearing candidates from configured FYI roots'
  };

  const factsExecutable = createExecutableVariable('facts', 'command', '', ['query'], undefined, FYI_SOURCE, {
    internal: {
      executableDef: factsDefinition,
      isReserved: true,
      isSystem: true
    }
  });

  return createObjectVariable(
    'fyi',
    {
      facts: factsExecutable
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
