import { mlldNameToMCPName } from '@core/mcp/names';
import type { RecordDefinition, RecordPolicySetTarget } from '@core/types/record';
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
import {
  isExecutableVariable,
  isRecordVariable,
  type ExecutableVariable
} from '@core/types/variable';

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
  instructions?: string;
  inputRecord?: string;
  params: string[];
  controlArgs: string[];
  updateArgs: string[];
  exactPayloadArgs: string[];
  sourceArgs: string[];
  dataArgs: string[];
  factArgs?: string[];
  trustedDataArgs?: string[];
  untrustedDataArgs?: string[];
  inputPolicy?: {
    exact?: string[];
    update?: string[];
    allowlist?: Record<string, RecordPolicySetTarget>;
    blocklist?: Record<string, RecordPolicySetTarget>;
    optionalBenign?: string[];
  };
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

function normalizeToolCollectionExecutableRef(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  }

  if (value && typeof value === 'object' && isExecutableVariable(value as any)) {
    const name = value.name?.trim();
    if (!name) {
      return undefined;
    }
    return name.startsWith('@') ? name.slice(1) : name;
  }

  if (isPlainObject(value) && (value as { __executable?: unknown }).__executable === true) {
    const name = typeof (value as { name?: unknown }).name === 'string'
      ? (value as { name: string }).name.trim()
      : '';
    if (!name) {
      return undefined;
    }
    return name.startsWith('@') ? name.slice(1) : name;
  }

  return undefined;
}

function normalizeToolCollectionRecordRef(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  }

  if (value && typeof value === 'object' && isRecordVariable(value as any)) {
    const name = typeof (value as { name?: unknown }).name === 'string'
      ? (value as { name: string }).name.trim()
      : '';
    if (!name) {
      return undefined;
    }
    return name.startsWith('@') ? name.slice(1) : name;
  }

  if (isPlainObject(value) && typeof (value as { name?: unknown }).name === 'string') {
    const name = (value as { name: string }).name.trim();
    if (!name) {
      return undefined;
    }
    return name.startsWith('@') ? name.slice(1) : name;
  }

  return undefined;
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
          ...(normalizeToolCollectionExecutableRef(entry.mlld)
            ? { mlld: normalizeToolCollectionExecutableRef(entry.mlld) }
            : {}),
          ...(normalizeToolCollectionRecordRef(entry.inputs)
            ? { inputs: normalizeToolCollectionRecordRef(entry.inputs) }
            : {}),
          ...(normalizeToolCollectionRecordRef(entry.returns)
            ? { returns: normalizeToolCollectionRecordRef(entry.returns) }
            : {}),
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
          ...(typeof entry.instructions === 'string' && entry.instructions.trim().length > 0
            ? { instructions: entry.instructions.trim() }
            : {}),
          ...(normalizeToolCollectionAuthorizable(entry.can_authorize ?? entry.authorizable) !== undefined
            ? { can_authorize: normalizeToolCollectionAuthorizable(entry.can_authorize ?? entry.authorizable) }
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
    ...(metadata.instructions ? { instructions: metadata.instructions } : {}),
    ...(metadata.can_authorize !== undefined
      ? {
          can_authorize: Array.isArray(metadata.can_authorize)
            ? [...metadata.can_authorize]
            : metadata.can_authorize
        }
      : {}),
    ...(metadata.inputSchema ? { inputSchema: { ...metadata.inputSchema, fields: metadata.inputSchema.fields.map(field => ({ ...field })) } } : {}),
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
    const normalizedName = outputRecord.startsWith('@') ? outputRecord.slice(1) : outputRecord;
    return env.getRecordDefinition(normalizedName) ?? entry.embeddedRecordDefinitions?.[normalizedName];
  }

  if (outputRecord && typeof outputRecord === 'object' && isRecordVariable(outputRecord as any)) {
    return (outputRecord as { value: RecordDefinition }).value;
  }

  if (isPlainObject(outputRecord) && Array.isArray((outputRecord as { fields?: unknown }).fields)) {
    return outputRecord as RecordDefinition;
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

type ToolDocInputField = NonNullable<EffectiveToolMetadata['inputSchema']>['fields'][number];
type ToolDocFieldReference = {
  param: EffectiveToolParam;
  field?: ToolDocInputField;
};

const LABEL_TOKEN_ALIASES: Record<string, string> = {
  comm: 'communication'
};

function humanizeLabelToken(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }
  return LABEL_TOKEN_ALIASES[trimmed] ?? trimmed.replace(/_/g, ' ');
}

