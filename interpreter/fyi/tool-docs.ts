import { mlldNameToMCPName } from '@core/mcp/names';
import type { ToolCollection } from '@core/types/tools';
import type { Environment } from '@interpreter/env/Environment';
import {
  isWriteToolMetadata,
  resolveEffectiveToolMetadata,
  resolveToolCollectionMetadataEntries,
  shouldAutoExposeFyiKnown,
  type EffectiveToolMetadata
} from '@interpreter/eval/exec/tool-metadata';
import { normalizeToolCollection } from '@interpreter/eval/var/tool-scope';
import { isStructuredValue, wrapStructured, type StructuredValue } from '@interpreter/utils/structured-value';
import { extractVariableValue, isVariable } from '@interpreter/utils/variable-resolution';
import { isExecutableVariable } from '@core/types/variable';

type FyiToolsAudience = 'planner' | 'worker' | 'generic';
type FyiToolsFormat = 'text' | 'json';
type FyiToolsIncludeHelpers = 'auto' | 'none' | 'all';

type FyiToolsOptions = {
  audience?: FyiToolsAudience;
  format?: FyiToolsFormat;
  includeHelpers?: FyiToolsIncludeHelpers;
  includeOperationLabels?: boolean;
};

type FyiKnownHelperStatus = {
  available: boolean;
  reason: string;
};

