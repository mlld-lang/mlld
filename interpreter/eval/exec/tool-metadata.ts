import type { AuthorizationToolContext } from '@core/policy/authorizations';
import {
  getToolCollectionAuthorizationContext,
  type ToolAuthorizationContextEntry,
  type ToolCollection,
  type ToolCollectionAuthorizationContext,
  type ToolDefinition
} from '@core/types/tools';
import { isExecutableVariable, type ExecutableVariable, type Variable } from '@core/types/variable';
import type { Environment } from '@interpreter/env/Environment';

export interface EffectiveToolMetadata {
  name: string;
  params: string[];
  labels: string[];
  controlArgs?: string[];
  hasControlArgsMetadata: boolean;
  taintFacts: boolean;
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
  return variable && isExecutableVariable(variable) ? variable : undefined;
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
      return variable;
    }
  }

  return undefined;
}

function getExecutableParamNames(executable: ExecutableVariable): string[] {
  return Array.isArray(executable.paramNames)
    ? executable.paramNames.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function getExecutableLabels(executable: ExecutableVariable): string[] {
  return normalizeStringList(executable.mx?.labels);
}

function getExecutableControlArgs(executable: ExecutableVariable): string[] | undefined {
  const executableDef = executable.internal?.executableDef ?? executable.value;
  const controlArgs = (executableDef as any)?.controlArgs;
  return Array.isArray(controlArgs) ? normalizeStringList(controlArgs) : undefined;
}

function getExecutableTaintFacts(executable: ExecutableVariable): boolean {
  void executable;
  return false;
}

function buildToolContextFromExecutable(
  name: string,
  executable: ExecutableVariable
): EffectiveToolMetadata {
  const params = getExecutableParamNames(executable);
  const controlArgs = getExecutableControlArgs(executable);
  return {
    name,
    params,
    labels: getExecutableLabels(executable),
    ...(controlArgs ? { controlArgs } : {}),
    hasControlArgsMetadata: Array.isArray(controlArgs),
    taintFacts: getExecutableTaintFacts(executable)
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

function getEffectiveToolParams(
  baseParams: string[],
  definition?: ToolDefinition
): string[] {
  if (!definition) {
    return baseParams;
  }

  if (Array.isArray(definition.expose)) {
    return normalizeStringList(definition.expose);
  }

  const boundKeys = new Set(getToolDefinitionBindKeys(definition));
  return baseParams.filter(paramName => !boundKeys.has(paramName));
}

function getEffectiveToolControlArgs(options: {
  params: readonly string[];
  baseControlArgs?: readonly string[];
  baseHasControlArgsMetadata: boolean;
  definition?: ToolDefinition;
}): { controlArgs: string[]; hasControlArgsMetadata: boolean } {
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

function applyToolDefinitionAuthMetadata(
  base: EffectiveToolMetadata,
  definition?: ToolDefinition
): EffectiveToolMetadata {
  if (!definition) {
    return base;
  }

  const labels = mergeStringLists(base.labels, definition.labels);
  const params = getEffectiveToolParams(base.params, definition);
  const { controlArgs, hasControlArgsMetadata } = getEffectiveToolControlArgs({
    params,
    baseControlArgs: base.controlArgs,
    baseHasControlArgsMetadata: base.hasControlArgsMetadata,
    definition
  });

  return {
    ...base,
    params,
    labels,
    ...(hasControlArgsMetadata ? { controlArgs } : {}),
    hasControlArgsMetadata
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
  const mergedControlArgs = mergeStringLists(base.controlArgs, definition.controlArgs);
  const hasControlArgsMetadata =
    base.hasControlArgsMetadata || Array.isArray(definition.controlArgs);

  return {
    ...base,
    labels,
    ...(hasControlArgsMetadata ? { controlArgs: mergedControlArgs } : {}),
    hasControlArgsMetadata
  };
}

function getScopedToolCollection(env: Environment): ToolCollection | undefined {
  const tools = env.getScopedEnvironmentConfig()?.tools;
  if (!tools || typeof tools !== 'object' || Array.isArray(tools)) {
    return undefined;
  }
  return tools as ToolCollection;
}

function createAuthorizationToolContextEntry(
  toolName: string,
  metadata: Pick<EffectiveToolMetadata, 'params' | 'controlArgs' | 'hasControlArgsMetadata'>
): AuthorizationToolContext {
  return {
    name: toolName,
    params: new Set(metadata.params),
    controlArgs: new Set(metadata.controlArgs ?? []),
    hasControlArgsMetadata: metadata.hasControlArgsMetadata
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
      controlArgs: new Set(entry.controlArgs),
      hasControlArgsMetadata: entry.hasControlArgsMetadata
    });
  }

  return contexts;
}

function toStoredAuthorizationContextEntry(
  metadata: Pick<EffectiveToolMetadata, 'params' | 'controlArgs' | 'hasControlArgsMetadata'>
): ToolAuthorizationContextEntry {
  return {
    params: [...metadata.params],
    controlArgs: [...(metadata.controlArgs ?? [])],
    hasControlArgsMetadata: metadata.hasControlArgsMetadata
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
      definition
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
      definition
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

    const direct = buildToolContextFromExecutable(name, variable);
    contexts.set(name, createAuthorizationToolContextEntry(name, direct));
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
    const merged = applyToolDefinitionAuthMetadata(base, directDefinition);
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
  const directDefinition =
    scopedTools?.[trimmed] ??
    Object.entries(scopedTools ?? {}).find(([name]) => name.trim().toLowerCase() === trimmed.toLowerCase())?.[1];
  if (directDefinition?.mlld) {
    const executable = resolveExecutableVariableCaseInsensitive(env, directDefinition.mlld);
    if (executable) {
      return resolveEffectiveToolMetadata({
        env,
        executable,
        operationName: trimmed
      });
    }
  }

  const executable = resolveExecutableVariableCaseInsensitive(env, trimmed);
  if (!executable) {
    return undefined;
  }

  return resolveEffectiveToolMetadata({
    env,
    executable,
    operationName: trimmed
  });
}
