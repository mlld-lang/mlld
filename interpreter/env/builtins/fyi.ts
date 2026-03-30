import type { Environment } from '@interpreter/env/Environment';
import type { NodeFunctionExecutable } from '@core/types/executable';
import {
  createExecutableVariable,
  createObjectVariable,
  type VariableSource
} from '@core/types/variable';
import { evaluateFyiKnown } from '@interpreter/fyi/facts-runtime';
import { evaluateFyiTools } from '@interpreter/fyi/tool-docs';

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

  const toolsDefinition: NodeFunctionExecutable = {
    type: 'nodeFunction',
    name: 'tools',
    fn: async (toolsOrEnv?: unknown, optionsOrEnv?: unknown, boundEnv?: Environment) => {
      const executionEnv = boundEnv
        ?? (looksLikeEnvironment(optionsOrEnv) ? optionsOrEnv : undefined)
        ?? (looksLikeEnvironment(toolsOrEnv) ? toolsOrEnv : undefined)
        ?? env;
      const tools = boundEnv || !looksLikeEnvironment(toolsOrEnv) ? toolsOrEnv : undefined;
      const options = boundEnv || !looksLikeEnvironment(optionsOrEnv) ? optionsOrEnv : undefined;
      return evaluateFyiTools(tools, executionEnv, options);
    },
    bindExecutionEnv: true,
    sourceDirective: 'exec',
    paramNames: ['tools', 'options'],
    optionalParams: ['tools', 'options'],
    description: 'Render LLM-oriented tool docs from live tool metadata'
  };

  const toolsExecutable = createExecutableVariable('tools', 'command', '', ['tools', 'options'], undefined, FYI_SOURCE, {
    internal: {
      executableDef: toolsDefinition,
      isReserved: true,
      isSystem: true
    }
  });

  return createObjectVariable(
    'fyi',
    {
      known: knownExecutable,
      tools: toolsExecutable
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
