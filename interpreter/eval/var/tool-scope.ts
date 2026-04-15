import {
  getToolCollectionAuthorizationContext,
  normalizeToolAuthorizableValue,
  type ToolAuthorizableValue,
  type ToolCollection,
  type ToolInputSchema
} from '@core/types/tools';
import {
  canUseRecordForOutput,
  canUseRecordForInput,
  type RecordDefinition
} from '@core/types/record';
import { buildToolInputSchemaFromRecordDefinition } from '@core/tools/input-schema';
import { isExecutableVariable } from '@core/types/variable';
import type { EvaluationContext } from '@interpreter/core/interpreter';
import type { Environment } from '@interpreter/env/Environment';
import {
  getCapturedModuleEnv,
  sealCapturedModuleEnv
} from '@interpreter/eval/import/variable-importer/executable/CapturedModuleEnvKeychain';
import { asData, isStructuredValue } from '@interpreter/utils/structured-value';
import { isVariable } from '@interpreter/utils/variable-resolution';
import { isRecordVariable } from '@core/types/variable';

export type ToolScopeValue = {
  tools: string[];
  hasTools: boolean;
  isWildcard: boolean;
};

function readToolCanAuthorizeValue(value: Record<string, unknown>): unknown {
  return value.can_authorize ?? value.authorizable;
}

function unwrapToolScopeValue(value: unknown): unknown {
  const directCollection = resolveDirectToolCollection(value);
  if (directCollection) {
    return directCollection;
  }

  let resolved = value;
  if (isStructuredValue(resolved)) {
    resolved = asData(resolved);
  }
  if (isVariable(resolved)) {
    resolved = resolved.value;
    if (isStructuredValue(resolved)) {
      resolved = asData(resolved);
    }
  }
  return resolved;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isArrayLikeValue(value: unknown): boolean {
  let resolved = value;
  if (isStructuredValue(resolved)) {
    resolved = asData(resolved);
  }
  if (isVariable(resolved)) {
    return isArrayLikeValue(resolved.value);
  }
  return Array.isArray(resolved);
}

function normalizeToolLabelValues(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0);
}

function hasUpdateWriteLabel(labels: readonly string[]): boolean {
  return labels.some(label => label.trim().toLowerCase() === 'update:w');
}

function resolveNamedRecordDefinition(
  env: Environment,
  name: string
): RecordDefinition | undefined {
  const recordDefinition = env.getRecordDefinition(name);
  if (recordDefinition) {
    return recordDefinition;
  }

  const variable = env.getVariable(name);
  if (variable && isRecordVariable(variable)) {
    return (variable as { value: RecordDefinition }).value;
  }

  return undefined;
}

function validatePolicySetTargets(options: {
  toolName: string;
  field: 'allowlist' | 'blocklist';
  targets: Record<string, { kind: 'reference'; name: string } | { kind: 'array'; values: unknown[] }>;
  env: Environment;
}): void {
  for (const [fieldName, target] of Object.entries(options.targets)) {
    if (target.kind === 'array') {
      continue;
    }

    const recordDefinition = resolveNamedRecordDefinition(options.env, target.name);
    if (recordDefinition) {
      if (!canUseRecordForOutput(recordDefinition)) {
        throw new Error(
          `Tool '${options.toolName}' ${options.field} target '@${target.name}' for field '${fieldName}' must not be an input record`
        );
      }

      const factCount = recordDefinition.fields.filter(field => field.classification === 'fact').length;
      if (factCount !== 1) {
        throw new Error(
          `Tool '${options.toolName}' ${options.field} target '@${target.name}' for field '${fieldName}' must resolve to a single-fact record or array`
        );
      }
      continue;
    }

    const variable = options.env.getVariable(target.name);
    if (variable && isArrayLikeValue(variable)) {
      continue;
    }

    throw new Error(
      `Tool '${options.toolName}' ${options.field} target '@${target.name}' for field '${fieldName}' must resolve to a record or array`
    );
  }
}

