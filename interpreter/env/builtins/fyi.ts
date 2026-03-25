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

export function createFyiVariable(env: Environment) {
  const factsDefinition: NodeFunctionExecutable = {
    type: 'nodeFunction',
    name: 'facts',
    fn: async (query?: unknown) => evaluateFyiFacts(query, env),
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
