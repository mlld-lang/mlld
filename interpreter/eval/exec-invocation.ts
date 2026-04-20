import { randomUUID } from 'crypto';
import type { ExecInvocation } from '@core/types';
import { astLocationToSourceLocation } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import type { ExecutableDefinition } from '@core/types/executable';
import {
  isCommandExecutable,
  isCommandRefExecutable,
  isCodeExecutable,
  isPartialExecutable
} from '@core/types/executable';
import { interpolate } from '../core/interpreter';
import { InterpolationContext } from '../core/interpolation-context';
import {
  isExecutableVariable,
  isRecordVariable,
  VariableMetadataUtils,
  createSimpleTextVariable
} from '@core/types/variable';
import type { Variable, VariableContext, VariableSource } from '@core/types/variable';
import {
  getToolCollectionMetadata,
  type ToolCollection,
  type ToolDefinition
} from '@core/types/tools';
import { applyWithClause } from './with-clause';
import { MlldInterpreterError, MlldPolicyError, MlldSecurityError, CircularReferenceError } from '@core/errors';
import { logger } from '@core/utils/logger';
import { AutoUnwrapManager } from './auto-unwrap-manager';
import { deriveExecutableSourceTaintLabel } from '@core/security/taint';
import {
  asData,
  asText,
  ensureStructuredValue,
  isStructuredValue,
  wrapStructured,
  collectAndMergeParameterDescriptors,
  extractSecurityDescriptor,
  applySecurityDescriptorToStructuredValue,
  type StructuredValue
} from '../utils/structured-value';
import { boundary } from '@interpreter/utils/boundary';
import { inheritExpressionProvenance } from '@core/types/provenance/ExpressionProvenance';
import { coerceValueForStdin } from '../utils/shell-value';
import { wrapExecResult, wrapPipelineResult } from '../utils/structured-exec';
import {
  makeSecurityDescriptor,
  normalizeSecurityDescriptor,
  removeLabelsFromDescriptor,
  type SecurityDescriptor,
  type ToolProvenance
} from '@core/types/security';
import type { FactSourceHandle } from '@core/types/handle';
import { isShelfSlotRefValue } from '@core/types/shelf';
import { normalizeTransformerResult } from '../utils/transformer-result';
import { varMxToSecurityDescriptor, updateVarMxFromDescriptor } from '@core/types/variable/VarMxHelpers';
import type { WhenExpressionNode } from '@core/types/when';
import type { ActiveWhenExpressionContext } from './when-expression';
import { resolveWorkingDirectory } from '../utils/working-directory';
import { PolicyEnforcer } from '@interpreter/policy/PolicyEnforcer';
import { evaluatePolicyAuthorizationDecision } from '@core/policy/authorizations';
import { enforceKeychainAccess } from '@interpreter/policy/keychain-policy';
import { runWithGuardRetry } from '../hooks/guard-retry-runner';
import { getGuardNextAction } from '../hooks/guard-post-retry';
import { expandOperationLabels } from '@core/policy/label-flow';
import {
  buildExecOperationPreview,
  deserializeShadowEnvs
} from './exec/context';
import {
  getStructuredSecurityDescriptor,
  getVariableSecurityDescriptor,
  setStructuredSecurityDescriptor
} from './exec/security-descriptor';
import {
  dispatchBuiltinMethod,
  evaluateBuiltinArguments,
  isBuiltinMethod,
  normalizeBuiltinTargetValue,
  resolveBuiltinInvocationObject
} from './exec/builtins';
import {
  createExecInvocationChunkEffect,
  finalizeExecInvocationStreaming,
  mergeExecInvocationStreamingFromDefinition,
  setupExecInvocationStreaming
} from './exec/streaming';
import {
  bindExecParameterVariables,
  evaluateExecInvocationArgs
} from './exec/args';
import { extractExecDeniedHandlerWhenExpression } from './exec/denied-handler-when';
import { executeNonCommandExecutable } from './exec/non-command-handlers';
import { executeCommandExecutable } from './exec/command-handler';
import { executeCodeExecutable } from './exec/code-handler';
import {
  getCapturedModuleEnv,
  sealCapturedModuleEnv
} from './import/variable-importer/executable/CapturedModuleEnvKeychain';
import {
  applyExecOutputPolicyLabels,
  cloneExecVariableWithNewValue,
  createExecOperationContextAndEnforcePolicy,
  enforceExecParamLabelFlow,
  handleExecPreGuardDecision,
  prepareExecGuardInputs,
  runExecPostGuards,
  runExecPreGuards,
  previewExecGuardArg,
  stringifyExecGuardArg
} from './exec/guard-policy';
import {
  createPolicyAuthorizationValidationError,
  createInvocationPolicyScope,
  resolveInvocationPolicyFragment,
  resolveInvocationPolicyReplaceFlag,
  validateRuntimePolicyAuthorizations
} from './exec/policy-fragment';
import {
  hasRuntimeAuthorizationSurface,
  isRuntimeAuthorizationSurfaceOperation,
  resolveAuthorizationSurfaceOperation,
  resolveEffectiveToolMetadata,
  resolveToolCollectionEntryMetadata,
  type EffectiveToolMetadata
} from './exec/tool-metadata';
import { isHandleWrapper, isFactSourceHandle } from '@core/types/handle';
import { collectProofClaimLabels } from '@interpreter/security/proof-claims';
import { DECLARED_CONTROL_ARG_KNOWN_PATTERNS } from '@core/policy/fact-requirements';
import { matchesLabelPattern } from '@core/policy/fact-labels';
import { createCallMcpConfig } from '../env/executors/call-mcp-config';
import {
  appendInjectedNotesToSystemPrompt,
  appendToolNotesToSystemPrompt
} from '@interpreter/fyi/tool-docs';
import {
  appendShelfNotesToSystemPrompt,
  renderInjectedShelfNotes
} from '@interpreter/shelf/shelf-notes';
import { getNormalizedShelfScope } from '@interpreter/shelf/runtime';
import { logToolCallEvent } from '@interpreter/utils/audit-log';
import { coerceRecordOutput } from './records/coerce-record';
import {
  type RecordDefinition
} from '@core/types/record';
import { resolveValueHandles } from '@interpreter/utils/handle-resolution';
import { descriptorHasExternalInputSource } from '@core/security/url-provenance';
import {
  collectSecurityRelevantArgNamesForOperation,
  repairSecurityRelevantValue
} from '@interpreter/security/runtime-repair';
import {
  traceLlmInvocation,
  traceLlmToolCall,
  traceLlmToolResult
} from '@interpreter/tracing/events';
import {
  applyInvocationScopedRuntimeConfig,
  normalizeInvocationWithClause
} from './exec/scoped-runtime-config';
import {
  applySeedWrites,
  disposeSessionFrame,
  getNormalizedSessionAttachment,
  materializeSession,
  resolveAttachedSessionInstance
} from '@interpreter/session/runtime';
import { resolveConfiguredOutputRecordDefinition } from './records/resolve-record-definition';
import { materializeGuardInputs } from '@interpreter/utils/guard-inputs';
import { emitResolvedAuthorizationTrace } from './exec/authorization-trace';
import { getStaticObjectKey } from '@interpreter/utils/object-compat';
import { isTolerantMatch } from '@interpreter/eval/expressions';

/**
 * Resolve a method/field on an object, handling AST-shaped objects
 * that store fields in `.entries` (pair array) or `.properties` (record).
 * Returns undefined when the field does not exist.
 */
function resolveObjectMethod(obj: unknown, name: string): unknown {
  if (!obj || typeof obj !== 'object') {
    return undefined;
  }
  const record = obj as Record<string, unknown>;
  // AST entry-based objects (new grammar format)
  if (Array.isArray(record.entries)) {
    for (const entry of record.entries) {
      if (
        entry &&
        typeof entry === 'object' &&
        entry.type === 'pair' &&
        getStaticObjectKey(entry.key) === name
      ) {
        return entry.value;
      }
    }
  }
  // AST property-based objects (legacy format) — only when entries aren't present
  if (!Array.isArray(record.entries) && record.type === 'object' && record.properties && typeof record.properties === 'object') {
    return (record.properties as Record<string, unknown>)[name];
  }
  // Plain objects
  return record[name];
}

type CollectionDispatchContext = {
  collection: ToolCollection;
  definition: ToolDefinition;
  toolKey: string;
};

type CollectionDispatchArgEntry = {
  value: unknown;
  stringValue: string;
  originalVariable?: Variable;
  guardVariableCandidate?: Variable;
  expressionSourceVariable?: Variable;
  sourceName?: string;
};

type CollectionDispatchArgNormalization = {
  evaluatedArgs: unknown[];
  evaluatedArgStrings: string[];
  originalVariables: (Variable | undefined)[];
  guardVariableCandidates: (Variable | undefined)[];
  expressionSourceVariables: (Variable | undefined)[];
  argSourceNames: (string | undefined)[];
};

type ExecutableDispatchArgNormalizationOptions = {
  env: Environment;
  executableParamNames: readonly string[];
  visibleParamNames: readonly string[];
  optionalParamNames: readonly string[];
  preserveStructuredArgs?: boolean;
  bind?: Record<string, unknown>;
  evaluatedArgs: readonly unknown[];
  materializedArgs?: readonly unknown[];
  originalVariables: readonly (Variable | undefined)[];
  guardVariableCandidates: readonly (Variable | undefined)[];
  expressionSourceVariables: readonly (Variable | undefined)[];
  argSourceNames: readonly (string | undefined)[];
};

interface LlmResumeState {
  sessionId: string;
  provider: string;
  continuationOf?: string;
  attempt?: number;
}

interface LlmRuntimeResumeConfig extends LlmResumeState {
  continue: boolean;
}

interface LlmResumeEnvelope {
  value: unknown;
  resumeState?: LlmResumeState;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function hasSecurityDescriptorSignals(descriptor: SecurityDescriptor | undefined): boolean {
  return Boolean(
    descriptor &&
      (
        descriptor.labels.length > 0 ||
        descriptor.taint.length > 0 ||
        descriptor.attestations.length > 0 ||
        descriptor.sources.length > 0 ||
        (descriptor.urls?.length ?? 0) > 0
      )
  );
}

function inferStructuredArgType(value: unknown): 'text' | 'json' | 'array' | 'object' {
  if (typeof value === 'string') {
    return 'text';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  if (value && typeof value === 'object') {
    return 'object';
  }
  return 'json';
}

function preserveStructuredArgSecurity(
  value: unknown,
  originalVariable: Variable | undefined,
  preserveStructuredArgs?: boolean
): unknown {
  if (
    !preserveStructuredArgs ||
    !originalVariable ||
    isStructuredValue(value) ||
    isVariable(value) ||
    isShelfSlotRefValue(value)
  ) {
    return value;
  }

  const descriptor = originalVariable.mx
    ? varMxToSecurityDescriptor(originalVariable.mx as VariableContext)
    : undefined;
  if (!hasSecurityDescriptorSignals(descriptor)) {
    return value;
  }

  return wrapStructured(value, inferStructuredArgType(value), undefined, {
    security: descriptor
  });
}

function isVariable(value: unknown): value is Variable {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'type' in value &&
    'name' in value &&
    'value' in value &&
    'source' in value
  );
}

function getToolCollectionFromValue(value: unknown): ToolCollection | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const metadata = getToolCollectionMetadata(value);
  return metadata?.auth ? (value as ToolCollection) : undefined;
}

function getToolDefinitionBind(definition: ToolDefinition): Record<string, unknown> | undefined {
  return isPlainObject(definition.bind) ? definition.bind : undefined;
}

function getCollectionVisibleParams(
  executableParamNames: readonly string[],
  definition: ToolDefinition
): string[] {
  const boundKeys = new Set(Object.keys(getToolDefinitionBind(definition) ?? {}));
  return executableParamNames.filter(param => !boundKeys.has(param));
}

async function resolveCollectionBoundValue(
  value: unknown,
  env: Environment,
  options?: {
    preserveStructuredArgs?: boolean;
  }
): Promise<unknown> {
  const { extractVariableValue, isVariable } = await import('../utils/variable-resolution');

  if (isVariable(value)) {
    if (isExecutableVariable(value)) {
      return value;
    }
    const extracted = await extractVariableValue(value, env);
    return resolveCollectionBoundValue(extracted, env, options);
  }
  if (isStructuredValue(value)) {
    return options?.preserveStructuredArgs ? value : boundary.plainData(value);
  }
  if (Array.isArray(value)) {
    return Promise.all(value.map(item => resolveCollectionBoundValue(item, env, options)));
  }
  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = await resolveCollectionBoundValue(entry, env, options);
    }
    return result;
  }
  return value;
}

async function materializeCollectionDispatchArg(
  value: unknown,
  env: Environment,
  options?: {
    preserveStructuredArgs?: boolean;
  }
): Promise<unknown> {
  let resolved = value;

  if (
    isPlainObject(resolved)
    && resolved.type === 'object'
    && (Array.isArray((resolved as { entries?: unknown[] }).entries)
      || isPlainObject((resolved as { properties?: unknown }).properties))
  ) {
    const { evaluateDataValue } = await import('@interpreter/eval/data-value-evaluator');
    resolved = await evaluateDataValue(resolved as any, env);
  }

  return resolveCollectionBoundValue(resolved, env, options);
}

async function materializePlainObjectExecutableDispatchArg(
  value: unknown,
  env: Environment,
  options?: {
    preserveStructuredArgs?: boolean;
  }
): Promise<unknown> {
  let resolved = value;
  const { extractVariableValue, isVariable } = await import('../utils/variable-resolution');

  if (isVariable(resolved)) {
    if (isExecutableVariable(resolved)) {
      return resolved;
    }
    resolved = await extractVariableValue(resolved, env);
  }

  if (isStructuredValue(resolved)) {
    return options?.preserveStructuredArgs ? resolved : boundary.plainData(resolved);
  }

  if (
    resolved
    && typeof resolved === 'object'
    && (
      (
        (resolved as { type?: unknown }).type === 'object'
        && (
          Array.isArray((resolved as { entries?: unknown[] }).entries)
          || isPlainObject((resolved as { properties?: unknown }).properties)
        )
      )
      || (
        (resolved as { type?: unknown }).type === 'array'
        && (
          Array.isArray((resolved as { items?: unknown[] }).items)
          || Array.isArray((resolved as { elements?: unknown[] }).elements)
        )
      )
    )
  ) {
    const { evaluateDataValue } = await import('@interpreter/eval/data-value-evaluator');
    resolved = await evaluateDataValue(resolved as any, env);
  }

  return resolved;
}

async function normalizeCollectionDispatchArguments(options: {
  env: Environment;
  executableParamNames: readonly string[];
  definition: ToolDefinition;
  metadata?: EffectiveToolMetadata;
  preserveStructuredArgs?: boolean;
  evaluatedArgs: readonly unknown[];
  originalVariables: readonly (Variable | undefined)[];
  guardVariableCandidates: readonly (Variable | undefined)[];
  expressionSourceVariables: readonly (Variable | undefined)[];
  argSourceNames: readonly (string | undefined)[];
}): Promise<CollectionDispatchArgNormalization> {
  const {
    definition,
    executableParamNames,
    ...rest
  } = options;

  return normalizeExecutableDispatchArguments({
    ...rest,
    executableParamNames,
    visibleParamNames: options.metadata?.params ?? getCollectionVisibleParams(executableParamNames, definition),
    optionalParamNames: options.metadata?.optionalParams ?? [],
    bind: getToolDefinitionBind(definition)
  });
}

async function normalizePlainObjectExecutableDispatchArguments(options: {
  env: Environment;
  executableParamNames: readonly string[];
  optionalParamNames: readonly string[];
  preserveStructuredArgs?: boolean;
  evaluatedArgs: readonly unknown[];
  originalVariables: readonly (Variable | undefined)[];
  guardVariableCandidates: readonly (Variable | undefined)[];
  expressionSourceVariables: readonly (Variable | undefined)[];
  argSourceNames: readonly (string | undefined)[];
}): Promise<CollectionDispatchArgNormalization> {
  const {
    executableParamNames,
    optionalParamNames,
    env,
    preserveStructuredArgs,
    evaluatedArgs,
    originalVariables,
    guardVariableCandidates,
    expressionSourceVariables,
    argSourceNames
  } = options;

  const materializedArgs = await Promise.all(
    evaluatedArgs.map(arg =>
      materializePlainObjectExecutableDispatchArg(arg, env, { preserveStructuredArgs })
    )
  );

  return normalizeExecutableDispatchArguments({
    env,
    executableParamNames,
    visibleParamNames: executableParamNames,
    optionalParamNames,
    preserveStructuredArgs,
    evaluatedArgs: materializedArgs,
    materializedArgs,
    originalVariables,
    guardVariableCandidates,
    expressionSourceVariables,
    argSourceNames
  });
}

async function normalizeExecutableDispatchArguments(
  options: ExecutableDispatchArgNormalizationOptions
): Promise<CollectionDispatchArgNormalization> {
  const {
    env,
    executableParamNames,
    visibleParamNames,
    optionalParamNames,
    bind,
    evaluatedArgs,
    materializedArgs,
    originalVariables,
    guardVariableCandidates,
    expressionSourceVariables,
    argSourceNames,
    preserveStructuredArgs
  } = options;

  if (executableParamNames.length === 0) {
    return {
      evaluatedArgs: [],
      evaluatedArgStrings: [],
      originalVariables: [],
      guardVariableCandidates: [],
      expressionSourceVariables: [],
      argSourceNames: []
    };
  }

  const optionalSet = new Set(
    optionalParamNames.filter(
      (param): param is string => typeof param === 'string' && param.trim().length > 0
    )
  );
  const visibleSet = new Set(visibleParamNames);
  const normalizedEntries = new Map<string, CollectionDispatchArgEntry>();
  const normalizedMaterializedArgs = materializedArgs
    ? materializedArgs.map((arg, index) =>
        preserveStructuredArgSecurity(arg, originalVariables[index], preserveStructuredArgs)
      )
    : await Promise.all(
        evaluatedArgs.map(arg => materializeCollectionDispatchArg(arg, env, { preserveStructuredArgs }))
      ).then(args =>
        args.map((arg, index) =>
          preserveStructuredArgSecurity(arg, originalVariables[index], preserveStructuredArgs)
        )
      );

  const shouldSpreadNamedObject =
    normalizedMaterializedArgs.length === 1
    && isPlainObject(normalizedMaterializedArgs[0])
    && Object.keys(normalizedMaterializedArgs[0]).every(key => visibleSet.has(key))
    && visibleParamNames
      .filter(param => !optionalSet.has(param))
      .every(param => Object.prototype.hasOwnProperty.call(normalizedMaterializedArgs[0], param));

  if (shouldSpreadNamedObject) {
    const objectArg = normalizedMaterializedArgs[0] as Record<string, unknown>;
    for (const paramName of visibleParamNames) {
      if (!Object.prototype.hasOwnProperty.call(objectArg, paramName)) {
        continue;
      }
      const value = objectArg[paramName];
      normalizedEntries.set(paramName, {
        value,
        stringValue: stringifyExecGuardArg(value),
        sourceName: paramName
      });
    }
  } else {
    const providedCount = Math.min(normalizedMaterializedArgs.length, visibleParamNames.length);
    for (let index = 0; index < providedCount; index += 1) {
      const paramName = visibleParamNames[index];
      normalizedEntries.set(paramName, {
        value: normalizedMaterializedArgs[index],
        stringValue: stringifyExecGuardArg(normalizedMaterializedArgs[index]),
        originalVariable: originalVariables[index],
        guardVariableCandidate: guardVariableCandidates[index],
        expressionSourceVariable: expressionSourceVariables[index],
        sourceName: argSourceNames[index] ?? paramName
      });
    }
  }

  const nextArgs: unknown[] = [];
  const nextArgStrings: string[] = [];
  const nextOriginalVariables: (Variable | undefined)[] = [];
  const nextGuardVariableCandidates: (Variable | undefined)[] = [];
  const nextExpressionSourceVariables: (Variable | undefined)[] = [];
  const nextArgSourceNames: (string | undefined)[] = [];

  let lastRelevantIndex = -1;
  for (let index = 0; index < executableParamNames.length; index += 1) {
    const paramName = executableParamNames[index];
    let entry = normalizedEntries.get(paramName);

    if (!entry && bind && Object.prototype.hasOwnProperty.call(bind, paramName)) {
      const value = await resolveCollectionBoundValue(bind[paramName], env, { preserveStructuredArgs });
      entry = {
        value,
        stringValue: stringifyExecGuardArg(value),
        sourceName: paramName
      };
    }

    nextArgs[index] = entry?.value;
    nextArgStrings[index] = entry?.stringValue ?? 'undefined';
    nextOriginalVariables[index] = entry?.originalVariable;
    nextGuardVariableCandidates[index] = entry?.guardVariableCandidate;
    nextExpressionSourceVariables[index] = entry?.expressionSourceVariable;
    nextArgSourceNames[index] = entry?.sourceName;

    if (entry) {
      lastRelevantIndex = index;
    }
  }

  if (lastRelevantIndex === -1) {
    return {
      evaluatedArgs: [],
      evaluatedArgStrings: [],
      originalVariables: [],
      guardVariableCandidates: [],
      expressionSourceVariables: [],
      argSourceNames: []
    };
  }

  return {
    evaluatedArgs: nextArgs.slice(0, lastRelevantIndex + 1),
    evaluatedArgStrings: nextArgStrings.slice(0, lastRelevantIndex + 1),
    originalVariables: nextOriginalVariables.slice(0, lastRelevantIndex + 1),
    guardVariableCandidates: nextGuardVariableCandidates.slice(0, lastRelevantIndex + 1),
    expressionSourceVariables: nextExpressionSourceVariables.slice(0, lastRelevantIndex + 1),
    argSourceNames: nextArgSourceNames.slice(0, lastRelevantIndex + 1)
  };
}

async function ensureCapturedModuleEnvMap(
  variableLike:
    | ({ internal?: Record<string, unknown> } & Record<string, unknown>)
    | undefined,
  targetEnv?: Environment
): Promise<Map<string, Variable> | undefined> {
  const rawCaptured =
    getCapturedModuleEnv(variableLike?.internal)
    ?? getCapturedModuleEnv(variableLike);
  if (!rawCaptured) {
    return undefined;
  }
  if (rawCaptured instanceof Map) {
    return rawCaptured as Map<string, Variable>;
  }
  if (typeof rawCaptured !== 'object') {
    return undefined;
  }

  const { VariableImporter } = await import('./import/VariableImporter');
  const { ObjectReferenceResolver } = await import('./import/ObjectReferenceResolver');
  const importer = new VariableImporter(new ObjectReferenceResolver());
  const moduleEnvMap = importer.deserializeModuleEnv(rawCaptured, targetEnv);

  if (variableLike?.internal) {
    sealCapturedModuleEnv(variableLike.internal, moduleEnvMap);
  }

  return moduleEnvMap;
}