function buildToolLabelSummaryLines(entry: EffectiveToolMetadata): string[] {
  const routing: string[] = [];
  const risk: string[] = [];
  const domain: string[] = [];
  const other: string[] = [];
  const routingLabels = new Set(['resolve', 'extract', 'execute', 'compose', 'advice']);
  const riskLabels = new Set(['exfil', 'destructive', 'privileged']);

  for (const label of entry.labels) {
    const trimmed = label.trim();
    if (!trimmed || trimmed.startsWith('role:') || trimmed === 'tool:r' || trimmed === 'tool:w' || trimmed === 'llm') {
      continue;
    }

    const segments = trimmed.split(':');
    if (segments.length === 2 && (segments[1] === 'r' || segments[1] === 'w')) {
      const rendered = `${humanizeLabelToken(segments[0])} (${segments[1] === 'r' ? 'read' : 'write'})`;
      if (routingLabels.has(segments[0])) {
        routing.push(rendered);
      } else {
        domain.push(rendered);
      }
      continue;
    }

    if (riskLabels.has(segments[0])) {
      risk.push(
        segments.length > 1
          ? `${humanizeLabelToken(segments[0])} (${segments.slice(1).map(humanizeLabelToken).join(':')})`
          : humanizeLabelToken(segments[0])
      );
      continue;
    }

    other.push(trimmed);
  }

  const lines: string[] = [];
  if (routing.length > 0) {
    lines.push(`Routing: ${routing.join(', ')}`);
  }
  if (risk.length > 0) {
    lines.push(`Risk: ${risk.join(', ')}`);
  }
  if (domain.length > 0) {
    lines.push(`Domain: ${domain.join(', ')}`);
  }
  if (other.length > 0) {
    lines.push(`Labels: ${other.join(', ')}`);
  }
  return lines;
}

function buildToolFieldLine(
  param: EffectiveToolParam,
  extraAnnotations: readonly string[] = []
): string {
  const annotations = [param.type ?? 'string'];
  if (param.optional) {
    annotations.push('optional');
  }
  annotations.push(...extraAnnotations);
  return `- \`${param.name}\` (${annotations.join(', ')})`;
}

function buildLegacyToolArgLine(
  entry: EffectiveToolMetadata,
  param: EffectiveToolParam
): string {
  const annotations: string[] = [];
  if ((entry.controlArgs ?? []).includes(param.name)) {
    annotations.push('**control arg**');
  }
  if ((entry.sourceArgs ?? []).includes(param.name)) {
    annotations.push('**source arg**');
  }
  return buildToolFieldLine(param, annotations);
}

function buildToolFieldReferences(
  entry: EffectiveToolMetadata,
  predicate: (field: ToolDocInputField) => boolean
): ToolDocFieldReference[] {
  if (!entry.inputSchema) {
    return [];
  }

  const paramEntries = new Map(
    getRenderedToolParamEntries(entry).map(param => [param.name, param] as const)
  );

  return entry.inputSchema.fields
    .filter(predicate)
    .map(field => {
      const baseParam = paramEntries.get(field.name);
      return {
        param: {
          name: field.name,
          type: field.valueType ?? baseParam?.type,
          optional: field.optional === true || baseParam?.optional === true
        },
        field
      };
    });
}

function buildFieldSummary(fields: readonly ToolDocFieldReference[]): string {
  return fields
    .map(({ param }) => {
      const typeSuffix =
        param.type && param.type !== 'string'
          ? `: ${param.type}`
          : '';
      return `${param.name}${param.optional ? '?' : ''}${typeSuffix}`;
    })
    .join(', ');
}

