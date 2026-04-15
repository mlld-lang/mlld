import { mlldNameToMCPName } from '@core/mcp/names';
import {
  getPolicyAuthorizableToolsForRole,
  stripPolicyAuthorizableField
} from '@core/policy/authorizations';
import type { Environment } from '@interpreter/env/Environment';
import type { NodeFunctionExecutable } from '@core/types/executable';
import {
  getToolCollectionAuthorizationContext,
  type ToolCollection
} from '@core/types/tools';
import {
  createExecutableVariable,
  createObjectVariable,
  isExecutableVariable,
  type VariableSource
} from '@core/types/variable';
import { mergePolicyConfigs, type PolicyConfig } from '@core/policy/union';
import {
  clonePolicyAuthorizationCompileReport,
  compilePolicyAuthorizations,
  createEmptyPolicyAuthorizationCompileReport,
  type PolicyAuthorizationCompilerIssue
} from '@interpreter/policy/authorization-compiler';
import {
  buildAuthorizationToolContextForCollection,
  mergeCatalogPolicyDefaults
} from '@interpreter/eval/exec/tool-metadata';
import { normalizeToolCollection } from '@interpreter/eval/var/tool-scope';
import { asData, isStructuredValue } from '@interpreter/utils/structured-value';
import { extractVariableValue, isVariable } from '@interpreter/utils/variable-resolution';
import { boundary } from '@interpreter/utils/boundary';
import { tracePolicyEvent } from '@interpreter/tracing/events';

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
  const resolved = await boundary.config(value, env);
  if (typeof resolved !== 'string') {
    return undefined;
  }

  const trimmed = resolved.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolvePolicyConfigSource(value: unknown): PolicyConfig | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }
  if (isPlainObject(value.policy)) {
    return value.policy as PolicyConfig;
  }
  if (isPlainObject(value.config)) {
    return value.config as PolicyConfig;
  }
  return value as PolicyConfig;
}

async function resolvePolicyBuilderBasePolicy(
  value: unknown,
  env: Environment
): Promise<PolicyConfig | undefined> {
  if (value === null || value === undefined) {
    return undefined;
  }

  const resolved = await boundary.config(value, env);
  return resolvePolicyConfigSource(resolved);
}

async function resolvePolicyBuilderOptions(
  rawOptions: unknown,
  env: Environment
): Promise<{ taskText?: string; basePolicy?: PolicyConfig }> {
  if (rawOptions === null || rawOptions === undefined) {
    return {};
  }

  const value = await boundary.config(rawOptions, env);
  if (!isPlainObject(value)) {
    return {};
  }

  const taskText = await resolvePolicyTaskText(value.task, env);
  const basePolicy = await resolvePolicyBuilderBasePolicy(value.basePolicy, env);
  return {
    ...(taskText ? { taskText } : {}),
    ...(basePolicy ? { basePolicy } : {})
  };
}

function normalizeToolCollectionStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map(entry => entry.trim());
}

