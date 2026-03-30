import type { Environment } from '@interpreter/env/Environment';
import type { NodeFunctionExecutable } from '@core/types/executable';
import {
  getToolCollectionAuthorizationContext,
  type ToolCollection
} from '@core/types/tools';
import {
  createExecutableVariable,
  createObjectVariable,
  type VariableSource
} from '@core/types/variable';
import {
  clonePolicyAuthorizationCompileReport,
  compilePolicyAuthorizations,
  createEmptyPolicyAuthorizationCompileReport
} from '@interpreter/policy/authorization-compiler';
import { buildAuthorizationToolContextForCollection } from '@interpreter/eval/exec/tool-metadata';
import { normalizeToolCollection } from '@interpreter/eval/var/tool-scope';
import { isStructuredValue } from '@interpreter/utils/structured-value';
import { extractVariableValue, isVariable } from '@interpreter/utils/variable-resolution';

const POLICY_SOURCE: VariableSource = {
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
      typeof (value as Environment).getPolicySummary === 'function'
  );
}

function createEmptyPolicyResult(message: string) {
  return {
    policy: {
      authorizations: {
        allow: {}
      }
    },
    valid: false,
    issues: [
      {
        reason: 'missing_tool_context',
        message
      }
    ],
    report: createEmptyPolicyAuthorizationCompileReport()
  };
}

function createPolicyBuilderResult(compilation: Awaited<ReturnType<typeof compilePolicyAuthorizations>>) {
  const authorizations = compilation.authorizations ?? {};

  return {
    policy: {
      authorizations: {
        allow: authorizations.allow ?? {},
        ...(authorizations.deny ? { deny: authorizations.deny } : {})
      }
    },
    valid: compilation.issues.length === 0,
    issues: compilation.issues,
    report: clonePolicyAuthorizationCompileReport(compilation.report)
  };
}

function resolveToolCollection(
  executionEnv: Environment,
  rawTools: unknown
): ToolCollection | undefined {
  if (rawTools === undefined) {
    const scopedTools = executionEnv.getScopedEnvironmentConfig()?.tools;
    if (scopedTools && typeof scopedTools === 'object' && !Array.isArray(scopedTools)) {
      return scopedTools as ToolCollection;
    }
    return undefined;
  }

  if (!rawTools || typeof rawTools !== 'object' || Array.isArray(rawTools)) {
    return undefined;
  }

  if (getToolCollectionAuthorizationContext(rawTools)) {
    return rawTools as ToolCollection;
  }

  try {
    return normalizeToolCollection(rawTools, executionEnv);
  } catch {
    return undefined;
  }
}

async function normalizeIntentContainer(
  rawIntent: unknown,
  env: Environment
): Promise<unknown> {
  if (isVariable(rawIntent)) {
    return normalizeIntentContainer(await extractVariableValue(rawIntent, env), env);
  }

  if (isStructuredValue(rawIntent) && (rawIntent.type === 'object' || rawIntent.type === 'array')) {
    return rawIntent.data;
  }

  return rawIntent;
}

async function buildPolicyAuthorizations(
  intentOrEnv?: unknown,
  toolsOrEnv?: unknown,
  boundEnv?: Environment,
  baseEnv?: Environment
) {
  const executionEnv = boundEnv
    ?? (looksLikeEnvironment(toolsOrEnv) ? toolsOrEnv : undefined)
    ?? (looksLikeEnvironment(intentOrEnv) ? intentOrEnv : undefined)
    ?? baseEnv;
  if (!executionEnv) {
    return createEmptyPolicyResult('Policy builder requires an execution environment');
  }

  const intent = boundEnv || !looksLikeEnvironment(intentOrEnv) ? intentOrEnv : undefined;
  const tools = boundEnv || !looksLikeEnvironment(toolsOrEnv) ? toolsOrEnv : undefined;
  const toolCollection = resolveToolCollection(executionEnv, tools);
  if (!toolCollection) {
    return createEmptyPolicyResult('Policy builder requires a valid tool collection');
  }

  const rawAuthorizations = await normalizeIntentContainer(intent, executionEnv);
  const toolContext = buildAuthorizationToolContextForCollection(executionEnv, toolCollection);
  const compilation = await compilePolicyAuthorizations({
    rawAuthorizations,
    rawSource: intent,
    env: executionEnv,
    toolContext,
    policy: executionEnv.getPolicySummary(),
    ambientDeniedTools: executionEnv.getPolicySummary()?.authorizations?.deny,
    mode: 'builder'
  });

  return createPolicyBuilderResult(compilation);
}

function createPolicyMethod(
  name: 'build' | 'validate',
  description: string,
  env: Environment
) {
  const definition: NodeFunctionExecutable = {
    type: 'nodeFunction',
    name,
    fn: async (intentOrEnv?: unknown, toolsOrEnv?: unknown, boundEnv?: Environment) =>
      buildPolicyAuthorizations(intentOrEnv, toolsOrEnv, boundEnv, env),
    bindExecutionEnv: true,
    sourceDirective: 'exec',
    paramNames: ['intent', 'tools'],
    optionalParams: ['intent', 'tools'],
    description
  };

  return createExecutableVariable(name, 'command', '', ['intent', 'tools'], undefined, POLICY_SOURCE, {
    internal: {
      executableDef: definition,
      isSystem: true
    }
  });
}

export function createPolicyVariable(env: Environment) {
  return createObjectVariable(
    'policy',
    {
      build: createPolicyMethod(
        'build',
        'Compile authorization intent into a policy fragment',
        env
      ),
      validate: createPolicyMethod(
        'validate',
        'Validate authorization intent and return policy builder diagnostics',
        env
      )
    },
    false,
    POLICY_SOURCE,
    {
      internal: {
        isSystem: true
      }
    }
  );
}