function buildToolFieldSectionLines(
  heading: string,
  fields: readonly ToolDocFieldReference[]
): string[] {
  if (fields.length === 0) {
    return [];
  }

  return [heading + ':', ...fields.map(field => buildToolFieldLine(field.param))];
}

function formatPolicyTarget(target: RecordPolicySetTarget): string {
  if (target.kind === 'reference') {
    return `@${target.name}`;
  }
  return JSON.stringify(target.values);
}

function buildToolPolicyTargetSectionLines(
  heading: string,
  targets: Readonly<Record<string, RecordPolicySetTarget>>
): string[] {
  const entries = Object.entries(targets);
  if (entries.length === 0) {
    return [];
  }

  return [
    `${heading}:`,
    ...entries.map(([fieldName, target]) => `- \`${fieldName}\` -> ${formatPolicyTarget(target)}`)
  ];
}

function buildInputSchemaSectionLines(entry: EffectiveToolMetadata): string[] {
  if (!entry.inputSchema) {
    return [];
  }

  const facts = buildToolFieldReferences(entry, field => field.classification === 'fact');
  const trustedData = buildToolFieldReferences(
    entry,
    field => field.classification === 'data' && field.dataTrust === 'trusted'
  );
  const untrustedData = buildToolFieldReferences(
    entry,
    field => field.classification === 'data' && field.dataTrust === 'untrusted'
  );
  const payload = buildToolFieldReferences(
    entry,
    field => field.classification === 'data' && field.dataTrust === undefined
  );
  const updateNames = new Set(entry.updateArgs ?? []);
  const exactNames = new Set(entry.exactPayloadArgs ?? []);
  const updates = buildToolFieldReferences(entry, field => updateNames.has(field.name));
  const exact = buildToolFieldReferences(entry, field => exactNames.has(field.name));
  const optionalBenign = buildToolFieldReferences(
    entry,
    field => entry.inputSchema?.optionalBenignFields.includes(field.name) === true
  );

  return [
    ...buildToolFieldSectionLines('Facts', facts),
    ...buildToolFieldSectionLines('Trusted payload', trustedData),
    ...buildToolFieldSectionLines('Untrusted payload', untrustedData),
    ...buildToolFieldSectionLines('Payload', payload),
    ...buildToolFieldSectionLines('Update', updates),
    ...buildToolFieldSectionLines('Exact', exact),
    ...buildToolPolicyTargetSectionLines('Allowlist', entry.inputSchema.allowlist),
    ...buildToolPolicyTargetSectionLines('Blocklist', entry.inputSchema.blocklist),
    ...buildToolFieldSectionLines('Optional benign', optionalBenign)
  ];
}

function buildToolSectionLines(
  env: Environment,
  heading: string,
  entries: readonly EffectiveToolMetadata[],
  options?: {
    includeDescriptions?: boolean;
    includeInstructions?: boolean;
  }
): string[] {
  return [`${heading}:`, '', ...buildToolEntryLines(env, entries, options)];
}