function normalizeToolCollectionAuthorizable(
  value: unknown
): false | string | string[] | undefined {
  if (value === false) {
    return false;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map(entry => entry.trim());
  return normalized.length > 0 ? normalized : undefined;
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
          ...(typeof entry.inputs === 'string' ? { inputs: entry.inputs.trim() } : {}),
          expose: normalizeToolCollectionStringList(entry.expose),
          optional: normalizeToolCollectionStringList(entry.optional),
          controlArgs: normalizeToolCollectionStringList(entry.controlArgs),
          updateArgs: normalizeToolCollectionStringList(entry.updateArgs),
          exactPayloadArgs: normalizeToolCollectionStringList(entry.exactPayloadArgs),
          sourceArgs: normalizeToolCollectionStringList((entry as { sourceArgs?: unknown }).sourceArgs),
          labels: normalizeToolCollectionStringList(entry.labels),
          ...(typeof entry.description === 'string' && entry.description.trim().length > 0
            ? { description: entry.description.trim() }
            : {}),
          ...(typeof (entry as { instructions?: unknown }).instructions === 'string'
            && (entry as { instructions: string }).instructions.trim().length > 0
            ? { instructions: (entry as { instructions: string }).instructions.trim() }
            : {}),
          ...(normalizeToolCollectionAuthorizable((entry as { authorizable?: unknown }).authorizable) !== undefined
            ? { authorizable: normalizeToolCollectionAuthorizable((entry as { authorizable?: unknown }).authorizable) }
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
      variable.internal?.isToolsCollection === true
        ? boundary.identity<ToolCollection | undefined>(variable)
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

function unwrapToolCollectionInput(value: unknown): unknown {
  return isStructuredValue(value) ? asData(value) : value;
}

function normalizeExecutableArrayToolCollection(
  rawTools: unknown,
  executionEnv: Environment
): ToolCollection | undefined {
  const resolvedTools = unwrapToolCollectionInput(rawTools);
  if (!Array.isArray(resolvedTools)) {
    return undefined;
  }

  const normalized: ToolCollection = {};
  for (const entry of resolvedTools) {
    let resolvedEntry = unwrapToolCollectionInput(entry);
    if (isVariable(resolvedEntry) && !isExecutableVariable(resolvedEntry)) {
      resolvedEntry = unwrapToolCollectionInput(resolvedEntry.value);
    }
    if (!isVariable(resolvedEntry) || !isExecutableVariable(resolvedEntry)) {
      return undefined;
    }
    const executable = resolvedEntry;

    const executableName =
      typeof executable.name === 'string'
        ? executable.name.trim()
        : '';
    if (!executableName) {
      return undefined;
    }
    if (!normalized[executableName]) {
      normalized[executableName] = { mlld: executableName };
    }
  }

  try {
    return normalizeToolCollection(normalized, executionEnv);
  } catch {
    return undefined;
  }
}

function createPolicyBuilderResult(
  compilation: Awaited<ReturnType<typeof compilePolicyAuthorizations>>,
  basePolicy: PolicyConfig | undefined
) {
  const authorizations = compilation.authorizations ?? {};

  return {
    policy: mergePolicyConfigs(stripAuthorizableFromPolicyConfig(basePolicy), {
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

  const normalizedArrayCollection = normalizeExecutableArrayToolCollection(rawTools, executionEnv);
  if (normalizedArrayCollection) {
    return normalizedArrayCollection;
  }

  if (!rawTools || typeof rawTools !== 'object') {
    return undefined;
  }

  if (isVariable(rawTools)) {
    const variableTools = rawTools;
    const directCollection =
      variableTools.internal?.isToolsCollection === true
        ? boundary.identity<ToolCollection | undefined>(variableTools)
        : undefined;
    if (directCollection) {
      return directCollection;
    }

    const rawValue = unwrapToolCollectionInput(variableTools.value);
    const arrayCollection = normalizeExecutableArrayToolCollection(rawValue, executionEnv);
    if (arrayCollection) {
      return arrayCollection;
    }
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

  rawTools = unwrapToolCollectionInput(rawTools);
  if (!rawTools || typeof rawTools !== 'object' || Array.isArray(rawTools)) {
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

function uniquePreservingOrder(values: readonly string[]): string[] {
  const unique: string[] = [];
  for (const value of values) {
    if (!unique.includes(value)) {
      unique.push(value);
    }
  }
  return unique;
}

function stripAuthorizableFromIntent(value: unknown): unknown {
  if (!isPlainObject(value)) {
    return value;
  }

  const stripped = stripPolicyAuthorizableField(value);
  if (!isPlainObject(stripped)) {
    return stripped;
  }

  if (!isPlainObject(stripped.authorizations)) {
    return stripped;
  }

  return {
    ...stripped,
    authorizations: stripPolicyAuthorizableField(stripped.authorizations)
  };
}

function collectRequestedAuthorizationToolNames(raw: unknown): string[] {
  if (!isPlainObject(raw)) {
    return [];
  }

  const container = isPlainObject(raw.authorizations)
    ? (raw.authorizations as Record<string, unknown>)
    : raw;
  const requested: string[] = [];
  const add = (value: unknown): void => {
    if (typeof value !== 'string') {
      return;
    }
    const trimmed = value.trim();
    if (trimmed.length > 0 && !requested.includes(trimmed)) {
      requested.push(trimmed);
    }
  };

  if (Array.isArray(container.allow)) {
    for (const toolName of container.allow) {
      add(toolName);
    }
  } else if (isPlainObject(container.allow)) {
    for (const toolName of Object.keys(container.allow)) {
      add(toolName);
    }
  }

  for (const bucketName of ['known', 'resolved']) {
    if (!isPlainObject(container[bucketName])) {
      continue;
    }
    for (const toolName of Object.keys(container[bucketName] as Record<string, unknown>)) {
      add(toolName);
    }
  }

  for (const [key] of Object.entries(container)) {
    if (key === 'allow' || key === 'deny' || key === 'known' || key === 'resolved') {
      continue;
    }
    add(key);
  }

  return requested;
}

function resolveAuthorizationSurfaceNamesForTool(
  requestedToolName: string,
  toolContext: ReadonlyMap<string, { name: string }>
): string[] {
  const trimmed = requestedToolName.trim();
  if (!trimmed) {
    return [];
  }

  const normalized = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  const candidates = uniquePreservingOrder([
    trimmed,
    normalized,
    mlldNameToMCPName(normalized)
  ].filter(value => value.length > 0));
  const matched: string[] = [];

  for (const candidate of candidates) {
    if (toolContext.has(candidate) && !matched.includes(candidate)) {
      matched.push(candidate);
    }
  }

  for (const toolName of toolContext.keys()) {
    const loweredToolName = toolName.trim().toLowerCase();
    if (candidates.some(candidate => candidate.trim().toLowerCase() === loweredToolName) && !matched.includes(toolName)) {
      matched.push(toolName);
    }
  }

  return matched;
}

function resolveAllowedAuthorizableSurfaceNames(
  rawToolNames: readonly string[],
  toolContext: ReadonlyMap<string, { name: string }>
): Set<string> {
  const allowed = new Set<string>();
  for (const toolName of rawToolNames) {
    for (const surfaceName of resolveAuthorizationSurfaceNamesForTool(toolName, toolContext)) {
      allowed.add(surfaceName);
    }
  }
  return allowed;
}

function stripAuthorizableFromPolicyConfig(
  policy: PolicyConfig | undefined
): PolicyConfig | undefined {
  if (!policy) {
    return undefined;
  }

  const { authorizable: _, ...rest } = policy;
  return rest;
}

function createPolicyBuilderIssueResult(
  basePolicy: PolicyConfig | undefined,
  issues: PolicyAuthorizationCompilerIssue[]
) {
  return {
    policy: mergePolicyConfigs(stripAuthorizableFromPolicyConfig(basePolicy), {
      authorizations: {
        allow: {}
      }
    }),
    valid: false,
    issues,
    report: createEmptyPolicyAuthorizationCompileReport()
  };
}

async function buildPolicyAuthorizations(
  mode: 'build' | 'validate',
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
  const strippedAuthorizations = stripAuthorizableFromIntent(rawAuthorizations);
  const builderOptions = await resolvePolicyBuilderOptions(options, executionEnv);
  const toolContext = buildAuthorizationToolContextForCollection(executionEnv, toolCollection);
  const basePolicy = mergeCatalogPolicyDefaults(
    builderOptions.basePolicy ?? executionEnv.getPolicySummary(),
    toolCollection
  );
  const authorizationRole =
    executionEnv.getLlmToolConfig()?.authorizationRole
    ?? executionEnv.getCurrentAuthorizationRole();
  const authorizableToolNames = getPolicyAuthorizableToolsForRole(
    basePolicy?.authorizable,
    authorizationRole
  );
  const requestedSurfaceNames = uniquePreservingOrder(
    collectRequestedAuthorizationToolNames(strippedAuthorizations).flatMap(toolName =>
      resolveAuthorizationSurfaceNamesForTool(toolName, toolContext)
    )
  );

  if (basePolicy?.authorizable && requestedSurfaceNames.length > 0) {
    const deniedTools = new Set(basePolicy.authorizations?.deny ?? []);
    const allowedTools = resolveAllowedAuthorizableSurfaceNames(authorizableToolNames ?? [], toolContext);
    const issues: PolicyAuthorizationCompilerIssue[] = [];

    for (const toolName of requestedSurfaceNames) {
      if (deniedTools.has(toolName)) {
        issues.push({
          reason: 'denied_by_policy',
          tool: toolName,
          message: `Tool '${toolName}' is denied by policy.authorizations.deny`
        });
        continue;
      }

      if (!allowedTools.has(toolName)) {
        issues.push({
          reason: 'invalid_authorization',
          tool: toolName,
          message: authorizationRole
            ? `Role '${authorizationRole}' cannot authorize tool '${toolName}'`
            : `Authorization requires an active exe role label before tool '${toolName}' can be authorized`
        });
      }
    }

    if (issues.length > 0) {
      return createPolicyBuilderIssueResult(basePolicy, issues);
    }
  }

  const compilation = await compilePolicyAuthorizations({
    rawAuthorizations: strippedAuthorizations,
    rawSource: intent,
    env: executionEnv,
    toolContext,
    policy: basePolicy,
    ambientDeniedTools: basePolicy?.authorizations?.deny,
    taskText: builderOptions.taskText,
    mode: 'builder'
  });

  executionEnv.emitRuntimeTraceEvent(tracePolicyEvent('effects', `policy.${mode}`, {
    mode,
    toolCount: Object.keys(toolCollection).length,
    valid: compilation.issues.length === 0,
    issueCount: compilation.issues.length,
    repairedArgCount: compilation.report.repairedArgs.length,
    droppedEntryCount: compilation.report.droppedEntries.length,
    droppedArrayElementCount: compilation.report.droppedArrayElements.length
  }));
  if (compilation.report.repairedArgs.length > 0) {
    executionEnv.emitRuntimeTraceEvent(tracePolicyEvent('verbose', 'policy.compile_repair', {
      mode,
      repairedArgs: compilation.report.repairedArgs.map(entry => ({
        tool: entry.tool,
        arg: entry.arg,
        steps: entry.steps
      }))
    }));
  }
  if (
    compilation.report.droppedEntries.length > 0
    || compilation.report.droppedArrayElements.length > 0
  ) {
    executionEnv.emitRuntimeTraceEvent(tracePolicyEvent('effects', 'policy.compile_drop', {
      mode,
      droppedEntries: compilation.report.droppedEntries,
      droppedArrayElements: compilation.report.droppedArrayElements
    }));
  }

  return createPolicyBuilderResult(compilation, basePolicy);
}

function createPolicyMethod(
  name: 'build' | 'validate',
  description: string,
  env: Environment
) {
  const definition: NodeFunctionExecutable = {
    type: 'nodeFunction',
    name,
    fn: async (...args: unknown[]) => {
      const [intentOrEnv, toolsOrEnv, optionsOrEnv, boundEnv] = args as [
        unknown?,
        unknown?,
        unknown?,
        Environment?
      ];
      return buildPolicyAuthorizations(name, intentOrEnv, toolsOrEnv, optionsOrEnv, boundEnv, env);
    },
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
