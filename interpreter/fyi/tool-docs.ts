import { mlldNameToMCPName } from '@core/mcp/names';
import type { ToolCollection } from '@core/types/tools';
import type { Environment } from '@interpreter/env/Environment';
import {
  isWriteToolMetadata,
  resolveEffectiveToolMetadata,
  resolveToolCollectionMetadataEntries,
  shouldAutoExposeFyiKnown,
  type EffectiveToolMetadata,
  type EffectiveToolParam
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

type FyiToolsRenderContext = {
  isMcpContext?: boolean;
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
  updateArgs: string[];
  exactPayloadArgs: string[];
  dataArgs: string[];
  multiControlArgCorrelation: boolean;
  discoveryCall?: string;
  operationLabels?: string[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
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
  value: unknown
): ToolCollection | undefined {
  const signature = buildToolCollectionMatchSignature(value);
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

function normalizeRenderContext(raw?: FyiToolsRenderContext) {
  return {
    isMcpContext: raw?.isMcpContext === true
  };
}

function cloneToolMetadata(metadata: EffectiveToolMetadata): EffectiveToolMetadata {
  return {
    ...metadata,
    ...(metadata.displayName ? { displayName: metadata.displayName } : {}),
    params: [...metadata.params],
    paramEntries: metadata.paramEntries.map(entry => ({ ...entry })),
    ...(metadata.optionalParams ? { optionalParams: [...metadata.optionalParams] } : {}),
    labels: [...metadata.labels],
    ...(metadata.description ? { description: metadata.description } : {}),
    ...(metadata.controlArgs ? { controlArgs: [...metadata.controlArgs] } : {}),
    hasControlArgsMetadata: metadata.hasControlArgsMetadata,
    ...(metadata.updateArgs ? { updateArgs: [...metadata.updateArgs] } : {}),
    hasUpdateArgsMetadata: metadata.hasUpdateArgsMetadata,
    ...(metadata.exactPayloadArgs ? { exactPayloadArgs: [...metadata.exactPayloadArgs] } : {})
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
    paramEntries: [],
    labels: [],
    hasControlArgsMetadata: false,
    hasUpdateArgsMetadata: false,
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
    return findMatchingToolCollectionInEnv(env, value) ?? value as ToolCollection;
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

function resolveDeniedToolNames(
  env: Environment,
  entries: readonly EffectiveToolMetadata[]
): string[] {
  const visibleToolNames = new Set(
    entries
      .filter(entry => isWriteToolMetadata(env, entry))
      .map(entry => entry.name.trim().toLowerCase())
      .filter(name => name.length > 0 && name !== 'known')
  );

  if (visibleToolNames.size === 0) {
    return [];
  }

  return Array.isArray(env.getPolicySummary()?.authorizations?.deny)
    ? env.getPolicySummary()!.authorizations!.deny!
        .filter((toolName): toolName is string => typeof toolName === 'string' && toolName.trim().length > 0)
        .map(toolName => toolName.trim())
        .filter(toolName => visibleToolNames.has(toolName.toLowerCase()))
    : [];
}

function resolveNoArgMetadata(env: Environment): EffectiveToolMetadata[] {
  const scopedTools = env.getScopedEnvironmentConfig()?.tools;
  if (scopedTools && typeof scopedTools === 'object') {
    if (Array.isArray(scopedTools)) {
      return dedupeToolMetadata(resolveExecutableArrayMetadata(scopedTools, env));
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

function formatTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function getRenderedToolName(entry: EffectiveToolMetadata): string {
  const displayName = typeof entry.displayName === 'string' ? entry.displayName.trim() : '';
  return displayName.length > 0 ? displayName : entry.name;
}

function formatControlArgsCell(entry: EffectiveToolMetadata): string {
  const controlArgs = entry.controlArgs ?? [];
  const base = formatArgList(controlArgs);
  if (controlArgs.length > 1 && entry.correlateControlArgs) {
    return `${base} (same source)`;
  }
  return base;
}

function formatOptionalArgsCell(entry: EffectiveToolMetadata): string {
  return formatArgList(entry.optionalParams ?? []);
}

function formatRequiredArgsCell(entry: EffectiveToolMetadata): string {
  const optional = new Set(entry.optionalParams ?? []);
  return formatArgList(entry.params.filter(param => !optional.has(param)));
}

function formatPayloadArgsCell(entry: EffectiveToolMetadata): string {
  const reservedArgs = new Set([
    ...(entry.controlArgs ?? []),
    ...(entry.updateArgs ?? []),
    ...(entry.exactPayloadArgs ?? [])
  ]);
  return formatArgList(entry.params.filter(param => !reservedArgs.has(param)));
}

function formatUpdateArgsCell(entry: EffectiveToolMetadata): string {
  if (!entry.hasUpdateArgsMetadata) {
    return '';
  }

  return formatArgList(entry.updateArgs ?? []);
}

function buildDeniedLine(denied: readonly string[]): string {
  return `Denied: ${denied.length > 0 ? denied.join(', ') : '(none)'}`;
}

function buildPlannerIntentLines(): string[] {
  return [
    'Authorization intent shape:',
    '  resolved: { tool: { arg: "<handle>" } } - from your lookups in this same call',
    '  known: { tool: { arg: "<value>" } } - from prior phases, shelf state, or user task text',
    '  allow: { tool: true } - no per-arg constraints'
  ];
}

function getRenderedToolParamEntries(entry: EffectiveToolMetadata): EffectiveToolParam[] {
  if (entry.paramEntries.length > 0) {
    return entry.paramEntries;
  }

  const optionalParams = new Set(entry.optionalParams ?? []);
  return entry.params.map(name => ({
    name,
    ...(optionalParams.has(name) ? { optional: true } : {})
  }));
}

function buildToolArgLine(
  entry: EffectiveToolMetadata,
  param: EffectiveToolParam
): string {
  const annotations = [param.type ?? 'string'];
  if ((entry.controlArgs ?? []).includes(param.name)) {
    annotations.push('**control arg**');
  }
  return `- \`${param.name}\` (${annotations.join(', ')})`;
}

function buildToolSectionLines(
  heading: string,
  entries: readonly EffectiveToolMetadata[]
): string[] {
  const lines: string[] = [`${heading}:`, ''];

  for (const [index, entry] of entries.entries()) {
    if (index > 0) {
      lines.push('');
    }

    lines.push(`### ${getRenderedToolName(entry)}`, 'Args:');
    const params = getRenderedToolParamEntries(entry);
    if (params.length === 0) {
      lines.push('- (none)');
      continue;
    }

    for (const param of params) {
      lines.push(buildToolArgLine(entry, param));
    }
  }

  return lines;
}

function buildWorkerHelperLine(
  includeHelpers: FyiToolsIncludeHelpers,
  helperStatus: FyiKnownHelperStatus
): string | undefined {
  if (includeHelpers === 'none') {
    return undefined;
  }

  if (helperStatus.available) {
    return 'Use @fyi.known("toolName") to discover approved handle-bearing targets for control args.';
  }

  if (includeHelpers === 'all') {
    return '@fyi.known() is not available for this phase.';
  }

  return undefined;
}

function resolveWriteEntries(
  env: Environment,
  entries: readonly EffectiveToolMetadata[]
): EffectiveToolMetadata[] {
  return entries.filter(
    entry => entry.name !== 'known' && isWriteToolMetadata(env, entry)
  );
}

function resolveReadEntries(
  env: Environment,
  entries: readonly EffectiveToolMetadata[]
): EffectiveToolMetadata[] {
  return entries.filter(
    entry => entry.name !== 'known' && !isWriteToolMetadata(env, entry)
  );
}

function buildToolTableLines(options: {
  audience: FyiToolsAudience;
  isMcpContext: boolean;
  writeEntries: readonly EffectiveToolMetadata[];
  helperStatus: FyiKnownHelperStatus;
  includeHelpers: FyiToolsIncludeHelpers;
}): string[] {
  const { audience, isMcpContext, writeEntries, helperStatus, includeHelpers } = options;
  const includeDiscoveryColumn = audience === 'worker';
  const includeUpdateColumn = writeEntries.some(entry => entry.hasUpdateArgsMetadata);
  const lines = [
    isMcpContext
      ? (includeDiscoveryColumn
          ? (includeUpdateColumn
              ? '| Tool | Control Args | Update Args | Discover Targets |'
              : '| Tool | Control Args | Discover Targets |')
          : (includeUpdateColumn
              ? '| Tool | Control Args | Update Args |'
              : '| Tool | Control Args |'))
      : (includeDiscoveryColumn
          ? (includeUpdateColumn
              ? '| Tool | Description | Control Args | Update Args | Discover Targets |'
              : '| Tool | Description | Control Args | Discover Targets |')
          : (includeUpdateColumn
              ? '| Tool | Description | Control Args | Update Args |'
              : '| Tool | Description | Control Args |')),
    isMcpContext
      ? (includeDiscoveryColumn
          ? (includeUpdateColumn
              ? '|------|-------------|-------------|------------------|'
              : '|------|-------------|------------------|')
          : (includeUpdateColumn
              ? '|------|-------------|-------------|'
              : '|------|-------------|'))
      : (includeDiscoveryColumn
          ? (includeUpdateColumn
              ? '|------|-------------|-------------|-------------|------------------|'
              : '|------|-------------|-------------|------------------|')
          : (includeUpdateColumn
              ? '|------|-------------|-------------|-------------|'
              : '|------|-------------|-------------|'))
  ];

  for (const entry of writeEntries) {
    const cells = [formatTableCell(getRenderedToolName(entry))];

    if (!isMcpContext) {
      cells.push(formatTableCell(entry.description ?? ''));
    }

    cells.push(formatTableCell(formatControlArgsCell(entry)));

    if (includeUpdateColumn) {
      cells.push(formatTableCell(formatUpdateArgsCell(entry)));
    }

    if (includeDiscoveryColumn) {
      const controlArgs = entry.controlArgs ?? [];
      const discoveryCall =
        helperStatus.available
        && includeHelpers !== 'none'
        && controlArgs.length > 0
          ? `@fyi.known("${entry.name}")`
          : '';
      cells.push(formatTableCell(discoveryCall));
    }

    lines.push(`| ${cells.join(' | ')} |`);
  }

  return lines;
}

function buildReadToolNameList(readEntries: readonly EffectiveToolMetadata[]): string {
  return `Read tools: ${readEntries.map(entry => getRenderedToolName(entry)).join(', ')}`;
}

function buildReadToolTableLines(readEntries: readonly EffectiveToolMetadata[]): string[] {
  const lines = [
    '| Tool | Description |',
    '|------|-------------|'
  ];

  for (const entry of readEntries) {
    lines.push(`| ${formatTableCell(getRenderedToolName(entry))} | ${formatTableCell(entry.description ?? '')} |`);
  }

  return lines;
}

function buildExplicitPlannerWriteToolContractLines(
  writeEntries: readonly EffectiveToolMetadata[]
): string[] {
  const lines: string[] = [];

  for (const entry of writeEntries) {
    if (lines.length > 0) {
      lines.push('');
    }

      lines.push(
      getRenderedToolName(entry),
      `  description: ${entry.description ?? 'No description provided.'}`,
      `  args: ${formatArgList(entry.params)}`,
      `  control_args: ${formatControlArgsCell(entry)}`,
      `  update_args: ${entry.hasUpdateArgsMetadata ? formatArgList(entry.updateArgs ?? []) : '(none)'}`,
      `  exact_payload_args: ${formatArgList(entry.exactPayloadArgs ?? [])}`,
      `  payload_args: ${formatPayloadArgsCell(entry)}`,
      `  optional_args: ${formatOptionalArgsCell(entry)}`,
      `  required_args: ${formatRequiredArgsCell(entry)}`
    );
  }

  return lines;
}

function buildTextLines(options: {
  env: Environment;
  audience: FyiToolsAudience;
  includeHelpers: FyiToolsIncludeHelpers;
  isMcpContext: boolean;
  denied: readonly string[];
  helperStatus: FyiKnownHelperStatus;
  entries: readonly EffectiveToolMetadata[];
}): string[] {
  const { env, audience, entries } = options;
  const writeEntries = resolveWriteEntries(env, entries);
  const readEntries = resolveReadEntries(env, entries);
  if (writeEntries.length === 0 && readEntries.length === 0) {
    return [];
  }

  const lines: string[] = [];

  if (writeEntries.length > 0) {
    lines.push(...buildToolSectionLines('Write tools (require authorization)', writeEntries));
  }

  if (readEntries.length > 0) {
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push(...buildToolSectionLines('Read tools', readEntries));
  }

  if (audience === 'planner') {
    lines.push('', ...buildPlannerIntentLines());
  }

  return lines;
}

function wrapToolNotesBlock(lines: readonly string[]): string | undefined {
  const normalized = lines.map(line => line.trimEnd());
  while (normalized.length > 0 && normalized[0].trim().length === 0) {
    normalized.shift();
  }
  while (normalized.length > 0 && normalized[normalized.length - 1].trim().length === 0) {
    normalized.pop();
  }

  if (normalized.length === 0) {
    return undefined;
  }

  return `<tool_notes>\n${normalized.join('\n')}\n</tool_notes>`;
}

function joinAnnotationLines(lines: readonly string[]): string | undefined {
  const normalized = lines.map(line => line.trimEnd());
  while (normalized.length > 0 && normalized[0].trim().length === 0) {
    normalized.shift();
  }
  while (normalized.length > 0 && normalized[normalized.length - 1].trim().length === 0) {
    normalized.pop();
  }

  if (normalized.length === 0) {
    return undefined;
  }

  return normalized.join('\n');
}

function buildToolDescriptionAnnotationLines(entry: EffectiveToolMetadata): string[] {
  if (entry.name === 'known') {
    return [];
  }

  const lines: string[] = [];
  const controlArgs = entry.controlArgs ?? [];
  if (controlArgs.length > 0) {
    const suffix = entry.correlateControlArgs && controlArgs.length > 1
      ? `${formatArgList(controlArgs)} (same source)`
      : formatArgList(controlArgs);
    lines.push(`[CONTROL: ${suffix}]`);
  }

  if (entry.hasUpdateArgsMetadata) {
    lines.push(`[UPDATE: ${formatArgList(entry.updateArgs ?? [])}]`);
  }

  const exactPayloadArgs = entry.exactPayloadArgs ?? [];
  if (exactPayloadArgs.length > 0) {
    lines.push(`[EXACT PAYLOAD: ${formatArgList(exactPayloadArgs)} (must appear in user task)]`);
  }

  return lines;
}

function renderText(options: {
  env: Environment;
  audience: FyiToolsAudience;
  includeHelpers: FyiToolsIncludeHelpers;
  isMcpContext: boolean;
  denied: readonly string[];
  helperStatus: FyiKnownHelperStatus;
  entries: readonly EffectiveToolMetadata[];
}): string {
  return buildTextLines(options).join('\n').trim();
}

function buildJsonToolEntry(
  env: Environment,
  entry: EffectiveToolMetadata,
  helperStatus: FyiKnownHelperStatus,
  includeOperationLabels: boolean
): JsonToolDocEntry {
  const controlArgs = entry.controlArgs ?? [];
  const updateArgs = entry.updateArgs ?? [];
  const exactPayloadArgs = entry.exactPayloadArgs ?? [];
  const reservedArgs = new Set([...controlArgs, ...updateArgs, ...exactPayloadArgs]);
  const dataArgs = entry.params.filter(param => !reservedArgs.has(param));
  return {
    name: entry.name,
    kind: isWriteToolMetadata(env, entry) ? 'write' : 'read',
    ...(entry.description ? { description: entry.description } : {}),
    params: [...entry.params],
    controlArgs: [...controlArgs],
    updateArgs: [...updateArgs],
    exactPayloadArgs: [...exactPayloadArgs],
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
  rawOptions?: unknown,
  renderContext?: FyiToolsRenderContext
): Promise<StructuredValue<string | ReturnType<typeof renderJson>>> {
  const { toolsArg, options: rawResolvedOptions } = await normalizeArgs(rawToolsOrOptions, rawOptions, env);
  const options = normalizeOptions(rawResolvedOptions, env);
  const context = normalizeRenderContext(renderContext);
  const entries = dedupeToolMetadata(await resolveToolMetadataInput(toolsArg, env));
  const helperStatus = resolveKnownHelperStatus(env, entries);
  const denied = resolveDeniedToolNames(env, entries);

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
      isMcpContext: context.isMcpContext,
      denied,
      helperStatus,
      entries
    }),
    'text'
  );
}

export function renderInjectedToolNotes(options: {
  env: Environment;
  entries: readonly EffectiveToolMetadata[];
  audience?: FyiToolsAudience;
  includeHelpers?: FyiToolsIncludeHelpers;
  isMcpContext?: boolean;
}): string | undefined {
  const entries = dedupeToolMetadata(options.entries);
  const audience = normalizeAudience(options.audience, options.env);
  const includeHelpers = normalizeIncludeHelpers(options.includeHelpers);
  const context = normalizeRenderContext({ isMcpContext: options.isMcpContext });
  const helperStatus = resolveKnownHelperStatus(options.env, entries);
  const denied = resolveDeniedToolNames(options.env, entries);
  const lines = buildTextLines({
    env: options.env,
    audience,
    includeHelpers,
    isMcpContext: context.isMcpContext,
    denied,
    helperStatus,
    entries
  });
  return wrapToolNotesBlock(lines);
}

export function renderToolDescriptionNotes(options: {
  env: Environment;
  entry: EffectiveToolMetadata;
  audience?: FyiToolsAudience;
  includeHelpers?: FyiToolsIncludeHelpers;
}): string | undefined {
  void options.env;
  void options.audience;
  void options.includeHelpers;
  return joinAnnotationLines(buildToolDescriptionAnnotationLines(options.entry));
}

export function appendToolNotesToSystemPrompt(
  systemPrompt: unknown,
  toolNotes: string | undefined
): string | undefined {
  if (!toolNotes) {
    return typeof systemPrompt === 'string' ? systemPrompt : undefined;
  }

  const base = typeof systemPrompt === 'string' ? systemPrompt.trimEnd() : '';
  if (base.length === 0) {
    return toolNotes;
  }

  return `${base}\n\n${toolNotes}`;
}
