import { mlldNameToMCPName } from '@core/mcp/names';
import type { RecordDefinition } from '@core/types/record';
import type { ToolCollection } from '@core/types/tools';
import type { Environment } from '@interpreter/env/Environment';
import { describeRecordProjectionFields } from '@interpreter/eval/records/display-projection';
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
import { isExecutableVariable, type ExecutableVariable } from '@core/types/variable';

type FyiToolsFormat = 'text' | 'json';
type FyiToolsIncludeHelpers = 'auto' | 'none' | 'all';

type FyiToolsOptions = {
  format?: FyiToolsFormat;
  includeHelpers?: FyiToolsIncludeHelpers;
  includeOperationLabels?: boolean;
  includeAuthIntentShape?: boolean;
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
  sourceArgs: string[];
  dataArgs: string[];
  multiControlArgCorrelation: boolean;
  discoveryCall?: string;
  operationLabels?: string[];
  output?: Array<{
    field: string;
    classification: 'fact' | 'data';
    shape: 'value' | 'value+handle' | 'preview+handle' | 'handle';
  }>;
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
          sourceArgs: normalizeToolCollectionStringList(entry.sourceArgs),
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

  const allowed = new Set([
    'format',
    'includeHelpers',
    'includeOperationLabels',
    'includeAuthIntentShape'
  ]);
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

function normalizeFormat(value: unknown): FyiToolsFormat {
  return value === 'json' ? 'json' : 'text';
}

function normalizeIncludeHelpers(value: unknown): FyiToolsIncludeHelpers {
  return value === 'none' || value === 'all' ? value : 'auto';
}

function normalizeOptions(raw: FyiToolsOptions) {
  return {
    format: normalizeFormat(raw.format),
    includeHelpers: normalizeIncludeHelpers(raw.includeHelpers),
    includeOperationLabels: raw.includeOperationLabels === true,
    includeAuthIntentShape: raw.includeAuthIntentShape === true
  };
}

function cloneToolMetadata(metadata: EffectiveToolMetadata): EffectiveToolMetadata {
  const params = Array.isArray(metadata.params) ? [...metadata.params] : [];
  const paramEntries = Array.isArray(metadata.paramEntries)
    ? metadata.paramEntries.map(entry => ({ ...entry }))
    : [];
  const labels = Array.isArray(metadata.labels) ? [...metadata.labels] : [];
  return {
    ...metadata,
    ...(metadata.displayName ? { displayName: metadata.displayName } : {}),
    params,
    paramEntries,
    ...(metadata.optionalParams ? { optionalParams: [...metadata.optionalParams] } : {}),
    labels,
    ...(metadata.description ? { description: metadata.description } : {}),
    ...(metadata.controlArgs ? { controlArgs: [...metadata.controlArgs] } : {}),
    hasControlArgsMetadata: metadata.hasControlArgsMetadata,
    ...(metadata.updateArgs ? { updateArgs: [...metadata.updateArgs] } : {}),
    hasUpdateArgsMetadata: metadata.hasUpdateArgsMetadata,
    ...(metadata.exactPayloadArgs ? { exactPayloadArgs: [...metadata.exactPayloadArgs] } : {}),
    ...(metadata.sourceArgs ? { sourceArgs: [...metadata.sourceArgs] } : {}),
    hasSourceArgsMetadata: metadata.hasSourceArgsMetadata,
    ...(metadata.outputRecord ? { outputRecord: metadata.outputRecord } : {}),
    ...(metadata.embeddedRecordDefinitions
      ? { embeddedRecordDefinitions: { ...metadata.embeddedRecordDefinitions } }
      : {})
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
    hasSourceArgsMetadata: false,
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

    if (isVariable(entry) && isExecutableVariable(entry)) {
      const executable = entry as ExecutableVariable;
      resolved.push(
        resolveEffectiveToolMetadata({
          env,
          executable,
          operationName: mlldNameToMCPName(executable.name)
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

  if (isVariable(unwrapped) && isExecutableVariable(unwrapped)) {
    const executable = unwrapped as ExecutableVariable;
    return [
      resolveEffectiveToolMetadata({
        env,
        executable,
        operationName: mlldNameToMCPName(executable.name)
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

function resolveToolOutputRecordDefinition(
  entry: EffectiveToolMetadata,
  env: Environment
): RecordDefinition | undefined {
  const outputRecord = entry.outputRecord;
  if (!outputRecord) {
    return undefined;
  }

  if (typeof outputRecord === 'string') {
    return env.getRecordDefinition(outputRecord) ?? entry.embeddedRecordDefinitions?.[outputRecord];
  }

  return undefined;
}

function buildToolOutputDescriptors(
  entry: EffectiveToolMetadata,
  env: Environment
): Array<{
  field: string;
  classification: 'fact' | 'data';
  shape: 'value' | 'value+handle' | 'preview+handle' | 'handle';
}> {
  const definition = resolveToolOutputRecordDefinition(entry, env);
  if (!definition) {
    return [];
  }

  return describeRecordProjectionFields(definition, env).map(field => ({
    field: field.field,
    classification: field.classification,
    shape: field.shape
  }));
}

function formatOutputShape(shape: 'value' | 'value+handle' | 'preview+handle' | 'handle'): string {
  switch (shape) {
    case 'value+handle':
      return 'value + handle';
    case 'preview+handle':
      return 'preview + handle';
    default:
      return shape;
  }
}

function formatArgList(args: readonly string[]): string {
  return args.length > 0 ? args.join(', ') : '(none)';
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

function buildAuthIntentShapeLines(): string[] {
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
  if ((entry.sourceArgs ?? []).includes(param.name)) {
    annotations.push('**source arg**');
  }
  return `- \`${param.name}\` (${annotations.join(', ')})`;
}

function buildToolSectionLines(
  env: Environment,
  heading: string,
  entries: readonly EffectiveToolMetadata[]
): string[] {
  return [`${heading}:`, '', ...buildToolEntryLines(env, entries)];
}

function buildToolEntryLines(
  env: Environment,
  entries: readonly EffectiveToolMetadata[]
): string[] {
  const lines: string[] = [];

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

    const outputDescriptors = buildToolOutputDescriptors(entry, env);
    if (outputDescriptors.length > 0) {
      lines.push('Returns:');
      for (const output of outputDescriptors) {
        lines.push(`- \`${output.field}\` (${formatOutputShape(output.shape)}, ${output.classification})`);
      }
    }
  }

  return lines;
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

function buildTextLines(options: {
  env: Environment;
  entries: readonly EffectiveToolMetadata[];
  includeAuthIntentShape: boolean;
}): string[] {
  const { env, entries, includeAuthIntentShape } = options;
  const writeEntries = resolveWriteEntries(env, entries);
  const readEntries = resolveReadEntries(env, entries);
  if (writeEntries.length === 0 && readEntries.length === 0) {
    return [];
  }

  const lines: string[] = [];

  if (writeEntries.length > 0) {
    lines.push(...buildToolSectionLines(env, 'Write tools (require authorization)', writeEntries));
  }

  if (readEntries.length > 0) {
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push(...buildToolSectionLines(env, 'Read tools', readEntries));
  }

  if (includeAuthIntentShape) {
    lines.push('', ...buildAuthIntentShapeLines());
  }

  return lines;
}

function buildAuthorizationTextLines(options: {
  env: Environment;
  entries: readonly EffectiveToolMetadata[];
}): string[] {
  const entries = options.entries.filter(entry => entry.name !== 'known');
  if (entries.length === 0) {
    return [];
  }

  return [
    'Tools you can authorize workers to use (you cannot call these directly):',
    'See <tool_notes> for tools you can call directly.',
    '',
    ...buildToolEntryLines(options.env, entries),
    '',
    'To authorize, pass authorization intent to your worker tool:',
    '  { resolved: { tool_name: { control_arg: handle } } }'
  ];
}

function wrapNotesBlock(tagName: string, lines: readonly string[]): string | undefined {
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

  return `<${tagName}>\n${normalized.join('\n')}\n</${tagName}>`;
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

function buildToolDescriptionAnnotationLines(
  env: Environment,
  entry: EffectiveToolMetadata
): string[] {
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

  const sourceArgs = entry.sourceArgs ?? [];
  if (sourceArgs.length > 0) {
    lines.push(`[SOURCE: ${formatArgList(sourceArgs)}]`);
  }

  const exactPayloadArgs = entry.exactPayloadArgs ?? [];
  if (exactPayloadArgs.length > 0) {
    lines.push(`[EXACT PAYLOAD: ${formatArgList(exactPayloadArgs)} (must appear in user task)]`);
  }

  const outputDescriptors = buildToolOutputDescriptors(entry, env);
  if (outputDescriptors.length > 0) {
    lines.push(
      `[OUTPUT: ${outputDescriptors.map(output => `${output.field}=${formatOutputShape(output.shape)}`).join(', ')}]`
    );
  }

  return lines;
}

function renderText(options: {
  env: Environment;
  entries: readonly EffectiveToolMetadata[];
  includeAuthIntentShape: boolean;
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
  const sourceArgs = entry.sourceArgs ?? [];
  const reservedArgs = new Set([...controlArgs, ...updateArgs, ...exactPayloadArgs, ...sourceArgs]);
  const dataArgs = entry.params.filter(param => !reservedArgs.has(param));
  return {
    name: entry.name,
    kind: isWriteToolMetadata(env, entry) ? 'write' : 'read',
    ...(entry.description ? { description: entry.description } : {}),
    params: [...entry.params],
    controlArgs: [...controlArgs],
    updateArgs: [...updateArgs],
    exactPayloadArgs: [...exactPayloadArgs],
    sourceArgs: [...sourceArgs],
    dataArgs,
    multiControlArgCorrelation: entry.correlateControlArgs && controlArgs.length > 1,
    ...(helperStatus.available && (controlArgs.length > 0 || sourceArgs.length > 0)
      ? { discoveryCall: `@fyi.known("${entry.name}")` }
      : {}),
    ...(includeOperationLabels ? { operationLabels: [...entry.labels] } : {}),
    ...(buildToolOutputDescriptors(entry, env).length > 0
      ? { output: buildToolOutputDescriptors(entry, env) }
      : {})
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
  const options = normalizeOptions(rawResolvedOptions);
  void renderContext;
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
      entries,
      includeAuthIntentShape: options.includeAuthIntentShape
    }),
    'text'
  );
}

export function renderInjectedToolNotes(options: {
  env: Environment;
  entries: readonly EffectiveToolMetadata[];
  includeHelpers?: FyiToolsIncludeHelpers;
  isMcpContext?: boolean;
  includeAuthIntentShape?: boolean;
}): string | undefined {
  void options.includeHelpers;
  void options.isMcpContext;
  const entries = dedupeToolMetadata(options.entries);
  const lines = buildTextLines({
    env: options.env,
    entries,
    includeAuthIntentShape: options.includeAuthIntentShape === true
  });
  return wrapNotesBlock('tool_notes', lines);
}

export function renderInjectedAuthorizationNotes(options: {
  env: Environment;
  entries: readonly EffectiveToolMetadata[];
}): string | undefined {
  const entries = dedupeToolMetadata(options.entries);
  return wrapNotesBlock(
    'authorization_notes',
    buildAuthorizationTextLines({
      env: options.env,
      entries
    })
  );
}

export function renderToolDescriptionNotes(options: {
  env: Environment;
  entry: EffectiveToolMetadata;
  includeHelpers?: FyiToolsIncludeHelpers;
}): string | undefined {
  void options.includeHelpers;
  return joinAnnotationLines(buildToolDescriptionAnnotationLines(options.env, options.entry));
}

export function appendToolNotesToSystemPrompt(
  systemPrompt: unknown,
  toolNotes: string | undefined
): string | undefined {
  return appendInjectedNotesToSystemPrompt(systemPrompt, toolNotes);
}

export function appendInjectedNotesToSystemPrompt(
  systemPrompt: unknown,
  notesBlock: string | undefined
): string | undefined {
  if (!notesBlock) {
    return typeof systemPrompt === 'string' ? systemPrompt : undefined;
  }

  const base = typeof systemPrompt === 'string' ? systemPrompt.trimEnd() : '';
  if (base.length === 0) {
    return notesBlock;
  }

  return `${base}\n\n${notesBlock}`;
}