export function resolveDirectToolCollection(value: unknown): ToolCollection | undefined {
  let resolved = value;
  let capturedModuleEnv: unknown;
  if (isStructuredValue(resolved)) {
    resolved = asData(resolved);
  }

  if (isVariable(resolved)) {
    capturedModuleEnv =
      getCapturedModuleEnv(resolved.internal)
      ?? getCapturedModuleEnv(resolved);
    const directCollection =
      resolved.internal?.isToolsCollection === true &&
      resolved.internal.toolCollection &&
      typeof resolved.internal.toolCollection === 'object' &&
      !Array.isArray(resolved.internal.toolCollection)
        ? resolved.internal.toolCollection as ToolCollection
        : undefined;
    if (directCollection) {
      if (capturedModuleEnv !== undefined) {
        sealCapturedModuleEnv(directCollection, capturedModuleEnv);
      }
      return directCollection;
    }

    resolved = resolved.value;
    if (isStructuredValue(resolved)) {
      resolved = asData(resolved);
    }
  }

  if (!isPlainObject(resolved)) {
    return undefined;
  }

  if (!getToolCollectionAuthorizationContext(resolved)) {
    return undefined;
  }

  if (capturedModuleEnv !== undefined) {
    sealCapturedModuleEnv(resolved, capturedModuleEnv);
  }

  return resolved as ToolCollection;
}

export async function resolveWithClauseToolsValue(
  toolsValue: unknown,
  env: Environment,
  context?: EvaluationContext
): Promise<unknown> {
  if (!toolsValue || typeof toolsValue !== 'object' || !('type' in (toolsValue as any))) {
    return toolsValue;
  }

  const { evaluate } = await import('@interpreter/core/interpreter');
  const result = await evaluate(toolsValue as any, env, { ...(context ?? {}), isExpression: true });
  let value = result.value;

  const { extractVariableValue, isVariable } = await import('@interpreter/utils/variable-resolution');
  if (isVariable(value)) {
    value = await extractVariableValue(value, env);
  }
  if (isStructuredValue(value)) {
    value = asData(value);
  }

  return value;
}

export function normalizeToolScopeValue(value: unknown): ToolScopeValue {
  value = unwrapToolScopeValue(value);

  if (value === undefined) {
    return { tools: [], hasTools: false, isWildcard: false };
  }
  if (value === null) {
    throw new Error('tools must be an array or object.');
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return { tools: [], hasTools: true, isWildcard: false };
    }
    if (trimmed === '*') {
      return { tools: [], hasTools: false, isWildcard: true };
    }
    const tools = trimmed
      .split(',')
      .map(part => part.trim())
      .filter(Boolean);
    return { tools, hasTools: true, isWildcard: false };
  }
  if (Array.isArray(value)) {
    const tools: string[] = [];
    for (const entry of value) {
      if (typeof entry !== 'string') {
        throw new Error('tools entries must be strings.');
      }
      const trimmed = entry.trim();
      if (trimmed.length > 0) {
        tools.push(trimmed);
      }
    }
    return { tools, hasTools: true, isWildcard: false };
  }
  if (isPlainObject(value)) {
    return { tools: Object.keys(value), hasTools: true, isWildcard: false };
  }
  throw new Error('tools must be an array or object.');
}

export function enforceToolSubset(baseTools: string[], childTools: string[]): void {
  const baseSet = new Set(baseTools);
  const invalid = childTools.filter(tool => !baseSet.has(tool));
  if (invalid.length > 0) {
    throw new Error(`Tool scope cannot add tools outside parent: ${invalid.join(', ')}`);
  }
}