function buildToolEntryLines(
  env: Environment,
  entries: readonly EffectiveToolMetadata[],
  options?: {
    includeDescriptions?: boolean;
    includeInstructions?: boolean;
  }
): string[] {
  const includeDescriptions = options?.includeDescriptions !== false;
  const includeInstructions = options?.includeInstructions !== false;
  const lines: string[] = [];

  for (const [index, entry] of entries.entries()) {
    if (index > 0) {
      lines.push('');
    }

    lines.push(`### ${getRenderedToolName(entry)}`);
    lines.push(...buildToolLabelSummaryLines(entry));
    if (includeDescriptions && entry.description) {
      lines.push(`Description: ${entry.description}`);
    }
    if (includeInstructions && entry.instructions) {
      lines.push(`Instructions: ${entry.instructions}`);
    }

    const inputSchemaLines = buildInputSchemaSectionLines(entry);
    if (inputSchemaLines.length > 0) {
      lines.push(...inputSchemaLines);
    } else {
      lines.push('Args:');
      const params = getRenderedToolParamEntries(entry);
      if (params.length === 0) {
        lines.push('- (none)');
        continue;
      }

      for (const param of params) {
        lines.push(buildLegacyToolArgLine(entry, param));
      }
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
  includeDescriptions?: boolean;
  includeInstructions?: boolean;
}): string[] {
  const {
    env,
    entries,
    includeAuthIntentShape,
    includeDescriptions,
    includeInstructions
  } = options;
  const writeEntries = resolveWriteEntries(env, entries);
  const readEntries = resolveReadEntries(env, entries);
  if (writeEntries.length === 0 && readEntries.length === 0) {
    return [];
  }

  const lines: string[] = [];

  if (writeEntries.length > 0) {
    lines.push(
      ...buildToolSectionLines(env, 'Write tools (require authorization)', writeEntries, {
        includeDescriptions,
        includeInstructions
      })
    );
  }

  if (readEntries.length > 0) {
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push(
      ...buildToolSectionLines(env, 'Read tools', readEntries, {
        includeDescriptions,
        includeInstructions
      })
    );
  }

  if (includeAuthIntentShape) {
    lines.push('', ...buildAuthIntentShapeLines());
  }

  return lines;
}

function buildAuthorizationTextLines(options: {
  env: Environment;
  entries: readonly EffectiveToolMetadata[];
  includeDescriptions?: boolean;
  includeInstructions?: boolean;
}): string[] {
  const entries = options.entries.filter(entry => entry.name !== 'known');
  if (entries.length === 0) {
    return [];
  }

  return [
    'Tools you can authorize workers to use (you cannot call these directly):',
    'See <tool_notes> for tools you can call directly.',
    '',
    ...buildToolEntryLines(options.env, entries, {
      includeDescriptions: options.includeDescriptions,
      includeInstructions: options.includeInstructions
    }),
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

  const lines = buildToolLabelSummaryLines(entry).map(line => `[${line}]`);

  if (entry.instructions) {
    lines.push(`Instructions: ${entry.instructions}`);
  }

  if (entry.inputSchema) {
    const facts = buildToolFieldReferences(entry, field => field.classification === 'fact');
    const trustedData = buildToolFieldReferences(
      entry,
      field => field.classification === 'data' && field.dataTrust === 'trusted'
    );
    const untrustedData = buildToolFieldReferences(
      entry,
      field => field.classification === 'data' && field.dataTrust === 'untrusted'
    );
    const payload = buildToolFieldReferences(
      entry,
      field => field.classification === 'data' && field.dataTrust === undefined
    );
    const updateNames = new Set(entry.updateArgs ?? []);
    const exactNames = new Set(entry.exactPayloadArgs ?? []);
    const updates = buildToolFieldReferences(entry, field => updateNames.has(field.name));
    const exact = buildToolFieldReferences(entry, field => exactNames.has(field.name));

    if (facts.length > 0) {
      const suffix =
        entry.correlateControlArgs && facts.length > 1
          ? `${buildFieldSummary(facts)} (same source)`
          : buildFieldSummary(facts);
      lines.push(`[FACTS: ${suffix}]`);
    }
    if (trustedData.length > 0) {
      lines.push(`[TRUSTED PAYLOAD: ${buildFieldSummary(trustedData)}]`);
    }
    if (untrustedData.length > 0) {
      lines.push(`[UNTRUSTED PAYLOAD: ${buildFieldSummary(untrustedData)}]`);
    }
    if (payload.length > 0) {
      lines.push(`[PAYLOAD: ${buildFieldSummary(payload)}]`);
    }
    if (updates.length > 0) {
      lines.push(`[UPDATE: ${buildFieldSummary(updates)}]`);
    }
    if (exact.length > 0) {
      lines.push(`[EXACT: ${buildFieldSummary(exact)}]`);
    }
    if (Object.keys(entry.inputSchema.allowlist).length > 0) {
      lines.push(
        `[ALLOWLIST: ${Object.entries(entry.inputSchema.allowlist)
          .map(([fieldName, target]) => `${fieldName} in ${formatPolicyTarget(target)}`)
          .join(', ')}]`
      );
    }
    if (Object.keys(entry.inputSchema.blocklist).length > 0) {
      lines.push(
        `[BLOCKLIST: ${Object.entries(entry.inputSchema.blocklist)
          .map(([fieldName, target]) => `${fieldName} not in ${formatPolicyTarget(target)}`)
          .join(', ')}]`
      );
    }
    if (entry.inputSchema.optionalBenignFields.length > 0) {
      lines.push(`[OPTIONAL BENIGN: ${formatArgList(entry.inputSchema.optionalBenignFields)}]`);
    }
  } else {
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
  const factArgs = entry.inputSchema ? [...entry.inputSchema.factFields] : undefined;
  const trustedDataArgs = entry.inputSchema
    ? entry.inputSchema.fields
        .filter(field => field.classification === 'data' && field.dataTrust === 'trusted')
        .map(field => field.name)
    : undefined;
  const untrustedDataArgs = entry.inputSchema
    ? entry.inputSchema.fields
        .filter(field => field.classification === 'data' && field.dataTrust === 'untrusted')
        .map(field => field.name)
    : undefined;
  const dataArgs = entry.inputSchema
    ? [...entry.inputSchema.dataFields]
    : entry.params.filter(param => !new Set([...controlArgs, ...updateArgs, ...exactPayloadArgs, ...sourceArgs]).has(param));
  return {
    name: entry.name,
    kind: isWriteToolMetadata(env, entry) ? 'write' : 'read',
    ...(entry.description ? { description: entry.description } : {}),
    ...(entry.instructions ? { instructions: entry.instructions } : {}),
    ...(entry.inputSchema ? { inputRecord: entry.inputSchema.recordName } : {}),
    params: [...entry.params],
    controlArgs: [...controlArgs],
    updateArgs: [...updateArgs],
    exactPayloadArgs: [...exactPayloadArgs],
    sourceArgs: [...sourceArgs],
    dataArgs,
    ...(factArgs ? { factArgs } : {}),
    ...(trustedDataArgs && trustedDataArgs.length > 0 ? { trustedDataArgs } : {}),
    ...(untrustedDataArgs && untrustedDataArgs.length > 0 ? { untrustedDataArgs } : {}),
    ...(entry.inputSchema
      && (
        entry.inputSchema.exactFields.length > 0
        || entry.inputSchema.updateFields.length > 0
        || Object.keys(entry.inputSchema.allowlist).length > 0
        || Object.keys(entry.inputSchema.blocklist).length > 0
        || entry.inputSchema.optionalBenignFields.length > 0
      )
      ? {
          inputPolicy: {
            ...(entry.inputSchema.exactFields.length > 0
              ? { exact: [...entry.inputSchema.exactFields] }
              : {}),
            ...(entry.inputSchema.updateFields.length > 0
              ? { update: [...entry.inputSchema.updateFields] }
              : {}),
            ...(Object.keys(entry.inputSchema.allowlist).length > 0
              ? { allowlist: { ...entry.inputSchema.allowlist } }
              : {}),
            ...(Object.keys(entry.inputSchema.blocklist).length > 0
              ? { blocklist: { ...entry.inputSchema.blocklist } }
              : {}),
            ...(entry.inputSchema.optionalBenignFields.length > 0
              ? { optionalBenign: [...entry.inputSchema.optionalBenignFields] }
              : {})
          }
        }
      : {}),
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
      includeAuthIntentShape: options.includeAuthIntentShape,
      includeDescriptions: true,
      includeInstructions: true
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
    includeAuthIntentShape: options.includeAuthIntentShape === true,
    includeDescriptions: false,
    includeInstructions: false
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
      entries,
      includeDescriptions: false,
      includeInstructions: false
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
