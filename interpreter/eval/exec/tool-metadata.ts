import { mcpNameToMlldName } from '@core/mcp/names';
import { expandOperationLabels } from '@core/policy/label-flow';
import type { AuthorizationToolContext } from '@core/policy/authorizations';
import {
  resolveRecordFactCorrelation,
  type RecordDefinition
} from '@core/types/record';
import {
  cloneToolInputSchema,
  getToolCollectionAuthorizationContext,
  type ToolAuthorizableValue,
  type ToolInputSchema,
  type ToolAuthorizationContextEntry,
  type ToolCollection,
  type ToolCollectionAuthorizationContext,
  type ToolDefinition
} from '@core/types/tools';
import type { ExecutableOutputRecord } from '@core/types/executable';
import { isExecutableVariable, type ExecutableVariable } from '@core/types/variable';
import type { Environment } from '@interpreter/env/Environment';
import { resolveDirectToolCollection } from '@interpreter/eval/var/tool-scope';

export interface EffectiveToolMetadata {
  name: string;
  displayName?: string;
  params: string[];
  paramEntries: EffectiveToolParam[];
  optionalParams?: string[];
  labels: string[];
  description?: string;
  instructions?: string;
  authorizable?: ToolAuthorizableValue;
  inputSchema?: ToolInputSchema;
  controlArgs?: string[];
  hasControlArgsMetadata: boolean;
  updateArgs?: string[];
  hasUpdateArgsMetadata: boolean;
  exactPayloadArgs?: string[];
  sourceArgs?: string[];
  hasSourceArgsMetadata: boolean;
  correlateControlArgs: boolean;
  taintFacts: boolean;
  outputRecord?: ExecutableOutputRecord;
  embeddedRecordDefinitions?: Record<string, RecordDefinition>;
}

export interface EffectiveToolParam {
  name: string;
  type?: string;
  optional?: boolean;
}

function normalizeStringList(values: readonly unknown[] | undefined): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalized: string[] = [];
  for (const entry of values) {
    if (typeof entry !== 'string') {
      continue;
    }
    const trimmed = entry.trim();
    if (trimmed && !normalized.includes(trimmed)) {
      normalized.push(trimmed);
    }
  }
  return normalized;
}

function normalizeTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function mergeStringLists(...lists: Array<readonly unknown[] | undefined>): string[] {
  const merged: string[] = [];
  for (const list of lists) {
    for (const entry of normalizeStringList(list)) {
      if (!merged.includes(entry)) {
        merged.push(entry);
      }
    }
  }
  return merged;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function resolveExecutableVariable(
  env: Environment,
  name: string
): ExecutableVariable | undefined {
  const variable = env.getVariable(name);
  return variable && isExecutableVariable(variable) ? variable as ExecutableVariable : undefined;
}

function resolveExecutableVariableCaseInsensitive(
  env: Environment,
  name: string
): ExecutableVariable | undefined {
  const direct = resolveExecutableVariable(env, name);
  if (direct) {
    return direct;
  }

  const lowered = name.trim().toLowerCase();
  if (!lowered) {
    return undefined;
  }

  for (const [candidateName, variable] of env.getAllVariables()) {
    if (candidateName.trim().toLowerCase() === lowered && isExecutableVariable(variable)) {
      return variable as ExecutableVariable;
    }
  }

  return undefined;
}

function getExecutableParamNames(executable: ExecutableVariable): string[] {
  return Array.isArray(executable.paramNames)
    ? executable.paramNames.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function buildEffectiveToolParam(
  name: string,
  options?: { type?: string; optional?: boolean }
): EffectiveToolParam {
  return {
    name,
    ...(normalizeTrimmedString(options?.type) ? { type: normalizeTrimmedString(options?.type) } : {}),
    ...(options?.optional === true ? { optional: true } : {})
  };
}

function buildEffectiveToolParams(
  params: readonly string[],
  paramTypes?: Record<string, string>,
  optionalParams?: readonly string[]
): EffectiveToolParam[] {
  const optional = new Set(normalizeStringList(optionalParams));
  return params.map(name =>
    buildEffectiveToolParam(name, {
      type: paramTypes?.[name],
      optional: optional.has(name)
    })
  );
}

function buildEffectiveParamEntries(
  params: readonly string[],
  baseParamEntries: readonly EffectiveToolParam[],
  optionalParams?: readonly string[]
): EffectiveToolParam[] {
  const paramTypes = Object.fromEntries(
    baseParamEntries
      .filter(entry => typeof entry.name === 'string' && entry.name.trim().length > 0 && typeof entry.type === 'string')
      .map(entry => [entry.name, entry.type as string])
  );
  return buildEffectiveToolParams(params, paramTypes, optionalParams);
}

function normalizeExecutableMxParamEntries(value: unknown): EffectiveToolParam[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized: EffectiveToolParam[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    if (typeof entry === 'string') {
      const name = normalizeTrimmedString(entry);
      if (!name || seen.has(name)) {
        continue;
      }
      seen.add(name);
      normalized.push(buildEffectiveToolParam(name));
      continue;
    }

    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }

    const name = normalizeTrimmedString((entry as { name?: unknown }).name);
    if (!name || seen.has(name)) {
      continue;
    }

    seen.add(name);
    normalized.push(
      buildEffectiveToolParam(name, {
        type: normalizeTrimmedString((entry as { type?: unknown }).type),
        optional: (entry as { optional?: unknown }).optional === true
      })
    );
  }

  return normalized;
}

function getExecutableOptionalParamNames(executable: ExecutableVariable): string[] | undefined {
  const executableDef = executable.internal?.executableDef ?? executable.value;
  const optionalParams = (executableDef as { optionalParams?: unknown }).optionalParams;
  return Array.isArray(optionalParams) ? normalizeStringList(optionalParams) : undefined;
}

function getExecutableLabels(executable: ExecutableVariable): string[] {
  return normalizeStringList(executable.mx?.labels);
}

function getExecutableControlArgs(executable: ExecutableVariable): string[] | undefined {
  const executableDef = executable.internal?.executableDef ?? executable.value;
  const controlArgs = (executableDef as { controlArgs?: unknown }).controlArgs;
  return Array.isArray(controlArgs) ? normalizeStringList(controlArgs) : undefined;
}

function getExecutableUpdateArgs(executable: ExecutableVariable): string[] | undefined {
  const executableDef = executable.internal?.executableDef ?? executable.value;
  const updateArgs = (executableDef as { updateArgs?: unknown }).updateArgs;
  return Array.isArray(updateArgs) ? normalizeStringList(updateArgs) : undefined;
}

function getExecutableExactPayloadArgs(executable: ExecutableVariable): string[] | undefined {
  const executableDef = executable.internal?.executableDef ?? executable.value;
  const exactPayloadArgs = (executableDef as { exactPayloadArgs?: unknown }).exactPayloadArgs;
  return Array.isArray(exactPayloadArgs) ? normalizeStringList(exactPayloadArgs) : undefined;
}

function getExecutableSourceArgs(executable: ExecutableVariable): string[] | undefined {
  const executableDef = executable.internal?.executableDef ?? executable.value;
  const sourceArgs = (executableDef as { sourceArgs?: unknown }).sourceArgs;
  return Array.isArray(sourceArgs) ? normalizeStringList(sourceArgs) : undefined;
}

function getExecutableCorrelateControlArgs(executable: ExecutableVariable): boolean {
  const executableDef = executable.internal?.executableDef ?? executable.value;
  return (executableDef as { correlateControlArgs?: unknown }).correlateControlArgs === true;
}

function getExecutableDescription(executable: ExecutableVariable): string | undefined {
  return normalizeTrimmedString(
    executable.description
    ?? executable.internal?.executableDef?.description
    ?? executable.mx?.description
  );
}

function getExecutableTaintFacts(executable: ExecutableVariable): boolean {
  void executable;
  return false;
}

function getExecutableOutputRecord(executable: ExecutableVariable): ExecutableOutputRecord | undefined {
  const executableDef = executable.internal?.executableDef ?? executable.value;
  const outputRecord = (executableDef as { outputRecord?: unknown }).outputRecord;
  if (!outputRecord) {
    return undefined;
  }

  if (typeof outputRecord === 'string') {
    const normalized = normalizeTrimmedString(outputRecord);
    return normalized;
  }

  return isPlainObject(outputRecord) ? outputRecord as ExecutableOutputRecord : undefined;
}

function getEmbeddedExecutableRecordDefinitions(
  executable: ExecutableVariable
): Record<string, RecordDefinition> | undefined {
  const candidate = executable.internal?.recordDefinitions;
  if (!isPlainObject(candidate)) {
    return undefined;
  }

  const entries = Object.entries(candidate)
    .filter(([, definition]) => isPlainObject(definition))
    .map(([name, definition]) => [name, definition as RecordDefinition] as const);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function buildToolContextFromExecutable(
  name: string,
  executable: ExecutableVariable
): EffectiveToolMetadata {
  const fallbackParams = getExecutableParamNames(executable);
  const fallbackOptionalParams = getExecutableOptionalParamNames(executable)?.filter(
    param => fallbackParams.includes(param)
  );
  const executableDef = executable.internal?.executableDef ?? executable.value;
  const executableParamTypes = executable.paramTypes
    ?? (executableDef as { paramTypes?: Record<string, string> }).paramTypes;
  const paramEntries = normalizeExecutableMxParamEntries(executable.mx?.params)
    ?? buildEffectiveToolParams(
      fallbackParams,
      executableParamTypes,
      fallbackOptionalParams
    );
  const params = paramEntries.map(entry => entry.name);
  const optionalParams = paramEntries
    .filter(entry => entry.optional === true)
    .map(entry => entry.name);
  const controlArgs = getExecutableControlArgs(executable);
  const updateArgs = getExecutableUpdateArgs(executable);
  const exactPayloadArgs = getExecutableExactPayloadArgs(executable);
  const sourceArgs = getExecutableSourceArgs(executable);
  const description = getExecutableDescription(executable);
  const outputRecord = getExecutableOutputRecord(executable);
  const embeddedRecordDefinitions = getEmbeddedExecutableRecordDefinitions(executable);
  return {
    name,
    params,
    paramEntries,
    ...(optionalParams && optionalParams.length > 0 ? { optionalParams } : {}),
    labels: getExecutableLabels(executable),
    ...(description ? { description } : {}),
    ...(Array.isArray(controlArgs) ? { controlArgs } : {}),
    hasControlArgsMetadata: Array.isArray(controlArgs),
    ...(Array.isArray(updateArgs) ? { updateArgs } : {}),
    hasUpdateArgsMetadata: Array.isArray(updateArgs),
    ...(Array.isArray(exactPayloadArgs) ? { exactPayloadArgs } : {}),
    ...(Array.isArray(sourceArgs) ? { sourceArgs } : {}),
    hasSourceArgsMetadata: Array.isArray(sourceArgs),
    correlateControlArgs: getExecutableCorrelateControlArgs(executable),
    taintFacts: getExecutableTaintFacts(executable),
    ...(outputRecord ? { outputRecord } : {}),
    ...(embeddedRecordDefinitions ? { embeddedRecordDefinitions } : {})
  };
}

function getToolDefinitionBindKeys(definition?: ToolDefinition): string[] {
  if (!isPlainObject(definition?.bind)) {
    return [];
  }

  return Object.keys(definition.bind).filter(
    (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
  );
}

function getRecordDefinitionForToolInput(options: {
  env: Environment;
  definition?: ToolDefinition;
  embeddedRecordDefinitions?: Record<string, RecordDefinition>;
}): RecordDefinition | undefined {
  const inputName = normalizeTrimmedString(options.definition?.inputs);
  if (!inputName) {
    return undefined;
  }
  return options.env.getRecordDefinition(inputName)
    ?? options.embeddedRecordDefinitions?.[inputName];
}

function resolveToolInputSchema(options: {
  env: Environment;
  definition?: ToolDefinition;
  executableParams: readonly string[];
  embeddedRecordDefinitions?: Record<string, RecordDefinition>;
}): ToolInputSchema | undefined {
  const recordDefinition = getRecordDefinitionForToolInput(options);
  if (!recordDefinition) {
    return undefined;
  }

  const paramSet = new Set(options.executableParams);
  const visibleParams = options.executableParams.filter(paramName =>
    recordDefinition.fields.some(field => field.name === paramName)
  );
  const fields = recordDefinition.fields
    .filter(field => paramSet.has(field.name))
    .map(field => ({
      name: field.name,
      classification: field.classification,
      ...(field.valueType ? { valueType: field.valueType } : {}),
      optional: field.optional === true,
      ...(field.dataTrust ? { dataTrust: field.dataTrust } : {})
    }));

  return {
    recordName: recordDefinition.name,
    fields,
    factFields: fields
      .filter(field => field.classification === 'fact')
      .map(field => field.name),
    dataFields: fields
      .filter(field => field.classification === 'data')
      .map(field => field.name),
    visibleParams,
    optionalParams: fields
      .filter(field => field.optional)
      .map(field => field.name),
    correlate: resolveRecordFactCorrelation(recordDefinition),
    ...(typeof recordDefinition.correlate === 'boolean'
      ? { declaredCorrelate: recordDefinition.correlate }
      : {})
  };
}

function hasWriteSurfaceLabel(labels: readonly string[]): boolean {
  return labels.some(label => typeof label === 'string' && /(^|:)w$/i.test(label));
}

function hasReadSurfaceLabel(labels: readonly string[]): boolean {
  return labels.some(label => typeof label === 'string' && /(^|:)r$/i.test(label));
}

function buildDerivedInputMetadata(labels: readonly string[], inputSchema?: ToolInputSchema): {
  params?: string[];
  optionalParams?: string[];
  controlArgs: string[];
  hasControlArgsMetadata: boolean;
  sourceArgs: string[];
  hasSourceArgsMetadata: boolean;
  correlateControlArgs: boolean;
} {
  if (!inputSchema) {
    return {
      controlArgs: [],
      hasControlArgsMetadata: false,
      sourceArgs: [],
      hasSourceArgsMetadata: false,
      correlateControlArgs: false
    };
  }

  const factFields = normalizeStringList(inputSchema.factFields);
  const writeSurface = hasWriteSurfaceLabel(labels);
  const readSurface = hasReadSurfaceLabel(labels);
  const controlArgs = writeSurface || !readSurface ? factFields : [];
  const sourceArgs = readSurface && !writeSurface ? factFields : [];

  return {
    params: [...inputSchema.visibleParams],
    optionalParams: [...inputSchema.optionalParams],
    controlArgs,
    hasControlArgsMetadata: controlArgs.length > 0,
    sourceArgs,
    hasSourceArgsMetadata: sourceArgs.length > 0,
    correlateControlArgs: controlArgs.length > 1 && inputSchema.correlate === true
  };
}

function getEffectiveToolParams(
  baseParams: string[],
  definition?: ToolDefinition,
  inputSchema?: ToolInputSchema
): string[] {
  if (inputSchema) {
    return [...inputSchema.visibleParams];
  }
  if (!definition) {
    return baseParams;
  }

  const boundKeys = new Set(getToolDefinitionBindKeys(definition));
  return baseParams.filter(paramName => !boundKeys.has(paramName));
}

function getEffectiveToolOptionalParams(
  params: readonly string[],
  baseOptionalParams?: readonly string[],
  definition?: ToolDefinition,
  inputSchema?: ToolInputSchema
): string[] {
  if (inputSchema) {
    const visibleParams = new Set(params);
    return normalizeStringList(inputSchema.optionalParams).filter(arg => visibleParams.has(arg));
  }
  const visibleParams = new Set(params);

  return normalizeStringList(baseOptionalParams).filter(arg => visibleParams.has(arg));
}

function getEffectiveToolControlArgs(options: {
  labels: readonly string[];
  inputSchema?: ToolInputSchema;
  params: readonly string[];
  baseControlArgs?: readonly string[];
  baseHasControlArgsMetadata: boolean;
  definition?: ToolDefinition;
}): { controlArgs: string[]; hasControlArgsMetadata: boolean } {
  if (options.inputSchema) {
    const derived = buildDerivedInputMetadata(options.labels, options.inputSchema);
    return {
      controlArgs: derived.controlArgs,
      hasControlArgsMetadata: derived.hasControlArgsMetadata
    };
  }
  const visibleParams = new Set(options.params);

  if (Array.isArray(options.definition?.controlArgs)) {
    return {
      controlArgs: normalizeStringList(options.definition.controlArgs).filter(arg => visibleParams.has(arg)),
      hasControlArgsMetadata: true
    };
  }

  if (options.baseHasControlArgsMetadata) {
    return {
      controlArgs: normalizeStringList(options.baseControlArgs).filter(arg => visibleParams.has(arg)),
      hasControlArgsMetadata: true
    };
  }

  return {
    controlArgs: [],
    hasControlArgsMetadata: false
  };
}

function getEffectiveToolUpdateArgs(options: {
  params: readonly string[];
  baseUpdateArgs?: readonly string[];
  baseHasUpdateArgsMetadata: boolean;
  definition?: ToolDefinition;
}): { updateArgs: string[]; hasUpdateArgsMetadata: boolean } {
  const visibleParams = new Set(options.params);

  if (Array.isArray(options.definition?.updateArgs)) {
    return {
      updateArgs: normalizeStringList(options.definition.updateArgs).filter(arg => visibleParams.has(arg)),
      hasUpdateArgsMetadata: true
    };
  }

  if (options.baseHasUpdateArgsMetadata) {
    return {
      updateArgs: normalizeStringList(options.baseUpdateArgs).filter(arg => visibleParams.has(arg)),
      hasUpdateArgsMetadata: true
    };
  }

  return {
    updateArgs: [],
    hasUpdateArgsMetadata: false
  };
}

function getEffectiveToolExactPayloadArgs(options: {
  params: readonly string[];
  baseExactPayloadArgs?: readonly string[];
  definition?: ToolDefinition;
}): string[] | undefined {
  const visibleParams = new Set(options.params);

  if (Array.isArray(options.definition?.exactPayloadArgs)) {
    return normalizeStringList(options.definition.exactPayloadArgs).filter(arg => visibleParams.has(arg));
  }

  if (Array.isArray(options.baseExactPayloadArgs)) {
    return normalizeStringList(options.baseExactPayloadArgs).filter(arg => visibleParams.has(arg));
  }

  return undefined;
}

function getEffectiveToolSourceArgs(options: {
  labels: readonly string[];
  inputSchema?: ToolInputSchema;
  params: readonly string[];
  baseSourceArgs?: readonly string[];
  baseHasSourceArgsMetadata: boolean;
  definition?: ToolDefinition;
}): { sourceArgs: string[]; hasSourceArgsMetadata: boolean } {
  if (options.inputSchema) {
    const derived = buildDerivedInputMetadata(options.labels, options.inputSchema);
    return {
      sourceArgs: derived.sourceArgs,
      hasSourceArgsMetadata: derived.hasSourceArgsMetadata
    };
  }
  const visibleParams = new Set(options.params);

  if (Array.isArray(options.definition?.sourceArgs)) {
    return {
      sourceArgs: normalizeStringList(options.definition.sourceArgs).filter(arg => visibleParams.has(arg)),
      hasSourceArgsMetadata: true
    };
  }

  if (options.baseHasSourceArgsMetadata) {
    return {
      sourceArgs: normalizeStringList(options.baseSourceArgs).filter(arg => visibleParams.has(arg)),
      hasSourceArgsMetadata: true
    };
  }

  return {
    sourceArgs: [],
    hasSourceArgsMetadata: false
  };
}

function getEffectiveToolCorrelateControlArgs(
  labels: readonly string[],
  inputSchema: ToolInputSchema | undefined,
  baseCorrelateControlArgs: boolean,
  definition?: ToolDefinition
): boolean {
  if (inputSchema) {
    const derived = buildDerivedInputMetadata(labels, inputSchema);
    return derived.correlateControlArgs;
  }
  if (definition?.correlateControlArgs === true) {
    return true;
  }
  return baseCorrelateControlArgs;
}

function applyToolDefinitionAuthMetadata(
  base: EffectiveToolMetadata,
  definition: ToolDefinition | undefined,
  env: Environment
): EffectiveToolMetadata {
  if (!definition) {
    return base;
  }

  const labels = mergeStringLists(base.labels, definition.labels);
  const inputSchema = resolveToolInputSchema({
    env,
    definition,
    executableParams: base.params,
    embeddedRecordDefinitions: base.embeddedRecordDefinitions
  });
  const params = getEffectiveToolParams(base.params, definition, inputSchema);
  const optionalParams = getEffectiveToolOptionalParams(params, base.optionalParams, definition, inputSchema);
  const paramEntries = buildEffectiveParamEntries(params, base.paramEntries, optionalParams);
  const { controlArgs, hasControlArgsMetadata } = getEffectiveToolControlArgs({
    labels,
    inputSchema,
    params,
    baseControlArgs: base.controlArgs,
    baseHasControlArgsMetadata: base.hasControlArgsMetadata,
    definition
  });
  const { updateArgs, hasUpdateArgsMetadata } = getEffectiveToolUpdateArgs({
    params,
    baseUpdateArgs: base.updateArgs,
    baseHasUpdateArgsMetadata: base.hasUpdateArgsMetadata,
    definition
  });
  const exactPayloadArgs = getEffectiveToolExactPayloadArgs({
    params,
    baseExactPayloadArgs: base.exactPayloadArgs,
    definition
  });
  const { sourceArgs, hasSourceArgsMetadata } = getEffectiveToolSourceArgs({
    labels,
    inputSchema,
    params,
    baseSourceArgs: base.sourceArgs,
    baseHasSourceArgsMetadata: base.hasSourceArgsMetadata,
    definition
  });
  const description = normalizeTrimmedString(definition.description) ?? base.description;
  const instructions = normalizeTrimmedString(definition.instructions) ?? base.instructions;

  return {
    ...base,
    params,
    paramEntries,
    ...(optionalParams.length > 0 ? { optionalParams } : {}),
    labels,
    ...(description ? { description } : {}),
    ...(instructions ? { instructions } : {}),
    ...(definition.authorizable !== undefined ? { authorizable: definition.authorizable } : {}),
    ...(inputSchema ? { inputSchema } : {}),
    ...(hasControlArgsMetadata ? { controlArgs } : {}),
    hasControlArgsMetadata,
    ...(hasUpdateArgsMetadata ? { updateArgs } : {}),
    hasUpdateArgsMetadata,
    ...(exactPayloadArgs !== undefined ? { exactPayloadArgs } : {}),
    ...(hasSourceArgsMetadata ? { sourceArgs } : {}),
    hasSourceArgsMetadata,
    correlateControlArgs: getEffectiveToolCorrelateControlArgs(labels, inputSchema, base.correlateControlArgs, definition)
  };
}

function mergeToolDefinitionMetadata(
  base: EffectiveToolMetadata,
  definition?: ToolDefinition
): EffectiveToolMetadata {
  if (!definition) {
    return base;
  }

  const labels = mergeStringLists(base.labels, definition.labels);
  const optionalParams = getEffectiveToolOptionalParams(base.params, base.optionalParams, definition, base.inputSchema);
  const paramEntries = buildEffectiveParamEntries(base.params, base.paramEntries, optionalParams);
  const description = base.description ?? normalizeTrimmedString(definition.description);
  const instructions = base.instructions ?? normalizeTrimmedString(definition.instructions);

  return {
    ...base,
    paramEntries,
    ...(optionalParams.length > 0 ? { optionalParams } : {}),
    labels,
    ...(description ? { description } : {}),
    ...(instructions ? { instructions } : {}),
    ...(base.authorizable !== undefined ? { authorizable: base.authorizable } : {}),
    correlateControlArgs: base.correlateControlArgs
  };
}

function getScopedToolCollection(env: Environment): ToolCollection | undefined {
  const scopedTools = env.getScopedEnvironmentConfig()?.tools;
  const direct = resolveDirectToolCollection(scopedTools);
  if (direct) {
    return direct;
  }

  return isPlainObject(scopedTools)
    ? scopedTools as ToolCollection
    : undefined;
}

function getLlmToolSurfaceNames(env: Environment): string[] {
  const llmToolConfig = env.getLlmToolConfig();
  return mergeStringLists(
    llmToolConfig?.toolMetadata?.map(entry => entry.name),
    llmToolConfig?.availableTools?.map(entry => entry.name)
  );
}

export function getRuntimeAuthorizationSurfaceNames(env: Environment): string[] {
  const scopedTools = getScopedToolCollection(env);
  return mergeStringLists(
    scopedTools ? Object.keys(scopedTools) : undefined,
    getLlmToolSurfaceNames(env)
  );
}

export function hasRuntimeAuthorizationSurface(env: Environment): boolean {
  return getRuntimeAuthorizationSurfaceNames(env).length > 0;
}

export function isRuntimeAuthorizationSurfaceOperation(
  env: Environment,
  operationName: string | undefined
): boolean {
  const normalizedOperationName = normalizeTrimmedString(operationName);
  if (!normalizedOperationName) {
    return false;
  }

  const loweredOperationName = normalizedOperationName.toLowerCase();
  return getRuntimeAuthorizationSurfaceNames(env).some(
    candidate => candidate.trim().toLowerCase() === loweredOperationName
  );
}

function hasExecutableLabel(
  labels: readonly string[] | undefined,
  target: string
): boolean {
  if (!Array.isArray(labels) || labels.length === 0) {
    return false;
  }

  const loweredTarget = target.trim().toLowerCase();
  return labels.some(label => (
    typeof label === 'string'
    && label.trim().toLowerCase() === loweredTarget
  ));
}

export function resolveAuthorizationSurfaceOperation(options: {
  env: Environment;
  operationName: string | undefined;
  executableLabels?: readonly string[];
  inheritedAuthorizationSurfaceOperation?: boolean;
}): boolean {
  const {
    env,
    operationName,
    executableLabels,
    inheritedAuthorizationSurfaceOperation
  } = options;

  if (isRuntimeAuthorizationSurfaceOperation(env, operationName)) {
    return true;
  }

  if (inheritedAuthorizationSurfaceOperation === false) {
    return false;
  }

  if (hasRuntimeAuthorizationSurface(env)) {
    return false;
  }

  // Bare llm exes like @claude are dispatch substrate, not the visible tool surface.
  if (hasExecutableLabel(executableLabels, 'llm')) {
    return false;
  }

  if (typeof inheritedAuthorizationSurfaceOperation === 'boolean') {
    return inheritedAuthorizationSurfaceOperation;
  }

  return true;
}

function createAuthorizationToolContextEntry(
  toolName: string,
  metadata: Pick<
    EffectiveToolMetadata,
    | 'params'
    | 'inputSchema'
    | 'controlArgs'
    | 'hasControlArgsMetadata'
    | 'updateArgs'
    | 'hasUpdateArgsMetadata'
    | 'exactPayloadArgs'
    | 'sourceArgs'
    | 'hasSourceArgsMetadata'
  >
): AuthorizationToolContext {
  return {
    name: toolName,
    params: new Set(metadata.params),
    controlArgs: new Set(metadata.controlArgs ?? []),
    hasControlArgsMetadata: metadata.hasControlArgsMetadata,
    updateArgs: new Set(metadata.updateArgs ?? []),
    hasUpdateArgsMetadata: metadata.hasUpdateArgsMetadata,
    exactPayloadArgs: new Set(metadata.exactPayloadArgs ?? [])
  };
}

function buildAuthorizationToolContextFromStoredContext(
  stored: ToolCollectionAuthorizationContext
): Map<string, AuthorizationToolContext> {
  const contexts = new Map<string, AuthorizationToolContext>();

  for (const [toolName, entry] of Object.entries(stored)) {
    contexts.set(toolName, {
      name: toolName,
      params: new Set(entry.params),
      controlArgs: new Set(entry.controlArgs ?? entry.inputSchema?.factFields ?? []),
      hasControlArgsMetadata: entry.hasControlArgsMetadata === true || (entry.inputSchema?.factFields.length ?? 0) > 0,
      updateArgs: new Set(entry.updateArgs ?? []),
      hasUpdateArgsMetadata: entry.hasUpdateArgsMetadata === true,
      exactPayloadArgs: new Set(entry.exactPayloadArgs ?? [])
    });
  }

  return contexts;
}

function buildToolContextFromStoredEntry(
  toolName: string,
  entry: ToolAuthorizationContextEntry,
  definition?: ToolDefinition
): EffectiveToolMetadata {
  const params = normalizeStringList(entry.params);
  const inputSchema = entry.inputSchema
    ? cloneToolInputSchema(entry.inputSchema)
    : undefined;
  const optionalParams = getEffectiveToolOptionalParams(params, undefined, definition, inputSchema);
  const paramEntries = buildEffectiveToolParams(params, undefined, optionalParams);
  const labels = mergeStringLists(entry.labels, definition?.labels);
  const { controlArgs, hasControlArgsMetadata } = getEffectiveToolControlArgs({
    labels,
    inputSchema,
    params,
    baseControlArgs: entry.controlArgs ?? inputSchema?.factFields,
    baseHasControlArgsMetadata: entry.hasControlArgsMetadata === true || (inputSchema?.factFields.length ?? 0) > 0,
    definition
  });
  const { updateArgs, hasUpdateArgsMetadata } = getEffectiveToolUpdateArgs({
    params,
    baseUpdateArgs: entry.updateArgs,
    baseHasUpdateArgsMetadata: entry.hasUpdateArgsMetadata === true,
    definition
  });
  const exactPayloadArgs = getEffectiveToolExactPayloadArgs({
    params,
    baseExactPayloadArgs: entry.exactPayloadArgs,
    definition
  });
  const { sourceArgs, hasSourceArgsMetadata } = getEffectiveToolSourceArgs({
    labels,
    inputSchema,
    params,
    baseSourceArgs: entry.sourceArgs ?? inputSchema?.factFields,
    baseHasSourceArgsMetadata: Array.isArray(entry.sourceArgs) || (inputSchema?.factFields.length ?? 0) > 0,
    definition
  });
  const description = normalizeTrimmedString(definition?.description) ?? normalizeTrimmedString(entry.description);
  const instructions = normalizeTrimmedString(definition?.instructions) ?? normalizeTrimmedString(entry.instructions);

  return {
    name: toolName,
    params,
    paramEntries,
    ...(optionalParams.length > 0 ? { optionalParams } : {}),
    labels,
    ...(description ? { description } : {}),
    ...(instructions ? { instructions } : {}),
    ...(entry.authorizable !== undefined ? { authorizable: entry.authorizable } : {}),
    ...(inputSchema ? { inputSchema } : {}),
    ...(hasControlArgsMetadata ? { controlArgs } : {}),
    hasControlArgsMetadata,
    ...(hasUpdateArgsMetadata ? { updateArgs } : {}),
    hasUpdateArgsMetadata,
    ...(exactPayloadArgs !== undefined ? { exactPayloadArgs } : {}),
    ...(hasSourceArgsMetadata ? { sourceArgs } : {}),
    hasSourceArgsMetadata,
    correlateControlArgs: getEffectiveToolCorrelateControlArgs(labels, inputSchema, false, definition),
    taintFacts: false
  };
}

function toStoredAuthorizationContextEntry(
  metadata: Pick<
    EffectiveToolMetadata,
    | 'params'
    | 'inputSchema'
    | 'controlArgs'
    | 'hasControlArgsMetadata'
    | 'updateArgs'
    | 'hasUpdateArgsMetadata'
    | 'exactPayloadArgs'
    | 'sourceArgs'
    | 'hasSourceArgsMetadata'
    | 'labels'
    | 'description'
    | 'instructions'
    | 'authorizable'
  >
): ToolAuthorizationContextEntry {
  return {
    params: [...metadata.params],
    ...(metadata.inputSchema ? { inputSchema: cloneToolInputSchema(metadata.inputSchema) } : {}),
    ...(metadata.hasControlArgsMetadata ? { controlArgs: [...(metadata.controlArgs ?? [])] } : {}),
    ...(metadata.hasControlArgsMetadata ? { hasControlArgsMetadata: true } : {}),
    ...(metadata.hasUpdateArgsMetadata ? { updateArgs: [...(metadata.updateArgs ?? [])] } : {}),
    ...(metadata.hasUpdateArgsMetadata ? { hasUpdateArgsMetadata: true } : {}),
    ...(metadata.exactPayloadArgs ? { exactPayloadArgs: [...metadata.exactPayloadArgs] } : {}),
    ...(metadata.hasSourceArgsMetadata ? { sourceArgs: [...(metadata.sourceArgs ?? [])] } : {}),
    ...(metadata.labels.length > 0 ? { labels: [...metadata.labels] } : {}),
    ...(metadata.description ? { description: metadata.description } : {}),
    ...(metadata.instructions ? { instructions: metadata.instructions } : {}),
    ...(metadata.authorizable !== undefined ? { authorizable: metadata.authorizable } : {}),
    ...(metadata.correlateControlArgs ? { correlateControlArgs: true } : {})
  };
}

export function buildCanonicalAuthorizationToolContextForCollection(
  env: Environment,
  collection: ToolCollection
): ToolCollectionAuthorizationContext {
  const contexts: ToolCollectionAuthorizationContext = {};

  for (const [toolName, definition] of Object.entries(collection)) {
    const execName = typeof definition?.mlld === 'string' ? definition.mlld : '';
    if (!execName) {
      continue;
    }

    const executable = resolveExecutableVariable(env, execName);
    if (!executable) {
      continue;
    }

    const merged = applyToolDefinitionAuthMetadata(
      buildToolContextFromExecutable(toolName, executable),
      definition,
      env
    );
    contexts[toolName] = toStoredAuthorizationContextEntry(merged);
  }

  return contexts;
}

function buildAuthorizationToolContextFromCollection(
  env: Environment,
  collection: ToolCollection
): Map<string, AuthorizationToolContext> {
  const stored = getToolCollectionAuthorizationContext(collection);
  const contexts = stored
    ? buildAuthorizationToolContextFromStoredContext(stored)
    : new Map<string, AuthorizationToolContext>();

  for (const [toolName, definition] of Object.entries(collection)) {
    if (contexts.has(toolName)) {
      continue;
    }

    const execName = typeof definition?.mlld === 'string' ? definition.mlld : '';
    if (!execName) {
      continue;
    }

    const executable = resolveExecutableVariable(env, execName);
    if (!executable) {
      continue;
    }

    const merged = applyToolDefinitionAuthMetadata(
      buildToolContextFromExecutable(toolName, executable),
      definition,
      env
    );
    contexts.set(toolName, createAuthorizationToolContextEntry(toolName, merged));
  }

  return contexts;
}

export function buildRuntimeAuthorizationToolContext(
  env: Environment
): Map<string, AuthorizationToolContext> {
  const contexts = new Map<string, AuthorizationToolContext>();
  const allVariables = env.getAllVariables();

  for (const [name, variable] of allVariables) {
    if (!isExecutableVariable(variable)) {
      continue;
    }

    const direct = buildToolContextFromExecutable(name, variable as ExecutableVariable);
    contexts.set(name, createAuthorizationToolContextEntry(name, direct));
  }

  const llmToolMetadata = env.getLlmToolConfig()?.toolMetadata;
  if (Array.isArray(llmToolMetadata)) {
    for (const entry of llmToolMetadata) {
      if (!entry || typeof entry.name !== 'string' || entry.name.trim().length === 0) {
        continue;
      }
      contexts.set(
        entry.name,
        createAuthorizationToolContextEntry(entry.name, entry)
      );
    }
  }

  const scopedTools = getScopedToolCollection(env);
  if (!scopedTools) {
    return contexts;
  }

  for (const [toolName, context] of buildAuthorizationToolContextFromCollection(env, scopedTools)) {
    contexts.set(toolName, context);
  }

  return contexts;
}

export function buildAuthorizationToolContextForCollection(
  env: Environment,
  collection: ToolCollection
): Map<string, AuthorizationToolContext> {
  return buildAuthorizationToolContextFromCollection(env, collection);
}

export function expandToolLabels(
  env: Environment,
  labels: readonly string[]
): string[] {
  return mergeStringLists(labels, expandOperationLabels(labels, env.getPolicySummary()?.operations));
}

export function isWriteToolMetadata(
  env: Environment,
  metadata: Pick<EffectiveToolMetadata, 'name' | 'labels' | 'controlArgs'>
): boolean {
  if ((metadata.controlArgs?.length ?? 0) > 0) {
    return true;
  }

  const policy = env.getPolicySummary();
  const operationCategories = new Set(
    Object.keys(policy?.operations ?? {})
      .map(label => label.trim())
      .filter(label => label.length > 0)
  );

  if (
    operationCategories.size > 0
    && expandToolLabels(env, metadata.labels).some(label => operationCategories.has(label))
  ) {
    return true;
  }

  const toolName = metadata.name.trim().toLowerCase();
  if (!toolName) {
    return false;
  }

  return Array.isArray(policy?.authorizations?.deny)
    && policy.authorizations.deny.some(entry => entry.trim().toLowerCase() === toolName);
}

export function shouldAutoExposeFyiKnown(
  env: Environment,
  toolMetadata: readonly Pick<EffectiveToolMetadata, 'name' | 'labels' | 'controlArgs' | 'sourceArgs'>[]
): boolean {
  return toolMetadata.some(metadata =>
    ((metadata.controlArgs?.length ?? 0) > 0 && isWriteToolMetadata(env, metadata))
    || (metadata.sourceArgs?.length ?? 0) > 0
  );
}

export function resolveToolCollectionEntryMetadata(
  env: Environment,
  collection: ToolCollection,
  toolName: string
): EffectiveToolMetadata | undefined {
  const definition = collection[toolName];
  if (!definition) {
    return undefined;
  }

  const execName = typeof definition.mlld === 'string' ? definition.mlld : '';
  if (execName) {
    const executable = resolveExecutableVariableCaseInsensitive(env, execName);
    if (executable) {
      return applyToolDefinitionAuthMetadata(
        buildToolContextFromExecutable(toolName, executable),
        definition,
        env
      );
    }
  }

  const storedEntry = getToolCollectionAuthorizationContext(collection)?.[toolName];
  if (storedEntry) {
    return buildToolContextFromStoredEntry(toolName, storedEntry, definition);
  }

  const params = getEffectiveToolParams([], definition);
  const inputSchema = resolveToolInputSchema({
    env,
    definition,
    executableParams: params
  });
  const optionalParams = getEffectiveToolOptionalParams(params, undefined, definition, inputSchema);
  const { controlArgs, hasControlArgsMetadata } = getEffectiveToolControlArgs({
    labels: normalizeStringList(definition.labels),
    inputSchema,
    params,
    baseHasControlArgsMetadata: false,
    definition
  });
  const { updateArgs, hasUpdateArgsMetadata } = getEffectiveToolUpdateArgs({
    params,
    baseHasUpdateArgsMetadata: false,
    definition
  });
  const exactPayloadArgs = getEffectiveToolExactPayloadArgs({
    params,
    definition
  });
  const { sourceArgs, hasSourceArgsMetadata } = getEffectiveToolSourceArgs({
    labels: normalizeStringList(definition.labels),
    inputSchema,
    params,
    baseHasSourceArgsMetadata: false,
    definition
  });
  const description = normalizeTrimmedString(definition.description);
  const instructions = normalizeTrimmedString(definition.instructions);

  return {
    name: toolName,
    params,
    paramEntries: buildEffectiveToolParams(params, undefined, optionalParams),
    ...(optionalParams.length > 0 ? { optionalParams } : {}),
    labels: normalizeStringList(definition.labels),
    ...(description ? { description } : {}),
    ...(instructions ? { instructions } : {}),
    ...(definition.authorizable !== undefined ? { authorizable: definition.authorizable } : {}),
    ...(inputSchema ? { inputSchema } : {}),
    ...(hasControlArgsMetadata ? { controlArgs } : {}),
    hasControlArgsMetadata,
    ...(hasUpdateArgsMetadata ? { updateArgs } : {}),
    hasUpdateArgsMetadata,
    ...(exactPayloadArgs !== undefined ? { exactPayloadArgs } : {}),
    ...(hasSourceArgsMetadata ? { sourceArgs } : {}),
    hasSourceArgsMetadata,
    correlateControlArgs: getEffectiveToolCorrelateControlArgs(
      normalizeStringList(definition.labels),
      inputSchema,
      false,
      definition
    ),
    taintFacts: false
  };
}

export function resolveToolCollectionMetadataEntries(
  env: Environment,
  collection: ToolCollection
): EffectiveToolMetadata[] {
  const resolved: EffectiveToolMetadata[] = [];
  for (const toolName of Object.keys(collection)) {
    const metadata = resolveToolCollectionEntryMetadata(env, collection, toolName);
    if (metadata) {
      resolved.push(metadata);
    }
  }
  return resolved;
}

export function resolveEffectiveToolMetadata(options: {
  env: Environment;
  executable: ExecutableVariable;
  operationName?: string;
  additionalLabels?: readonly string[];
}): EffectiveToolMetadata {
  const { env, executable, operationName, additionalLabels } = options;
  const executableName = executable.name;
  const base = buildToolContextFromExecutable(operationName ?? executableName, executable);
  const scopedTools = getScopedToolCollection(env);

  if (!scopedTools) {
    return {
      ...base,
      labels: mergeStringLists(base.labels, additionalLabels)
    };
  }

  const directDefinition =
    operationName && scopedTools[operationName]?.mlld === executableName
      ? scopedTools[operationName]
      : undefined;

  if (directDefinition) {
    const merged = applyToolDefinitionAuthMetadata(base, directDefinition, env);
    return {
      ...merged,
      labels: mergeStringLists(merged.labels, additionalLabels)
    };
  }

  const matchingDefinitions = Object.values(scopedTools).filter(
    definition => definition?.mlld === executableName
  );
  if (matchingDefinitions.length === 0) {
    return {
      ...base,
      labels: mergeStringLists(base.labels, additionalLabels)
    };
  }

  let merged = base;
  for (const definition of matchingDefinitions) {
    merged = mergeToolDefinitionMetadata(merged, definition);
  }

  return {
    ...merged,
    labels: mergeStringLists(merged.labels, additionalLabels)
  };
}

export function resolveNamedOperationMetadata(
  env: Environment,
  operationName: string
): EffectiveToolMetadata | undefined {
  const trimmed = operationName.trim();
  if (!trimmed) {
    return undefined;
  }

  const scopedTools = getScopedToolCollection(env);
  const scopedToolName =
    Object.keys(scopedTools ?? {}).find(name => name.trim().toLowerCase() === trimmed.toLowerCase());
  if (scopedTools && scopedToolName) {
    const metadata = resolveToolCollectionEntryMetadata(env, scopedTools, scopedToolName);
    if (metadata) {
      return metadata;
    }
  }

  const executable =
    resolveExecutableVariableCaseInsensitive(env, trimmed)
    ?? (() => {
      const mlldName = mcpNameToMlldName(trimmed);
      return mlldName !== trimmed
        ? resolveExecutableVariableCaseInsensitive(env, mlldName)
        : undefined;
    })();
  if (!executable) {
    return undefined;
  }

  return resolveEffectiveToolMetadata({
    env,
    executable,
    operationName: trimmed
  });
}