export function normalizeToolCollection(raw: unknown, env: Environment): ToolCollection {
  if (!isPlainObject(raw)) {
    throw new Error('Tool collections must be object literals');
  }

  const collection: ToolCollection = {};
  const collectionCapturedModuleEnv = new Map<string, unknown>();

  for (const [toolName, toolValue] of Object.entries(raw)) {
    if (!isPlainObject(toolValue)) {
      throw new Error(`Tool '${toolName}' must be an object`);
    }

    const mlldRef = (toolValue as Record<string, unknown>).mlld;
    if (mlldRef === undefined || mlldRef === null) {
      throw new Error(`Tool '${toolName}' is missing 'mlld' reference`);
    }

    const { mlldName, executable: referencedExecutable, capturedModuleEnv } =
      resolveToolMlldReference(mlldRef, toolName);
    const execVar = referencedExecutable ?? env.getVariable(mlldName);
    if (!execVar || !isExecutableVariable(execVar)) {
      throw new Error(`Tool '${toolName}' references non-executable '@${mlldName}'`);
    }

    const paramNames = Array.isArray(execVar.paramNames) ? execVar.paramNames : [];
    const paramSet = new Set(paramNames);
    const executableDef = execVar.internal?.executableDef ?? execVar.value;
    const hasExecutableControlArgsMetadata = Array.isArray((executableDef as any)?.controlArgs);
    const hasExecutableUpdateArgsMetadata = Array.isArray((executableDef as any)?.updateArgs);
    const hasExecutableExactPayloadArgsMetadata = Array.isArray((executableDef as any)?.exactPayloadArgs);
    const hasExecutableSourceArgsMetadata = Array.isArray((executableDef as any)?.sourceArgs);
    const executableControlArgs = normalizeExecutableMetadataStringArray((executableDef as any)?.controlArgs);
    const executableUpdateArgs = normalizeExecutableMetadataStringArray((executableDef as any)?.updateArgs);
    const executableExactPayloadArgs = normalizeExecutableMetadataStringArray((executableDef as any)?.exactPayloadArgs);
    const executableSourceArgs = normalizeExecutableMetadataStringArray((executableDef as any)?.sourceArgs);
    const unknownFields = Object.keys(toolValue).filter(key =>
      ![
        'mlld',
        'inputs',
        'labels',
        'description',
        'instructions',
        'can_authorize',
        'authorizable',
        'bind',
        'expose',
        'optional',
        'controlArgs',
        'updateArgs',
        'exactPayloadArgs',
        'sourceArgs',
        'correlateControlArgs'
      ].includes(key)
    );
    if (unknownFields.length > 0) {
      throw new Error(
        `Tool '${toolName}' has unknown fields: ${unknownFields.join(', ')}`
      );
    }

    const description = toolValue.description;
    if (description !== undefined && typeof description !== 'string') {
      throw new Error(`Tool '${toolName}' description must be a string`);
    }
    const instructions = toolValue.instructions;
    if (instructions !== undefined && typeof instructions !== 'string') {
      throw new Error(`Tool '${toolName}' instructions must be a string`);
    }

    const labels = normalizeStringArray(toolValue.labels, toolName, 'labels');
    const canAuthorize = normalizeToolAuthorizable(readToolCanAuthorizeValue(toolValue), toolName);
    const expose = normalizeLegacyStringArray(toolValue.expose, toolName, 'expose');
    const optional = normalizeLegacyStringArray(toolValue.optional, toolName, 'optional');
    const controlArgs = normalizeLegacyStringArray(toolValue.controlArgs, toolName, 'controlArgs');
    const updateArgs = normalizeLegacyStringArray(toolValue.updateArgs, toolName, 'updateArgs');
    const exactPayloadArgs = normalizeLegacyStringArray(toolValue.exactPayloadArgs, toolName, 'exactPayloadArgs');
    const sourceArgs = normalizeLegacyStringArray(toolValue.sourceArgs, toolName, 'sourceArgs');
    const correlateControlArgs = (toolValue as Record<string, unknown>).correlateControlArgs;
    if (correlateControlArgs !== undefined && typeof correlateControlArgs !== 'boolean') {
      throw new Error(`Tool '${toolName}' correlateControlArgs must be a boolean`);
    }
    const bind = toolValue.bind;
    const boundKeys =
      bind && isPlainObject(bind)
        ? Object.keys(bind)
        : [];

    if (bind !== undefined) {
      if (!isPlainObject(bind)) {
        throw new Error(`Tool '${toolName}' bind must be an object`);
      }
      const invalidKeys = Object.keys(bind).filter(key => !paramSet.has(key));
      if (invalidKeys.length > 0) {
        throw new Error(
          `Tool '${toolName}' bind keys must match parameters of '@${mlldName}': ${invalidKeys.join(', ')}`
        );
      }
    }

    const inputSchema = resolveToolInputSchema({
      toolName,
      rawInputRef: (toolValue as Record<string, unknown>).inputs,
      env,
      executableName: mlldName,
      executableParamNames: paramNames,
      bindKeys: boundKeys,
      labels: [
        ...normalizeToolLabelValues(execVar.mx?.labels),
        ...(labels ?? [])
      ]
    });

    if (inputSchema) {
      const mixedShapeFields = [
        'expose',
        'optional',
        'controlArgs',
        'updateArgs',
        'exactPayloadArgs',
        'sourceArgs',
        'correlateControlArgs'
      ].filter(field => (toolValue as Record<string, unknown>)[field] !== undefined);
      if (mixedShapeFields.length > 0) {
        throw new Error(
          `Tool '${toolName}' inputs cannot be combined with ${mixedShapeFields.join(', ')}`
        );
      }
    } else {
      if (expose) {
        const invalidExpose = expose.filter(name => !paramSet.has(name));
        if (invalidExpose.length > 0) {
          throw new Error(
            `Tool '${toolName}' expose values must match parameters of '@${mlldName}': ${invalidExpose.join(', ')}`
          );
        }
      }

      if (optional) {
        const invalidOptional = optional.filter(name => !paramSet.has(name));
        if (invalidOptional.length > 0) {
          throw new Error(
            `Tool '${toolName}' optional values must match parameters of '@${mlldName}': ${invalidOptional.join(', ')}`
          );
        }
      }

      if (expose) {
        const overlap = boundKeys.filter(key => expose.includes(key));
        if (overlap.length > 0) {
          throw new Error(
            `Tool '${toolName}' expose values cannot include bound parameters: ${overlap.join(', ')}`
          );
        }

        const covered = new Set([...boundKeys, ...expose]);
        let lastCoveredIndex = -1;
        for (let i = 0; i < paramNames.length; i += 1) {
          if (covered.has(paramNames[i])) {
            lastCoveredIndex = i;
          }
        }
        if (lastCoveredIndex >= 0) {
          const missing: string[] = [];
          for (let i = 0; i <= lastCoveredIndex; i += 1) {
            const paramName = paramNames[i];
            if (!covered.has(paramName)) {
              missing.push(paramName);
            }
          }
          if (missing.length > 0) {
            throw new Error(
              `Tool '${toolName}' bind and expose must cover required parameters: ${missing.join(', ')}`
            );
          }
        }
      }

      if (optional) {
        if (!expose) {
          throw new Error(`Tool '${toolName}' optional values require expose to be set`);
        }
        const optionalOutsideExpose = optional.filter(name => !expose.includes(name));
        if (optionalOutsideExpose.length > 0) {
          throw new Error(
            `Tool '${toolName}' optional values must be a subset of expose: ${optionalOutsideExpose.join(', ')}`
          );
        }
      }

      const visibleParams = expose
        ? expose
        : paramNames.filter(paramName => !boundKeys.includes(paramName));
      validateRestrictedArgOverride({
        field: 'controlArgs',
        toolName,
        values: controlArgs,
        visibleParams,
        executableValues: executableControlArgs,
        hasExecutableMetadata: hasExecutableControlArgsMetadata
      });
      validateRestrictedArgOverride({
        field: 'updateArgs',
        toolName,
        values: updateArgs,
        visibleParams,
        executableValues: executableUpdateArgs,
        hasExecutableMetadata: hasExecutableUpdateArgsMetadata
      });
      validateRestrictedArgOverride({
        field: 'exactPayloadArgs',
        toolName,
        values: exactPayloadArgs,
        visibleParams,
        executableValues: executableExactPayloadArgs,
        hasExecutableMetadata: hasExecutableExactPayloadArgsMetadata
      });
      validateRestrictedArgOverride({
        field: 'sourceArgs',
        toolName,
        values: sourceArgs,
        visibleParams,
        executableValues: executableSourceArgs,
        hasExecutableMetadata: hasExecutableSourceArgsMetadata
      });
    }

    const normalizedDefinition = {
      mlld: mlldName,
      ...(inputSchema ? { inputs: inputSchema.recordName } : {}),
      ...(labels ? { labels } : {}),
      ...(description ? { description } : {}),
      ...(instructions ? { instructions } : {}),
      ...(canAuthorize !== undefined ? { can_authorize: canAuthorize } : {}),
      ...(bind ? { bind } : {}),
      ...(expose ? { expose } : {}),
      ...(optional ? { optional } : {}),
      ...(controlArgs ? { controlArgs } : {}),
      ...(updateArgs ? { updateArgs } : {}),
      ...(exactPayloadArgs ? { exactPayloadArgs } : {}),
      ...(sourceArgs ? { sourceArgs } : {}),
      ...(correlateControlArgs === true ? { correlateControlArgs: true } : {})
    };

    const definitionCapturedModuleEnv = buildToolDefinitionCapturedModuleEnv(
      mlldName,
      execVar,
      capturedModuleEnv
    );
    if (definitionCapturedModuleEnv !== undefined) {
      sealCapturedModuleEnv(normalizedDefinition, definitionCapturedModuleEnv);
      mergeCapturedModuleEnvEntries(collectionCapturedModuleEnv, definitionCapturedModuleEnv);
    }

    collection[toolName] = normalizedDefinition;
  }

  if (collectionCapturedModuleEnv.size > 0) {
    sealCapturedModuleEnv(collection, collectionCapturedModuleEnv);
  }

  return collection;
}