type JsonToolDocEntry = {
  name: string;
  kind: 'write' | 'read';
  description?: string;
  params: string[];
  controlArgs: string[];
  dataArgs: string[];
  multiControlArgCorrelation: boolean;
  discoveryCall?: string;
  operationLabels?: string[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isOptionsCandidate(value: unknown): value is FyiToolsOptions {
  if (!isPlainObject(value)) {
    return false;
  }

  const keys = Object.keys(value);
  if (keys.length === 0) {
    return true;
  }

  const allowed = new Set(['audience', 'format', 'includeHelpers', 'includeOperationLabels']);
  return keys.every(key => allowed.has(key));
}

async function unwrapValue(value: unknown, env: Environment): Promise<unknown> {
  let current = value;
  if (isVariable(current)) {
    current = await extractVariableValue(current, env);
  }

  if (isStructuredValue(current)) {
    return current.data;
  }

  return current;
}

async function normalizeArgs(
  rawToolsOrOptions: unknown,
  rawOptions: unknown,
  env: Environment
): Promise<{ toolsArg: unknown; options: FyiToolsOptions }> {
  const first = await unwrapValue(rawToolsOrOptions, env);
  const second = await unwrapValue(rawOptions, env);

  if (rawOptions === undefined && isOptionsCandidate(first)) {
    return {
      toolsArg: undefined,
      options: first
    };
  }

  return {
    toolsArg: first,
    options: isOptionsCandidate(second) ? second : {}
  };
}

function normalizeAudience(value: unknown, env: Environment): FyiToolsAudience {
  if (value === 'planner' || value === 'worker' || value === 'generic') {
    return value;
  }

  const scopedDisplay = env.getScopedEnvironmentConfig()?.display;
  if (scopedDisplay === 'planner' || scopedDisplay === 'worker' || scopedDisplay === 'generic') {
    return scopedDisplay;
  }

  return 'worker';
}

function normalizeFormat(value: unknown): FyiToolsFormat {
  return value === 'json' ? 'json' : 'text';
}

function normalizeIncludeHelpers(value: unknown): FyiToolsIncludeHelpers {
  return value === 'none' || value === 'all' ? value : 'auto';
}

function normalizeOptions(raw: FyiToolsOptions, env: Environment) {
  return {
    audience: normalizeAudience(raw.audience, env),
    format: normalizeFormat(raw.format),
    includeHelpers: normalizeIncludeHelpers(raw.includeHelpers),
    includeOperationLabels: raw.includeOperationLabels === true
  };
}

function cloneToolMetadata(metadata: EffectiveToolMetadata): EffectiveToolMetadata {
  return {
    ...metadata,
    params: [...metadata.params],
    labels: [...metadata.labels],
    ...(metadata.description ? { description: metadata.description } : {}),
    ...(metadata.controlArgs ? { controlArgs: [...metadata.controlArgs] } : {})
  };
}

function dedupeToolMetadata(entries: readonly EffectiveToolMetadata[]): EffectiveToolMetadata[] {
  const deduped: EffectiveToolMetadata[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const trimmed = entry.name.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    deduped.push(cloneToolMetadata(entry));
  }

  return deduped;
}

function buildNameOnlyMetadata(name: string): EffectiveToolMetadata {
  return {
    name,
    params: [],
    labels: [],
    hasControlArgsMetadata: false,
    correlateControlArgs: false,
    taintFacts: false
  };
}

function looksLikeToolCollectionCandidate(value: unknown): value is ToolCollection {
  if (!isPlainObject(value)) {
    return false;
  }

  const entries = Object.values(value);
  if (entries.length === 0) {
    return true;
  }

  return entries.every(entry => isPlainObject(entry) && 'mlld' in entry);
}

function resolveToolCollectionCandidate(value: unknown, env: Environment): ToolCollection | undefined {
  if (!looksLikeToolCollectionCandidate(value)) {
    return undefined;
  }

  try {
    return normalizeToolCollection(value, env);
  } catch {
    return value as ToolCollection;
  }
}

function resolveExecutableArrayMetadata(
  value: readonly unknown[],
  env: Environment
): EffectiveToolMetadata[] {
  const resolved: EffectiveToolMetadata[] = [];

  for (const entry of value) {
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (trimmed) {
        resolved.push(buildNameOnlyMetadata(trimmed));
      }
      continue;
    }

    if (isExecutableVariable(entry)) {
      resolved.push(
        resolveEffectiveToolMetadata({
          env,
          executable: entry,
          operationName: mlldNameToMCPName(entry.name)
        })
      );
      continue;
    }
  }

  return dedupeToolMetadata(resolved);
}

function resolveNoArgMetadata(env: Environment): EffectiveToolMetadata[] {
  const scopedTools = env.getScopedEnvironmentConfig()?.tools;
  if (scopedTools && typeof scopedTools === 'object') {
    if (Array.isArray(scopedTools)) {
      return dedupeToolMetadata(
        scopedTools
          .filter((toolName): toolName is string => typeof toolName === 'string' && toolName.trim().length > 0)
          .map(toolName => buildNameOnlyMetadata(toolName.trim()))
      );
    }

    return dedupeToolMetadata(resolveToolCollectionMetadataEntries(env, scopedTools as ToolCollection));
  }

  const llmToolConfig = env.getLlmToolConfig();
  if (Array.isArray(llmToolConfig?.toolMetadata) && llmToolConfig.toolMetadata.length > 0) {
    return dedupeToolMetadata(llmToolConfig.toolMetadata);
  }

  if (Array.isArray(llmToolConfig?.availableTools) && llmToolConfig.availableTools.length > 0) {
    return dedupeToolMetadata(
      llmToolConfig.availableTools
        .filter(tool => typeof tool?.name === 'string' && tool.name.trim().length > 0)
        .map(tool => buildNameOnlyMetadata(tool.name.trim()))
    );
  }

  return [];
}

async function resolveToolMetadataInput(
  rawTools: unknown,
  env: Environment
): Promise<EffectiveToolMetadata[]> {
  if (rawTools === undefined) {
    return resolveNoArgMetadata(env);
  }

  const unwrapped = await unwrapValue(rawTools, env);
  if (Array.isArray(unwrapped)) {
    return resolveExecutableArrayMetadata(unwrapped, env);
  }

  if (typeof unwrapped === 'string') {
    const trimmed = unwrapped.trim();
    return trimmed ? [buildNameOnlyMetadata(trimmed)] : [];
  }

  if (isExecutableVariable(unwrapped)) {
    return [
      resolveEffectiveToolMetadata({
        env,
        executable: unwrapped,
        operationName: mlldNameToMCPName(unwrapped.name)
      })
    ];
  }

  const collection = resolveToolCollectionCandidate(unwrapped, env);
  if (collection) {
    return dedupeToolMetadata(resolveToolCollectionMetadataEntries(env, collection));
  }

  return [];
}

function resolveKnownHelperStatus(
  env: Environment,
  entries: readonly EffectiveToolMetadata[]
): FyiKnownHelperStatus {
  if (shouldAutoExposeFyiKnown(env, entries)) {
    return {
      available: true,
      reason: 'write_tools_with_control_args_present'
    };
  }

  if (entries.some(entry => entry.name === 'known')) {
    return {
      available: true,
      reason: 'explicit_tool_present'
    };
  }

  return {
    available: false,
    reason: 'not_available'
  };
}

function formatArgList(args: readonly string[]): string {
  return args.length > 0 ? args.join(', ') : '(none)';
}

function formatSignature(name: string, params: readonly string[]): string {
  return `${name}(${params.join(', ')})`;
}

function buildPlannerPreamble(denied: readonly string[]): string[] {
  const lines: string[] = [];
  if (denied.length > 0) {
    lines.push('DENIED BY POLICY (cannot be authorized):');
    for (const toolName of denied) {
      lines.push(`  ${toolName}`);
    }
    lines.push('');
  }

  lines.push('Authorization intent shape:');
  lines.push('  resolved: { tool: { arg: "handle_value" } }');
  lines.push('  known: { tool: { arg: { value: "literal", source: "reason" } } }');
  lines.push('  allow: ["tool_name"]');
  return lines;
}

function buildWorkerHelperPreamble(
  includeHelpers: FyiToolsIncludeHelpers,
  helperStatus: FyiKnownHelperStatus
): string[] {
  if (includeHelpers === 'none') {
    return [];
  }

  if (helperStatus.available) {
    return [
      'Handle discovery available:',
      '  @fyi.known() returns proof-bearing candidates for control args.',
      '  Call @fyi.known("toolName") for candidates specific to a write tool.'
    ];
  }

  if (includeHelpers === 'all') {
    return ['Handle discovery not available for this phase.'];
  }

  return [];
}

function buildToolTextBlock(options: {
  env: Environment;
  audience: FyiToolsAudience;
  entry: EffectiveToolMetadata;
  helperStatus: FyiKnownHelperStatus;
  includeHelpers: FyiToolsIncludeHelpers;
}): string[] {
  const { env, audience, entry, helperStatus, includeHelpers } = options;
  const lines: string[] = [];
  const isWrite = isWriteToolMetadata(env, entry);
  const controlArgs = entry.controlArgs ?? [];
  const dataArgs = entry.params.filter(param => !controlArgs.includes(param));

  lines.push(`${formatSignature(entry.name, entry.params)} [${isWrite ? 'WRITE' : 'READ'}]`);
  if (entry.description) {
    lines.push(`  ${entry.description}`);
  }

  if (isWrite) {
    if (controlArgs.length > 0) {
      lines.push(
        audience === 'planner'
          ? `  CONTROL args (authorization targets): ${formatArgList(controlArgs)}`
          : `  CONTROL args (target selection): ${formatArgList(controlArgs)}`
      );

      if (entry.correlateControlArgs && controlArgs.length > 1) {
        lines.push(
          audience === 'planner'
            ? '  If you authorize this tool, include all required control args from the same trusted result.'
            : '  These control args must come from the same source record.'
        );
      }

      if (
        audience !== 'planner'
        && includeHelpers !== 'none'
        && helperStatus.available
      ) {
        lines.push(`  Discover approved targets: @fyi.known("${entry.name}")`);
      }
    } else {
      lines.push('  No control args - authorize with allow.');
    }

    lines.push(`  DATA args (payload): ${formatArgList(dataArgs)}`);
    return lines;
  }

  if (controlArgs.length > 0) {
    lines.push(`  CONTROL args: ${formatArgList(controlArgs)}`);
  }

  return lines;
}

function renderText(options: {
  env: Environment;
  audience: FyiToolsAudience;
  includeHelpers: FyiToolsIncludeHelpers;
  denied: readonly string[];
  helperStatus: FyiKnownHelperStatus;
  entries: readonly EffectiveToolMetadata[];
}): string {
  const { env, audience, includeHelpers, denied, helperStatus, entries } = options;
  const lines: string[] = [];

  if (audience === 'planner') {
    lines.push(...buildPlannerPreamble(denied));
    if (lines.length > 0) {
      lines.push('');
    }
  } else if (audience === 'worker') {
    const helperLines = buildWorkerHelperPreamble(includeHelpers, helperStatus);
    if (helperLines.length > 0) {
      lines.push(...helperLines, '');
    }
  }

  const visibleEntries = entries.filter(entry => entry.name !== 'known');
  for (const entry of visibleEntries) {
    lines.push(
      ...buildToolTextBlock({
        env,
        audience,
        entry,
        helperStatus,
        includeHelpers
      }),
      ''
    );
  }

  return lines.join('\n').trim();
}

function buildJsonToolEntry(
  env: Environment,
  entry: EffectiveToolMetadata,
  helperStatus: FyiKnownHelperStatus,
  includeOperationLabels: boolean
): JsonToolDocEntry {
  const controlArgs = entry.controlArgs ?? [];
  const dataArgs = entry.params.filter(param => !controlArgs.includes(param));
  return {
    name: entry.name,
    kind: isWriteToolMetadata(env, entry) ? 'write' : 'read',
    ...(entry.description ? { description: entry.description } : {}),
    params: [...entry.params],
    controlArgs: [...controlArgs],
    dataArgs,
    multiControlArgCorrelation: entry.correlateControlArgs && controlArgs.length > 1,
    ...(helperStatus.available && controlArgs.length > 0
      ? { discoveryCall: `@fyi.known("${entry.name}")` }
      : {}),
    ...(includeOperationLabels ? { operationLabels: [...entry.labels] } : {})
  };
}

function renderJson(options: {
  env: Environment;
  denied: readonly string[];
  helperStatus: FyiKnownHelperStatus;
  includeOperationLabels: boolean;
  entries: readonly EffectiveToolMetadata[];
}) {
  const { env, denied, helperStatus, includeOperationLabels, entries } = options;
  return {
    helpers: {
      fyi_known: {
        available: helperStatus.available,
        reason: helperStatus.reason
      }
    },
    denied: [...denied],
    tools: entries
      .filter(entry => entry.name !== 'known')
      .map(entry => buildJsonToolEntry(env, entry, helperStatus, includeOperationLabels))
  };
}

export async function evaluateFyiTools(
  rawToolsOrOptions: unknown,
  env: Environment,
  rawOptions?: unknown
): Promise<StructuredValue<string | ReturnType<typeof renderJson>>> {
  const { toolsArg, options: rawResolvedOptions } = await normalizeArgs(rawToolsOrOptions, rawOptions, env);
  const options = normalizeOptions(rawResolvedOptions, env);
  const entries = dedupeToolMetadata(await resolveToolMetadataInput(toolsArg, env));
  const helperStatus = resolveKnownHelperStatus(env, entries);
  const denied = Array.isArray(env.getPolicySummary()?.authorizations?.deny)
    ? env.getPolicySummary()!.authorizations!.deny!
        .filter((toolName): toolName is string => typeof toolName === 'string' && toolName.trim().length > 0)
        .map(toolName => toolName.trim())
    : [];

  if (options.format === 'json') {
    return wrapStructured(
      renderJson({
        env,
        denied,
        helperStatus,
        includeOperationLabels: options.includeOperationLabels,
        entries
      }),
      'object'
    );
  }

  return wrapStructured(
    renderText({
      env,
      audience: options.audience,
      includeHelpers: options.includeHelpers,
      denied,
      helperStatus,
      entries
    }),
    'text'
  );
}