async function resolveCollectionExecutableForDispatch(options: {
  env: Environment;
  execName: string;
  executableRef?: unknown;
  collection?: ToolCollection;
  definition?: ToolDefinition;
  sourceVariable?:
    | ({ internal?: Record<string, unknown> } & Record<string, unknown>)
    | undefined;
}): Promise<unknown> {
  const { env, execName, executableRef, collection, definition, sourceVariable } = options;
  if (executableRef && typeof executableRef === 'object') {
    if (isExecutableVariable(executableRef as any)) {
      return executableRef;
    }
    if (
      '__executable' in (executableRef as Record<string, unknown>)
      && Boolean((executableRef as { __executable?: unknown }).__executable)
    ) {
      return executableRef;
    }
  }

  return (
    env.getVariable(execName)
    ?? (await ensureCapturedModuleEnvMap(sourceVariable))?.get(execName)
    ?? (await ensureCapturedModuleEnvMap(collection as Record<string, unknown> | undefined))?.get(execName)
    ?? (await ensureCapturedModuleEnvMap(definition as Record<string, unknown> | undefined))?.get(execName)
  );
}

function normalizeCollectionExecutableReferenceName(value: unknown): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  }

  if (value && typeof value === 'object' && isExecutableVariable(value as any)) {
    const name = typeof (value as { name?: unknown }).name === 'string'
      ? (value as { name: string }).name.trim()
      : '';
    return name.startsWith('@') ? name.slice(1) : name;
  }

  if (
    value
    && typeof value === 'object'
    && '__executable' in (value as Record<string, unknown>)
    && Boolean((value as { __executable?: unknown }).__executable)
  ) {
    const name = typeof (value as { name?: unknown }).name === 'string'
      ? (value as { name: string }).name.trim()
      : '';
    return name.startsWith('@') ? name.slice(1) : name;
  }

  return '';
}

function isPassthroughVariableReferenceArg(
  value: unknown,
  paramName: string | undefined
): boolean {
  if (!paramName || !value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as {
    type?: unknown;
    identifier?: unknown;
    fields?: unknown;
    pipes?: unknown;
  };

  return (
    candidate.type === 'VariableReference' &&
    candidate.identifier === paramName &&
    (!Array.isArray(candidate.fields) || candidate.fields.length === 0) &&
    (!Array.isArray(candidate.pipes) || candidate.pipes.length === 0)
  );
}

function getCommandRefTargetInfo(
  source: unknown
): {
  targetName?: string;
  objectName?: string;
  methodName?: string;
  firstArg?: unknown;
} | null {
  const commandRef =
    source && typeof source === 'object' && (source as { type?: unknown }).type === 'ExecInvocation'
      ? (source as { commandRef?: unknown }).commandRef
      : source;

  if (!commandRef || typeof commandRef !== 'object') {
    return null;
  }

  const ref = commandRef as {
    name?: unknown;
    identifier?: unknown;
    args?: unknown[];
    objectReference?: { type?: unknown; identifier?: unknown };
  };
  const firstArg = Array.isArray(ref.args) ? ref.args[0] : undefined;
  const methodName = typeof ref.name === 'string' ? ref.name : undefined;
  const objectName =
    ref.objectReference?.type === 'VariableReference' && typeof ref.objectReference.identifier === 'string'
      ? ref.objectReference.identifier
      : undefined;

  if (objectName && methodName) {
    return { objectName, methodName, firstArg };
  }

  if (typeof ref.identifier === 'string') {
    return { targetName: ref.identifier, firstArg };
  }

  if (Array.isArray(ref.identifier) && ref.identifier.length > 0) {
    const identifierNode = ref.identifier[0] as { type?: unknown; identifier?: unknown } | undefined;
    if (identifierNode?.type === 'VariableReference' && typeof identifierNode.identifier === 'string') {
      return { targetName: identifierNode.identifier, firstArg };
    }
  }

  if (methodName) {
    return { targetName: methodName, firstArg };
  }

  return null;
}

function preservesFirstArgForPolicyBuilderChain(
  variable: Variable | undefined,
  definition: ExecutableDefinition | undefined,
  env: Environment,
  seen = new Set<string>()
): boolean {
  if (!variable || !definition || !isCommandRefExecutable(definition)) {
    return false;
  }

  const variableKey = variable.name || '__anonymous_exec__';
  if (seen.has(variableKey)) {
    return false;
  }
  seen.add(variableKey);

  const target = getCommandRefTargetInfo(definition.commandRefAst ?? {
    name: definition.commandRef,
    identifier: definition.commandRef,
    args: definition.commandArgs
  });
  if (!target) {
    return false;
  }

  const firstParam = definition.paramNames?.[0];
  if (!isPassthroughVariableReferenceArg(target.firstArg, firstParam)) {
    return false;
  }

  if (
    target.objectName === 'policy' &&
    (target.methodName === 'build' || target.methodName === 'validate')
  ) {
    return true;
  }

  if (!target.targetName) {
    return false;
  }

  const nextVariable = env.getVariable(target.targetName);
  if (!nextVariable || !isExecutableVariable(nextVariable)) {
    return false;
  }

  return preservesFirstArgForPolicyBuilderChain(
    nextVariable,
    nextVariable.internal?.executableDef as ExecutableDefinition | undefined,
    env,
    seen
  );
}

/**
 * Resolve stdin input from expression using shared shell classification.
 */
type ResolvedStdinInput = {
  text: string;
  descriptor?: SecurityDescriptor;
};

async function resolveStdinInput(
  stdinSource: unknown,
  env: Environment
): Promise<ResolvedStdinInput> {
  if (stdinSource === null || stdinSource === undefined) {
    return { text: '' };
  }

  const { evaluate } = await import('../core/interpreter');
  const result = await evaluate(stdinSource as any, env, { isExpression: true });
  let value = result.value;
  const descriptor = extractSecurityDescriptor(value, {
    recursive: true,
    mergeArrayElements: true
  });

  const { isVariable, resolveValue, ResolutionContext } = await import('../utils/variable-resolution');
  if (isVariable(value)) {
    value = await resolveValue(value, env, ResolutionContext.CommandExecution);
  }

  return { text: coerceValueForStdin(value), descriptor };
}

const chainDebugEnabled = process.env.MLLD_DEBUG_CHAINING === '1';
function chainDebug(message: string, payload?: Record<string, unknown>): void {
  if (!chainDebugEnabled) {
    return;
  }
  try {
    const serialized = payload ? ` ${JSON.stringify(payload)}` : '';
    process.stdout.write(`[CHAIN] ${message}${serialized}\n`);
  } catch {
    process.stdout.write(`[CHAIN] ${message}\n`);
  }
}

function hasUntrustedWithoutTrusted(descriptor?: SecurityDescriptor): boolean {
  if (!descriptor) {
    return false;
  }
  const hasUntrusted =
    descriptor.labels.includes('untrusted') || descriptor.taint.includes('untrusted');
  const hasTrusted =
    descriptor.labels.includes('trusted') || descriptor.taint.includes('trusted');
  return hasUntrusted && !hasTrusted;
}

function hasDescriptorLabel(descriptor: SecurityDescriptor | undefined, label: string): boolean {
  if (!descriptor) {
    return false;
  }
  return descriptor.labels.includes(label) || descriptor.taint.includes(label);
}

function stripTrustedFromDescriptor(descriptor: SecurityDescriptor): SecurityDescriptor {
  return removeLabelsFromDescriptor(descriptor, ['trusted']) ?? descriptor;
}

function stripUntrustedFromDescriptor(descriptor: SecurityDescriptor): SecurityDescriptor {
  return removeLabelsFromDescriptor(descriptor, ['untrusted']) ?? descriptor;
}

const resolveVariableIndexValue = async (fieldValue: any, env: Environment): Promise<unknown> => {
  const { evaluateDataValue } = await import('./data-value-evaluator');
  const node =
    typeof fieldValue === 'object'
      ? (fieldValue as any)
      : {
          type: 'VariableReference',
          valueType: 'varIdentifier',
          identifier: String(fieldValue)
        };
  return evaluateDataValue(node as any, env);
};

function buildToolCallArguments(
  paramNames: readonly string[],
  evaluatedArgs: readonly unknown[]
): Record<string, unknown> | undefined {
  if (evaluatedArgs.length === 0) {
    return undefined;
  }

  if (
    paramNames.length === 0 &&
    evaluatedArgs.length === 1 &&
    evaluatedArgs[0] &&
    typeof evaluatedArgs[0] === 'object' &&
    !Array.isArray(evaluatedArgs[0])
  ) {
    return { ...(evaluatedArgs[0] as Record<string, unknown>) };
  }

  const argsRecord: Record<string, unknown> = {};
  for (let index = 0; index < evaluatedArgs.length; index += 1) {
    const paramName = paramNames[index];
    const key = typeof paramName === 'string' && paramName.trim().length > 0
      ? paramName
      : `arg${index}`;
    argsRecord[key] = evaluatedArgs[index];
  }
  return argsRecord;
}

function buildEffectiveToolCallArguments(options: {
  paramNames: readonly string[];
  evaluatedArgs: readonly unknown[];
  metadata?: Pick<EffectiveToolMetadata, 'params' | 'inputSchema'>;
}): Record<string, unknown> | undefined {
  const { paramNames, evaluatedArgs, metadata } = options;
  const inputSchema = metadata?.inputSchema;
  if (
    inputSchema?.wholeObjectInput === true &&
    evaluatedArgs.length === 1 &&
    isPlainObject(evaluatedArgs[0])
  ) {
    const visibleParams = new Set(
      (metadata?.params?.length ? metadata.params : inputSchema.visibleParams)
        .filter((param): param is string => typeof param === 'string' && param.trim().length > 0)
    );
    return Object.fromEntries(
      Object.entries(evaluatedArgs[0] as Record<string, unknown>)
        .filter(([key]) => visibleParams.size === 0 || visibleParams.has(key))
    );
  }
  return buildToolCallArguments(paramNames, evaluatedArgs);
}

function hasUntrustedDescriptor(value: unknown): boolean {
  const descriptor = extractSecurityDescriptor(value, {
    recursive: true,
    mergeArrayElements: true
  });
  if (!descriptor) {
    return false;
  }
  return descriptor.labels.includes('untrusted') || descriptor.taint.includes('untrusted');
}

function hasAcceptedProofForInput(value: unknown): boolean {
  const descriptor = extractSecurityDescriptor(value, {
    recursive: true,
    mergeArrayElements: true
  });
  const proofLabels = collectProofClaimLabels(descriptor);
  return proofLabels.some(label =>
    DECLARED_CONTROL_ARG_KNOWN_PATTERNS.some(pattern => matchesLabelPattern(pattern, label))
  );
}

function cloneFactSources(
  factsources: readonly FactSourceHandle[] | undefined
): readonly FactSourceHandle[] | undefined {
  return Array.isArray(factsources) && factsources.length > 0
    ? [...factsources]
    : undefined;
}

function collectInvocationArgDescriptor(
  candidate: unknown
): SecurityDescriptor | undefined {
  if (isVariable(candidate)) {
    return getVariableSecurityDescriptor(candidate);
  }
  if (isStructuredValue(candidate)) {
    return getStructuredSecurityDescriptor(candidate);
  }
  return extractSecurityDescriptor(candidate, {
    recursive: true,
    mergeArrayElements: true
  });
}

function collectInvocationArgFactSources(
  candidate: unknown
): readonly FactSourceHandle[] | undefined {
  if (isVariable(candidate)) {
    return cloneFactSources(candidate.mx?.factsources);
  }
  if (isStructuredValue(candidate)) {
    return cloneFactSources(candidate.metadata?.factsources ?? candidate.mx?.factsources);
  }
  if (!candidate || typeof candidate !== 'object') {
    return undefined;
  }

  const recordCandidate = candidate as {
    mx?: { factsources?: readonly FactSourceHandle[] };
    metadata?: { factsources?: readonly FactSourceHandle[] };
  };
  return cloneFactSources(recordCandidate.metadata?.factsources ?? recordCandidate.mx?.factsources);
}

function mergeInvocationArgDescriptors(options: {
  env: Environment;
  evaluatedArgs: readonly unknown[];
  originalVariables: readonly (Variable | undefined)[];
  guardVariableCandidates: readonly (Variable | undefined)[];
  expressionSourceVariables: readonly (Variable | undefined)[];
  argSecurityDescriptors?: readonly (SecurityDescriptor | undefined)[];
}): readonly (SecurityDescriptor | undefined)[] | undefined {
  const {
    env,
    evaluatedArgs,
    originalVariables,
    guardVariableCandidates,
    expressionSourceVariables,
    argSecurityDescriptors
  } = options;
  const descriptorCount = Math.max(
    evaluatedArgs.length,
    originalVariables.length,
    guardVariableCandidates.length,
    expressionSourceVariables.length,
    argSecurityDescriptors?.length ?? 0
  );
  if (descriptorCount === 0) {
    return argSecurityDescriptors;
  }

  const descriptors = Array.from(
    { length: descriptorCount },
    (_unused, index) => argSecurityDescriptors?.[index]
  );
  let changed = false;

  for (let index = 0; index < descriptorCount; index += 1) {
    const sourceDescriptors = [
      collectInvocationArgDescriptor(originalVariables[index]),
      collectInvocationArgDescriptor(guardVariableCandidates[index]),
      collectInvocationArgDescriptor(evaluatedArgs[index])
    ].filter((descriptor): descriptor is SecurityDescriptor => Boolean(descriptor));
    if (sourceDescriptors.length === 0) {
      continue;
    }

    const merged =
      sourceDescriptors.length === 1
        ? sourceDescriptors[0]
        : env.mergeSecurityDescriptors(...sourceDescriptors);
    descriptors[index] = descriptors[index]
      ? env.mergeSecurityDescriptors(descriptors[index]!, merged)
      : merged;
    changed = true;
  }

  return changed ? descriptors : argSecurityDescriptors;
}

function mergeInvocationArgFactSources(options: {
  evaluatedArgs: readonly unknown[];
  originalVariables: readonly (Variable | undefined)[];
  guardVariableCandidates: readonly (Variable | undefined)[];
  expressionSourceVariables: readonly (Variable | undefined)[];
  argFactSourceDescriptors?: readonly (readonly FactSourceHandle[] | undefined)[];
}): readonly (readonly FactSourceHandle[] | undefined)[] | undefined {
  const {
    evaluatedArgs,
    originalVariables,
    guardVariableCandidates,
    expressionSourceVariables,
    argFactSourceDescriptors
  } = options;
  const descriptorCount = Math.max(
    evaluatedArgs.length,
    originalVariables.length,
    guardVariableCandidates.length,
    expressionSourceVariables.length,
    argFactSourceDescriptors?.length ?? 0
  );
  if (descriptorCount === 0) {
    return argFactSourceDescriptors;
  }

  const factsourceDescriptors = Array.from(
    { length: descriptorCount },
    (_unused, index) => cloneFactSources(argFactSourceDescriptors?.[index])
  );
  let changed = false;

  for (let index = 0; index < descriptorCount; index += 1) {
    const merged = new Map<string, FactSourceHandle>();
    const push = (factsources: readonly FactSourceHandle[] | undefined): void => {
      for (const handle of factsources ?? []) {
        const key = `${handle.instanceKey ?? ''}::${handle.coercionId ?? ''}::${handle.position ?? ''}::${handle.ref}`;
        if (!merged.has(key)) {
          merged.set(key, handle);
        }
      }
    };

    push(argFactSourceDescriptors?.[index]);
    push(collectInvocationArgFactSources(originalVariables[index]));
    push(collectInvocationArgFactSources(guardVariableCandidates[index]));
    push(collectInvocationArgFactSources(evaluatedArgs[index]));

    if (merged.size === 0) {
      continue;
    }

    const nextFactsources = Array.from(merged.values());
    const current = factsourceDescriptors[index];
    if (
      !Array.isArray(current)
      || current.length !== nextFactsources.length
      || current.some((entry, entryIndex) => entry !== nextFactsources[entryIndex])
    ) {
      factsourceDescriptors[index] = nextFactsources;
      changed = true;
    }
  }

  return changed ? factsourceDescriptors : argFactSourceDescriptors;
}

function buildToolInputValidationArguments(options: {
  paramNames: readonly string[];
  evaluatedArgs: readonly unknown[];
  metadata?: Pick<EffectiveToolMetadata, 'params' | 'inputSchema'>;
  argSecurityDescriptors?: readonly (SecurityDescriptor | undefined)[];
  argFactSourceDescriptors?: readonly (readonly FactSourceHandle[] | undefined)[];
}): Record<string, unknown> | undefined {
  const {
    paramNames,
    evaluatedArgs,
    metadata,
    argSecurityDescriptors,
    argFactSourceDescriptors
  } = options;

  const withInvocationMetadata = (value: unknown, index: number): unknown => {
    const descriptor = argSecurityDescriptors?.[index];
    const factsources = argFactSourceDescriptors?.[index];
    if (!descriptor && (!Array.isArray(factsources) || factsources.length === 0)) {
      return value;
    }

    const structured = isStructuredValue(value)
      ? ensureStructuredValue(
          value.data,
          value.type,
          getMaterializedStructuredText(value),
          value.metadata
        )
      : wrapStructured(value as any);
    if (descriptor) {
      applySecurityDescriptorToStructuredValue(structured, descriptor);
    }
    if (Array.isArray(factsources) && factsources.length > 0) {
      structured.metadata = {
        ...(structured.metadata ?? {}),
        factsources: [...factsources]
      };
      structured.mx.factsources = [...factsources];
    }
    return structured;
  };

  if (
    metadata?.inputSchema?.wholeObjectInput === true &&
    evaluatedArgs.length === 1 &&
    isPlainObject(evaluatedArgs[0])
  ) {
    const flattened = buildEffectiveToolCallArguments({
      paramNames,
      evaluatedArgs,
      metadata
    });
    if (!flattened) {
      return undefined;
    }
    return Object.fromEntries(
      Object.entries(flattened).map(([key, value]) => [
        key,
        withInvocationMetadata(value, 0)
      ])
    );
  }

  const validationArgs = evaluatedArgs.map((value, index) => withInvocationMetadata(value, index));

  return buildToolCallArguments(paramNames, validationArgs);
}

function collectInputFactSources(value: unknown, seen = new Set<unknown>()): FactSourceHandle[] {
  const collected: FactSourceHandle[] = [];

  const push = (candidate: unknown): void => {
    if (!Array.isArray(candidate)) {
      return;
    }
    for (const entry of candidate) {
      if (isFactSourceHandle(entry)) {
        collected.push(entry);
      }
    }
  };

  const visit = (candidate: unknown): void => {
    if (!candidate || typeof candidate !== 'object') {
      return;
    }
    if (seen.has(candidate)) {
      return;
    }
    seen.add(candidate);

    if (isVariable(candidate)) {
      push(candidate.mx?.factsources);
      visit(candidate.value);
      return;
    }

    if (isStructuredValue(candidate)) {
      push(candidate.metadata?.factsources);
      push(candidate.mx?.factsources);
      visit(candidate.data);
      return;
    }

    const recordCandidate = candidate as {
      mx?: { factsources?: readonly unknown[] };
      metadata?: { factsources?: readonly unknown[] };
    };
    push(recordCandidate.mx?.factsources);
    push(recordCandidate.metadata?.factsources);

    if (Array.isArray(candidate)) {
      for (const entry of candidate) {
        visit(entry);
      }
      return;
    }

    if (isPlainObject(candidate)) {
      for (const entry of Object.values(candidate)) {
        visit(entry);
      }
    }
  };

  visit(value);

  const deduped = new Map<string, FactSourceHandle>();
  for (const handle of collected) {
    const key = `${handle.instanceKey ?? ''}::${handle.coercionId ?? ''}::${handle.position ?? ''}::${handle.ref}`;
    if (!deduped.has(key)) {
      deduped.set(key, handle);
    }
  }
  return Array.from(deduped.values());
}

function collectCorrelationKeys(factsources: readonly FactSourceHandle[]): string[] {
  return factsources
    .map(handle => {
      if (typeof handle.instanceKey === 'string' && handle.instanceKey.length > 0) {
        return `instance:${handle.instanceKey}`;
      }
      if (typeof handle.coercionId === 'string' && typeof handle.position === 'number') {
        return `coercion:${handle.coercionId}:${handle.position}`;
      }
      return undefined;
    })
    .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

function matchesInputType(value: unknown, expected: string | undefined): boolean {
  if (!expected) {
    return true;
  }

  const resolved = isStructuredValue(value) ? asData(value) : value;
  switch (expected) {
    case 'string':
      return typeof resolved === 'string';
    case 'number':
      return typeof resolved === 'number' && Number.isFinite(resolved);
    case 'boolean':
      return typeof resolved === 'boolean';
    case 'array':
      return Array.isArray(resolved);
    case 'object':
      return isPlainObject(resolved);
    case 'handle':
      return isHandleWrapper(resolved);
    default:
      return true;
  }
}

function unwrapPolicySetComparableValue(value: unknown): unknown {
  let resolved = value;
  if (isVariable(resolved)) {
    resolved = resolved.value;
  }
  if (isStructuredValue(resolved)) {
    resolved = asData(resolved);
  }

  if (isPlainObject(resolved) && Object.prototype.hasOwnProperty.call(resolved, 'value')) {
    return unwrapPolicySetComparableValue((resolved as Record<string, unknown>).value);
  }

  if (isPlainObject(resolved) && Object.prototype.hasOwnProperty.call(resolved, 'eq')) {
    return unwrapPolicySetComparableValue((resolved as Record<string, unknown>).eq);
  }

  if (isPlainObject(resolved) && Array.isArray((resolved as Record<string, unknown>).oneOf)) {
    return ((resolved as Record<string, unknown>).oneOf as unknown[]).map(entry =>
      unwrapPolicySetComparableValue(entry)
    );
  }

  return resolved;
}

function validateToolInputSchema(options: {
  env: Environment;
  metadata: EffectiveToolMetadata;
  args: Record<string, unknown> | undefined;
}): void {
  const { env, metadata, args } = options;
  const inputSchema = metadata.inputSchema;
  if (!inputSchema) {
    return;
  }

  const providedArgs = args ?? {};
  const fieldMap = new Map(inputSchema.fields.map(field => [field.name, field]));
  const throwDispatchPolicyError = (params: {
    code: 'allowlist_mismatch' | 'blocklist_match' | 'proofless_control_arg' | 'proofless_source_arg' | 'correlate_mismatch';
    message: string;
    field?: string;
    hint: string;
  }): never => {
    throw new MlldPolicyError(
      params.message,
      {
        code: params.code,
        phase: 'dispatch',
        direction: 'input',
        tool: metadata.name,
        ...(params.field ? { field: params.field } : {}),
        hint: params.hint
      },
      { env }
    );
  };

  const correlationSets: string[][] = [];
  for (const field of inputSchema.fields) {
    const hasValue = Object.prototype.hasOwnProperty.call(providedArgs, field.name)
      && providedArgs[field.name] !== undefined;
    if (!hasValue) {
      if (!field.optional) {
        throw new Error(`Tool '${metadata.name}' is missing required input '${field.name}'`);
      }
      continue;
    }

    const value = providedArgs[field.name];
    if (!matchesInputType(value, field.valueType)) {
      throw new Error(`Tool '${metadata.name}' input '${field.name}' must be ${field.valueType}`);
    }
    if (field.classification === 'fact') {
      if (!hasAcceptedProofForInput(value)) {
        throwDispatchPolicyError({
          code: isToolWriteLabelSet(metadata.labels) ? 'proofless_control_arg' : 'proofless_source_arg',
          message: `Tool '${metadata.name}' input '${field.name}' must carry known or fact proof`,
          field: field.name,
          hint: `Pass '${field.name}' as a known or fact-backed value before calling '${metadata.name}'.`
        });
      }
      if (inputSchema.correlate) {
        correlationSets.push(collectCorrelationKeys(collectInputFactSources(value)));
      }
      continue;
    }
    if (field.dataTrust === 'trusted' && hasUntrustedDescriptor(value)) {
      throw new Error(`Tool '${metadata.name}' trusted input '${field.name}' cannot carry untrusted taint`);
    }
  }

  const resolvePolicySetMembers = (
    target: { kind: 'reference'; name: string } | { kind: 'array'; values: unknown[] }
  ): unknown[] => {
    if (target.kind === 'array') {
      return [...target.values];
    }

    const variable = env.getVariable(target.name);
    if (!variable) {
      return [];
    }

    let resolved: unknown = variable;
    if (isVariable(resolved)) {
      resolved = resolved.value;
    }
    if (isStructuredValue(resolved)) {
      resolved = asData(resolved);
    }

    if (Array.isArray(resolved)) {
      return resolved;
    }

    return resolved === undefined ? [] : [resolved];
  };

  const valueMatchesPolicySet = (
    value: unknown,
    target: { kind: 'reference'; name: string } | { kind: 'array'; values: unknown[] }
  ): boolean => {
    const members = resolvePolicySetMembers(target);
    if (members.length === 0) {
      return false;
    }

    const matchesCandidate = (candidate: unknown): boolean => {
      const comparable = unwrapPolicySetComparableValue(candidate);
      if (Array.isArray(comparable)) {
        return comparable.every(entry => matchesCandidate(entry));
      }
      return members.some(member => isTolerantMatch(comparable, member));
    };

    if (Array.isArray(value)) {
      return value.every(entry => matchesCandidate(entry));
    }

    return matchesCandidate(value);
  };

  for (const [fieldName, target] of Object.entries(inputSchema.allowlist ?? {})) {
    if (!Object.prototype.hasOwnProperty.call(providedArgs, fieldName)) {
      continue;
    }
    if (!valueMatchesPolicySet(providedArgs[fieldName], target)) {
      throwDispatchPolicyError({
        code: 'allowlist_mismatch',
        message: `Tool '${metadata.name}' input '${fieldName}' must match its allowlist`,
        field: fieldName,
        hint: `Provide '${fieldName}' from the declared allowlist before calling '${metadata.name}'.`
      });
    }
  }

  for (const [fieldName, target] of Object.entries(inputSchema.blocklist ?? {})) {
    if (!Object.prototype.hasOwnProperty.call(providedArgs, fieldName)) {
      continue;
    }
    if (valueMatchesPolicySet(providedArgs[fieldName], target)) {
      throwDispatchPolicyError({
        code: 'blocklist_match',
        message: `Tool '${metadata.name}' input '${fieldName}' must not match its blocklist`,
        field: fieldName,
        hint: `Remove '${fieldName}' from the declared blocklist before calling '${metadata.name}'.`
      });
    }
  }

  if (inputSchema.correlate && correlationSets.length > 1) {
    let shared = new Set(correlationSets[0]);
    for (const keys of correlationSets.slice(1)) {
      shared = new Set(keys.filter(key => shared.has(key)));
    }
    if (shared.size === 0) {
      throwDispatchPolicyError({
        code: 'correlate_mismatch',
        message: `Tool '${metadata.name}' fact inputs must correlate to the same source instance`,
        hint: `Pass fact inputs to '${metadata.name}' from the same correlated source.`
      });
    }
  }
}

function hasProvidedUpdateArgValue(
  args: Record<string, unknown> | undefined,
  argName: string
): boolean {
  return Boolean(
    args
    && Object.prototype.hasOwnProperty.call(args, argName)
    && args[argName] !== null
    && args[argName] !== undefined
  );
}

function enforceUpdateToolArguments(options: {
  metadata: {
    name: string;
    updateArgs?: readonly string[];
    hasUpdateArgsMetadata: boolean;
  };
  args: Record<string, unknown> | undefined;
  env: Environment;
}): void {
  if (!options.metadata.hasUpdateArgsMetadata) {
    return;
  }

  const updateArgs = options.metadata.updateArgs ?? [];
  if (updateArgs.some(argName => hasProvidedUpdateArgValue(options.args, argName))) {
    return;
  }

  if (updateArgs.length > 0) {
    throw new MlldPolicyError(
      `Update with no changed fields - specify at least one of: ${updateArgs.join(', ')}`,
      {
        code: 'no_update_fields',
        phase: 'dispatch',
        direction: 'input',
        tool: options.metadata.name,
        hint: `Provide at least one declared update field before calling '${options.metadata.name}'.`
      },
      { env: options.env }
    );
  }
  throw new MlldPolicyError(
    'Update with no changed fields - specify at least one declared update field',
    {
      code: 'no_update_fields',
      phase: 'dispatch',
      direction: 'input',
      tool: options.metadata.name,
      hint: `Declare at least one update field before calling '${options.metadata.name}'.`
    },
    { env: options.env }
  );
}

function mergeAuthorizationAttestationsIntoArgDescriptors(options: {
  env: Environment;
  paramNames: readonly string[];
  argSecurityDescriptors?: readonly (SecurityDescriptor | undefined)[];
  matchedAttestations?: Readonly<Record<string, readonly string[]>>;
}): readonly (SecurityDescriptor | undefined)[] | undefined {
  const { env, paramNames, argSecurityDescriptors, matchedAttestations } = options;
  if (!matchedAttestations || Object.keys(matchedAttestations).length === 0) {
    return argSecurityDescriptors;
  }

  const descriptorCount = Math.max(paramNames.length, argSecurityDescriptors?.length ?? 0);
  if (descriptorCount === 0) {
    return argSecurityDescriptors;
  }

  const descriptors = Array.from({ length: descriptorCount }, (_unused, index) => argSecurityDescriptors?.[index]);
  let changed = false;

  for (const [argName, labels] of Object.entries(matchedAttestations)) {
    const paramIndex = paramNames.indexOf(argName);
    if (paramIndex === -1 || !Array.isArray(labels) || labels.length === 0) {
      continue;
    }

    const attestationDescriptor = makeSecurityDescriptor({
      attestations: labels
    });
    descriptors[paramIndex] = descriptors[paramIndex]
      ? env.mergeSecurityDescriptors(descriptors[paramIndex]!, attestationDescriptor)
      : attestationDescriptor;
    changed = true;
  }

  return changed ? descriptors : argSecurityDescriptors;
}

function normalizeToolCallError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function collectConversationInputDescriptor(value: unknown): SecurityDescriptor | undefined {
  return extractSecurityDescriptor(value, {
    recursive: true,
    mergeArrayElements: true
  });
}

function sanitizeLlmConfigSecurityInput(config: unknown): unknown {
  const candidate = boundary.plainData(config);

  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return candidate;
  }

  const record = candidate as Record<string, unknown>;
  if (
    !Object.prototype.hasOwnProperty.call(record, 'tools') &&
    !Object.prototype.hasOwnProperty.call(record, '_mlld')
  ) {
    return candidate;
  }

  const sanitized = { ...record };
  delete sanitized.tools;
  delete sanitized._mlld;
  return sanitized;
}

function readLlmRuntimeResumeConfig(config: unknown): LlmRuntimeResumeConfig | null {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return null;
  }

  const runtimeConfig = (config as Record<string, unknown>)._mlld;
  if (!runtimeConfig || typeof runtimeConfig !== 'object' || Array.isArray(runtimeConfig)) {
    return null;
  }

  const resumeConfig = (runtimeConfig as Record<string, unknown>).resume;
  if (!resumeConfig || typeof resumeConfig !== 'object' || Array.isArray(resumeConfig)) {
    return null;
  }

  const sessionId = (resumeConfig as Record<string, unknown>).sessionId;
  const provider = (resumeConfig as Record<string, unknown>).provider;
  const continueFlag = (resumeConfig as Record<string, unknown>).continue;
  if (typeof sessionId !== 'string' || sessionId.trim().length === 0) {
    return null;
  }
  if (typeof continueFlag !== 'boolean') {
    return null;
  }

  return {
    sessionId: sessionId.trim(),
    provider: typeof provider === 'string' && provider.trim().length > 0 ? provider.trim() : 'unknown',
    continue: continueFlag
  };
}