function resolveToolMlldReference(
  value: unknown,
  toolName: string
): {
  mlldName: string;
  executable?: unknown;
  capturedModuleEnv?: unknown;
} {
  if (typeof value === 'string') {
    return {
      mlldName: value.startsWith('@') ? value.slice(1) : value
    };
  }
  if (value && typeof value === 'object' && isExecutableVariable(value as any)) {
    const executable = value as { name?: unknown; internal?: Record<string, unknown> };
    const rawName = typeof executable.name === 'string' ? executable.name : '';
    const mlldName = rawName.startsWith('@') ? rawName.slice(1) : rawName;
    if (!mlldName) {
      throw new Error(`Tool '${toolName}' has invalid 'mlld' reference`);
    }
    return {
      mlldName,
      executable: value,
      capturedModuleEnv:
        getCapturedModuleEnv(executable.internal)
        ?? getCapturedModuleEnv(value)
        ?? buildSingleExecutableCapturedModuleEnv(mlldName, value)
    };
  }
  if (value && typeof value === 'object' && '__executable' in (value as any)) {
    const name = (value as any).name;
    if (typeof name === 'string' && name.length > 0) {
      const mlldName = name.startsWith('@') ? name.slice(1) : name;
      return {
        mlldName,
        capturedModuleEnv:
          getCapturedModuleEnv((value as { internal?: Record<string, unknown> }).internal)
          ?? getCapturedModuleEnv(value)
      };
    }
  }
  throw new Error(`Tool '${toolName}' has invalid 'mlld' reference`);
}

