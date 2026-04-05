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
import { mergePolicyConfigs, type PolicyConfig } from '@core/policy/union';
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

async function resolvePolicyTaskText(
  value: unknown,
  env: Environment
): Promise<string | undefined> {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (isVariable(value)) {
    return resolvePolicyTaskText(await extractVariableValue(value, env), env);
  }

  if (
    value
    && typeof value === 'object'
    && 'type' in (value as Record<string, unknown>)
    && !isStructuredValue(value)
  ) {
    const { evaluate } = await import('@interpreter/core/interpreter');
    const result = await evaluate(value as any, env, { isExpression: true });
    return resolvePolicyTaskText(result.value, env);
  }

  if (isStructuredValue(value)) {
    const text = value.type === 'object' || value.type === 'array'
      ? undefined
      : value.text;
    if (typeof text === 'string') {
      const trimmed = text.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
    return resolvePolicyTaskText(value.data, env);
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

async function resolvePolicyBuilderOptions(
  rawOptions: unknown,
  env: Environment
): Promise<{ taskText?: string }> {
  if (rawOptions === null || rawOptions === undefined) {
    return {};
  }

  if (isVariable(rawOptions)) {
    return resolvePolicyBuilderOptions(await extractVariableValue(rawOptions, env), env);
  }

  if (
    rawOptions
    && typeof rawOptions === 'object'
    && 'type' in (rawOptions as Record<string, unknown>)
    && !isStructuredValue(rawOptions)
  ) {
    const { evaluate } = await import('@interpreter/core/interpreter');
    const result = await evaluate(rawOptions as any, env, { isExpression: true });
    return resolvePolicyBuilderOptions(result.value, env);
  }

  const value =
    isStructuredValue(rawOptions) && (rawOptions.type === 'object' || rawOptions.type === 'array')
      ? rawOptions.data
      : rawOptions;
  if (!isPlainObject(value)) {
    return {};
  }

  const taskText = await resolvePolicyTaskText(value.task, env);
  return taskText ? { taskText } : {};
}

function normalizeToolCollectionStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map(entry => entry.trim());
}

function buildToolCollectionMatchSignature(value: unknown): string | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const entries = Object.entries(value)
    .filter(([toolName]) => toolName.trim().length > 0)
    .map(([toolName, entry]) => {
      if (!isPlainObject(entry)) {
        return undefined;
      }

      const bind =
        isPlainObject(entry.bind)
          ? Object.fromEntries(
              Object.entries(entry.bind).sort(([left], [right]) => left.localeCompare(right))
            )
          : undefined;

      return [
        toolName,
        {
          ...(typeof entry.mlld === 'string' ? { mlld: entry.mlld.trim() } : {}),
          expose: normalizeToolCollectionStringList(entry.expose),
          optional: normalizeToolCollectionStringList(entry.optional),
          controlArgs: normalizeToolCollectionStringList(entry.controlArgs),
          updateArgs: normalizeToolCollectionStringList(entry.updateArgs),
          exactPayloadArgs: normalizeToolCollectionStringList(entry.exactPayloadArgs),
          labels: normalizeToolCollectionStringList(entry.labels),
          ...(typeof entry.description === 'string' && entry.description.trim().length > 0
            ? { description: entry.description.trim() }
            : {}),
          ...(bind ? { bind } : {})
        }
      ] as const;
    });

  if (entries.some(entry => entry === undefined)) {
    return undefined;
  }

  return JSON.stringify(
    (entries as Array<readonly [string, Record<string, unknown>]>)
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

function findMatchingToolCollectionInEnv(
  env: Environment,
  rawTools: unknown
): ToolCollection | undefined {
  const signature = buildToolCollectionMatchSignature(rawTools);
  if (!signature) {
    return undefined;
  }

  for (const [, variable] of env.getAllVariables()) {
    const candidate =
      variable.internal?.isToolsCollection === true &&
      variable.internal.toolCollection &&
      isPlainObject(variable.internal.toolCollection)
        ? variable.internal.toolCollection as ToolCollection
        : undefined;
    if (!candidate) {
      continue;
    }
    if (buildToolCollectionMatchSignature(candidate) === signature) {
      return candidate;
    }
  }

  return undefined;
}

function createPolicyBuilderResult(
  compilation: Awaited<ReturnType<typeof compilePolicyAuthorizations>>,
  basePolicy: PolicyConfig | undefined
) {
  const authorizations = compilation.authorizations ?? {};

  return {
    policy: mergePolicyConfigs(basePolicy, {
      authorizations: {
        allow: authorizations.allow ?? {},
        ...(authorizations.deny ? { deny: authorizations.deny } : {})
      }
    }),
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

  if (isVariable(rawTools)) {
    const variableTools = rawTools;
    const directCollection =
      variableTools.internal?.isToolsCollection === true &&
      variableTools.internal.toolCollection &&
      typeof variableTools.internal.toolCollection === 'object' &&
      !Array.isArray(variableTools.internal.toolCollection)
        ? variableTools.internal.toolCollection as ToolCollection
        : undefined;
    if (directCollection) {
      return directCollection;
    }

    const rawValue = variableTools.value;
    if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
      if (getToolCollectionAuthorizationContext(rawValue)) {
        return rawValue as ToolCollection;
      }
      try {
        return normalizeToolCollection(rawValue, executionEnv);
      } catch {
        return findMatchingToolCollectionInEnv(executionEnv, rawValue);
      }
    }

    return undefined;
  }

  if (getToolCollectionAuthorizationContext(rawTools)) {
    return rawTools as ToolCollection;
  }

  try {
    return normalizeToolCollection(rawTools, executionEnv);
  } catch {
    return findMatchingToolCollectionInEnv(executionEnv, rawTools);
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
  optionsOrEnv?: unknown,
  boundEnv?: Environment,
  baseEnv?: Environment
) {
  const executionEnv = boundEnv
    ?? (looksLikeEnvironment(optionsOrEnv) ? optionsOrEnv : undefined)
    ?? (looksLikeEnvironment(toolsOrEnv) ? toolsOrEnv : undefined)
    ?? (looksLikeEnvironment(intentOrEnv) ? intentOrEnv : undefined)
    ?? baseEnv;
  if (!executionEnv) {
    return createEmptyPolicyResult('Policy builder requires an execution environment');
  }

  const intent = boundEnv || !looksLikeEnvironment(intentOrEnv) ? intentOrEnv : undefined;
  const tools = boundEnv || !looksLikeEnvironment(toolsOrEnv) ? toolsOrEnv : undefined;
  const options = boundEnv || !looksLikeEnvironment(optionsOrEnv) ? optionsOrEnv : undefined;
  const toolCollection = resolveToolCollection(executionEnv, tools);
  if (!toolCollection) {
    return createEmptyPolicyResult('Policy builder requires a valid tool collection');
  }

  const rawAuthorizations = await normalizeIntentContainer(intent, executionEnv);
  const builderOptions = await resolvePolicyBuilderOptions(options, executionEnv);
  const toolContext = buildAuthorizationToolContextForCollection(executionEnv, toolCollection);
  const activePolicy = executionEnv.getPolicySummary();
  const compilation = await compilePolicyAuthorizations({
    rawAuthorizations,
    rawSource: intent,
    env: executionEnv,
    toolContext,
    policy: activePolicy,
    ambientDeniedTools: activePolicy?.authorizations?.deny,
    taskText: builderOptions.taskText,
    mode: 'builder'
  });

  return createPolicyBuilderResult(compilation, activePolicy);
}

function createPolicyMethod(
  name: 'build' | 'validate',
  description: string,
  env: Environment
) {
  const definition: NodeFunctionExecutable = {
    type: 'nodeFunction',
    name,
    fn: async (
      intentOrEnv?: unknown,
      toolsOrEnv?: unknown,
      optionsOrEnv?: unknown,
      boundEnv?: Environment
    ) =>
      buildPolicyAuthorizations(intentOrEnv, toolsOrEnv, optionsOrEnv, boundEnv, env),
    bindExecutionEnv: true,
    sourceDirective: 'exec',
    paramNames: ['intent', 'tools', 'options'],
    optionalParams: ['intent', 'tools', 'options'],
    description
  };

  return createExecutableVariable(
    name,
    'command',
    '',
    ['intent', 'tools', 'options'],
    undefined,
    POLICY_SOURCE,
    {
      internal: {
        executableDef: definition,
        isSystem: true
      }
    }
  );
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