function normalizeLlmResumeState(state: LlmResumeState): LlmResumeState {
  const continuationOf =
    typeof state.continuationOf === 'string' && state.continuationOf.trim().length > 0
      ? state.continuationOf.trim()
      : state.sessionId;
  const attempt =
    typeof state.attempt === 'number' && Number.isFinite(state.attempt)
      ? Math.max(0, Math.trunc(state.attempt))
      : 0;
  return {
    sessionId: state.sessionId,
    provider: state.provider,
    continuationOf,
    attempt
  };
}

function activateLlmResumeState(state: LlmResumeState): LlmResumeState {
  const normalized = normalizeLlmResumeState(state);
  return {
    ...normalized,
    attempt: (normalized.attempt ?? 0) + 1
  };
}

function mergeReturnedLlmResumeState(
  previous: LlmResumeState | undefined,
  next: LlmResumeState
): LlmResumeState {
  const normalizedNext = normalizeLlmResumeState(next);
  const normalizedPrevious = previous ? normalizeLlmResumeState(previous) : undefined;
  return {
    ...normalizedNext,
    continuationOf: normalizedPrevious?.continuationOf ?? normalizedNext.continuationOf,
    attempt: normalizedPrevious?.attempt ?? normalizedNext.attempt
  };
}

function injectLlmRuntimeResumeConfig(
  config: Record<string, unknown>,
  resumeConfig: LlmRuntimeResumeConfig
): Record<string, unknown> {
  const runtimeConfig =
    config._mlld && typeof config._mlld === 'object' && !Array.isArray(config._mlld)
      ? { ...(config._mlld as Record<string, unknown>) }
      : {};
  runtimeConfig.resume = {
    sessionId: resumeConfig.sessionId,
    provider: resumeConfig.provider,
    continue: resumeConfig.continue
  };
  return {
    ...config,
    _mlld: runtimeConfig
  };
}

function clearLlmResumeBridgeTools(
  config: Record<string, unknown>
): { config: Record<string, unknown>; didUpdate: boolean } {
  // Resume is output repair only, not "retry but cheaper". Handle aliases are
  // minted per bridge call, so a continue:true call cannot safely expose new
  // tools against handles mentioned in the previous transcript. Keep the
  // explicit tool list empty here and pair it with disableAutoProvisionedShelve
  // at bridge construction time. Loosening this is a spec change.
  // See spec-guard-resume.md#resume-invariants.
  if (!Object.prototype.hasOwnProperty.call(config, 'tools')) {
    return { config, didUpdate: false };
  }

  if (Array.isArray(config.tools) && config.tools.length === 0) {
    return { config, didUpdate: false };
  }

  return {
    config: {
      ...config,
      tools: []
    },
    didUpdate: true
  };
}

function assertLlmResumeBridgeToolsEmpty(tools: unknown): void {
  const configuredCount =
    tools === undefined
      ? 0
      : Array.isArray(tools)
        ? tools.length
        : 1;
  if (configuredCount === 0) {
    return;
  }

  throw new Error(
    'Resume invariant violated: continue:true LLM calls must not expose bridge tools. See spec-guard-resume.md#resume-invariants.'
  );
}

function tryExtractLlmResumeEnvelope(value: unknown): LlmResumeEnvelope | null {
  const candidate = boundary.plainData(value);
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  const runtimeRecord =
    record._mlld && typeof record._mlld === 'object' && !Array.isArray(record._mlld)
      ? (record._mlld as Record<string, unknown>)
      : null;
  if (!runtimeRecord) {
    return null;
  }

  const sessionId = runtimeRecord.sessionId;
  const provider = runtimeRecord.provider;
  const continuationOf = runtimeRecord.continuationOf;
  const attempt = runtimeRecord.attempt;
  const valueField =
    Object.prototype.hasOwnProperty.call(record, 'value')
      ? record.value
      : Object.prototype.hasOwnProperty.call(record, 'result')
        ? record.result
        : Object.prototype.hasOwnProperty.call(record, 'output')
          ? record.output
          : undefined;
  if (valueField === undefined) {
    return null;
  }

  const resumeState =
    typeof sessionId === 'string' &&
    sessionId.trim().length > 0 &&
    typeof provider === 'string' &&
    provider.trim().length > 0
      ? {
          sessionId: sessionId.trim(),
          provider: provider.trim(),
          ...(typeof continuationOf === 'string' && continuationOf.trim().length > 0
            ? { continuationOf: continuationOf.trim() }
            : {}),
          ...(typeof attempt === 'number' && Number.isFinite(attempt)
            ? { attempt: Math.max(0, Math.trunc(attempt)) }
            : {})
        }
      : undefined;

  return {
    value: valueField,
    resumeState
  };
}

function readLlmResumeStateFromGuardDetails(details: unknown): LlmResumeState | null {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return null;
  }

  const operation = (details as Record<string, unknown>).operation;
  if (!operation || typeof operation !== 'object' || Array.isArray(operation)) {
    return null;
  }

  const metadata = (operation as Record<string, unknown>).metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  const resumeState = (metadata as Record<string, unknown>).llmResumeState;
  if (!resumeState || typeof resumeState !== 'object' || Array.isArray(resumeState)) {
    return null;
  }

  const sessionId = (resumeState as Record<string, unknown>).sessionId;
  const provider = (resumeState as Record<string, unknown>).provider;
  const continuationOf = (resumeState as Record<string, unknown>).continuationOf;
  const attempt = (resumeState as Record<string, unknown>).attempt;
  if (typeof sessionId !== 'string' || sessionId.trim().length === 0) {
    return null;
  }
  if (typeof provider !== 'string' || provider.trim().length === 0) {
    return null;
  }

  return {
    sessionId: sessionId.trim(),
    provider: provider.trim(),
    ...(typeof continuationOf === 'string' && continuationOf.trim().length > 0
      ? { continuationOf: continuationOf.trim() }
      : {}),
    ...(typeof attempt === 'number' && Number.isFinite(attempt)
      ? { attempt: Math.max(0, Math.trunc(attempt)) }
      : {})
  };
}

function readLlmResumePromptFromGuardAction(
  action: ReturnType<typeof getGuardNextAction>
): string | null {
  if (action?.decision !== 'resume') {
    return null;
  }

  if (typeof action.hint === 'string' && action.hint.trim().length > 0) {
    return action.hint.trim();
  }

  const details =
    action.details && typeof action.details === 'object' && !Array.isArray(action.details)
      ? (action.details as Record<string, unknown>)
      : null;
  const hints = Array.isArray(details?.hints) ? details.hints : [];
  for (const entry of hints) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }
    const hint = (entry as Record<string, unknown>).hint;
    if (typeof hint === 'string' && hint.trim().length > 0) {
      return hint.trim();
    }
  }

  const reasons = Array.isArray(details?.reasons) ? details.reasons : [];
  for (const reason of reasons) {
    if (typeof reason === 'string' && reason.trim().length > 0) {
      return reason.trim();
    }
  }

  const guardResults = Array.isArray(details?.guardResults) ? details.guardResults : [];
  for (const entry of guardResults) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }
    const hint =
      (entry as Record<string, unknown>).hint &&
      typeof (entry as Record<string, unknown>).hint === 'object' &&
      !Array.isArray((entry as Record<string, unknown>).hint)
        ? ((entry as Record<string, unknown>).hint as Record<string, unknown>).hint
        : undefined;
    if (typeof hint === 'string' && hint.trim().length > 0) {
      return hint.trim();
    }
    const reason = (entry as Record<string, unknown>).reason;
    if (typeof reason === 'string' && reason.trim().length > 0) {
      return reason.trim();
    }
  }

  const guardContext =
    details?.guardContext && typeof details.guardContext === 'object' && !Array.isArray(details.guardContext)
      ? (details.guardContext as Record<string, unknown>)
      : null;
  const guardContextHints = Array.isArray(guardContext?.hints) ? guardContext.hints : [];
  for (const entry of guardContextHints) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }
    const hint = (entry as Record<string, unknown>).hint;
    if (typeof hint === 'string' && hint.trim().length > 0) {
      return hint.trim();
    }
  }
  if (typeof guardContext?.reason === 'string' && guardContext.reason.trim().length > 0) {
    return guardContext.reason.trim();
  }

  return null;
}

function buildLlmConversationDescriptor(
  env: Environment,
  evaluatedArgs: readonly unknown[]
): SecurityDescriptor | undefined {
  const descriptors: SecurityDescriptor[] = [];

  for (let index = 0; index < evaluatedArgs.length; index += 1) {
    const candidate =
      index === 1
        ? sanitizeLlmConfigSecurityInput(evaluatedArgs[index])
        : evaluatedArgs[index];
    const descriptor = collectConversationInputDescriptor(candidate);
    if (descriptor) {
      descriptors.push(descriptor);
    }
  }

  if (descriptors.length === 0) {
    return undefined;
  }

  return descriptors.length === 1
    ? descriptors[0]
    : env.mergeSecurityDescriptors(...descriptors);
}

function buildToolProvenance(
  toolName: string,
  args: Record<string, unknown> | undefined,
  auditRef: string | undefined
): ToolProvenance | undefined {
  const name = toolName.trim();
  if (!name) {
    return undefined;
  }

  const argNames = args
    ? Object.keys(args).filter(key => key.trim().length > 0)
    : [];
  return {
    name,
    ...(argNames.length > 0 ? { args: argNames } : {}),
    ...(auditRef ? { auditRef } : {})
  };
}

function synchronizeGuardVariableCandidates(options: {
  guardVariableCandidates: (Variable | undefined)[];
  evaluatedArgs: readonly unknown[];
  evaluatedArgStrings: readonly string[];
}): void {
  const { guardVariableCandidates, evaluatedArgs, evaluatedArgStrings } = options;

  for (let i = 0; i < guardVariableCandidates.length; i += 1) {
    const candidate = guardVariableCandidates[i];
    if (!candidate) {
      continue;
    }
    const updated = cloneExecVariableWithNewValue(
      candidate,
      evaluatedArgs[i],
      evaluatedArgStrings[i] ?? ''
    );
    const resolvedDescriptor = extractSecurityDescriptor(evaluatedArgs[i], {
      recursive: true,
      mergeArrayElements: true
    });
    if (resolvedDescriptor) {
      if (!updated.mx) {
        updated.mx = {};
      }
      updateVarMxFromDescriptor(updated.mx as VariableContext, resolvedDescriptor);
      if ((updated.mx as any).mxCache) {
        delete (updated.mx as any).mxCache;
      }
    }
    guardVariableCandidates[i] = updated;
  }
}

function mergeResolvedArgValueDescriptors(options: {
  env: Environment;
  evaluatedArgs: readonly unknown[];
  argSecurityDescriptors?: readonly (SecurityDescriptor | undefined)[];
}): readonly (SecurityDescriptor | undefined)[] | undefined {
  const { env, evaluatedArgs, argSecurityDescriptors } = options;
  const descriptorCount = Math.max(evaluatedArgs.length, argSecurityDescriptors?.length ?? 0);
  if (descriptorCount === 0) {
    return argSecurityDescriptors;
  }

  const descriptors = Array.from(
    { length: descriptorCount },
    (_unused, index) => argSecurityDescriptors?.[index]
  );
  let changed = false;

  for (let index = 0; index < evaluatedArgs.length; index += 1) {
    const resolvedDescriptor = extractSecurityDescriptor(evaluatedArgs[index], {
      recursive: true,
      mergeArrayElements: true
    });
    if (!resolvedDescriptor) {
      continue;
    }
    descriptors[index] = descriptors[index]
      ? env.mergeSecurityDescriptors(descriptors[index]!, resolvedDescriptor)
      : resolvedDescriptor;
    changed = true;
  }

  return changed ? descriptors : argSecurityDescriptors;
}

async function repairSecurityRelevantExecArgs(options: {
  env: Environment;
  operationName: string;
  effectiveToolMetadata: {
    labels: readonly string[];
    controlArgs?: readonly string[];
    hasControlArgsMetadata: boolean;
    sourceArgs?: readonly string[];
    hasSourceArgsMetadata: boolean;
  };
  policySummary: ReturnType<Environment['getPolicySummary']>;
  paramNames: readonly string[];
  evaluatedArgs: readonly unknown[];
}): Promise<{
  evaluatedArgs: unknown[];
  repairedArgIndices: ReadonlySet<number>;
}> {
  const targetArgNames = collectSecurityRelevantArgNamesForOperation({
    env: options.env,
    operationName: options.operationName,
    labels: options.effectiveToolMetadata.labels,
    controlArgs: options.effectiveToolMetadata.controlArgs,
    hasControlArgsMetadata: options.effectiveToolMetadata.hasControlArgsMetadata,
    sourceArgs: options.effectiveToolMetadata.sourceArgs,
    hasSourceArgsMetadata: options.effectiveToolMetadata.hasSourceArgsMetadata,
    policy: options.policySummary
  });

  if (targetArgNames.length === 0) {
    return {
      evaluatedArgs: [...options.evaluatedArgs],
      repairedArgIndices: new Set<number>()
    };
  }

  const nextArgs = [...options.evaluatedArgs];
  const repairedArgIndices = new Set<number>();
  for (const argName of new Set(targetArgNames)) {
    const argIndex = options.paramNames.indexOf(argName);
    if (argIndex === -1 || argIndex >= nextArgs.length) {
      continue;
    }

    const original = nextArgs[argIndex];
    const repaired = await repairSecurityRelevantValue({
      value: original,
      env: options.env,
      preserveOnAmbiguous: true
    });
    nextArgs[argIndex] = repaired.value;
    if (repaired.value !== original) {
      repairedArgIndices.add(argIndex);
    }
  }

  return {
    evaluatedArgs: nextArgs,
    repairedArgIndices
  };
}

function getToolResultLength(value: unknown): number | undefined {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === 'string') {
    return value.length;
  }

  if (isStructuredValue(value)) {
    if (typeof value.metadata?.length === 'number') {
      return value.metadata.length;
    }

    const textDescriptor = Object.getOwnPropertyDescriptor(value, 'text');
    if (textDescriptor && 'value' in textDescriptor && typeof textDescriptor.value === 'string') {
      return textDescriptor.value.length;
    }
    return undefined;
  }

  try {
    return String(value).length;
  } catch {
    return undefined;
  }
}