function buildSingleExecutableCapturedModuleEnv(
  executableName: string,
  executable: unknown
): Map<string, unknown> | undefined {
  if (!executableName || !executable || typeof executable !== 'object') {
    return undefined;
  }

  return new Map([[executableName, executable]]);
}

function buildToolDefinitionCapturedModuleEnv(
  executableName: string,
  executable: unknown,
  capturedModuleEnv: unknown
): Map<string, unknown> | undefined {
  const merged = new Map<string, unknown>();
  mergeCapturedModuleEnvEntries(merged, capturedModuleEnv);
  mergeCapturedModuleEnvEntries(
    merged,
    buildSingleExecutableCapturedModuleEnv(executableName, executable)
  );
  return merged.size > 0 ? merged : undefined;
}

function mergeCapturedModuleEnvEntries(
  target: Map<string, unknown>,
  capturedModuleEnv: unknown
): void {
  if (capturedModuleEnv instanceof Map) {
    for (const [name, variable] of capturedModuleEnv.entries()) {
      if (typeof name === 'string' && name.trim().length > 0 && !target.has(name)) {
        target.set(name, variable);
      }
    }
    return;
  }

  if (!capturedModuleEnv || typeof capturedModuleEnv !== 'object' || Array.isArray(capturedModuleEnv)) {
    return;
  }

  for (const [name, variable] of Object.entries(capturedModuleEnv as Record<string, unknown>)) {
    if (name.trim().length > 0 && !target.has(name)) {
      target.set(name, variable);
    }
  }
}

function normalizeStringArray(
  value: unknown,
  toolName: string,
  field: 'labels'
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`Tool '${toolName}' ${field} must be an array of strings`);
  }
  return value;
}

function normalizeToolAuthorizable(
  value: unknown,
  toolName: string
): ToolAuthorizableValue | undefined {
  const normalized = normalizeToolAuthorizableValue(value);
  if (value !== undefined && normalized === undefined) {
    throw new Error(
      `Tool '${toolName}' can_authorize must be false, a role string, or an array of role strings`
    );
  }
  const roleNames =
    normalized === false
      ? []
      : typeof normalized === 'string'
        ? [normalized]
        : normalized ?? [];
  const invalidRoles = roleNames.filter(role => !/^role:[a-z][a-z0-9_-]*$/i.test(role));
  if (invalidRoles.length > 0) {
    throw new Error(
      `Tool '${toolName}' can_authorize entries must match role:*: ${invalidRoles.join(', ')}`
    );
  }
  return normalized;
}

function normalizeLegacyStringArray(
  value: unknown,
  toolName: string,
  field: 'expose' | 'optional' | 'controlArgs' | 'updateArgs' | 'exactPayloadArgs' | 'sourceArgs'
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`Tool '${toolName}' ${field} must be an array of strings`);
  }
  return value;
}

function normalizeExecutableMetadataStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === 'string');
}