function getMaterializedStructuredText(value: StructuredValue): string | undefined {
  const textDescriptor = Object.getOwnPropertyDescriptor(value, 'text');
  return textDescriptor && 'value' in textDescriptor && typeof textDescriptor.value === 'string'
    ? textDescriptor.value
    : undefined;
}

function getEvalResultStdout(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }

  if (!isStructuredValue(value)) {
    return undefined;
  }

  switch (value.type) {
    case 'text':
    case 'number':
    case 'boolean':
    case 'bigint':
    case 'json':
      return asText(value);
    default:
      return undefined;
  }
}

function isToolWriteLabelSet(labels: readonly string[]): boolean {
  return labels.some(label => label === 'tool:w' || label.startsWith('tool:w:'));
}

function isStructuredInteropCodeExecutable(definition: ExecutableDefinition): boolean {
  if (!isCodeExecutable(definition)) {
    return false;
  }

  return (
    definition.language === 'js'
    || definition.language === 'javascript'
    || definition.language === 'node'
    || definition.language === 'nodejs'
    || definition.language === 'py'
    || definition.language === 'python'
  );
}

function shouldMaterializeExecArgumentStrings(definition: ExecutableDefinition): boolean {
  return (
    definition.type === 'command'
    || (
      definition.type === 'code'
      && (definition.language === 'bash' || definition.language === 'sh')
    )
  );
}

function stringifyDispatchArg(definition: ExecutableDefinition, value: unknown): string {
  return shouldMaterializeExecArgumentStrings(definition)
    ? stringifyExecGuardArg(value)
    : previewExecGuardArg(value);
}

function stringifyDispatchArgs(
  definition: ExecutableDefinition,
  values: readonly unknown[]
): string[] {
  return values.map(arg => stringifyDispatchArg(definition, arg));
}

function shouldResolveHandlesBeforeExecutableDispatch(options: {
  definition: ExecutableDefinition;
  toolLabels: readonly string[];
  preservePolicyIntentHandles: boolean;
  argIndex: number;
}): boolean {
  if (options.preservePolicyIntentHandles && options.argIndex === 0) {
    return false;
  }

  // Plain structured code interop helpers should receive handle wrappers as ordinary data.
  // Write-tool dispatch remains an explicit security boundary and still
  // resolves handles before entering the tool body.
  if (isStructuredInteropCodeExecutable(options.definition) && !isToolWriteLabelSet(options.toolLabels)) {
    return false;
  }

  return true;
}

function getImportedExecutableSourcePath(variable: Variable | undefined): string | undefined {
  const importPath = variable?.mx?.importPath;
  if (typeof importPath !== 'string' || importPath.trim().length === 0) {
    return undefined;
  }

  // These are sentinel labels stamped onto mx.importPath, not file paths.
  // Treating them as source paths leaks strings like "in module-env" into
  // error messages and as spurious setCurrentFilePath values.
  switch (importPath) {
    case 'let':
    case 'exe-param':
    case 'for-var':
    case 'module-env':
      return undefined;
    default:
      return importPath;
  }
}

/**
 * Evaluate an ExecInvocation node
 * This executes a previously defined exec command with arguments and optional tail modifiers
 */
export async function evaluateExecInvocation(
  node: ExecInvocation,
  env: Environment
): Promise<EvalResult> {
  const operationPreview = buildExecOperationPreview(node);
  return env.withExecutionContext('exec-invocation', { allowToolbridge: true }, async () => {
    return runWithGuardRetry({
      env,
      operationContext: operationPreview,
      sourceRetryable: true,
      execute: () => evaluateExecInvocationInternal(node, env)
    });
  });
}