function resolveToolInputSchema(options: {
  toolName: string;
  rawInputRef: unknown;
  env: Environment;
  executableName: string;
  executableParamNames: readonly string[];
  bindKeys: readonly string[];
  labels?: readonly string[];
}): ToolInputSchema | undefined {
  const {
    toolName,
    rawInputRef,
    env,
    executableName,
    executableParamNames,
    bindKeys,
    labels
  } = options;
  if (rawInputRef === undefined) {
    return undefined;
  }
  const recordDefinition = resolveToolInputRecordDefinition(rawInputRef, env, toolName);
  if (!canUseRecordForInput(recordDefinition)) {
    throw new Error(
      `Tool '${toolName}' inputs must reference an input-capable record`
    );
  }
  if (recordDefinition.validate === 'demote') {
    throw new Error(
      `Tool '${toolName}' inputs cannot use record '@${recordDefinition.name}' with validate: "demote"`
    );
  }
  const fieldNames = recordDefinition.fields.map(field => field.name);
  const fieldSet = new Set(fieldNames);
  const paramSet = new Set(executableParamNames);
  const overlap = bindKeys.filter(key => fieldSet.has(key));
  if (overlap.length > 0) {
    throw new Error(
      `Tool '${toolName}' bind cannot include input-record fields: ${overlap.join(', ')}`
    );
  }
  const invalidParams = fieldNames.filter(name => !paramSet.has(name));
  if (invalidParams.length > 0) {
    throw new Error(
      `Tool '${toolName}' inputs for '@${executableName}' reference unknown parameters: ${invalidParams.join(', ')}`
    );
  }
  const covered = new Set([...fieldNames, ...bindKeys]);
  const orphanParams = executableParamNames.filter(name => !covered.has(name));
  if (orphanParams.length > 0) {
    throw new Error(
      `Tool '${toolName}' must cover all parameters of '@${executableName}' via inputs or bind: ${orphanParams.join(', ')}`
    );
  }
  const inputSchema = buildToolInputSchemaFromRecordDefinition({
    recordDefinition,
    executableParamNames
  });
  if (inputSchema.updateFields.length > 0 && !hasUpdateWriteLabel(labels ?? [])) {
    throw new Error(
      `Tool '${toolName}' inputs require label 'update:w' when record '@${recordDefinition.name}' declares update fields`
    );
  }
  validatePolicySetTargets({
    toolName,
    field: 'allowlist',
    targets: inputSchema.allowlist,
    env
  });
  validatePolicySetTargets({
    toolName,
    field: 'blocklist',
    targets: inputSchema.blocklist,
    env
  });
  return inputSchema;
}

function resolveToolInputRecordDefinition(
  value: unknown,
  env: Environment,
  toolName: string
): RecordDefinition {
  if (typeof value === 'string') {
    const recordName = value.startsWith('@') ? value.slice(1) : value;
    const recordDefinition = env.getRecordDefinition(recordName);
    if (recordDefinition) {
      return recordDefinition;
    }
    const recordVariable = env.getVariable(recordName);
    if (recordVariable && isRecordVariable(recordVariable)) {
      return (recordVariable as { value: RecordDefinition }).value;
    }
    throw new Error(`Tool '${toolName}' inputs reference unknown record '@${recordName}'`);
  }
  if (isRecordVariable(value as any)) {
    return (value as { value: RecordDefinition }).value;
  }
  if (isVariable(value) && isRecordVariable(value as any)) {
    return (value as { value: RecordDefinition }).value;
  }
  throw new Error(`Tool '${toolName}' inputs must be a record reference`);
}

function validateRestrictedArgOverride(options: {
  field: 'controlArgs' | 'updateArgs' | 'exactPayloadArgs' | 'sourceArgs';
  toolName: string;
  values: string[] | undefined;
  visibleParams: readonly string[];
  executableValues: readonly string[];
  hasExecutableMetadata: boolean;
}): void {
  const { field, toolName, values, visibleParams, executableValues, hasExecutableMetadata } = options;
  if (!values) {
    return;
  }

  const visibleSet = new Set(visibleParams);
  const invalidVisibleValues = values.filter(name => !visibleSet.has(name));
  if (invalidVisibleValues.length > 0) {
    throw new Error(
      `Tool '${toolName}' ${field} must reference visible parameters: ${invalidVisibleValues.join(', ')}`
    );
  }

  if (!hasExecutableMetadata) {
    return;
  }

  const executableSet = new Set(executableValues);
  const widenedValues = values.filter(name => !executableSet.has(name));
  if (widenedValues.length > 0) {
    throw new Error(
      `Tool '${toolName}' ${field} must be a subset of executable ${field}: ${widenedValues.join(', ')}`
    );
  }
}