async function evaluateExecInvocationInternal(
  node: ExecInvocation,
  env: Environment
): Promise<EvalResult> {
  let commandName: string | undefined; // Declare at function scope for finally block
  let endResolutionTrackingIfNeeded: () => void = () => {};
  const skipInternalToolCallTracking = (node as any)?.meta?.toolCallTracking === 'router';
  const invocationWithClause = normalizeInvocationWithClause(node);

  const normalizeFields = (fields?: Array<{ type: string; value: any }>) =>
    (fields || []).map(field => {
      if (!field || typeof field !== 'object') return field;
      if (field.type === 'Field') {
        return { ...field, type: 'field' };
      }
      return field;
    });

  const resolveNamespaceMethodCandidate = async (
    commandRefWithObject: { objectReference?: any },
    methodName: string,
    sourceLocation: any
  ): Promise<{ found: boolean; value?: unknown }> => {
    const objectRef = commandRefWithObject.objectReference;
    if (!objectRef || typeof objectRef.identifier !== 'string') {
      return { found: false };
    }

    let objectVar = env.getVariable(objectRef.identifier);
    if (!objectVar) {
      objectVar = await env.getResolverVariable(objectRef.identifier);
    }

    if (!objectVar || objectVar.internal?.isNamespace !== true) {
      return { found: false };
    }

    try {
      const { extractVariableValue, isVariable } = await import('../utils/variable-resolution');
      let objectValue: unknown;

      if (objectRef.fields && objectRef.fields.length > 0) {
        const { accessFields } = await import('../utils/field-access');
        objectValue = await accessFields(objectVar, normalizeFields(objectRef.fields), {
          env,
          preserveContext: false,
          returnUndefinedForMissing: true,
          sourceLocation: objectRef.location ?? sourceLocation
        });
        // accessFields may return wrapped values — unwrap to the plain object
        if (isVariable(objectValue)) {
          objectValue = await extractVariableValue(objectValue as Variable, env);
        }
        if (isStructuredValue(objectValue)) {
          objectValue = objectValue.data;
        }
      } else {
        objectValue = await extractVariableValue(objectVar, env);
      }

      if (!objectValue || typeof objectValue !== 'object') {
        return { found: false };
      }

      const resolved = resolveObjectMethod(objectValue, methodName);
      if (typeof resolved === 'undefined') {
        return { found: false };
      }

      // If the resolved value is a native JS function (e.g., Array.prototype.includes
      // picked up from the prototype chain) and the method name collides with a
      // builtin, defer to the builtin handler which dispatches properly.
      // Namespace-exported mlld executables (objects with __executable) take priority.
      if (isBuiltinMethod(methodName) && typeof resolved === 'function') {
        return { found: false };
      }

      return { found: true, value: resolved };
    } catch {
      return { found: false };
    }
  };

  const streamingSetup = await setupExecInvocationStreaming(node, env);
  let streamingOptions = streamingSetup.streamingOptions;
  let streamingRequested = streamingSetup.streamingRequested;
  let streamingEnabled = streamingSetup.streamingEnabled;
  let hasStreamFormat = streamingSetup.hasStreamFormat;
  const pipelineId = streamingSetup.pipelineId;
  const streamingManager = streamingSetup.streamingManager;
  const chunkEffect = createExecInvocationChunkEffect({
    env,
    isStreamingEnabled: () => streamingEnabled,
    shouldSkipDefaultSinks: () => streamingOptions.skipDefaultSinks
  });


  try {
    let policyEnforcer: PolicyEnforcer | undefined;
    let resultSecurityDescriptor: SecurityDescriptor | undefined;
    let strictToolResultDescriptor: SecurityDescriptor | undefined;
    let strictToolResultBaseDescriptor: SecurityDescriptor | undefined;
    let surfacedLlmSessionId: string | undefined;
    const mergeResultDescriptor = (descriptor?: SecurityDescriptor): void => {
      if (!descriptor) {
        return;
      }
      resultSecurityDescriptor = resultSecurityDescriptor
        ? env.mergeSecurityDescriptors(resultSecurityDescriptor, descriptor)
        : descriptor;
    };
  const interpolateWithResultDescriptor = (
    nodes: any,
    targetEnv: Environment = env,
    interpolationContext: InterpolationContext = InterpolationContext.Default
  ): Promise<string> => {
    return interpolate(nodes, targetEnv, interpolationContext, {
      collectSecurityDescriptor: descriptor => {
        if (descriptor) {
          mergeResultDescriptor(descriptor);
        }
      }
    });
  };

  const createParameterMetadata = (value: unknown) => {
    const descriptor = extractSecurityDescriptor(value);
    const metadata = descriptor
      ? VariableMetadataUtils.applySecurityMetadata(
          undefined,
          { existingDescriptor: descriptor }
        )
      : undefined;

    return {
      metadata,
      internal: {
        isSystem: true,
        isParameter: true
      }
    };
  };

  const attachLlmSessionIdMetadata = <T>(structured: StructuredValue<T>): StructuredValue<T> => {
    const sessionId =
      typeof surfacedLlmSessionId === 'string' && surfacedLlmSessionId.trim().length > 0
        ? surfacedLlmSessionId.trim()
        : undefined;
    if (!sessionId) {
      return structured;
    }

    structured.metadata = {
      ...(structured.metadata ?? {}),
      sessionId
    };
    structured.mx.sessionId = sessionId;
    return structured;
  };

  const cloneExecutableResult = (value: Variable): Variable =>
    cloneExecVariableWithNewValue(value, value.value, stringifyExecGuardArg(value.value));

  const applyDescriptorToExecutableResult = (
    value: Variable,
    descriptor?: SecurityDescriptor
  ): Variable => {
    const cloned = cloneExecutableResult(value);
    if (!descriptor) {
      return cloned;
    }

    const existing = getVariableSecurityDescriptor(cloned);
    const merged = existing
      ? runtimeEnv.mergeSecurityDescriptors(existing, descriptor)
      : descriptor;

    cloned.metadata = VariableMetadataUtils.applySecurityMetadata(cloned.metadata, {
      existingDescriptor: merged
    });

    if (!cloned.mx) {
      cloned.mx = {};
    }
    updateVarMxFromDescriptor(cloned.mx as VariableContext, merged);
    if ((cloned.mx as any).mxCache) {
      delete (cloned.mx as any).mxCache;
    }

    VariableMetadataUtils.attachContext(cloned);
    return cloned;
  };

  const isExecutableResult = (value: unknown): value is Variable =>
    !!value && typeof value === 'object' && isExecutableVariable(value as any);

  const createEvalResult = (
    value: unknown,
    targetEnv: Environment,
    options?: { type?: string; text?: string }
  ): EvalResult => {
    if (isExecutableResult(value)) {
      return {
        value,
        env: targetEnv,
        stdout: `[executable: ${value.name}]`,
        stderr: '',
        exitCode: 0
      };
    }

    const wrapped = attachLlmSessionIdMetadata(wrapExecResult(value, options));
    if (resultSecurityDescriptor) {
      const existing = getStructuredSecurityDescriptor(wrapped);
      const merged = existing
        ? env.mergeSecurityDescriptors(existing, resultSecurityDescriptor)
        : resultSecurityDescriptor;
      setStructuredSecurityDescriptor(wrapped, merged);
    }
    return {
      value: wrapped,
      env: targetEnv,
      stdout: getEvalResultStdout(wrapped),
      stderr: '',
      exitCode: 0
    };
  };

  const toPipelineInput = (value: unknown, options?: { type?: string; text?: string }): unknown => {
    const structured = attachLlmSessionIdMetadata(wrapExecResult(value, options));
    if (resultSecurityDescriptor) {
      setStructuredSecurityDescriptor(structured, resultSecurityDescriptor);
    }
    return structured;
  };

  const applyInvocationWithClause = async (
    value: unknown,
    wrapOptions?: { type?: string; text?: string }
  ): Promise<EvalResult> => {
    if (invocationWithClause) {
      if (invocationWithClause.pipeline) {
        const { processPipeline } = await import('./pipeline/unified-processor');
        const pipelineInputValue = toPipelineInput(value, wrapOptions);
        const pipelineResult = await processPipeline({
          value: pipelineInputValue,
          env,
          node,
          identifier: node.identifier,
          descriptorHint: resultSecurityDescriptor
        });
        return applyWithClause(
          pipelineResult,
          { ...invocationWithClause, pipeline: undefined },
          env
        );
      }
      return applyWithClause(value, invocationWithClause, env);
    }
    return createEvalResult(value, env, wrapOptions);
  };

  const nodeSourceLocation = astLocationToSourceLocation(node.location, env.getCurrentFilePath());

  // Get the command name from the command reference or legacy format
  let args: any[] = [];
  
  // Handle legacy format where name and arguments are directly on the node
  if (!node.commandRef && (node as any).name) {
    commandName = (node as any).name;
    args = (node as any).arguments || [];
  } else if (node.commandRef) {
    // Handle new format with commandRef
    if ((node.commandRef as any).name) {
      commandName = (node.commandRef as any).name;
      args = node.commandRef.args || [];
    } else if (typeof node.commandRef.identifier === 'string') {
      // If identifier is a string, use it directly
      commandName = node.commandRef.identifier;
      args = node.commandRef.args || [];
    } else if (Array.isArray((node.commandRef as any).identifier) && (node.commandRef as any).identifier.length > 0) {
      // If identifier is an array, extract from the first node
      const identifierNode = (node.commandRef as any).identifier[0];
      if (identifierNode.type === 'VariableReference' && identifierNode.identifier) {
        commandName = identifierNode.identifier as string;
      } else if (identifierNode.type === 'Text' && identifierNode.content) {
        commandName = identifierNode.content;
      } else {
        throw new Error('Unable to extract command name from identifier array');
      }
      args = node.commandRef.args || [];
    } else {
      throw new Error('CommandReference missing both name and identifier');
    }
  } else {
    throw new Error('ExecInvocation node missing both commandRef and name');
  }

  // Resolve dynamic method names when the final segment is a variable index (e.g., @obj[@name]())
  const identifierNode = (node.commandRef as any)?.identifier?.[0];
  const identifierFields = normalizeFields(identifierNode?.fields);
  const lastField = identifierFields[identifierFields.length - 1];
  if (lastField?.type === 'variableIndex') {
    const resolvedName = await resolveVariableIndexValue(lastField.value, env);
    commandName = String(resolvedName);
  }
  
  if (!commandName) {
    throw new MlldInterpreterError('ExecInvocation has no command identifier');
  }

  // Collect metadata needed for the circular-reference / recursion-depth guard.
  // The guard itself runs AFTER argument evaluation (see below) so that legitimate
  // nested calls like @f(@f(x)) are not incorrectly blocked — arguments are
  // evaluated in the caller's scope before the callee's body begins executing.
  const isBuiltinCommand = isBuiltinMethod(commandName);
  const existingVar = env.hasVariable(commandName)
    ? (env.getVariable(commandName) as any)
    : null;
  let isReservedName = existingVar?.internal?.isReserved;
  // exe recursive @fn(...) — the 'recursive' label opts in to bounded self-calls
  let isRecursiveExe = Array.isArray(existingVar?.mx?.labels)
    && existingVar.mx.labels.includes('recursive');
  // Tool-bridge wrapper exes are dispatch shims, not user-callable identifiers.
  // Concurrent fan-out invokes the same tempName in parallel, which otherwise
  // trips the recursion guard; wrappers can't self-recurse at the mlld level,
  // the wrapped body's real name carries the real guard.
  let isToolbridgeWrapper = existingVar?.internal?.isToolbridgeWrapper === true;
  let shouldTrackResolution = !isBuiltinCommand && !isReservedName && !isToolbridgeWrapper;

  // Check if this is a field access exec invocation (e.g., @obj.method())
  // or a method call on an exec result (e.g., @func(args).method())
  let variable;
  let collectionDispatchContext: CollectionDispatchContext | undefined;
  let objectMethodExecutableDispatch = false;
  const commandRefWithObject = node.commandRef as any & { objectReference?: any; objectSource?: unknown };
  if (node.commandRef && (commandRefWithObject.objectReference || commandRefWithObject.objectSource)) {
    let namespaceMethodPreferred = false;
    if (commandRefWithObject.objectReference) {
      const namespaceCandidate = await resolveNamespaceMethodCandidate(
        commandRefWithObject,
        commandName,
        nodeSourceLocation
      );
      if (namespaceCandidate.found) {
        variable = namespaceCandidate.value;
        namespaceMethodPreferred = true;
        // @mcp.sendEmail is not @sendEmail — namespace-qualified calls must not
        // participate in recursion tracking for the unqualified method name.
        shouldTrackResolution = false;
      }
    }

    if (!namespaceMethodPreferred && isBuiltinMethod(commandName)) {
      const builtinResolution = await resolveBuiltinInvocationObject({
        commandName,
        commandRefWithObject,
        env,
        normalizeFields,
        resolveVariableIndexValue,
        evaluateExecInvocationNode: evaluateExecInvocation
      });
      if (builtinResolution.kind === 'type-check-fallback') {
        return createEvalResult(builtinResolution.result, env);
      }

      let objectValue = builtinResolution.value.objectValue;
      const objectVar = builtinResolution.value.objectVar;
      const sourceDescriptor = builtinResolution.value.sourceDescriptor;

      chainDebug('builtin invocation start', {
        commandName,
        hasObjectSource: Boolean(commandRefWithObject.objectSource),
        hasObjectReference: Boolean(commandRefWithObject.objectReference)
      });

      const targetDescriptor =
        sourceDescriptor ||
        (objectVar && varMxToSecurityDescriptor(objectVar.mx)) ||
        extractSecurityDescriptor(objectValue);
      mergeResultDescriptor(targetDescriptor);

      objectValue = normalizeBuiltinTargetValue(objectValue, commandName);

      chainDebug('resolved object value', {
        commandName,
        objectType: Array.isArray(objectValue) ? 'array' : typeof objectValue,
        preview:
          typeof objectValue === 'string'
            ? objectValue.slice(0, 80)
            : Array.isArray(objectValue)
              ? `[array length=${objectValue.length}]`
              : objectValue && typeof objectValue === 'object'
                ? '[object]'
                : objectValue
      });

      const evaluatedArgs = await evaluateBuiltinArguments(args, env);
      const quantifierEvaluator = (objectValue as any)?.__mlldQuantifierEvaluator;
      if (quantifierEvaluator && typeof quantifierEvaluator === 'function') {
        const quantifierResult = quantifierEvaluator(commandName, evaluatedArgs);
        return createEvalResult(quantifierResult, env);
      }

      const dispatchResult = dispatchBuiltinMethod({
        commandName,
        objectValue,
        evaluatedArgs
      });
      let result = dispatchResult.result;
      if (dispatchResult.propagateResultDescriptor) {
        inheritExpressionProvenance(result, objectVar ?? objectValue);
        const sourceDescriptorForResult =
          (objectVar && varMxToSecurityDescriptor(objectVar.mx)) || extractSecurityDescriptor(objectValue);
        if (sourceDescriptorForResult) {
          resultSecurityDescriptor = resultSecurityDescriptor
            ? env.mergeSecurityDescriptors(resultSecurityDescriptor, sourceDescriptorForResult)
            : sourceDescriptorForResult;
        }
      }
      
      // Apply post-invocation fields if present (e.g., @str.split(',')[1])
      const postFieldsBuiltin: any[] = (node as any).fields || [];
      if (postFieldsBuiltin && postFieldsBuiltin.length > 0) {
        const { accessField } = await import('../utils/field-access');
        for (const f of postFieldsBuiltin) {
          result = await accessField(result, f, { env, sourceLocation: nodeSourceLocation });
        }
      }
      
      const normalized = normalizeTransformerResult(commandName, result);
      const resolvedValue = normalized.value;
      const wrapOptions = normalized.options;
      inheritExpressionProvenance(resolvedValue, objectVar ?? objectValue);

      chainDebug('applying builtin pipeline', {
        commandName,
        pipelineLength: invocationWithClause?.pipeline?.length ?? 0
      });
      return applyInvocationWithClause(resolvedValue, wrapOptions);
    }
    // If this is a non-builtin method with objectSource, we do not (yet) support it
    if (commandRefWithObject.objectSource && !commandRefWithObject.objectReference) {
      throw new MlldInterpreterError(`Only builtin methods are supported on exec results (got: ${commandName})`);
    }
    if (!namespaceMethodPreferred) {
      // Get the object first
      const objectRef = commandRefWithObject.objectReference;
      // Try regular variable first, then resolver variable (for reserved names like @keychain)
      let objectVar = env.getVariable(objectRef.identifier);
      if (!objectVar) {
        // Check if it's a resolver variable (e.g., @keychain, @debug)
        objectVar = await env.getResolverVariable(objectRef.identifier);
      }
      if (!objectVar) {
        throw new MlldInterpreterError(`Object not found: ${objectRef.identifier}`);
      }
      
      const { extractVariableValue, isVariable } = await import('../utils/variable-resolution');
      let objectValue: unknown;
      
      if (objectRef.fields && objectRef.fields.length > 0) {
        const { resolveVariable, ResolutionContext } = await import('../utils/variable-resolution');
        objectValue = await resolveVariable(objectVar, env, ResolutionContext.FieldAccess);
        const { accessFields } = await import('../utils/field-access');
        const accessedObject = await accessFields(objectValue, normalizeFields(objectRef.fields), {
          env,
          preserveContext: true,
          returnUndefinedForMissing: true,
          sourceLocation: objectRef.location
        });

        const accessedFieldVariable =
          accessedObject &&
          typeof accessedObject === 'object' &&
          'value' in (accessedObject as Record<string, unknown>)
          ? (accessedObject as { value?: unknown }).value
          : undefined;
        objectValue = accessedFieldVariable;
        if (isVariable(objectValue)) {
          const fieldVariable = objectValue;
          objectValue = await extractVariableValue(objectValue, env);
          if (isStructuredValue(objectValue)) {
            objectValue = objectValue.data;
          }

          if (typeof objectValue === 'object' && objectValue !== null) {
            const toolCollection =
              (fieldVariable.internal?.isToolsCollection === true
                ? boundary.identity<ToolCollection | undefined>(fieldVariable)
                : undefined)
              ?? getToolCollectionFromValue(objectValue);
            if (toolCollection) {
              const definition = toolCollection[commandName];
              if (!definition) {
                throw new MlldInterpreterError(`Unknown tool '${commandName}' in collection '@${objectRef.identifier}'`);
              }

              const execName = normalizeCollectionExecutableReferenceName(definition.mlld);
              if (!execName) {
                throw new MlldInterpreterError(`Tool '${commandName}' in collection '@${objectRef.identifier}' is missing an executable reference`);
              }

              const resolvedExecutable = await resolveCollectionExecutableForDispatch({
                env,
                execName,
                executableRef: definition.mlld,
                collection: toolCollection,
                definition,
                sourceVariable: fieldVariable as { internal?: Record<string, unknown> } | undefined
              });
              const isSerializedExecutable =
                typeof resolvedExecutable === 'object'
                && resolvedExecutable !== null
                && '__executable' in resolvedExecutable
                && Boolean((resolvedExecutable as { __executable?: unknown }).__executable);
              if (!resolvedExecutable || (!isExecutableVariable(resolvedExecutable) && !isSerializedExecutable)) {
                throw new MlldInterpreterError(
                  `Tool '${commandName}' in collection '@${objectRef.identifier}' references non-executable '@${execName}'`
                );
              }

              variable = resolvedExecutable;
              collectionDispatchContext = {
                collection: toolCollection,
                definition,
                toolKey: commandName
              };
            } else {
              variable = resolveObjectMethod(objectValue, commandName);
              objectMethodExecutableDispatch = true;
            }
          }
        } else if (isStructuredValue(objectValue)) {
          objectValue = objectValue.data;
        }

        if (!isVariable(accessedFieldVariable) && typeof objectValue === 'object' && objectValue !== null) {
          const toolCollection = getToolCollectionFromValue(objectValue);
          if (toolCollection) {
            const definition = toolCollection[commandName];
            if (!definition) {
              throw new MlldInterpreterError(`Unknown tool '${commandName}' in collection '@${objectRef.identifier}'`);
            }

            const execName = normalizeCollectionExecutableReferenceName(definition.mlld);
            if (!execName) {
              throw new MlldInterpreterError(`Tool '${commandName}' in collection '@${objectRef.identifier}' is missing an executable reference`);
            }

            const resolvedExecutable = await resolveCollectionExecutableForDispatch({
              env,
              execName,
              executableRef: definition.mlld,
              collection: toolCollection,
              definition,
              sourceVariable: objectVar as { internal?: Record<string, unknown> } | undefined
            });
            const isSerializedExecutable =
              typeof resolvedExecutable === 'object'
              && resolvedExecutable !== null
              && '__executable' in resolvedExecutable
              && Boolean((resolvedExecutable as { __executable?: unknown }).__executable);
            if (!resolvedExecutable || (!isExecutableVariable(resolvedExecutable) && !isSerializedExecutable)) {
              throw new MlldInterpreterError(
                `Tool '${commandName}' in collection '@${objectRef.identifier}' references non-executable '@${execName}'`
              );
            }

            variable = resolvedExecutable;
            collectionDispatchContext = {
              collection: toolCollection,
              definition,
              toolKey: commandName
            };
          } else {
            variable = resolveObjectMethod(objectValue, commandName);
            objectMethodExecutableDispatch = true;
          }
        }
      } else {
        if (objectVar.internal?.isSessionSchema === true) {
          const { resolveVariable, ResolutionContext } = await import('../utils/variable-resolution');
          objectValue = await resolveVariable(objectVar, env, ResolutionContext.FieldAccess);
          if (isVariable(objectValue)) {
            objectValue = await extractVariableValue(objectValue, env);
          }
        } else {
          objectValue = await extractVariableValue(objectVar, env);
        }

        if (typeof objectValue === 'object' && objectValue !== null) {
          const toolCollection =
            (objectVar.internal?.isToolsCollection === true
              ? boundary.identity<ToolCollection | undefined>(objectVar)
              : undefined)
            ?? getToolCollectionFromValue(objectValue);
          if (toolCollection) {
            const definition = toolCollection[commandName];
            if (!definition) {
              throw new MlldInterpreterError(`Unknown tool '${commandName}' in collection '@${objectRef.identifier}'`);
            }

            const execName = normalizeCollectionExecutableReferenceName(definition.mlld);
            if (!execName) {
              throw new MlldInterpreterError(`Tool '${commandName}' in collection '@${objectRef.identifier}' is missing an executable reference`);
            }

            const resolvedExecutable = await resolveCollectionExecutableForDispatch({
              env,
              execName,
              executableRef: definition.mlld,
              collection: toolCollection,
              definition,
              sourceVariable: objectVar as { internal?: Record<string, unknown> } | undefined
            });
            const isSerializedExecutable =
              typeof resolvedExecutable === 'object'
              && resolvedExecutable !== null
              && '__executable' in resolvedExecutable
              && Boolean((resolvedExecutable as { __executable?: unknown }).__executable);
            if (!resolvedExecutable || (!isExecutableVariable(resolvedExecutable) && !isSerializedExecutable)) {
              throw new MlldInterpreterError(
                `Tool '${commandName}' in collection '@${objectRef.identifier}' references non-executable '@${execName}'`
              );
            }

            variable = resolvedExecutable;
            collectionDispatchContext = {
              collection: toolCollection,
              definition,
              toolKey: commandName
            };
          } else {
            variable = resolveObjectMethod(objectValue, commandName);
            objectMethodExecutableDispatch = true;
          }
        }
      }
      
      if (!variable) {
        throw new MlldInterpreterError(`Method not found: ${commandName} on ${objectRef.identifier}`);
      }

      if (collectionDispatchContext && isExecutableVariable(variable)) {
        commandName = variable.name ?? commandName;
        isReservedName = variable.internal?.isReserved;
        isRecursiveExe = Array.isArray(variable.mx?.labels) && variable.mx.labels.includes('recursive');
        isToolbridgeWrapper = variable.internal?.isToolbridgeWrapper === true;
        shouldTrackResolution = !isBuiltinMethod(commandName) && !isReservedName && !isToolbridgeWrapper;
      }
    }
    
    // Handle __executable objects from resolved imports
    if (typeof variable === 'object' && variable !== null && '__executable' in variable && variable.__executable) {
      // Deserialize shadow environments if needed
      const rawInternal =
        (variable.internal as Record<string, unknown> | undefined) ??
        {};
      let serializedInternal: Record<string, unknown> = { ...rawInternal };
      let capturedModuleEnv = getCapturedModuleEnv(rawInternal);
      if (capturedModuleEnv === undefined) {
        capturedModuleEnv = getCapturedModuleEnv(variable);
      }
      if (capturedModuleEnv !== undefined) {
        serializedInternal.capturedModuleEnv = capturedModuleEnv;
      }
      if (serializedInternal.capturedShadowEnvs && typeof serializedInternal.capturedShadowEnvs === 'object') {
        // Check if it needs deserialization (is plain object, not Map)
        const needsDeserialization = Object.entries(serializedInternal.capturedShadowEnvs).some(
          ([lang, env]) => env && !(env instanceof Map)
        );

        if (needsDeserialization) {
          serializedInternal = {
            ...serializedInternal,
            capturedShadowEnvs: deserializeShadowEnvs(serializedInternal.capturedShadowEnvs)
          };
        }
      }

      // Deserialize module environment if needed
      if (capturedModuleEnv && !(capturedModuleEnv instanceof Map)) {
        // Import the VariableImporter to reuse the proper deserialization logic
        const { VariableImporter } = await import('./import/VariableImporter');
        const importer = new VariableImporter(null); // ObjectResolver not needed for this
        const moduleEnvMap = importer.deserializeModuleEnv(capturedModuleEnv);

        capturedModuleEnv = moduleEnvMap;
        serializedInternal.capturedModuleEnv = moduleEnvMap;
      }
      
      // Convert the __executable object to a proper ExecutableVariable
      const { createExecutableVariable } = await import('@core/types/variable/VariableFactories');
      const executableInternal: Record<string, unknown> = {
        executableDef: variable.executableDef,
        ...serializedInternal
      };
      if (capturedModuleEnv !== undefined) {
        executableInternal.capturedModuleEnv = capturedModuleEnv;
      }
      variable = createExecutableVariable(
        commandName,
        'command', // Default type - the real type is in executableDef
        '', // Empty template - the real template is in executableDef
        variable.paramNames || [],
        undefined, // No language here - it's in executableDef
        {
          directive: 'exe',
          syntax: 'braces',
          hasInterpolation: false,
          isMultiLine: false
        },
        {
          internal: {
            ...executableInternal
          }
        }
      );
    }
  } else {
    // Regular command lookup
    variable = env.getVariable(commandName);
    if (!variable) {
      // Try splitting on dot to handle variant access (e.g., "json.fromlist" -> "json" + variant "fromlist")
      if (commandName.includes('.')) {
        const parts = commandName.split('.');
        const baseName = parts[0];
        const variantName = parts.slice(1).join('.');

        const baseVar = env.getVariable(baseName);
        if (baseVar) {
          const variants = baseVar.internal?.transformerVariants as Record<string, MlldVariable> | undefined;
          if (variants && variantName in variants) {
            variable = variants[variantName];
          }
        }
      }

      if (!variable) {
        throw new MlldInterpreterError(`Command not found: ${commandName}`);
      }
    }

    // Check if this is a transformer variant access (e.g., @parse.fromlist)
    if (isExecutableVariable(variable) && node.commandRef) {
      const varRef = (node.commandRef as any).identifier?.[0] || node.commandRef;
      if (varRef && varRef.type === 'VariableReference' && varRef.fields && varRef.fields.length > 0) {
        const field = varRef.fields[0];
        if (field.type === 'field') {
          const variants = variable.internal?.transformerVariants as Record<string, MlldVariable> | undefined;
          if (variants && field.value in variants) {
            // Replace the variable with the variant
            variable = variants[field.value];
          }
        }
      }
    }
  }

  if (
    variable &&
    !isExecutableVariable(variable as any) &&
    typeof variable === 'object' &&
    (variable as { type?: unknown }).type === 'object' &&
    (variable as { value?: unknown }).value &&
    typeof (variable as { value?: unknown }).value === 'object' &&
    '__executable' in ((variable as { value: Record<string, unknown> }).value) &&
    Boolean(((variable as { value: Record<string, unknown> }).value as { __executable?: unknown }).__executable)
  ) {
    variable = (variable as { value: unknown }).value as any;
  }

  if (typeof variable === 'object' && variable !== null && '__executable' in variable && (variable as any).__executable) {
    const rawInternal =
      ((variable as any).internal as Record<string, unknown> | undefined) ??
      {};
    let serializedInternal: Record<string, unknown> = { ...rawInternal };
    let capturedModuleEnv = getCapturedModuleEnv(rawInternal);
    if (capturedModuleEnv === undefined) {
      capturedModuleEnv = getCapturedModuleEnv(variable as any);
    }
    if (capturedModuleEnv !== undefined) {
      serializedInternal.capturedModuleEnv = capturedModuleEnv;
    }
    if (serializedInternal.capturedShadowEnvs && typeof serializedInternal.capturedShadowEnvs === 'object') {
      const needsDeserialization = Object.entries(serializedInternal.capturedShadowEnvs).some(
        ([, shadowEnv]) => shadowEnv && !(shadowEnv instanceof Map)
      );

      if (needsDeserialization) {
        serializedInternal = {
          ...serializedInternal,
          capturedShadowEnvs: deserializeShadowEnvs(serializedInternal.capturedShadowEnvs)
        };
      }
    }

    if (capturedModuleEnv && !(capturedModuleEnv instanceof Map)) {
      const { VariableImporter } = await import('./import/VariableImporter');
      const importer = new VariableImporter(null);
      const moduleEnvMap = importer.deserializeModuleEnv(capturedModuleEnv);

      capturedModuleEnv = moduleEnvMap;
      serializedInternal.capturedModuleEnv = moduleEnvMap;
    }

    const { createExecutableVariable } = await import('@core/types/variable/VariableFactories');
    const executableInternal: Record<string, unknown> = {
      executableDef: (variable as any).executableDef,
      ...serializedInternal
    };
    if (capturedModuleEnv !== undefined) {
      executableInternal.capturedModuleEnv = capturedModuleEnv;
    }
    variable = createExecutableVariable(
      commandName,
      'command',
      '',
      ((variable as any).paramNames as string[] | undefined) || [],
      undefined,
      {
        directive: 'exe',
        syntax: 'braces',
        hasInterpolation: false,
        isMultiLine: false
      },
      {
        internal: {
          ...executableInternal
        }
      }
    );
  }

  // Ensure it's an executable variable
  if (!isExecutableVariable(variable)) {
    throw new MlldInterpreterError(`Variable ${commandName} is not executable (type: ${variable.type})`);
  }
  
  // Special handling for built-in transformers
  if (variable.internal?.isBuiltinTransformer && variable.internal?.transformerImplementation) {
    // Args were already extracted above
    
    // Special handling for @typeof/@typeInfo - we need the Variable object, not just the value
    const normalizedBuiltinName = typeof commandName === 'string' ? commandName.toLowerCase() : '';
    if (normalizedBuiltinName === 'typeof' || normalizedBuiltinName === 'typeinfo') {
      if (args.length > 0) {
        const arg = args[0];
        
        // Check if it's a variable reference
        if (arg && typeof arg === 'object' && 'type' in arg && arg.type === 'VariableReference') {
          const varRef = arg as any;
          const varName = varRef.identifier;
          const varObj = env.getVariable(varName);
          
          if (varObj) {
            const inferSimpleTypeFromValue = (value: unknown): string => {
              if (value === null || value === undefined) return 'null';
              if (
                value &&
                typeof value === 'object' &&
                (
                  (('__executable' in value) && Boolean((value as { __executable?: unknown }).__executable)) ||
                  (('type' in value) && (value as { type?: unknown }).type === 'executable')
                )
              ) {
                return 'executable';
              }
              if (isStructuredValue(value)) {
                return inferSimpleTypeFromValue(value.data === undefined ? value.text : value.data);
              }
              if (Array.isArray(value)) return 'array';
              if (typeof value === 'string') return 'string';
              if (typeof value === 'number') return 'number';
              if (typeof value === 'boolean') return 'boolean';
              if (typeof value === 'function') return 'executable';
              if (typeof value === 'object') return 'object';
              return 'string';
            };

            const getSimpleTypeInfo = (value: Variable): string => {
              if (value.type === 'executable') return 'executable';
              if (value.type === 'array') return 'array';
              if (value.type === 'object') return 'object';
              if (value.type === 'simple-text' || value.type === 'command-result') return 'string';
              if (value.type === 'primitive' && 'primitiveType' in value) {
                const primitiveType = (value as any).primitiveType;
                if (primitiveType === 'number' || primitiveType === 'string' || primitiveType === 'boolean') {
                  return primitiveType;
                }
                if (primitiveType === 'null') {
                  return 'null';
                }
              }
              return inferSimpleTypeFromValue(value.value);
            };

            const getRichTypeInfo = (value: Variable): string => {
              let typeInfo = value.type;

              if (value.type === 'simple-text' && 'subtype' in value) {
                const subtype = (value as any).subtype;
                if (subtype && subtype !== 'simple' && subtype !== 'interpolated-text') {
                  typeInfo = subtype;
                }
              } else if (value.type === 'primitive' && 'primitiveType' in value) {
                typeInfo = `primitive (${(value as any).primitiveType})`;
              } else if (value.type === 'object') {
                const objValue = value.value;
                if (objValue && typeof objValue === 'object') {
                  const keys = Object.keys(objValue);
                  typeInfo = `object (${keys.length} properties)`;
                }
              } else if (value.type === 'array') {
                const arrValue = value.value;
                if (Array.isArray(arrValue)) {
                  typeInfo = `array (${arrValue.length} items)`;
                }
              } else if (value.type === 'executable') {
                const execDef = value.internal?.executableDef;
                if (execDef && 'type' in execDef) {
                  typeInfo = `executable (${execDef.type})`;
                }
              }

              if (value.source?.directive) {
                typeInfo += ` [from /${value.source.directive}]`;
              }

              return typeInfo;
            };

            let selectedTypeInfo = normalizedBuiltinName === 'typeof'
              ? getSimpleTypeInfo(varObj)
              : getRichTypeInfo(varObj);

            if (Array.isArray(varRef.fields) && varRef.fields.length > 0) {
              const { accessFields } = await import('../utils/field-access');
              const {
                isVariable,
                resolveVariable,
                ResolutionContext
              } = await import('../utils/variable-resolution');

              let resolvedTarget = await resolveVariable(varObj, env, ResolutionContext.FieldAccess);
              const fieldResult = await accessFields(resolvedTarget, normalizeFields(varRef.fields), {
                env,
                preserveContext: true,
                sourceLocation: varRef.location
              });
              resolvedTarget = (fieldResult as { value?: unknown }).value;

              selectedTypeInfo =
                isVariable(resolvedTarget)
                  ? (normalizedBuiltinName === 'typeof'
                      ? getSimpleTypeInfo(resolvedTarget)
                      : getRichTypeInfo(resolvedTarget))
                  : inferSimpleTypeFromValue(resolvedTarget);
            }

            const result = await variable.internal.transformerImplementation(
              `__MLLD_VARIABLE_OBJECT__:${selectedTypeInfo}`
            );
            const normalized = normalizeTransformerResult(commandName, result);
            const resolvedValue = normalized.value;
            const wrapOptions = normalized.options;
            
            // Clean up resolution tracking before returning
            endResolutionTrackingIfNeeded();
            return applyInvocationWithClause(resolvedValue, wrapOptions);
          }
        }
      }
    }
    
    // Special handling for @exists - return true when argument evaluation succeeds
    if (commandName === 'exists' || commandName === 'EXISTS') {
      const arg = args[0];
      const isGlobPattern = (value: string): boolean => /[\*\?\{\}\[\]]/.test(value);
      const isEmptyLoadArray = (value: unknown): boolean => {
        if (isStructuredValue(value)) {
          return (
            value.type === 'array' &&
            Array.isArray(value.data) &&
            value.data.length === 0
          );
        }
        return Array.isArray(value) && value.length === 0;
      };

      const resolveLoadContentSource = async (loadNode: any): Promise<string | undefined> => {
        const source = loadNode?.source;
        if (!source || typeof source !== 'object') {
          return undefined;
        }
        const actualSource =
          source.type === 'path' || source.type === 'url'
            ? source
            : source.segments && source.raw !== undefined
              ? { ...source, type: 'path' }
              : source;

        if (actualSource.type === 'path') {
          if (actualSource.meta?.hasVariables && Array.isArray(actualSource.segments)) {
            try {
              return (await interpolateWithResultDescriptor(actualSource.segments, env)).trim();
            } catch {
              return typeof actualSource.raw === 'string' ? actualSource.raw.trim() : undefined;
            }
          }
          if (typeof actualSource.raw === 'string') {
            return actualSource.raw.trim();
          }
        }

        if (actualSource.type === 'url') {
          if (typeof actualSource.raw === 'string') {
            return actualSource.raw.trim();
          }
          if (typeof actualSource.protocol === 'string' && typeof actualSource.host === 'string') {
            return `${actualSource.protocol}://${actualSource.host}${actualSource.path || ''}`;
          }
        }

        return undefined;
      };

      const isStringPathArgument = (value: unknown): boolean => {
        if (Array.isArray(value)) {
          return true;
        }
        if (!value || typeof value !== 'object') {
          return false;
        }
        if ('wrapperType' in value && Array.isArray((value as any).content)) {
          return true;
        }
        if ((value as any).type === 'Text') {
          return true;
        }
        if ((value as any).type === 'Literal' && (value as any).valueType === 'string') {
          return true;
        }
        return false;
      };

      const finalizeExistsResult = async (existsResult: boolean): Promise<EvalResult> => {
        endResolutionTrackingIfNeeded();
        return applyInvocationWithClause(existsResult);
      };

      if (!arg) {
        return finalizeExistsResult(false);
      }

      try {
        if (isStringPathArgument(arg)) {
          const resolvePathString = async (): Promise<string> => {
            if (Array.isArray(arg)) {
              return interpolateWithResultDescriptor(arg, env, InterpolationContext.Default);
            }
            if (arg && typeof arg === 'object' && (arg as any).type === 'Text') {
              return String((arg as any).content ?? '');
            }
            if (arg && typeof arg === 'object' && (arg as any).type === 'Literal') {
              return String((arg as any).value ?? '');
            }
            if (arg && typeof arg === 'object' && 'wrapperType' in arg && Array.isArray((arg as any).content)) {
              return interpolateWithResultDescriptor((arg as any).content, env, InterpolationContext.Default);
            }
            return String(arg ?? '');
          };

          const trimmedPath = (await resolvePathString()).trim();
          if (!trimmedPath) {
            return finalizeExistsResult(false);
          }

          const { processContentLoader } = await import('./content-loader');
          const loadNode = {
            type: 'load-content',
            source: { type: 'path', raw: trimmedPath }
          };
          const loadResult = await processContentLoader(loadNode as any, env);
          if (isGlobPattern(trimmedPath) && isEmptyLoadArray(loadResult)) {
            return finalizeExistsResult(false);
          }
          return finalizeExistsResult(true);
        }

        if (arg && typeof arg === 'object' && (arg as any).type === 'load-content') {
          const { processContentLoader } = await import('./content-loader');
          const loadResult = await processContentLoader(arg as any, env);
          const sourceString = await resolveLoadContentSource(arg);
          if (sourceString && isGlobPattern(sourceString) && isEmptyLoadArray(loadResult)) {
            return finalizeExistsResult(false);
          }
          return finalizeExistsResult(true);
        }

        if (arg && typeof arg === 'object' && (arg as any).type === 'ExecInvocation') {
          await evaluateExecInvocation(arg as any, env);
          return finalizeExistsResult(true);
        }

        if (arg && typeof arg === 'object' && (arg as any).type === 'VariableReference') {
          const varRef = arg as any;
          let targetVar = env.getVariable(varRef.identifier);
          if (!targetVar && env.hasVariable(varRef.identifier)) {
            targetVar = await env.getResolverVariable(varRef.identifier);
          }
          if (!targetVar) {
            return finalizeExistsResult(false);
          }

          const { resolveVariable, ResolutionContext } = await import('../utils/variable-resolution');
          let resolvedValue = await resolveVariable(targetVar, env, ResolutionContext.FieldAccess);
          let fieldMissing = false;
          if (varRef.fields && varRef.fields.length > 0) {
            const { accessField } = await import('../utils/field-access');
            const normalized = normalizeFields(varRef.fields);
            for (const field of normalized) {
              const fieldResult = await accessField(resolvedValue, field, {
                preserveContext: true,
                env,
                sourceLocation: nodeSourceLocation,
                returnUndefinedForMissing: true
              });
              resolvedValue = (fieldResult as any).value;
              if (resolvedValue === undefined) {
                fieldMissing = true;
                break;
              }
            }
          }

          if (fieldMissing) {
            return finalizeExistsResult(false);
          }

          if (varRef.pipes && varRef.pipes.length > 0) {
            const { processPipeline } = await import('./pipeline/unified-processor');
            await processPipeline({
              value: resolvedValue,
              env,
              node: varRef,
              identifier: varRef.identifier
            });
          }

          return finalizeExistsResult(true);
        }

        return finalizeExistsResult(true);
      } catch {
        return finalizeExistsResult(false);
      }
    }

    // Special handling for @fileExists - evaluate argument to string path, then check filesystem
    if (commandName === 'fileExists' || commandName === 'FILEEXISTS') {
      const arg = args[0];
      const isGlobPattern = (value: string): boolean => /[\*\?\{\}\[\]]/.test(value);
      const isEmptyLoadArray = (value: unknown): boolean => {
        if (isStructuredValue(value)) {
          return (
            value.type === 'array' &&
            Array.isArray(value.data) &&
            value.data.length === 0
          );
        }
        return Array.isArray(value) && value.length === 0;
      };

      const finalizeFileExistsResult = async (existsResult: boolean): Promise<EvalResult> => {
        endResolutionTrackingIfNeeded();
        return applyInvocationWithClause(existsResult);
      };

      if (!arg) {
        return finalizeFileExistsResult(false);
      }

      try {
        // Step 1: Evaluate the argument to a string path, regardless of AST type
        let pathString: string;

        if (arg && typeof arg === 'object' && (arg as any).type === 'load-content') {
          // <path> syntax - extract the path string
          const source = (arg as any).source;
          if (source?.type === 'path') {
            if (source.meta?.hasVariables && Array.isArray(source.segments)) {
              pathString = (await interpolateWithResultDescriptor(source.segments, env)).trim();
            } else {
              pathString = String(source.raw ?? '').trim();
            }
          } else {
            return finalizeFileExistsResult(false);
          }
        } else if (arg && typeof arg === 'object' && (arg as any).type === 'VariableReference') {
          // @var - resolve variable to its string value, then check the FILE (not variable existence)
          const varRef = arg as any;
          let targetVar = env.getVariable(varRef.identifier);
          if (!targetVar && env.hasVariable(varRef.identifier)) {
            targetVar = await env.getResolverVariable(varRef.identifier);
          }
          if (!targetVar) {
            return finalizeFileExistsResult(false);
          }

          const { resolveVariable, ResolutionContext } = await import('../utils/variable-resolution');
          let resolvedValue = await resolveVariable(targetVar, env, ResolutionContext.Display);

          // Handle field access (e.g., @obj.path)
          if (varRef.fields && varRef.fields.length > 0) {
            const { accessField } = await import('../utils/field-access');
            const normalized = normalizeFields(varRef.fields);
            for (const field of normalized) {
              const fieldResult = await accessField(resolvedValue, field, {
                preserveContext: true,
                env,
                sourceLocation: nodeSourceLocation,
                returnUndefinedForMissing: true
              });
              resolvedValue = (fieldResult as any).value;
              if (resolvedValue === undefined) {
                return finalizeFileExistsResult(false);
              }
            }
          }

          pathString = String(asText(resolvedValue) ?? resolvedValue ?? '').trim();
        } else if (arg && typeof arg === 'object' && (arg as any).type === 'ExecInvocation') {
          // @func() result - evaluate, then use result as path
          const execResult = await evaluateExecInvocation(arg as any, env);
          const val = execResult?.value ?? '';
          pathString = String(asText(val) ?? val ?? '').trim();
        } else if (Array.isArray(arg)) {
          pathString = (await interpolateWithResultDescriptor(arg, env, InterpolationContext.Default)).trim();
        } else if (arg && typeof arg === 'object' && (arg as any).type === 'Text') {
          pathString = String((arg as any).content ?? '').trim();
        } else if (arg && typeof arg === 'object' && (arg as any).type === 'Literal') {
          pathString = String((arg as any).value ?? '').trim();
        } else if (arg && typeof arg === 'object' && 'wrapperType' in arg && Array.isArray((arg as any).content)) {
          pathString = (await interpolateWithResultDescriptor((arg as any).content, env, InterpolationContext.Default)).trim();
        } else {
          pathString = String(arg ?? '').trim();
        }

        if (!pathString) {
          return finalizeFileExistsResult(false);
        }

        // Step 2: Check filesystem existence
        if (isGlobPattern(pathString)) {
          // For globs, use processContentLoader (works with virtual FS in tests)
          const { processContentLoader } = await import('./content-loader');
          const loadNode = {
            type: 'load-content',
            source: { type: 'path', raw: pathString }
          };
          const loadResult = await processContentLoader(loadNode as any, env);
          if (isEmptyLoadArray(loadResult)) {
            return finalizeFileExistsResult(false);
          }
          return finalizeFileExistsResult(true);
        } else {
          // For single paths, resolve and check via IFileSystemService.exists()
          const resolvedPath = await env.resolvePath(pathString);
          const fileExists = await env.getFileSystemService().exists(resolvedPath);
          return finalizeFileExistsResult(fileExists);
        }
      } catch {
        return finalizeFileExistsResult(false);
      }
    }

    // Check if this is a multi-arg builtin transformer (like keychain functions)
    if (variable.internal?.keychainFunction) {
      // Keychain functions need all args passed as an array
      const evaluatedArgs: any[] = [];
      for (const arg of args) {
        let evalArg = arg;
        if (evalArg && typeof evalArg === 'object' && 'type' in evalArg) {
          const { evaluateDataValue } = await import('./data-value-evaluator');
          evalArg = await evaluateDataValue(evalArg as any, env);
        }
        if (typeof evalArg === 'string') {
          evaluatedArgs.push(evalArg);
        } else if (evalArg && typeof evalArg === 'object') {
          evaluatedArgs.push(await interpolateWithResultDescriptor([evalArg], env));
        } else {
          evaluatedArgs.push(String(evalArg));
        }
      }
      const keychainFunction = variable.internal?.keychainFunction;
      if (keychainFunction) {
        const service = String(evaluatedArgs[0] ?? '');
        const account = String(evaluatedArgs[1] ?? '');
        if (!service || !account) {
          throw new MlldInterpreterError('Keychain access requires service and account', {
            code: 'KEYCHAIN_PATH_INVALID'
          });
        }
        enforceKeychainAccess(
          env,
          { service, account, action: keychainFunction },
          node.location ? astLocationToSourceLocation(node.location) : undefined
        );
      }
      const result = await variable.internal.transformerImplementation(evaluatedArgs);
      const normalized = normalizeTransformerResult(commandName, result);
      let resolvedValue = normalized.value;
      const wrapOptions = normalized.options;

      if (keychainFunction === 'get' && resolvedValue !== null && resolvedValue !== undefined) {
        const keychainDescriptor = makeSecurityDescriptor({
          labels: ['secret'],
          taint: ['secret', 'src:keychain'],
          sources: ['keychain.get']
        });
        const existingDescriptor = extractSecurityDescriptor(resolvedValue, {
          recursive: true,
          mergeArrayElements: true
        });
        const mergedDescriptor = existingDescriptor
          ? env.mergeSecurityDescriptors(existingDescriptor, keychainDescriptor)
          : keychainDescriptor;
        if (isStructuredValue(resolvedValue)) {
          applySecurityDescriptorToStructuredValue(resolvedValue, mergedDescriptor);
        } else {
          const wrapped = wrapStructured(resolvedValue);
          applySecurityDescriptorToStructuredValue(wrapped, mergedDescriptor);
          resolvedValue = wrapped;
        }
      }

      endResolutionTrackingIfNeeded();

      if (invocationWithClause) {
        if (invocationWithClause.pipeline) {
          const { processPipeline } = await import('./pipeline/unified-processor');
          const pipelineInputValue = toPipelineInput(resolvedValue, wrapOptions);
          const pipelineResult = await processPipeline({
            value: pipelineInputValue,
            env,
            node,
            identifier: node.identifier,
            descriptorHint: resultSecurityDescriptor
          });
          return applyWithClause(
            pipelineResult,
            { ...invocationWithClause, pipeline: undefined },
            env
          );
        } else {
          return applyWithClause(resolvedValue, invocationWithClause, env);
        }
      }
      return { value: resolvedValue ?? '', wrapOptions };
    }

    // Regular transformer handling (single arg)
    let inputValue = '';
    if (args.length > 0) {
      let arg: any = args[0];
      if (arg && typeof arg === 'object' && 'type' in arg) {
        const { evaluateDataValue } = await import('./data-value-evaluator');
        arg = await evaluateDataValue(arg as any, env);
      }
      const transformerName = (variable.name ?? commandName ?? '').toLowerCase();
      if (
        transformerName === 'keep'
        || transformerName === 'keepstructured'
        || transformerName === 'pretty'
      ) {
        inputValue = arg as any;
      } else if (typeof arg === 'string') {
        inputValue = arg;
      } else if (arg && typeof arg === 'object') {
        inputValue = await interpolateWithResultDescriptor([arg], env);
      } else {
        inputValue = String(arg);
      }
    }

    // Call the transformer implementation directly
    const result = await variable.internal.transformerImplementation(inputValue);
    const normalized = normalizeTransformerResult(commandName, result);
    const resolvedValue = normalized.value;
    const wrapOptions = normalized.options;

    // Clean up resolution tracking before returning
    endResolutionTrackingIfNeeded();

    return applyInvocationWithClause(resolvedValue, wrapOptions);
  }
  
  // Get the full executable definition from metadata
  let definition = variable.internal?.executableDef as ExecutableDefinition;
  if (!definition) {
    throw new MlldInterpreterError(`Executable ${commandName} has no definition in metadata`);
  }
  const mcpTool = (variable.internal as any)?.mcpTool as
    | { name?: unknown; source?: unknown }
    | undefined;
  if (mcpTool && typeof mcpTool.name === 'string' && mcpTool.name.trim().length > 0) {
    const mcpName = mcpTool.name.trim();
    const mcpSource = typeof mcpTool.source === 'string' && mcpTool.source.trim().length > 0
      ? mcpTool.source.trim()
      : undefined;
    env.enforceMcpServerAllowed(mcpSource, {
      sourceLocation: nodeSourceLocation ?? undefined
    });
    const toolCandidates = [
      commandName,
      variable.name,
      mcpName
    ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
    const allowedByToolScope = toolCandidates.some(candidate => env.isToolAllowed(candidate, mcpName));
    if (!allowedByToolScope) {
      throw new MlldSecurityError(
        `MCP tool '${mcpName}' denied by env.tools`,
        {
          code: 'ENV_TOOL_DENIED',
          sourceLocation: nodeSourceLocation ?? undefined,
          env
        }
      );
    }
  }
  const isPartial = isPartialExecutable(definition);
  const boundArgs = isPartial && Array.isArray(definition.boundArgs) ? definition.boundArgs : [];
  if (isPartial) {
    definition = definition.base;
  }
  ({
    streamingOptions,
    streamingRequested,
    streamingEnabled,
    hasStreamFormat
  } = await mergeExecInvocationStreamingFromDefinition(
    node,
    definition,
    env,
    streamingManager,
    {
      streamingOptions,
      streamingRequested,
      streamingEnabled,
      hasStreamFormat
    }
  ));

  let whenExprNode: WhenExpressionNode | null = null;
  if (isCodeExecutable(definition)) {
    whenExprNode = extractExecDeniedHandlerWhenExpression(definition);
  }
  if (!whenExprNode) {
    const enclosingWhenExpr = env.getExecutionContext<ActiveWhenExpressionContext>('when-expression');
    if (enclosingWhenExpr?.hasDeniedHandler) {
      whenExprNode = enclosingWhenExpr.node;
    }
  }

  let runtimeEnv = env;
  runtimeEnv = await applyInvocationScopedRuntimeConfig({
    runtimeEnv,
    env,
    definition,
    node,
    invocationWithClause
  });
  let sessionSeedApplied = false;
  let sessionSeedPending = false;
  const variableLabels = variable.mx?.labels;
  const hasLlmLabel = Array.isArray(variableLabels) && variableLabels.includes('llm');
  let attachedSessionFrameId: string | undefined;
  let attachedSessionCleanupRegistered = false;
  const importedExecutableSourcePath = getImportedExecutableSourcePath(variable);
  if (importedExecutableSourcePath) {
    const sourceScopedEnv = runtimeEnv.createChild();
    sourceScopedEnv.setModuleIsolated(true);
    if (runtimeEnv.getCurrentFilePath() !== importedExecutableSourcePath) {
      sourceScopedEnv.setCurrentFilePath(importedExecutableSourcePath);
    }
    runtimeEnv = sourceScopedEnv;
  }

  const preattachedSession = hasLlmLabel ? getNormalizedSessionAttachment(runtimeEnv) : undefined;
  if (preattachedSession) {
    attachedSessionFrameId = randomUUID();
    const sessionInstance = materializeSession(
      preattachedSession.definition,
      runtimeEnv,
      attachedSessionFrameId
    );
    runtimeEnv.attachSessionInstance(attachedSessionFrameId, sessionInstance);
    try {
      await applySeedWrites(sessionInstance, preattachedSession.seed, runtimeEnv);
      sessionSeedApplied = true;
    } catch (error) {
      runtimeEnv.disposeSessionInstances(attachedSessionFrameId);
      throw error;
    }
  }

  // Handle command arguments - args were already extracted above
  const params = definition.paramNames || [];
  let evaluatedArgStrings: string[] = [];
  let evaluatedArgs: unknown[] = [];
  let execEnv!: Environment;
  try {
    ({ evaluatedArgStrings, evaluatedArgs } = await evaluateExecInvocationArgs({
      args,
      env: runtimeEnv,
      commandName,
      definition,
      services: {
        interpolate: interpolateWithResultDescriptor,
        evaluateExecInvocation,
        mergeResultDescriptor
      }
    }));

    if (collectionDispatchContext) {
      const scopedConfig = runtimeEnv.getScopedEnvironmentConfig();
      const scopedEnv = runtimeEnv.createChild();
      scopedEnv.setScopedEnvironmentConfig({
        ...(scopedConfig ?? {}),
        tools: collectionDispatchContext.collection
      });
      runtimeEnv = scopedEnv;
    }
    const hasInvocationPolicy =
      invocationWithClause && Object.prototype.hasOwnProperty.call(invocationWithClause, 'policy');
    const replaceInvocationPolicy =
      invocationWithClause && Object.prototype.hasOwnProperty.call(invocationWithClause, 'replace')
        ? await resolveInvocationPolicyReplaceFlag(invocationWithClause.replace, runtimeEnv)
        : false;
    if (replaceInvocationPolicy && !hasInvocationPolicy) {
      throw new MlldInterpreterError('with { replace: true } requires with { policy: ... }');
    }
    const resolvedPolicyFragment =
      hasInvocationPolicy
        ? await resolveInvocationPolicyFragment(invocationWithClause.policy, runtimeEnv, {
            replace: replaceInvocationPolicy
          })
        : undefined;
    if (resolvedPolicyFragment) {
      const policyScope = createInvocationPolicyScope(runtimeEnv, resolvedPolicyFragment, {
        replace: replaceInvocationPolicy
      });
      runtimeEnv = policyScope.env;
    }

    policyEnforcer = new PolicyEnforcer(runtimeEnv.getPolicySummary());

    // Function-scope boundary stops findVisibleVariableOwner from walking past
    // this frame into caller/ancestor scopes. Setting it unconditionally is
    // what fixes the m-20d3/m-2f2c family of sibling-call leaks — any local
    // exe in a deep chain that does `let @x = ...` otherwise lets the walker
    // reach prior siblings' let-bindings and param envs. Narrowing the
    // condition (to imported-only, or to imported+wrapper) regresses that fix
    // because exes like @slotValue dispatch through captured-module-env paths
    // where mx.isImported is false even though they're running inside an
    // imported chain.
    const localScopedConfig = runtimeEnv.getLocalScopedEnvironmentConfig();
    execEnv = runtimeEnv.createChild();
    if (localScopedConfig) {
      execEnv.setScopedEnvironmentConfig(localScopedConfig);
    }
    execEnv.setFunctionScopeBoundary(true);
    if (attachedSessionFrameId) {
      const sessionFrameId = attachedSessionFrameId;
      execEnv.registerScopeCleanup(async () => {
        disposeSessionFrame(sessionFrameId, execEnv);
      });
      attachedSessionCleanupRegistered = true;
    }
  } catch (error) {
    if (attachedSessionFrameId && !attachedSessionCleanupRegistered) {
      runtimeEnv.disposeSessionInstances(attachedSessionFrameId);
    }
    throw error;
  }

  // Set captured module environment for variable lookup fallback
  const capturedModuleEnv = await ensureCapturedModuleEnvMap(
    variable as { internal?: Record<string, unknown> } | undefined,
    execEnv
  );
  if (capturedModuleEnv instanceof Map) {
    execEnv.setCapturedModuleEnv(capturedModuleEnv);
  }

  // Circular reference / recursion depth guard — runs AFTER argument evaluation.
  //
  // Why here and not earlier: arguments are evaluated in the caller's scope before
  // the callee's body takes over. Placing the guard here means @f(@f(x)) works
  // correctly — the inner @f(x) resolves and returns before the outer @f begins
  // executing its body. Placing it before arg eval would falsely flag the inner
  // call as circular.
  //
  // The guard fires when this function's body is already executing (depth > 0)
  // and it is about to execute again. Non-recursive functions throw immediately.
  // Functions labelled `recursive` are allowed up to MLLD_RECURSION_DEPTH calls.
  let resolutionTrackingActive = false;
  if (shouldTrackResolution && env.isResolving(commandName)) {
    // Prefer a user-facing name over internal wrapper tempNames in error output.
    const displayName =
      (variable?.internal as { toolbridgeDisplayName?: unknown } | undefined)?.toolbridgeDisplayName
        ?? commandName;
    if (!isRecursiveExe) {
      throw new CircularReferenceError(
        `Circular reference detected: executable '@${displayName}' calls itself recursively without a terminating condition`,
        { identifier: commandName, location: nodeSourceLocation }
      );
    }
    const limit = Number(process.env.MLLD_RECURSION_DEPTH ?? 64);
    if (env.getCallDepth(commandName) >= limit) {
      throw new CircularReferenceError(
        `'@${displayName}' exceeded maximum recursion depth (${limit}). Add a base case or increase the limit with MLLD_RECURSION_DEPTH.`,
        { identifier: commandName, location: nodeSourceLocation }
      );
    }
  }
  if (shouldTrackResolution) {
    env.beginResolving(commandName);
    resolutionTrackingActive = true;
  }
  endResolutionTrackingIfNeeded = (): void => {
    if (!resolutionTrackingActive || !commandName) return;
    env.endResolving(commandName);
    resolutionTrackingActive = false;
  };

  // Track original Variables for arguments
  const originalVariables: (Variable | undefined)[] = new Array(args.length);
  const guardVariableCandidates: (Variable | undefined)[] = new Array(args.length);
  const expressionSourceVariables: (Variable | undefined)[] = new Array(args.length);
  const argSourceNames: (string | undefined)[] = new Array(args.length);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg && typeof arg === 'object' && 'type' in arg && arg.type === 'VariableReference') {
      const varRef = arg as any;
      const varName = varRef.identifier;
      argSourceNames[i] = varName;
      const variable = env.getVariable(varName);
      if (variable && !varRef.fields) {
        // GOTCHA: Don't preserve template variables after interpolation,
        //         use the interpolated string value instead
        const { isTemplate } = await import('@core/types/variable');
        if (isTemplate(variable) && typeof evaluatedArgs[i] === 'string') {
          originalVariables[i] = undefined;
          guardVariableCandidates[i] = variable;
        } else {
          originalVariables[i] = variable;
          guardVariableCandidates[i] = variable;
        }
      } else if (variable && varRef.fields && varRef.fields.length > 0) {
        expressionSourceVariables[i] = variable;
      }
    } else if (
      arg &&
      typeof arg === 'object' &&
      'type' in arg &&
      arg.type === 'ExecInvocation'
    ) {
      const objectRef = (arg.commandRef as any)?.objectReference;
      if (
        objectRef &&
        typeof objectRef === 'object' &&
        objectRef.type === 'VariableReference' &&
        objectRef.identifier
      ) {
        const baseVariable = env.getVariable(objectRef.identifier);
        if (baseVariable) {
          expressionSourceVariables[i] = baseVariable;
        }
      }
    } else if (
      arg &&
      typeof arg === 'object' &&
      'type' in arg &&
      (arg.type === 'object' || arg.type === 'array')
    ) {
      // Inline object/array literals: scan AST for variable references with security labels
      const { extractDescriptorsFromDataAst } = await import('./var');
      const dataDescriptor = extractDescriptorsFromDataAst(arg, env);
      if (dataDescriptor && (dataDescriptor.labels.length > 0 || dataDescriptor.taint.length > 0)) {
        const guardInputSource: VariableSource = {
          directive: 'var',
          syntax: 'expression',
          hasInterpolation: false,
          isMultiLine: false
        };
        const syntheticVar =
          materializeGuardInputs([evaluatedArgs[i]], {
            nameHint: '__inline_arg__',
            preserveStructuredScalars: true
          })[0]
          ?? createSimpleTextVariable(
            '__inline_arg__',
            evaluatedArgStrings[i] ?? '',
            guardInputSource
          );
        syntheticVar.source = guardInputSource;
        syntheticVar.value = evaluatedArgs[i];
        if (!syntheticVar.mx) syntheticVar.mx = {};
        updateVarMxFromDescriptor(syntheticVar.mx as VariableContext, dataDescriptor);
        if ((syntheticVar.mx as any).mxCache) delete (syntheticVar.mx as any).mxCache;
        guardVariableCandidates[i] = syntheticVar;
      }
    }
  }

  if (collectionDispatchContext) {
    const collectionMetadata = resolveToolCollectionEntryMetadata(
      env,
      collectionDispatchContext.collection,
      collectionDispatchContext.toolKey
    );
    const normalizedArgs = await normalizeCollectionDispatchArguments({
      env,
      executableParamNames: Array.isArray(variable.paramNames)
        ? variable.paramNames.filter(
            (paramName): paramName is string =>
              typeof paramName === 'string' && paramName.trim().length > 0
          )
        : [],
      definition: collectionDispatchContext.definition,
      metadata: collectionMetadata,
      preserveStructuredArgs: variable.internal?.preserveStructuredArgs === true,
      evaluatedArgs,
      originalVariables,
      guardVariableCandidates,
      expressionSourceVariables,
      argSourceNames
    });
    evaluatedArgs = normalizedArgs.evaluatedArgs;
    evaluatedArgStrings = normalizedArgs.evaluatedArgStrings;
    originalVariables.splice(0, originalVariables.length, ...normalizedArgs.originalVariables);
    guardVariableCandidates.splice(
      0,
      guardVariableCandidates.length,
      ...normalizedArgs.guardVariableCandidates
    );
    expressionSourceVariables.splice(
      0,
      expressionSourceVariables.length,
      ...normalizedArgs.expressionSourceVariables
    );
    argSourceNames.splice(0, argSourceNames.length, ...normalizedArgs.argSourceNames);
  } else if ((node as any).meta?.routerNamedObjectDispatch === true && isExecutableVariable(variable)) {
    const routerOptionalParamNames = Array.isArray((node as any).meta?.routerOptionalParamNames)
      ? (node as any).meta.routerOptionalParamNames.filter(
          (paramName: unknown): paramName is string =>
            typeof paramName === 'string' && paramName.trim().length > 0
        )
      : [];
    const normalizedArgs = await normalizePlainObjectExecutableDispatchArguments({
      env,
      executableParamNames: Array.isArray(variable.paramNames)
        ? variable.paramNames.filter(
            (paramName): paramName is string =>
              typeof paramName === 'string' && paramName.trim().length > 0
          )
        : [],
      optionalParamNames: routerOptionalParamNames,
      preserveStructuredArgs: variable.internal?.preserveStructuredArgs === true,
      evaluatedArgs,
      originalVariables,
      guardVariableCandidates,
      expressionSourceVariables,
      argSourceNames
    });
    evaluatedArgs = normalizedArgs.evaluatedArgs;
    evaluatedArgStrings = normalizedArgs.evaluatedArgStrings;
    originalVariables.splice(0, originalVariables.length, ...normalizedArgs.originalVariables);
    guardVariableCandidates.splice(
      0,
      guardVariableCandidates.length,
      ...normalizedArgs.guardVariableCandidates
    );
    expressionSourceVariables.splice(
      0,
      expressionSourceVariables.length,
      ...normalizedArgs.expressionSourceVariables
    );
    argSourceNames.splice(0, argSourceNames.length, ...normalizedArgs.argSourceNames);
  } else if (objectMethodExecutableDispatch && isExecutableVariable(variable)) {
    const normalizedArgs = await normalizePlainObjectExecutableDispatchArguments({
      env,
      executableParamNames: Array.isArray(variable.paramNames)
        ? variable.paramNames.filter(
            (paramName): paramName is string =>
              typeof paramName === 'string' && paramName.trim().length > 0
          )
        : [],
      optionalParamNames: Array.isArray(definition.optionalParams)
        ? definition.optionalParams.filter(
            (paramName): paramName is string =>
              typeof paramName === 'string' && paramName.trim().length > 0
          )
        : [],
      preserveStructuredArgs: variable.internal?.preserveStructuredArgs === true,
      evaluatedArgs,
      originalVariables,
      guardVariableCandidates,
      expressionSourceVariables,
      argSourceNames
    });
    evaluatedArgs = normalizedArgs.evaluatedArgs;
    evaluatedArgStrings = normalizedArgs.evaluatedArgStrings;
    originalVariables.splice(0, originalVariables.length, ...normalizedArgs.originalVariables);
    guardVariableCandidates.splice(
      0,
      guardVariableCandidates.length,
      ...normalizedArgs.guardVariableCandidates
    );
    expressionSourceVariables.splice(
      0,
      expressionSourceVariables.length,
      ...normalizedArgs.expressionSourceVariables
    );
    argSourceNames.splice(0, argSourceNames.length, ...normalizedArgs.argSourceNames);
  }

  if (boundArgs.length > 0) {
    const boundArgStrings = stringifyDispatchArgs(definition, boundArgs);
    evaluatedArgs.unshift(...boundArgs);
    evaluatedArgStrings.unshift(...boundArgStrings);
    originalVariables.unshift(...Array.from({ length: boundArgs.length }, () => undefined));
    guardVariableCandidates.unshift(...Array.from({ length: boundArgs.length }, () => undefined));
    expressionSourceVariables.unshift(...Array.from({ length: boundArgs.length }, () => undefined));
    argSourceNames.unshift(...Array.from({ length: boundArgs.length }, () => undefined));
  }

  const policyObjectRef = (node.commandRef as any)?.objectReference;
  const preserveDirectPolicyIntentHandles =
    policyObjectRef &&
    typeof policyObjectRef === 'object' &&
    policyObjectRef.type === 'VariableReference' &&
    policyObjectRef.identifier === 'policy' &&
    (variable.name === 'build' || variable.name === 'validate');
  const preservePolicyIntentHandles =
    preserveDirectPolicyIntentHandles ||
    preservesFirstArgForPolicyBuilderChain(variable, definition, env);
  const mcpToolLabels = (node as any).meta?.mcpToolLabels;
  const toolOperationName =
    typeof (node as any).meta?.toolOperationName === 'string' &&
    (node as any).meta.toolOperationName.trim().length > 0
      ? (node as any).meta.toolOperationName.trim()
      : collectionDispatchContext?.toolKey;
  const effectiveToolMetadata = resolveEffectiveToolMetadata({
    env: runtimeEnv,
    executable: variable,
    operationName: toolOperationName ?? variable.name ?? commandName,
    additionalLabels: Array.isArray(mcpToolLabels)
      ? mcpToolLabels.filter(label => typeof label === 'string' && label.length > 0)
      : undefined
  });
  const toolLabels = effectiveToolMetadata.labels;

  evaluatedArgs = await Promise.all(
    evaluatedArgs.map((arg, index) =>
      shouldResolveHandlesBeforeExecutableDispatch({
        definition,
        toolLabels,
        preservePolicyIntentHandles,
        argIndex: index
      })
        ? resolveValueHandles(arg, runtimeEnv)
        : arg
    )
  );
  evaluatedArgStrings = stringifyDispatchArgs(definition, evaluatedArgs);
  synchronizeGuardVariableCandidates({
    guardVariableCandidates,
    evaluatedArgs,
    evaluatedArgStrings
  });

  const pendingGuardAction = getGuardNextAction(runtimeEnv);
  const resumePrompt = readLlmResumePromptFromGuardAction(pendingGuardAction);
  let isLlmResumeContinuation = false;
  let llmResumeEligible = false;
  let currentLlmResumeState = readLlmResumeStateFromGuardDetails(pendingGuardAction?.details) ?? undefined;
  surfacedLlmSessionId = currentLlmResumeState?.sessionId;
  let llmTraceSessionId: string | undefined;
  let llmTraceProvider: string | undefined;
  let llmTraceModel: string | undefined;
  let llmTraceToolCount: number | undefined;
  let llmTraceStartedAt: number | undefined;

  if (pendingGuardAction?.decision === 'resume' && evaluatedArgs.length > 0) {
    evaluatedArgs[0] = resumePrompt ?? '';
    evaluatedArgStrings = stringifyDispatchArgs(definition, evaluatedArgs);
    synchronizeGuardVariableCandidates({
      guardVariableCandidates,
      evaluatedArgs,
      evaluatedArgStrings
    });
  }

  // Provider-neutral resume state is injected into llm config for any exe llm
  // that accepts a config object. Tool-bridge setup remains opt-in via
  // config.tools. Shelf-scoped llm calls also receive agent-visible shelf notes
  // in config.system.
  const llmParamNames = Array.isArray(definition.paramNames) ? definition.paramNames : [];
  if (hasLlmLabel && llmParamNames.length >= 2) {
    const originalConfigArg = evaluatedArgs[1];
    const rawConfig = originalConfigArg === undefined ? {} : originalConfigArg;
    if (rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig)) {
      const captureLlmTraceConfig = (config: Record<string, unknown>): void => {
        const runtimeConfig = readLlmRuntimeResumeConfig(config);
        llmTraceSessionId = runtimeConfig?.sessionId;
        llmTraceProvider = runtimeConfig?.provider;
        llmTraceModel = typeof config.model === 'string' ? config.model : undefined;
        llmTraceToolCount = Array.isArray(config.tools) ? config.tools.length : undefined;
      };
      let nextConfig = { ...(rawConfig as Record<string, unknown>) };
      let didUpdateConfigArg = false;
      const existingRuntimeResumeConfig = readLlmRuntimeResumeConfig(rawConfig);
      const hasToolSelection = Object.prototype.hasOwnProperty.call(nextConfig, 'tools');
      const hasWritableShelfScope = (getNormalizedShelfScope(execEnv)?.writeSlotBindings.length ?? 0) > 0;
      const hasSessionAttachment = Boolean(getNormalizedSessionAttachment(execEnv));

      llmResumeEligible = true;
      if (existingRuntimeResumeConfig?.continue === true) {
        isLlmResumeContinuation = true;
        const normalizedResumeConfig = clearLlmResumeBridgeTools(nextConfig);
        nextConfig = normalizedResumeConfig.config;
        didUpdateConfigArg ||= normalizedResumeConfig.didUpdate;
      } else if (!existingRuntimeResumeConfig && !isLlmResumeContinuation && !hasToolSelection) {
        nextConfig = injectLlmRuntimeResumeConfig(nextConfig, {
          sessionId: randomUUID(),
          provider: 'unknown',
          continue: false
        });
        didUpdateConfigArg = true;
      }

      if (pendingGuardAction?.decision === 'resume') {
        const normalizedResumeConfig = clearLlmResumeBridgeTools(nextConfig);
        nextConfig = normalizedResumeConfig.config;
        didUpdateConfigArg ||= normalizedResumeConfig.didUpdate;
        if (currentLlmResumeState) {
          currentLlmResumeState = activateLlmResumeState(currentLlmResumeState);
          nextConfig = injectLlmRuntimeResumeConfig(nextConfig, {
            sessionId: currentLlmResumeState.sessionId,
            provider: currentLlmResumeState.provider,
            continue: true
          });
          isLlmResumeContinuation = true;
        }
      }

      if (hasToolSelection || hasWritableShelfScope || hasSessionAttachment) {
        // config.tools selects capabilities for the bridge; writable shelf scope can also
        // force an MCP bridge so @shelve is auto-provisioned for boxed llm calls. Neither
        // selection should seed the conversation descriptor used for policy/attestation checks.
        if (hasToolSelection || hasWritableShelfScope) {
          resultSecurityDescriptor = buildLlmConversationDescriptor(execEnv, evaluatedArgs);
        }
        const toolsValue = hasToolSelection ? nextConfig.tools : [];
        if (isLlmResumeContinuation) {
          assertLlmResumeBridgeToolsEmpty(toolsValue);
        }
        const dirValue = nextConfig.dir;
        const workingDirectory = typeof dirValue === 'string' && dirValue.trim().length > 0
          ? dirValue.trim()
          : execEnv.getProjectRoot();
        const callConfig = await createCallMcpConfig({
          tools: toolsValue,
          env: execEnv,
          ...(attachedSessionFrameId ? { sessionId: attachedSessionFrameId } : {}),
          workingDirectory,
          conversationDescriptor: resultSecurityDescriptor,
          isMcpContext: true,
          // Load-bearing resume invariant: do not auto-provision @shelve on a
          // continue:true call. Resume must stay incapable of issuing any new
          // tool dispatches across the bridge boundary. See
          // spec-guard-resume.md#resume-invariants.
          disableAutoProvisionedShelve: isLlmResumeContinuation
        });
        const previousSystem = nextConfig.system;
        const toolNotesSystem = appendToolNotesToSystemPrompt(nextConfig.system, callConfig.toolNotes);
        const nextSystem = appendInjectedNotesToSystemPrompt(
          toolNotesSystem,
          callConfig.authorizationNotes
        );
        if (nextSystem !== undefined) {
          nextConfig.system = nextSystem;
          didUpdateConfigArg ||= nextSystem !== previousSystem;
        }
        const sessionAttachment = getNormalizedSessionAttachment(execEnv);
        if (sessionAttachment && !attachedSessionFrameId) {
          const existingSessionInstance = execEnv.getSessionInstance(
            callConfig.sessionId,
            sessionAttachment.definition.id
          );
          if (!existingSessionInstance) {
            const sessionInstance = materializeSession(
              sessionAttachment.definition,
              execEnv,
              callConfig.sessionId
            );
            execEnv.attachSessionInstance(callConfig.sessionId, sessionInstance);
            execEnv.registerScopeCleanup(async () => {
              disposeSessionFrame(callConfig.sessionId, execEnv);
            });
            sessionSeedPending = true;
          }
        } else if (attachedSessionFrameId) {
          attachedSessionCleanupRegistered = true;
        }
        execEnv.registerScopeCleanup(callConfig.cleanup);
        execEnv.setLlmToolConfig(callConfig);

      }

      const previousSystem = nextConfig.system;
      const shelfNotes = renderInjectedShelfNotes(execEnv);
      const nextSystem = appendShelfNotesToSystemPrompt(nextConfig.system, shelfNotes);
      if (nextSystem !== undefined) {
        nextConfig.system = nextSystem;
        didUpdateConfigArg ||= nextSystem !== previousSystem;
      }

      if (didUpdateConfigArg) {
        evaluatedArgs[1] = nextConfig;
        evaluatedArgStrings = stringifyDispatchArgs(definition, evaluatedArgs);
        synchronizeGuardVariableCandidates({
          guardVariableCandidates,
          env: runtimeEnv,
          evaluatedArgs,
          evaluatedArgStrings
        });
      }
      captureLlmTraceConfig(nextConfig);
    }
  }
  if (hasLlmLabel) {
    llmTraceStartedAt = Date.now();
  }
  
  const guardHelperImpl =
    (variable.internal as any)?.guardHelperImplementation;
  if (
    (variable.internal as any)?.isGuardHelper &&
    typeof guardHelperImpl === 'function'
  ) {
    const impl = guardHelperImpl as (args: readonly unknown[]) => unknown | Promise<unknown>;
    const helperResult = await impl(evaluatedArgs);
    return createEvalResult(helperResult, env);
  }

  let mcpSecurityDescriptor = (node as any).meta?.mcpSecurity as SecurityDescriptor | undefined;
  if (!mcpSecurityDescriptor) {
    const mcpTool = (variable.internal as any)?.mcpTool;
    if (mcpTool?.name) {
      mcpSecurityDescriptor = makeSecurityDescriptor({
        taint: ['src:mcp'],
        sources: [`mcp:${mcpTool.name}`]
      });
    }
  }
  let inputSecurityDescriptor = normalizeSecurityDescriptor(
    (node as any).meta?.inputSecurityDescriptor as SecurityDescriptor | undefined
  );
  let argSecurityDescriptors = Array.isArray((node as any).meta?.argSecurityDescriptors)
    ? ((node as any).meta.argSecurityDescriptors as Array<SecurityDescriptor | undefined>)
        .map(descriptor => normalizeSecurityDescriptor(descriptor))
    : undefined;
  const argFactSourceDescriptors = Array.isArray((node as any).meta?.argFactSourceDescriptors)
    ? ((node as any).meta.argFactSourceDescriptors as Array<readonly FactSourceHandle[] | undefined>)
        .map(entry => Array.isArray(entry) && entry.length > 0 ? [...entry] : undefined)
    : undefined;
  const effectiveOperationTaintFacts = false;
  const argRepair = await repairSecurityRelevantExecArgs({
    env: runtimeEnv,
    operationName: toolOperationName ?? variable.name ?? commandName,
    effectiveToolMetadata,
    policySummary: runtimeEnv.getPolicySummary(),
    paramNames: params,
    evaluatedArgs
  });
  evaluatedArgs = argRepair.evaluatedArgs;
  if (argRepair.repairedArgIndices.size > 0) {
    if (Array.isArray(argSecurityDescriptors)) {
      argSecurityDescriptors = argSecurityDescriptors.map((descriptor, index) =>
        argRepair.repairedArgIndices.has(index) ? undefined : descriptor
      );
      const remainingDescriptors = argSecurityDescriptors.filter(
        (descriptor): descriptor is SecurityDescriptor => Boolean(descriptor)
      );
      inputSecurityDescriptor =
        remainingDescriptors.length === 0
          ? undefined
          : remainingDescriptors.length === 1
            ? remainingDescriptors[0]
            : runtimeEnv.mergeSecurityDescriptors(...remainingDescriptors);
    }
    evaluatedArgStrings = stringifyDispatchArgs(definition, evaluatedArgs);
    synchronizeGuardVariableCandidates({
      guardVariableCandidates,
      env: runtimeEnv,
      evaluatedArgs,
      evaluatedArgStrings
    });
  }
  if (inputSecurityDescriptor) {
    resultSecurityDescriptor = resultSecurityDescriptor
      ? runtimeEnv.mergeSecurityDescriptors(resultSecurityDescriptor, inputSecurityDescriptor)
      : inputSecurityDescriptor;
  }
  const policyGuardControlArgs =
    effectiveToolMetadata.hasControlArgsMetadata
      ? effectiveToolMetadata.controlArgs ?? []
      : undefined;
  const policyGuardSourceArgs =
    effectiveToolMetadata.hasSourceArgsMetadata
      ? effectiveToolMetadata.sourceArgs ?? []
      : undefined;
  const authorizationDecisionControlArgs =
    effectiveToolMetadata.hasControlArgsMetadata
      ? effectiveToolMetadata.controlArgs ?? []
      : effectiveToolMetadata.params;
  const inheritedAuthorizationSurfaceOperation =
    runtimeEnv.getContextManager().peekOperation()?.metadata?.authorizationSurfaceOperation;
  const authorizationSurfaceOperation = resolveAuthorizationSurfaceOperation({
    env: execEnv,
    operationName: toolOperationName ?? variable.name ?? commandName,
    executableLabels: toolLabels,
    inheritedAuthorizationSurfaceOperation
  });
  const shouldValidatePolicyAuthorizations =
    Boolean(runtimeEnv.getPolicySummary()?.authorizations) &&
    isToolWriteLabelSet(toolLabels) &&
    authorizationSurfaceOperation;
  const authorizationArgs = buildEffectiveToolCallArguments({
    paramNames: params,
    evaluatedArgs,
    metadata: effectiveToolMetadata
  }) ?? {};
  let effectiveArgSecurityDescriptors = mergeInvocationArgDescriptors({
    env: runtimeEnv,
    evaluatedArgs,
    originalVariables,
    guardVariableCandidates,
    expressionSourceVariables,
    argSecurityDescriptors
  });
  effectiveArgSecurityDescriptors = mergeResolvedArgValueDescriptors({
    env: runtimeEnv,
    evaluatedArgs,
    argSecurityDescriptors: effectiveArgSecurityDescriptors
  });
  const effectiveArgFactSourceDescriptors = mergeInvocationArgFactSources({
    evaluatedArgs,
    originalVariables,
    guardVariableCandidates,
    expressionSourceVariables,
    argFactSourceDescriptors
  });
  if (shouldValidatePolicyAuthorizations) {
    const validation = validateRuntimePolicyAuthorizations(runtimeEnv.getPolicySummary(), runtimeEnv);
    if (validation && validation.errors.length > 0) {
      throw createPolicyAuthorizationValidationError(validation);
    }

    const authorizationDecision = evaluatePolicyAuthorizationDecision({
      authorizations: runtimeEnv.getPolicySummary()!.authorizations!,
      operationName: toolOperationName ?? variable.name ?? commandName,
      args: authorizationArgs,
      controlArgs: authorizationDecisionControlArgs
    });
    if (authorizationDecision.decision === 'allow' && authorizationDecision.matchedAttestations) {
      effectiveArgSecurityDescriptors = mergeAuthorizationAttestationsIntoArgDescriptors({
        env: runtimeEnv,
        paramNames: params,
        argSecurityDescriptors: effectiveArgSecurityDescriptors,
        matchedAttestations: authorizationDecision.matchedAttestations
      });
    }
  }
  const validationArgs = buildToolInputValidationArguments({
    paramNames: params,
    evaluatedArgs,
    metadata: effectiveToolMetadata,
    argSecurityDescriptors: effectiveArgSecurityDescriptors,
    argFactSourceDescriptors: effectiveArgFactSourceDescriptors
  });
  validateToolInputSchema({
    env,
    metadata: effectiveToolMetadata,
    args: validationArgs
  });
  enforceUpdateToolArguments({
    metadata: effectiveToolMetadata,
    args: authorizationArgs,
    env
  });
  const trackedMcpName =
    typeof (mcpTool as any)?.name === 'string' && (mcpTool as any).name.trim().length > 0
      ? (mcpTool as any).name.trim()
      : '';
  const trackedToolName = trackedMcpName || (toolOperationName ?? variable.name ?? commandName ?? '');
  const toolCallArguments =
    trackedToolName.length > 0
      ? buildEffectiveToolCallArguments({
          paramNames: params,
          evaluatedArgs,
          metadata: effectiveToolMetadata
        })
      : undefined;
  const toolAuditId = trackedToolName.length > 0 ? randomUUID() : undefined;
  let toolBodyExecuted = false;
  let toolBodyStartedAt: number | undefined;
  let toolBodyEndedAt: number | undefined;
  const toolProvenance = buildToolProvenance(trackedToolName, toolCallArguments, toolAuditId);
  const toolCallRecordBase =
    !skipInternalToolCallTracking && trackedToolName.length > 0
      ? {
          name: trackedToolName,
          arguments: toolCallArguments,
          timestamp: Date.now()
        }
      : null;
  const shouldTraceLlmToolCall =
    trackedToolName.length > 0 &&
    Array.from(env.getEnclosingExeLabels()).includes('llm');
  if (shouldTraceLlmToolCall) {
    env.emitRuntimeTraceEvent(traceLlmToolCall({
      tool: trackedToolName,
      args: env.summarizeTraceValue(toolCallArguments)
    }));
  }
  const recordToolCall = (ok: boolean, error?: unknown): void => {
    if (!toolCallRecordBase) {
      return;
    }
    if (ok) {
      env.recordToolCall({ ...toolCallRecordBase, ok: true });
      return;
    }
    env.recordToolCall({
      ...toolCallRecordBase,
      ok: false,
      error: normalizeToolCallError(error)
    });
  };
  const recordToolAudit = async (
    ok: boolean,
    resultValue?: unknown,
    error?: unknown
  ): Promise<void> => {
    if (
      !toolAuditId ||
      trackedToolName.length === 0 ||
      !toolBodyExecuted ||
      toolBodyStartedAt === undefined ||
      toolBodyEndedAt === undefined
    ) {
      return;
    }

    const descriptor =
      normalizeSecurityDescriptor(
        ok
          ? (
              extractSecurityDescriptor(resultValue, {
                recursive: true,
                mergeArrayElements: true
              }) ?? resultSecurityDescriptor
            )
          : resultSecurityDescriptor
      );

    await logToolCallEvent(runtimeEnv, {
      id: toolAuditId,
      tool: trackedToolName,
      args: toolCallArguments,
      ok,
      ...(ok ? {} : { error: normalizeToolCallError(error) }),
      ...(ok ? { resultLength: getToolResultLength(resultValue) } : {}),
      duration: Math.max(0, toolBodyEndedAt - toolBodyStartedAt),
      labels: descriptor?.labels,
      taint: descriptor?.taint,
      sources: descriptor?.sources
    });
  };
  const runTrackedToolBody = async <T>(runner: () => Promise<T>): Promise<T> => {
    toolBodyExecuted = true;
    toolBodyStartedAt = Date.now();
    try {
      return await runner();
    } finally {
      toolBodyEndedAt = Date.now();
    }
  };

  try {
    const activePolicyEnforcer = policyEnforcer ?? new PolicyEnforcer(runtimeEnv.getPolicySummary());
    const { guardInputsWithMapping, guardInputs } = prepareExecGuardInputs({
      env: runtimeEnv,
      evaluatedArgs,
      evaluatedArgStrings,
      stringifyArg: value => stringifyDispatchArg(definition, value),
      guardVariableCandidates,
      expressionSourceVariables,
      inputSecurityDescriptor,
      argSecurityDescriptors: effectiveArgSecurityDescriptors,
      argFactSourceDescriptors: effectiveArgFactSourceDescriptors,
      mcpSecurityDescriptor,
      argNames: params
    });
    for (const entry of guardInputsWithMapping) {
      if (entry.index >= 0 && entry.index < guardVariableCandidates.length) {
        guardVariableCandidates[entry.index] = entry.variable;
      }
    }
    let postHookInputs: readonly Variable[] = guardInputs;
    const execDescriptor = getVariableSecurityDescriptor(variable);
	    const {
	      operationContext,
	      exeLabels,
	      mergePolicyInputDescriptor
	    } = await createExecOperationContextAndEnforcePolicy({
      node,
      definition,
      commandName,
      operationName: toolOperationName ?? variable.name ?? commandName,
      toolLabels,
      authorizationControlArgs: policyGuardControlArgs,
      authorizationSourceArgs: policyGuardSourceArgs,
      commandAccessSubstrate: (variable.internal as any)?.isToolbridgeWrapper === true,
      correlateControlArgs: effectiveToolMetadata.correlateControlArgs === true,
      operationTaintFacts: effectiveOperationTaintFacts,
      env: runtimeEnv,
      execEnv,
      policyEnforcer: activePolicyEnforcer,
      mcpSecurityDescriptor,
      execDescriptor,
      guardArgNames: guardInputsWithMapping.map(entry => entry.name ?? null),
      services: {
        interpolateWithResultDescriptor,
        getResultSecurityDescriptor: () => resultSecurityDescriptor,
        resolveStdinInput
	      }
	    });

	    const activeExeLabels = exeLabels.length > 0
	      ? exeLabels
	      : Array.from(runtimeEnv.getExeLabels() ?? runtimeEnv.getEnclosingExeLabels());
	    if (activeExeLabels.length > 0) {
	      execEnv.setExeLabels(activeExeLabels);
	    }

	    if (llmResumeEligible || currentLlmResumeState) {
	      const nextMetadata: Record<string, unknown> = {
	        ...((operationContext.metadata ?? {}) as Record<string, unknown>)
	      };
      if (llmResumeEligible) {
        nextMetadata.llmResumeEligible = true;
      }
      if (currentLlmResumeState) {
        nextMetadata.llmResumeState = { ...currentLlmResumeState };
      }
      operationContext.metadata = nextMetadata;
    }
    if (shouldValidatePolicyAuthorizations) {
      const nextMetadata: Record<string, unknown> = {
        ...((operationContext.metadata ?? {}) as Record<string, unknown>),
        authorizationTrace: {
          tool: toolOperationName ?? variable.name ?? commandName,
          args: runtimeEnv.summarizeTraceValue(authorizationArgs),
          controlArgs: [...authorizationDecisionControlArgs]
        }
      };
      operationContext.metadata = nextMetadata;
    }

    const finalizeResult = async (result: EvalResult): Promise<EvalResult> =>
      runExecPostGuards({
        env: runtimeEnv,
        execEnv,
        node,
        operationContext,
        postHookInputs,
        result,
        whenExprNode
      });

    const invocationResult = await runtimeEnv.withOpContext(operationContext, async () => {
      return AutoUnwrapManager.executeWithPreservation(async () => {
      const {
        preDecision,
        postHookInputs: nextPostHookInputs,
        transformedGuardSet
      } = await runExecPreGuards({
        env: runtimeEnv,
        node,
        operationContext,
        guardInputs,
        guardInputsWithMapping,
        guardVariableCandidates,
        evaluatedArgs,
        evaluatedArgStrings,
        stringifyArg: value => stringifyDispatchArg(definition, value)
      });
      emitResolvedAuthorizationTrace({
        env: runtimeEnv,
        operationContext,
        preDecision
      });
      postHookInputs = nextPostHookInputs;
      await bindExecParameterVariables({
        params,
        evaluatedArgs,
        evaluatedArgStrings,
        originalVariables,
        guardVariableCandidates,
        definition,
        execEnv,
        transformedGuardSet,
        createParameterMetadata
      });
      if (!sessionSeedApplied && sessionSeedPending) {
        const sessionAttachment = getNormalizedSessionAttachment(execEnv);
        if (sessionAttachment) {
          const sessionInstance = resolveAttachedSessionInstance(sessionAttachment.definition, execEnv);
          if (!sessionInstance) {
            throw new MlldInterpreterError(
              `Session @${sessionAttachment.definition.canonicalName} failed to attach to the current frame.`,
              'session',
              undefined,
              { code: 'SESSION_NOT_ATTACHED' }
            );
          }
          await applySeedWrites(sessionInstance, sessionAttachment.seed, execEnv);
          sessionSeedApplied = true;
          sessionSeedPending = false;
        }
      }

      // Capture descriptors from executable definition and parameters
      const descriptorPieces: SecurityDescriptor[] = [];
      const strictToolDescriptorPieces: SecurityDescriptor[] = [];
      const variableDescriptor = getVariableSecurityDescriptor(variable);
      if (variableDescriptor) {
        descriptorPieces.push(variableDescriptor);
        strictToolDescriptorPieces.push(variableDescriptor);
      }
      const mergedParamDescriptor = collectAndMergeParameterDescriptors(params, execEnv);
      if (mergedParamDescriptor) {
        descriptorPieces.push(mergedParamDescriptor);
      }
      if (mcpSecurityDescriptor) {
        descriptorPieces.push(mcpSecurityDescriptor);
        strictToolDescriptorPieces.push(mcpSecurityDescriptor);
      }
      const sourceTaintLabel = deriveExecutableSourceTaintLabel({
        type: (definition as any).type,
        language: (definition as any).language
      });
      if (sourceTaintLabel) {
        const sourceDescriptor = makeSecurityDescriptor({ taint: [sourceTaintLabel] });
        descriptorPieces.push(sourceDescriptor);
        strictToolDescriptorPieces.push(sourceDescriptor);
      }
      if (toolProvenance) {
        const provenanceDescriptor = makeSecurityDescriptor({ tools: [toolProvenance] });
        descriptorPieces.push(provenanceDescriptor);
        strictToolDescriptorPieces.push(provenanceDescriptor);
      }
      if (strictToolDescriptorPieces.length > 0) {
        strictToolResultBaseDescriptor =
          strictToolDescriptorPieces.length === 1
            ? strictToolDescriptorPieces[0]
            : runtimeEnv.mergeSecurityDescriptors(...strictToolDescriptorPieces);
      }
      if (descriptorPieces.length > 0) {
        const descriptorFromPieces =
          descriptorPieces.length === 1
            ? descriptorPieces[0]
            : runtimeEnv.mergeSecurityDescriptors(...descriptorPieces);
        resultSecurityDescriptor = resultSecurityDescriptor
          ? runtimeEnv.mergeSecurityDescriptors(resultSecurityDescriptor, descriptorFromPieces)
          : descriptorFromPieces;
      }
      const paramFlowHandled = await enforceExecParamLabelFlow({
        env: runtimeEnv,
        execEnv,
        node,
        whenExprNode,
        policyEnforcer: activePolicyEnforcer,
        operationContext,
        exeLabels,
        resultSecurityDescriptor
      });
      if (paramFlowHandled) {
        return finalizeResult(paramFlowHandled);
      }
      resultSecurityDescriptor = applyExecOutputPolicyLabels({
        policyEnforcer: activePolicyEnforcer,
        exeLabels,
        resultSecurityDescriptor
      });
      if (resultSecurityDescriptor) {
        runtimeEnv.recordSecurityDescriptor(resultSecurityDescriptor);
      }

      const preGuardHandled = await handleExecPreGuardDecision({
        preDecision,
        node,
        env: runtimeEnv,
        execEnv,
        operationContext,
        postHookInputs,
        whenExprNode
      });
      if (preGuardHandled) {
        return finalizeResult(preGuardHandled);
      }

      let result: unknown;
      let strictToolResult: unknown;
      let recordTrustRefinementApplied = false;
      let outputRecordEnv = execEnv;
      let workingDirectory: string | undefined;
      let workspacePushed = false;
      if ('workingDir' in definition && (definition as any).workingDir) {
    const resolvedWorkingDirectory = await resolveWorkingDirectory(
      (definition as any).workingDir as any,
      execEnv,
      {
        sourceLocation: node.location ?? undefined,
        directiveType: 'exec'
      }
    );
    if (resolvedWorkingDirectory.type === 'path') {
      workingDirectory = resolvedWorkingDirectory.path;
    }
    workspacePushed = resolvedWorkingDirectory.workspacePushed;
  }

  try {
  const isCommandDefinition = isCommandExecutable(definition);
  const isCodeDefinition = isCodeExecutable(definition);
  if (!isCommandDefinition && !isCodeDefinition) {
    const nonCommandResult = await runTrackedToolBody(() =>
      executeNonCommandExecutable({
        definition,
        commandName,
        node,
        nodeSourceLocation,
        env: runtimeEnv,
        execEnv,
        variable,
        params,
        evaluatedArgs,
        argSourceNames,
        resultSecurityDescriptor,
        exeLabels,
        skipResultWithClause: isLlmResumeContinuation,
        services: {
          interpolateWithResultDescriptor,
          toPipelineInput,
          evaluateExecInvocation
        }
      })
    );
    if (nonCommandResult === undefined) {
      throw new MlldInterpreterError(`Unknown executable type: ${(definition as any).type}`);
    }
    result = nonCommandResult;
  }
  // Handle command executables
  else if (isCommandDefinition) {
    result = await runTrackedToolBody(() =>
      executeCommandExecutable({
        definition,
        commandName,
        node,
        env: runtimeEnv,
        execEnv,
        variable,
        params,
        evaluatedArgs,
        evaluatedArgStrings,
        originalVariables,
        exeLabels,
        preDecisionMetadata: preDecision?.metadata,
        policyEnforcer: activePolicyEnforcer,
        operationContext,
        mergePolicyInputDescriptor,
        workingDirectory,
        streamingEnabled,
        pipelineId,
        hasStreamFormat,
        suppressTerminal: streamingOptions.suppressTerminal === true,
        skipResultWithClause: isLlmResumeContinuation,
        chunkEffect,
        services: {
          interpolateWithResultDescriptor,
          mergeResultDescriptor,
          getResultSecurityDescriptor: () => resultSecurityDescriptor,
          resolveStdinInput
        }
      })
    );
  }
  // Handle code executables
  else if (isCodeDefinition) {
    const codeResult = await runTrackedToolBody(() =>
      executeCodeExecutable({
        definition,
        commandName,
        node,
        env: runtimeEnv,
        execEnv,
        variable,
        params,
        evaluatedArgs,
        evaluatedArgStrings,
        exeLabels,
        policyEnforcer: activePolicyEnforcer,
        operationContext,
        mergePolicyInputDescriptor,
        workingDirectory,
        whenExprNode,
        skipResultWithClause: isLlmResumeContinuation,
        services: {
          interpolateWithResultDescriptor,
          toPipelineInput,
          mergeResultDescriptor,
          getResultSecurityDescriptor: () => resultSecurityDescriptor,
          finalizeResult
        }
      })
    );
    if (codeResult.kind === 'return') {
      return codeResult.evalResult;
    }
    result = codeResult.result;
    strictToolResult = codeResult.toolResult;
    strictToolResultDescriptor = codeResult.toolResultDescriptor;
    execEnv = codeResult.execEnv;
    outputRecordEnv = codeResult.outputRecordEnv ?? execEnv;
  } else {
    throw new MlldInterpreterError(`Unknown executable type: ${(definition as any).type}`);
  }

  const resumeEnvelope = tryExtractLlmResumeEnvelope(result);
  if (resumeEnvelope) {
    result = resumeEnvelope.value;
    if (resumeEnvelope.resumeState) {
      currentLlmResumeState = mergeReturnedLlmResumeState(currentLlmResumeState, resumeEnvelope.resumeState);
      surfacedLlmSessionId = currentLlmResumeState.sessionId;
      const nextMetadata: Record<string, unknown> = {
        ...((operationContext.metadata ?? {}) as Record<string, unknown>),
        ...(llmResumeEligible ? { llmResumeEligible: true } : {}),
        llmResumeState: { ...currentLlmResumeState }
      };
      operationContext.metadata = nextMetadata;
      runtimeEnv.updateOpContext({ metadata: nextMetadata });
    }
  }
  const useStrictToolResult =
    (variable.internal as any)?.isToolbridgeWrapper === true &&
    definition.toolReturnMode?.strict === true;

  if (!useStrictToolResult && definition.outputRecord) {
    const recordDefinition = await resolveConfiguredOutputRecordDefinition({
      outputRecord: definition.outputRecord,
      variable,
      commandName,
      runtimeEnv,
      execEnv: outputRecordEnv,
      nodeSourceLocation
    });
    const rawRecordDescriptor = extractSecurityDescriptor(result, {
      recursive: true,
      mergeArrayElements: true
    });
    const inheritedRecordDescriptor = resultSecurityDescriptor
      ? (rawRecordDescriptor
          ? runtimeEnv.mergeSecurityDescriptors(resultSecurityDescriptor, rawRecordDescriptor)
          : resultSecurityDescriptor)
      : rawRecordDescriptor;
    result = await coerceRecordOutput({
      definition: recordDefinition,
      value: result,
      env: execEnv,
      inheritedDescriptor: inheritedRecordDescriptor
    });
    recordTrustRefinementApplied =
      isStructuredValue(result) && result.type !== 'text';
  }

  if (useStrictToolResult) {
    result = strictToolResult;
  }

  if (surfacedLlmSessionId) {
    result = attachLlmSessionIdMetadata(wrapExecResult(result));
  }

  // Apply post-invocation field/index access if present (e.g., @func()[1], @obj.method().2)
  const postFields: any[] = (node as any).fields || [];
  if (postFields && postFields.length > 0) {
    try {
      const { accessField } = await import('../utils/field-access');
      let current: any = result;
      for (const f of postFields) {
        current = await accessField(current, f, {
          env: runtimeEnv,
          sourceLocation: nodeSourceLocation
        });
      }
      result = current;
    } catch (e) {
      // Preserve existing behavior: if field access fails, surface error as interpreter error
      throw e;
    }
  }

  // Normalize Variable results into raw values (with StructuredValue wrappers when enabled)
  if (result && typeof result === 'object') {
    const { isVariable, extractVariableValue } = await import('../utils/variable-resolution');
    if (isVariable(result)) {
      if (isExecutableVariable(result)) {
        result = cloneExecutableResult(result);
      } else {
        let extracted = await extractVariableValue(result, execEnv);
        while (isVariable(extracted) && !isExecutableVariable(extracted)) {
          extracted = await extractVariableValue(extracted, execEnv);
        }
        if (isExecutableResult(extracted)) {
          result = cloneExecutableResult(extracted);
        } else if (isStructuredValue(extracted)) {
          // Preserve the original wrapper so record projection/internal field
          // metadata survives returned variable normalization.
          result = wrapStructured(extracted as any);
        } else {
          const typeHint = Array.isArray(extracted)
            ? 'array'
            : typeof extracted === 'object' && extracted !== null
              ? 'object'
              : 'text';
          const structured = wrapStructured(extracted as any, typeHint as any);
          result = structured;
        }
      }
    }
  }

  const resultValueDescriptor = extractSecurityDescriptor(result, {
    recursive: useStrictToolResult,
    mergeArrayElements: useStrictToolResult
  });

  if (useStrictToolResult) {
    resultSecurityDescriptor = undefined;
    mergeResultDescriptor(strictToolResultBaseDescriptor);
    mergeResultDescriptor(strictToolResultDescriptor);
    mergeResultDescriptor(resultValueDescriptor);
    resultSecurityDescriptor = applyExecOutputPolicyLabels({
      policyEnforcer: activePolicyEnforcer,
      exeLabels,
      resultSecurityDescriptor
    });
  } else {
    const localExecutionDescriptor = execEnv.getLocalSecurityDescriptor();
    const shouldPreferUntrustedReturn = hasUntrustedWithoutTrusted(resultValueDescriptor);

    mergeResultDescriptor(
      shouldPreferUntrustedReturn && localExecutionDescriptor
        ? stripTrustedFromDescriptor(localExecutionDescriptor)
        : localExecutionDescriptor
    );
    mergeResultDescriptor(resultValueDescriptor);

    if (shouldPreferUntrustedReturn && resultSecurityDescriptor) {
      resultSecurityDescriptor = stripTrustedFromDescriptor(resultSecurityDescriptor);
    }

    if (
      recordTrustRefinementApplied
      && resultSecurityDescriptor
      && !hasDescriptorLabel(resultValueDescriptor, 'untrusted')
    ) {
      resultSecurityDescriptor = stripUntrustedFromDescriptor(resultSecurityDescriptor);
    }
  }

  if (resultSecurityDescriptor) {
    if (isExecutableResult(result)) {
      result = applyDescriptorToExecutableResult(result, resultSecurityDescriptor);
    } else {
      const structured = wrapExecResult(result);
      const existing = getStructuredSecurityDescriptor(structured);
      const merged = existing
        ? runtimeEnv.mergeSecurityDescriptors(existing, resultSecurityDescriptor)
        : resultSecurityDescriptor;
      setStructuredSecurityDescriptor(structured, merged);
      result = structured;
    }
  }

  // Clean up resolution tracking after executable body completes, before pipeline/with clause processing
  // This allows pipelines to retry/re-execute the same function without false circular reference detection
  // Skip builtin methods and reserved names as they were never added to the resolution stack
  endResolutionTrackingIfNeeded();

  // Apply withClause transformations if present
  if (!useStrictToolResult && invocationWithClause && !isLlmResumeContinuation) {
    if (invocationWithClause.pipeline) {
      // When an ExecInvocation has a pipeline, we need to create a special pipeline
      // where the ExecInvocation itself becomes stage 0, retryable
      const { executePipeline } = await import('./pipeline');
      
      // Create a source function that re-executes this ExecInvocation (without the pipeline)
      const sourceFunction = async () => {
        // Re-execute this same ExecInvocation but without the pipeline
        // IMPORTANT: Use execEnv not env, so the function parameters are available
        const nodeWithoutPipeline = {
          ...node,
          withClause: { ...invocationWithClause, pipeline: undefined }
        };
        const freshResult = await evaluateExecInvocation(nodeWithoutPipeline, execEnv);
        return wrapExecResult(freshResult.value);
      };
      
      // Create synthetic source stage for retryable pipeline
      const SOURCE_STAGE = {
        rawIdentifier: '__source__',
        identifier: [],
        args: [],
        fields: [],
        rawArgs: []
      };

      // Attach builtin effects BEFORE prepending synthetic source
      // This ensures effects are attached to user-defined stages, not to __source__
      let userPipeline = invocationWithClause.pipeline;
      try {
        const { attachBuiltinEffects } = await import('./pipeline/effects-attachment');
        const { functionalPipeline } = attachBuiltinEffects(userPipeline as any);
        userPipeline = functionalPipeline as any;
      } catch {
        // If helper import fails, proceed without effect attachment
      }

      // Prepend synthetic source stage after effect attachment
      const normalizedPipeline = [SOURCE_STAGE, ...userPipeline];

      // Execute the pipeline with the ExecInvocation result as initial input
      // Mark it as retryable with the source function
      const pipelineInput = wrapExecResult(result);
      const pipelineResult = await executePipeline(
        pipelineInput,
        normalizedPipeline,
        execEnv,  // Use execEnv which has merged nodes
        node.location,
        invocationWithClause.format,
        true,  // isRetryable
        sourceFunction,
        true,  // hasSyntheticSource
        undefined,
        undefined,
        { returnStructured: true, stream: streamingRequested }
      );
      
      // Still need to handle other withClause features (trust, needs)
      let pipelineValue = wrapPipelineResult(pipelineResult);
      const pipelineDescriptor = getStructuredSecurityDescriptor(pipelineValue);
      const combinedDescriptor = pipelineDescriptor
        ? (resultSecurityDescriptor
            ? runtimeEnv.mergeSecurityDescriptors(pipelineDescriptor, resultSecurityDescriptor)
            : pipelineDescriptor)
        : resultSecurityDescriptor;
      if (combinedDescriptor) {
        setStructuredSecurityDescriptor(pipelineValue, combinedDescriptor);
        mergeResultDescriptor(combinedDescriptor);
      }
      const withClauseResult = await applyWithClause(
        pipelineValue,
        { ...invocationWithClause, pipeline: undefined },
        execEnv
      );
      const finalWithClauseResult = await finalizeResult(withClauseResult);
      return finalWithClauseResult;
    } else {
      const withClauseResult = await applyWithClause(result, invocationWithClause, execEnv);
      const finalWithClauseResult = await finalizeResult(withClauseResult);
      return finalWithClauseResult;
    }
  }

  const finalEvalResult = await finalizeResult(createEvalResult(result, execEnv));
  return finalEvalResult;
  } finally {
    await execEnv.runScopeCleanups();
    if (workspacePushed) {
      execEnv.popActiveWorkspace();
    }
  }
      });
    });
    if (descriptorHasExternalInputSource(resultSecurityDescriptor)) {
      env.recordKnownUrlsFromValue(invocationResult.value);
    }
    await recordToolAudit(true, invocationResult.value);
    if (shouldTraceLlmToolCall) {
      env.emitRuntimeTraceEvent(traceLlmToolResult({
        tool: trackedToolName,
        ok: true,
        result: env.summarizeTraceValue(invocationResult.value),
        durationMs:
          toolBodyStartedAt !== undefined && toolBodyEndedAt !== undefined
            ? Math.max(0, toolBodyEndedAt - toolBodyStartedAt)
            : undefined
      }));
    }
    if (hasLlmLabel) {
      env.emitRuntimeTraceEvent(traceLlmInvocation(
        isLlmResumeContinuation ? 'llm.resume' : 'llm.call',
        {
        sessionId: currentLlmResumeState?.sessionId ?? llmTraceSessionId,
        provider: currentLlmResumeState?.provider ?? llmTraceProvider,
        model: llmTraceModel,
        toolCount: llmTraceToolCount,
        resume: isLlmResumeContinuation,
        ok: true,
        durationMs: llmTraceStartedAt !== undefined ? Math.max(0, Date.now() - llmTraceStartedAt) : undefined
        }
      ));
    }
    recordToolCall(true);
    return invocationResult;
  } catch (error) {
    await recordToolAudit(false, undefined, error);
    if (shouldTraceLlmToolCall) {
      env.emitRuntimeTraceEvent(traceLlmToolResult({
        tool: trackedToolName,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs:
          toolBodyStartedAt !== undefined && toolBodyEndedAt !== undefined
            ? Math.max(0, toolBodyEndedAt - toolBodyStartedAt)
            : undefined
      }));
    }
    if (hasLlmLabel) {
      env.emitRuntimeTraceEvent(traceLlmInvocation(
        isLlmResumeContinuation ? 'llm.resume' : 'llm.call',
        {
        sessionId: currentLlmResumeState?.sessionId ?? llmTraceSessionId,
        provider: currentLlmResumeState?.provider ?? llmTraceProvider,
        model: llmTraceModel,
        toolCount: llmTraceToolCount,
        resume: isLlmResumeContinuation,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: llmTraceStartedAt !== undefined ? Math.max(0, Date.now() - llmTraceStartedAt) : undefined
        }
      ));
    }
    recordToolCall(false, error);
    throw error;
  }
  } finally {
    // Ensure resolution tracking is always cleaned up, even on error paths.
    endResolutionTrackingIfNeeded();

    finalizeExecInvocationStreaming(env, streamingManager);
  }
}
