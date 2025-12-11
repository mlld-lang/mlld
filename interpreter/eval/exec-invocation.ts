import type { ExecInvocation, WithClause } from '@core/types';
import { astLocationToSourceLocation } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import type { ExecutableDefinition } from '@core/types/executable';
import { isCommandExecutable, isCodeExecutable, isTemplateExecutable, isCommandRefExecutable, isSectionExecutable, isResolverExecutable, isPipelineExecutable, isDataExecutable } from '@core/types/executable';
import { interpolate } from '../core/interpreter';
import { InterpolationContext } from '../core/interpolation-context';
import {
  isExecutableVariable,
  VariableMetadataUtils
} from '@core/types/variable';
import type { Variable, VariableContext } from '@core/types/variable';
import { applyWithClause } from './with-clause';
import { MlldInterpreterError, MlldCommandExecutionError, CircularReferenceError } from '@core/errors';
import { CommandUtils } from '../env/CommandUtils';
import { logger } from '@core/utils/logger';
import { extractSection } from './show';
import { prepareValueForShadow } from '../env/variable-proxy';
import { evaluateExeBlock, type ExeBlockNode } from './exe';
import type { ShadowEnvironmentCapture } from '../env/types/ShadowEnvironmentCapture';
import { AutoUnwrapManager } from './auto-unwrap-manager';
import { StructuredValue as LegacyStructuredValue } from '@core/types/structured-value';
import {
  asText,
  asData,
  isStructuredValue,
  wrapStructured,
  parseAndWrapJson,
  collectAndMergeParameterDescriptors,
  extractSecurityDescriptor,
  normalizeWhenShowEffect,
  applySecurityDescriptorToStructuredValue
} from '../utils/structured-value';
import { inheritExpressionProvenance } from '@core/types/provenance/ExpressionProvenance';
import type { StructuredValueContext } from '../utils/structured-value';
import { coerceValueForStdin } from '../utils/shell-value';
import { wrapExecResult, wrapPipelineResult } from '../utils/structured-exec';
import type { SecurityDescriptor } from '@core/types/security';
import { normalizeTransformerResult } from '../utils/transformer-result';
import { ctxToSecurityDescriptor } from '@core/types/variable/CtxHelpers';
import type { WhenExpressionNode } from '@core/types/when';
import { handleExecGuardDenial } from './guard-denial-handler';
import { resolveWorkingDirectory } from '../utils/working-directory';
import type { OperationContext } from '../env/ContextManager';
import { getGuardTransformedInputs, handleGuardDecision } from '../hooks/hook-decision-handler';
import { runWithGuardRetry } from '../hooks/guard-retry-runner';
import {
  materializeGuardInputsWithMapping,
  type GuardInputMappingEntry
} from '../utils/guard-inputs';
import { createParameterVariable } from '../utils/parameter-factory';
import { getAdapter } from '../streaming/adapter-registry';
import { loadStreamAdapter, resolveStreamFormatValue } from '../streaming/stream-format';

/**
 * Resolve stdin input from expression using shared shell classification.
 */
async function resolveStdinInput(stdinSource: unknown, env: Environment): Promise<string> {
  if (stdinSource === null || stdinSource === undefined) {
    return '';
  }

  const { evaluate } = await import('../core/interpreter');
  const result = await evaluate(stdinSource as any, env, { isExpression: true });
  let value = result.value;

  const { isVariable, resolveValue, ResolutionContext } = await import('../utils/variable-resolution');
  if (isVariable(value)) {
    value = await resolveValue(value, env, ResolutionContext.CommandExecution);
  }

  return coerceValueForStdin(value);
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

function cloneVariableWithNewValue(
  source: Variable,
  value: unknown,
  fallback: string
): Variable {
  const cloned: Variable = {
    ...source,
    value: value ?? fallback,
    ctx: source.ctx ? { ...source.ctx } : undefined,
    internal: { ...(source.internal ?? {}) }
  };
  if (cloned.ctx?.ctxCache) {
    delete cloned.ctx.ctxCache;
  }
  return cloned;
}

function cloneGuardCandidateForParameter(
  name: string,
  candidate: Variable,
  argValue: unknown,
  fallback: string | undefined
): Variable {
  const cloned: Variable = {
    ...candidate,
    name,
    value: argValue ?? fallback ?? candidate.value,
    ctx: candidate.ctx ? { ...candidate.ctx } : undefined,
    internal: {
      ...(candidate.internal ?? {}),
      isSystem: true,
      isParameter: true
    }
  };
  if (cloned.ctx?.ctxCache) {
    delete cloned.ctx.ctxCache;
  }
  return cloned;
}

function stringifyGuardArg(value: unknown): string {
  if (isStructuredValue(value)) {
    return asText(value);
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value === undefined) {
    return 'undefined';
  }
  if (value === null) {
    return 'null';
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function applyGuardTransformsToExecArgs(options: {
  guardInputEntries: readonly GuardInputMappingEntry[];
  transformedInputs: readonly Variable[];
  guardVariableCandidates: (Variable | undefined)[];
  evaluatedArgs: any[];
  evaluatedArgStrings: string[];
}): void {
  const { guardInputEntries, transformedInputs, guardVariableCandidates, evaluatedArgs, evaluatedArgStrings } =
    options;
  const limit = Math.min(transformedInputs.length, guardInputEntries.length);
  for (let i = 0; i < limit; i++) {
    const entry = guardInputEntries[i];
    const replacement = transformedInputs[i];
    if (!entry || !replacement) {
      continue;
    }
    const argIndex = entry.index;
    guardVariableCandidates[argIndex] = replacement;
    const normalizedValue = isStructuredValue(replacement.value)
      ? replacement.value.data
      : replacement.value;
    evaluatedArgs[argIndex] = normalizedValue;
    evaluatedArgStrings[argIndex] = stringifyGuardArg(normalizedValue);
  }
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

type StringBuiltinMethod =
  | 'toLowerCase'
  | 'toUpperCase'
  | 'trim'
  | 'slice'
  | 'substring'
  | 'substr'
  | 'replace'
  | 'replaceAll'
  | 'padStart'
  | 'padEnd'
  | 'repeat';
type ArrayBuiltinMethod = 'slice' | 'concat' | 'reverse' | 'sort';
type SearchBuiltinMethod = 'includes' | 'startsWith' | 'endsWith' | 'indexOf';
type MatchBuiltinMethod = 'match';
type TypeCheckingMethod = 'isArray' | 'isObject' | 'isString' | 'isNumber' | 'isBoolean' | 'isNull' | 'isDefined';

function ensureStringTarget(method: string, target: unknown): string {
  if (typeof target === 'string') {
    return target;
  }
  throw new MlldInterpreterError(`Cannot call .${method}() on ${typeof target}`);
}

function ensureArrayTarget(method: string, target: unknown): unknown[] {
  if (Array.isArray(target)) {
    return target;
  }
  throw new MlldInterpreterError(`Cannot call .${method}() on ${typeof target}`);
}

function handleStringBuiltin(method: StringBuiltinMethod, target: unknown, args: unknown[] = []): string {
  const value = ensureStringTarget(method, target);
  switch (method) {
    case 'toLowerCase':
      return value.toLowerCase();
    case 'toUpperCase':
      return value.toUpperCase();
    case 'trim':
      return value.trim();
    case 'slice': {
      const start = args.length > 0 ? Number(args[0]) : undefined;
      const end = args.length > 1 ? Number(args[1]) : undefined;
      return value.slice(start ?? undefined, end ?? undefined);
    }
    case 'substring': {
      const start = args.length > 0 ? Number(args[0]) : 0;
      const end = args.length > 1 ? Number(args[1]) : undefined;
      return value.substring(start, end ?? undefined);
    }
    case 'substr': {
      const start = args.length > 0 ? Number(args[0]) : 0;
      const length = args.length > 1 && args[1] !== undefined ? Number(args[1]) : undefined;
      return length !== undefined ? value.substr(start, length) : value.substr(start);
    }
    case 'replace': {
      const searchValue = args[0] instanceof RegExp ? args[0] : String(args[0] ?? '');
      const replaceValue = String(args[1] ?? '');
      return value.replace(searchValue as any, replaceValue);
    }
    case 'replaceAll': {
      const searchValue = args[0] instanceof RegExp ? args[0] : String(args[0] ?? '');
      const replaceValue = String(args[1] ?? '');
      if (searchValue instanceof RegExp && !searchValue.global) {
        return value.replace(new RegExp(searchValue.source, `${searchValue.flags}g`), replaceValue);
      }
      return value.replaceAll(searchValue as any, replaceValue);
    }
    case 'padStart': {
      const targetLength = args.length > 0 ? Number(args[0]) : value.length;
      const padStringArg = args.length > 1 ? String(args[1]) : ' ';
      return value.padStart(targetLength, padStringArg);
    }
    case 'padEnd': {
      const targetLength = args.length > 0 ? Number(args[0]) : value.length;
      const padStringArg = args.length > 1 ? String(args[1]) : ' ';
      return value.padEnd(targetLength, padStringArg);
    }
    case 'repeat': {
      const count = args.length > 0 ? Number(args[0]) : 0;
      return value.repeat(count);
    }
  }
  throw new MlldInterpreterError(`Unsupported string builtin: ${method}`);
}

function handleArrayBuiltin(method: ArrayBuiltinMethod, target: unknown, args: unknown[] = []): unknown[] {
  const array = ensureArrayTarget(method, target);
  switch (method) {
    case 'slice': {
      const start = args.length > 0 ? Number(args[0]) : undefined;
      const end = args.length > 1 ? Number(args[1]) : undefined;
      return array.slice(start ?? undefined, end ?? undefined);
    }
    case 'concat':
      return array.concat(...args);
    case 'reverse':
      return [...array].reverse();
    case 'sort': {
      const cloned = [...array];
      const comparator = args[0];
      if (typeof comparator === 'function') {
        return cloned.sort(comparator as (a: unknown, b: unknown) => number);
      }
      return cloned.sort();
    }
  }
  throw new MlldInterpreterError(`Unsupported array builtin: ${method}`);
}

function handleLengthBuiltin(target: unknown): number {
  if (typeof target === 'string' || Array.isArray(target)) {
    return target.length;
  }
  throw new MlldInterpreterError(`Cannot call .length() on ${typeof target}`);
}

function handleJoinBuiltin(target: unknown, separator: unknown): string {
  const value = ensureArrayTarget('join', target);
  const joiner = separator !== undefined ? String(separator) : ',';
  return value.join(joiner);
}

function handleSplitBuiltin(target: unknown, separator: unknown): string[] {
  const value = ensureStringTarget('split', target);
  const splitOn = separator !== undefined ? String(separator) : '';
  return value.split(splitOn);
}

function handleTypeCheckingBuiltin(method: TypeCheckingMethod, target: unknown): boolean {
  switch (method) {
    case 'isArray':
      return Array.isArray(target);
    case 'isObject':
      return typeof target === 'object' && target !== null && !Array.isArray(target);
    case 'isString':
      return typeof target === 'string';
    case 'isNumber':
      return typeof target === 'number';
    case 'isBoolean':
      return typeof target === 'boolean';
    case 'isNull':
      return target === null;
    case 'isDefined':
      return target !== null && target !== undefined;
  }
  throw new MlldInterpreterError(`Unsupported type checking builtin: ${method}`);
}

function handleSearchBuiltin(method: SearchBuiltinMethod, target: unknown, arg: unknown): boolean | number {
  if (Array.isArray(target)) {
    if (method === 'includes') {
      return target.includes(arg);
    }
    if (method === 'indexOf') {
      return target.indexOf(arg);
    }
    throw new MlldInterpreterError(`Cannot call .${method}() on array targets`);
  }

  const value = ensureStringTarget(method, target);
  const searchValue = String(arg ?? '');

  switch (method) {
    case 'includes':
      return value.includes(searchValue);
    case 'indexOf':
      return value.indexOf(searchValue);
    case 'startsWith':
      return value.startsWith(searchValue);
    case 'endsWith':
      return value.endsWith(searchValue);
  }
  throw new MlldInterpreterError(`Unsupported search builtin: ${method}`);
}

function handleMatchBuiltin(target: unknown, arg: unknown): RegExpMatchArray | null {
  const value = ensureStringTarget('match', target);
  const pattern = arg instanceof RegExp ? arg : new RegExp(String(arg ?? ''));
  return value.match(pattern);
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
  return await runWithGuardRetry({
    env,
    operationContext: operationPreview,
    sourceRetryable: true,
    execute: () => evaluateExecInvocationInternal(node, env)
  });
}

function buildExecOperationPreview(node: ExecInvocation): OperationContext | undefined {
  const identifier = (node.commandRef as any)?.identifier;
  if (typeof identifier === 'string' && identifier.length > 0) {
    return {
      type: 'exe',
      name: identifier,
      location: node.location ?? null,
      metadata: { sourceRetryable: true }
    };
  }
  return undefined;
}

async function evaluateExecInvocationInternal(
  node: ExecInvocation,
  env: Environment
): Promise<EvalResult> {
  let commandName: string | undefined; // Declare at function scope for finally block

  // Define builtin methods list at function scope for use in circular reference checks
  const builtinMethods = [
    'includes',
    'match',
    'length',
    'indexOf',
    'join',
    'split',
    'toLowerCase',
    'toUpperCase',
    'trim',
    'slice',
    'substring',
    'substr',
    'replace',
    'replaceAll',
    'padStart',
    'padEnd',
    'repeat',
    'startsWith',
    'endsWith',
    'concat',
    'reverse',
    'sort',
    'isArray',
    'isObject',
    'isString',
    'isNumber',
    'isBoolean',
    'isNull',
    'isDefined'
  ];

  const normalizeFields = (fields?: Array<{ type: string; value: any }>) =>
    (fields || []).map(field => {
      if (!field || typeof field !== 'object') return field;
      if (field.type === 'Field') {
        return { ...field, type: 'field' };
      }
      return field;
    });

  let streamingOptions = env.getStreamingOptions();
  let streamingRequested =
    node.stream === true ||
    node.withClause?.stream === true ||
    node.meta?.withClause?.stream === true;
  let streamingEnabled = streamingOptions.enabled !== false && streamingRequested;
  const hasStreamFormat =
    node.withClause?.streamFormat !== undefined ||
    node.meta?.withClause?.streamFormat !== undefined;
  const rawStreamFormat = node.withClause?.streamFormat || node.meta?.withClause?.streamFormat;
  const streamFormatValue = hasStreamFormat
    ? await resolveStreamFormatValue(rawStreamFormat, env)
    : undefined;
  const pipelineId = `exec-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;
  let lastEmittedChunk: string | undefined;
  if (hasStreamFormat) {
    env.setStreamingOptions({
      ...streamingOptions,
      streamFormat: streamFormatValue as any,
      skipDefaultSinks: true,
      suppressTerminal: true
    });
    streamingOptions = env.getStreamingOptions();
  }
  const activeStreamingOptions = streamingOptions;
  const streamingManager = env.getStreamingManager();
  if (streamingEnabled) {
    let adapter;
    if (hasStreamFormat && streamFormatValue) {
      adapter = await loadStreamAdapter(streamFormatValue);
    }
    if (!adapter) {
      adapter = await getAdapter('ndjson');
    }
    streamingManager.configure({
      env,
      streamingEnabled: true,
      streamingOptions: activeStreamingOptions,
      adapter: adapter as any
    });
  }
  const chunkEffect = (chunk: string, source: 'stdout' | 'stderr') => {
    if (!streamingEnabled) return;

    const trimmed = chunk.trim();
    if (trimmed && trimmed === lastEmittedChunk) {
      return;
    }
    lastEmittedChunk = trimmed || chunk;
    const withSpacing = chunk.endsWith('\n') ? `${chunk}\n` : `${chunk}\n\n`;
    // Only emit via effects when default sinks are suppressed (avoids double-writing with TerminalSink)
    if (!streamingOptions.skipDefaultSinks) {
      return;
    }
    // Route stdout chunks to doc to display progressively; stderr stays stderr.
    if (source === 'stdout') {
      env.emitEffect('doc', withSpacing);
    } else {
      env.emitEffect('stderr', chunk);
    }
  };


  try {
  let resultSecurityDescriptor: SecurityDescriptor | undefined;
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

  const createEvalResult = (
    value: unknown,
    targetEnv: Environment,
    options?: { type?: string; text?: string }
  ): EvalResult => {
    const wrapped = wrapExecResult(value, options);
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
      stdout: asText(wrapped),
      stderr: '',
      exitCode: 0
    };
  };

  const toPipelineInput = (value: unknown, options?: { type?: string; text?: string }): unknown => {
    const structured = wrapExecResult(value, options);
    if (resultSecurityDescriptor) {
      setStructuredSecurityDescriptor(structured, resultSecurityDescriptor);
    }
    return structured;
  };
  if (process.env.MLLD_DEBUG === 'true') {
    console.error('[evaluateExecInvocation] Entry:', {
      hasCommandRef: !!node.commandRef,
      hasWithClause: !!node.withClause,
      hasPipeline: !!(node.withClause?.pipeline),
      pipelineLength: node.withClause?.pipeline?.length
    });
  }

  if (process.env.DEBUG_WHEN || process.env.DEBUG_EXEC) {
    logger.debug('evaluateExecInvocation called with:', { commandRef: node.commandRef });
  }
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

  // Check for circular reference before resolving (skip builtin methods and reserved names)
  const isBuiltinMethod = builtinMethods.includes(commandName);
  const isReservedName = env.hasVariable(commandName) &&
    (env.getVariable(commandName) as any)?.internal?.isReserved;
  const shouldTrackResolution = !isBuiltinMethod && !isReservedName;

  if (shouldTrackResolution && env.isResolving(commandName)) {
    throw new CircularReferenceError(
      `Circular reference detected: executable '@${commandName}' calls itself recursively without a terminating condition`,
      {
        identifier: commandName,
        location: nodeSourceLocation
      }
    );
  }

  // Mark this executable as being resolved (skip builtin methods and reserved names)
  if (shouldTrackResolution) {
    env.beginResolving(commandName);
  }

  // Check if this is a field access exec invocation (e.g., @obj.method())
  // or a method call on an exec result (e.g., @func(args).method())
  let variable;
  const commandRefWithObject = node.commandRef as any & { objectReference?: any; objectSource?: ExecInvocation };
  if (node.commandRef && (commandRefWithObject.objectReference || commandRefWithObject.objectSource)) {
    // Check if this is a builtin method call (e.g., @list.includes())
    const typeCheckingMethods: TypeCheckingMethod[] = [
      'isArray',
      'isObject',
      'isString',
      'isNumber',
      'isBoolean',
      'isNull',
      'isDefined'
    ];
    const isTypeCheckingBuiltin = typeCheckingMethods.includes(commandName as TypeCheckingMethod);
    if (builtinMethods.includes(commandName)) {
      // Handle builtin methods on objects/arrays/strings
      let objectValue: any;
      let objectVar: Variable | undefined;
      let sourceDescriptor: SecurityDescriptor | undefined;

      if (commandRefWithObject.objectReference) {
        const objectRef = commandRefWithObject.objectReference;
        objectVar = env.getVariable(objectRef.identifier);

        if (!objectVar) {
          if (isTypeCheckingBuiltin) {
            const typeCheckResult = handleTypeCheckingBuiltin(commandName as TypeCheckingMethod, undefined);
            return createEvalResult(typeCheckResult, env);
          }
          throw new MlldInterpreterError(`Object not found: ${objectRef.identifier}`);
        }
        // Extract the value from the variable reference
        const { extractVariableValue } = await import('../utils/variable-resolution');
        objectValue = await extractVariableValue(objectVar, env);

        // Navigate through fields if present
        if (objectRef.fields && objectRef.fields.length > 0) {
          const normalizedFields = normalizeFields(objectRef.fields);
          for (const field of normalizedFields) {
            let targetValue: any = objectValue;
            let key = field.value;

            if (field.type === 'variableIndex') {
              if (isStructuredValue(targetValue)) {
                targetValue = asData(targetValue);
              }
              key = await resolveVariableIndexValue(field.value, env);
            }

            if (isStructuredValue(targetValue) && typeof key === 'string' && key in (targetValue as any)) {
              objectValue = (targetValue as any)[key];
            } else if (typeof targetValue === 'object' && targetValue !== null) {
              objectValue = (targetValue as any)[key];
            } else {
              if (isTypeCheckingBuiltin) {
                const typeCheckResult = handleTypeCheckingBuiltin(commandName as TypeCheckingMethod, undefined);
                return createEvalResult(typeCheckResult, env);
              }
              throw new MlldInterpreterError(`Cannot access field ${String(key)} on non-object`);
            }
          }
        }
      } else if (commandRefWithObject.objectSource) {
        // Evaluate the source ExecInvocation to obtain a value, then apply builtin method
        const srcResult = await evaluateExecInvocation(commandRefWithObject.objectSource, env);
        if (srcResult && typeof srcResult === 'object') {
          sourceDescriptor = extractSecurityDescriptor(srcResult.value);
          if (srcResult.value !== undefined) {
            const { resolveValue, ResolutionContext } = await import('../utils/variable-resolution');
            objectValue = await resolveValue(srcResult.value, env, ResolutionContext.Display);
          } else if (typeof srcResult.stdout === 'string') {
            objectValue = srcResult.stdout;
          }
        }
      }

      // Fallback if we still don't have an object value
      if (typeof objectValue === 'undefined') {
        if (isTypeCheckingBuiltin) {
          const typeCheckResult = handleTypeCheckingBuiltin(commandName as TypeCheckingMethod, objectValue);
          return createEvalResult(typeCheckResult, env);
        }
        if (process.env.DEBUG_EXEC) {
          logger.debug('Builtin invocation unresolved object value', {
            commandName,
            objectIdentifier: commandRefWithObject.objectReference?.identifier,
            fields: commandRefWithObject.objectReference?.fields
          });
        }
        throw new MlldInterpreterError('Unable to resolve object value for builtin method invocation');
      }

      if (process.env.DEBUG_EXEC) {
        logger.debug('Builtin invocation object value', {
          commandName,
          objectType: Array.isArray(objectValue) ? 'array' : typeof objectValue,
          objectPreview:
            typeof objectValue === 'string'
              ? objectValue.slice(0, 80)
              : Array.isArray(objectValue)
              ? `[array length=${objectValue.length}]`
              : objectValue && typeof objectValue === 'object'
              ? Object.keys(objectValue)
              : objectValue
        });
      }

      chainDebug('builtin invocation start', {
        commandName,
        hasObjectSource: Boolean(commandRefWithObject.objectSource),
        hasObjectReference: Boolean(commandRefWithObject.objectReference)
      });

      const targetDescriptor =
        sourceDescriptor ||
        (objectVar && ctxToSecurityDescriptor(objectVar.ctx)) ||
        extractSecurityDescriptor(objectValue);
      mergeResultDescriptor(targetDescriptor);

      // Structured exec returns wrappers – convert them to plain data before method lookup
      if (isStructuredValue(objectValue)) {
        objectValue = objectValue.type === 'array' ? objectValue.data : asText(objectValue);
      } else if (LegacyStructuredValue.isStructuredValue?.(objectValue)) {
        objectValue = objectValue.text;
      }

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
      
      // Evaluate arguments
      const evaluatedArgs: any[] = [];
      for (const arg of args) {
        const { evaluateDataValue } = await import('./data-value-evaluator');
        const evaluatedArg = await evaluateDataValue(arg, env);
        evaluatedArgs.push(evaluatedArg);
      }

      const quantifierEvaluator = (objectValue as any)?.__mlldQuantifierEvaluator;
      if (quantifierEvaluator && typeof quantifierEvaluator === 'function') {
        const quantifierResult = quantifierEvaluator(commandName, evaluatedArgs);
        return createEvalResult(quantifierResult, env);
      }
    
    // Apply the builtin method
    let result: any;
    const propagateResult = (output: unknown): void => {
      inheritExpressionProvenance(output, objectVar ?? objectValue);
      const sourceDescriptor =
        (objectVar && ctxToSecurityDescriptor(objectVar.ctx)) || extractSecurityDescriptor(objectValue);
      if (sourceDescriptor) {
        resultSecurityDescriptor = resultSecurityDescriptor
          ? env.mergeSecurityDescriptors(resultSecurityDescriptor, sourceDescriptor)
          : sourceDescriptor;
      }
    };
    switch (commandName) {
      case 'toLowerCase':
      case 'toUpperCase':
      case 'trim':
      case 'substring':
      case 'substr':
      case 'replace':
      case 'replaceAll':
      case 'padStart':
      case 'padEnd':
      case 'repeat':
        result = handleStringBuiltin(commandName as StringBuiltinMethod, objectValue, evaluatedArgs);
        propagateResult(result);
        break;
      case 'slice':
        if (Array.isArray(objectValue)) {
          result = handleArrayBuiltin('slice', objectValue, evaluatedArgs);
        } else {
          result = handleStringBuiltin('slice', objectValue, evaluatedArgs);
        }
        propagateResult(result);
        break;
      case 'concat':
      case 'reverse':
      case 'sort':
        result = handleArrayBuiltin(commandName as ArrayBuiltinMethod, objectValue, evaluatedArgs);
        propagateResult(result);
        break;
      case 'length':
        result = handleLengthBuiltin(objectValue);
        break;
      case 'join':
        result = handleJoinBuiltin(objectValue, evaluatedArgs[0]);
        propagateResult(result);
        break;
      case 'split':
        result = handleSplitBuiltin(objectValue, evaluatedArgs[0]);
        propagateResult(result);
        break;
      case 'includes':
      case 'indexOf':
      case 'startsWith':
      case 'endsWith':
          result = handleSearchBuiltin(commandName as SearchBuiltinMethod, objectValue, evaluatedArgs[0]);
          break;
      case 'match':
        result = handleMatchBuiltin(objectValue, evaluatedArgs[0]);
        propagateResult(result);
        break;
      case 'isArray':
      case 'isObject':
      case 'isString':
      case 'isNumber':
      case 'isBoolean':
      case 'isNull':
      case 'isDefined':
        result = handleTypeCheckingBuiltin(commandName as TypeCheckingMethod, objectValue);
        break;
        default:
          throw new MlldInterpreterError(`Unknown builtin method: ${commandName}`);
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

      // If a withClause (e.g., pipeline) is attached to this builtin invocation, apply it
      if (node.withClause) {
        if (node.withClause.pipeline) {
          const { processPipeline } = await import('./pipeline/unified-processor');
          const pipelineInputValue = toPipelineInput(resolvedValue, wrapOptions);
          chainDebug('applying builtin pipeline', {
            commandName,
            pipelineLength: node.withClause.pipeline.length
          });
          const pipelineResult = await processPipeline({
            value: pipelineInputValue,
            env,
            node,
            identifier: node.identifier,
            descriptorHint: resultSecurityDescriptor
          });
          // Still need to handle other withClause features (trust, needs)
          return applyWithClause(pipelineResult, { ...node.withClause, pipeline: undefined }, env);
        } else {
          return applyWithClause(resolvedValue, node.withClause, env);
        }
      }

      // Return the result wrapped appropriately when no withClause is present
      return createEvalResult(resolvedValue, env, wrapOptions);
    }
    // If this is a non-builtin method with objectSource, we do not (yet) support it
    if (commandRefWithObject.objectSource && !commandRefWithObject.objectReference) {
      throw new MlldInterpreterError(`Only builtin methods are supported on exec results (got: ${commandName})`);
    }
    
    // Get the object first
    const objectRef = commandRefWithObject.objectReference;
    const objectVar = env.getVariable(objectRef.identifier);
    if (!objectVar) {
      throw new MlldInterpreterError(`Object not found: ${objectRef.identifier}`);
    }
    
    // Extract Variable value for object field access - WHY: Need raw object to access fields
    const { extractVariableValue } = await import('../utils/variable-resolution');
    const objectValue = await extractVariableValue(objectVar, env);
    
    
    // Access the field
    if (objectRef.fields && objectRef.fields.length > 0) {
      const { accessFields } = await import('../utils/field-access');
      const accessedObject = await accessFields(objectValue, normalizeFields(objectRef.fields), {
        env,
        preserveContext: false,
        returnUndefinedForMissing: true,
        sourceLocation: objectRef.location
      });

      if (typeof accessedObject === 'object' && accessedObject !== null) {
        const fieldValue = (accessedObject as any)[commandName];
        variable = fieldValue;
      }
    } else {
      // Direct field access on the object
      if (typeof objectValue === 'object' && objectValue !== null) {
        // Handle AST object structure with type and properties
        let fieldValue;
        if (objectValue.type === 'object' && objectValue.properties) {
          fieldValue = objectValue.properties[commandName];
        } else {
          fieldValue = (objectValue as any)[commandName];
        }
        
        variable = fieldValue;
      }
    }
    
    if (!variable) {
      throw new MlldInterpreterError(`Method not found: ${commandName} on ${objectRef.identifier}`);
    }
    
    // Handle __executable objects from resolved imports
    if (typeof variable === 'object' && variable !== null && '__executable' in variable && variable.__executable) {
      // Deserialize shadow environments if needed
      let serializedInternal =
        (variable.internal as Record<string, unknown> | undefined) ??
        {};
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
      if (serializedInternal.capturedModuleEnv && !(serializedInternal.capturedModuleEnv instanceof Map)) {
        // Import the VariableImporter to reuse the proper deserialization logic
        const { VariableImporter } = await import('./import/VariableImporter');
        const importer = new VariableImporter(null); // ObjectResolver not needed for this
        const moduleEnvMap = importer.deserializeModuleEnv(serializedInternal.capturedModuleEnv);

        // Each executable in the module env needs access to the full env
        for (const [_, variable] of moduleEnvMap) {
          if (variable.type === 'executable') {
            variable.internal = {
              ...(variable.internal ?? {}),
              capturedModuleEnv: moduleEnvMap
            };
          }
        }

        serializedInternal = {
          ...serializedInternal,
          capturedModuleEnv: moduleEnvMap
        };
      }
      
      // Convert the __executable object to a proper ExecutableVariable
      const { createExecutableVariable } = await import('@core/types/variable/VariableFactories');
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
            executableDef: variable.executableDef,
            ...serializedInternal
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

    // Check if this is a transformer variant access (e.g., @json.fromlist)
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

  // Ensure it's an executable variable
  if (!isExecutableVariable(variable)) {
    throw new MlldInterpreterError(`Variable ${commandName} is not executable (type: ${variable.type})`);
  }
  
  // Special handling for built-in transformers
  if (variable.internal?.isBuiltinTransformer && variable.internal?.transformerImplementation) {
    // Args were already extracted above
    
    // Special handling for @typeof - we need the Variable object, not just the value
    if (commandName === 'typeof' || commandName === 'TYPEOF') {
      if (args.length > 0) {
        const arg = args[0];
        
        // Check if it's a variable reference
        if (arg && typeof arg === 'object' && 'type' in arg && arg.type === 'VariableReference') {
          const varRef = arg as any;
          const varName = varRef.identifier;
          const varObj = env.getVariable(varName);
          
          if (varObj) {
            // Generate type information from the Variable object
            let typeInfo = varObj.type;
            
            // Handle subtypes for text variables
            if (varObj.type === 'simple-text' && 'subtype' in varObj) {
              // For simple-text, show the main type unless it has a special subtype
              const subtype = (varObj as any).subtype;
              if (subtype && subtype !== 'simple' && subtype !== 'interpolated-text') {
                typeInfo = subtype;
              }
            } else if (varObj.type === 'primitive' && 'primitiveType' in varObj) {
              typeInfo = `primitive (${(varObj as any).primitiveType})`;
            } else if (varObj.type === 'object') {
              const objValue = varObj.value;
              if (objValue && typeof objValue === 'object') {
                const keys = Object.keys(objValue);
                typeInfo = `object (${keys.length} properties)`;
              }
            } else if (varObj.type === 'array') {
              const arrValue = varObj.value;
              if (Array.isArray(arrValue)) {
                typeInfo = `array (${arrValue.length} items)`;
              }
            } else if (varObj.type === 'executable') {
              // Get executable type from metadata
      const execDef = varObj.internal?.executableDef;
              if (execDef && 'type' in execDef) {
                typeInfo = `executable (${execDef.type})`;
              }
            }
            
            // Add source information if available
            if (varObj.source?.directive) {
              typeInfo += ` [from /${varObj.source.directive}]`;
            }
            
            // Pass the type info with a special marker
            const result = await variable.internal.transformerImplementation(`__MLLD_VARIABLE_OBJECT__:${typeInfo}`);
            const normalized = normalizeTransformerResult(commandName, result);
            const resolvedValue = normalized.value;
            const wrapOptions = normalized.options;
            
            // Clean up resolution tracking before returning
            if (commandName && shouldTrackResolution) {
              env.endResolving(commandName);
            }

            // Apply withClause transformations if present
            if (node.withClause) {
              if (node.withClause.pipeline) {
                // Use unified pipeline processor for pipeline part
                const { processPipeline } = await import('./pipeline/unified-processor');
                const pipelineInputValue = toPipelineInput(resolvedValue, wrapOptions);
                const pipelineResult = await processPipeline({
                  value: pipelineInputValue,
                  env,
                  node,
                  identifier: node.identifier,
                  descriptorHint: resultSecurityDescriptor
                });
                // Still need to handle other withClause features (trust, needs)
                return applyWithClause(pipelineResult, { ...node.withClause, pipeline: undefined }, env);
              } else {
                return applyWithClause(resolvedValue, node.withClause, env);
              }
            }

            return createEvalResult(resolvedValue, env, wrapOptions);
          }
        }
      }
    }
    
    // Regular transformer handling
    let inputValue = '';
    if (args.length > 0) {
      let arg: any = args[0];
      if (arg && typeof arg === 'object' && 'type' in arg) {
        const { evaluateDataValue } = await import('./data-value-evaluator');
        arg = await evaluateDataValue(arg as any, env);
      }
      const transformerName = (variable.name ?? commandName ?? '').toLowerCase();
      if (transformerName === 'keep' || transformerName === 'keepstructured') {
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
    if (commandName && shouldTrackResolution) {
      env.endResolving(commandName);
    }

    // Apply withClause transformations if present
    if (node.withClause) {
      if (node.withClause.pipeline) {
        // Use unified pipeline processor for pipeline part
        const { processPipeline } = await import('./pipeline/unified-processor');
        const pipelineInputValue = toPipelineInput(resolvedValue, wrapOptions);
        const pipelineResult = await processPipeline({
          value: pipelineInputValue,
          env,
          node,
          identifier: node.identifier,
          descriptorHint: resultSecurityDescriptor
        });
        // Still need to handle other withClause features (trust, needs)
        return applyWithClause(pipelineResult, { ...node.withClause, pipeline: undefined }, env);
      } else {
        return applyWithClause(resolvedValue, node.withClause, env);
      }
    }

    return createEvalResult(resolvedValue, env, wrapOptions);
  }
  
  // Get the full executable definition from metadata
  const definition = variable.internal?.executableDef as ExecutableDefinition;
  if (!definition) {
    throw new MlldInterpreterError(`Executable ${commandName} has no definition in metadata`);
  }
  if (process.env.DEBUG_EXEC === 'true' && commandName === 'pipe') {
    // Debug aid for pipeline identity scenarios
    console.error('[debug-exec] definition for @pipe:', JSON.stringify(definition, null, 2));
  }
  const definitionHasStreamFormat =
    definition.withClause?.streamFormat !== undefined ||
    (definition.meta as any)?.withClause?.streamFormat !== undefined;
  streamingRequested =
    streamingRequested ||
    definition.withClause?.stream === true ||
    (definition.meta as any)?.withClause?.stream === true ||
    (definition.meta as any)?.isStream === true;
  streamingEnabled = streamingOptions.enabled !== false && streamingRequested;

  let whenExprNode: WhenExpressionNode | null = null;
  if (definition.language === 'mlld-when') {
    const candidate =
      Array.isArray(definition.codeTemplate) && definition.codeTemplate.length > 0
        ? (definition.codeTemplate[0] as WhenExpressionNode | undefined)
        : undefined;
    if (!candidate || candidate.type !== 'WhenExpression') {
      throw new MlldInterpreterError('mlld-when executable missing WhenExpression node');
    }
    whenExprNode = candidate;
  }
  
  // Create a child environment for parameter substitution
  let execEnv = env.createChild();

  // Set captured module environment for variable lookup fallback
  if (variable?.internal?.capturedModuleEnv instanceof Map) {
    execEnv.setCapturedModuleEnv(variable.internal.capturedModuleEnv);
  }

  // Handle command arguments - args were already extracted above
  const params = definition.paramNames || [];
  
  // Evaluate arguments using consistent interpolate() pattern
  const evaluatedArgStrings: string[] = [];
  const evaluatedArgs: any[] = []; // Preserve original data types
  
  for (const arg of args) {
    let argValue: string;
    let argValueAny: any;

    if (process.env.MLLD_DEBUG === 'true') {
      console.error('[DEBUG ARG] Processing arg:', { isStructured: isStructuredValue(arg), argType: typeof arg, argKeys: arg && typeof arg === 'object' ? Object.keys(arg).slice(0, 5) : null });
    }

    if (isStructuredValue(arg)) {
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[DEBUG ARG] StructuredValue detected:', { type: arg.type, dataType: typeof arg.data, isArray: Array.isArray(arg.data) });
      }
      argValueAny = arg;
      argValue = asText(arg);
    } else if (arg && typeof arg === 'object' && (arg as any).type === 'RegexLiteral') {
      const pattern = (arg as any).pattern || '';
      const flags = (arg as any).flags || '';
      const regex = new RegExp(pattern, flags);
      argValueAny = regex;
      argValue = regex.toString();
    } else if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean') {
      // Primitives: pass through directly
      argValue = String(arg);
      argValueAny = arg;
      
    } else if (arg && typeof arg === 'object' && 'type' in arg) {
      // AST nodes: evaluate based on type
      switch (arg.type) {
        case 'WhenExpression': {
          // Evaluate when-expression argument
          const { evaluateWhenExpression } = await import('./when-expression');
          const whenRes = await evaluateWhenExpression(arg as any, env);
          argValueAny = whenRes.value;
          // Stringify for argValue if object/array
          if (argValueAny === undefined) {
            argValue = 'undefined';
          } else if (typeof argValueAny === 'object') {
            try { argValue = JSON.stringify(argValueAny); } catch { argValue = String(argValueAny); }
          } else {
            argValue = String(argValueAny);
          }
          break;
        }
        case 'foreach':
        case 'foreach-command': {
          const { evaluateForeachCommand } = await import('./foreach');
          const arr = await evaluateForeachCommand(arg as any, env);
          argValueAny = arr;
          argValue = JSON.stringify(arr);
          break;
        }
        case 'object':
          // Object literals: recursively evaluate properties (may contain exec invocations, etc.)
          const { evaluateDataValue } = await import('./data-value-evaluator');
          argValueAny = await evaluateDataValue(arg, env);
          argValue = JSON.stringify(argValueAny);
          break;
          
        case 'array':
          // Array literals: recursively evaluate items (may contain variables, exec calls, etc.)
          const { evaluateDataValue: evalArray } = await import('./data-value-evaluator');
          argValueAny = await evalArray(arg, env);
          argValue = JSON.stringify(argValueAny);
          break;
          
        case 'VariableReference':
          // Special handling for variable references to preserve objects
          const varRef = arg as any;
          const varName = varRef.identifier;
          const variable = env.getVariable(varName);
          
          if (variable) {
            // Get the actual value from the variable
            let value = variable.value;
            
            // WHY: Template variables store AST arrays for lazy evaluation,
            //      must interpolate before passing to executables
            const { isTemplate } = await import('@core/types/variable');
            if (isTemplate(variable)) {
              if (Array.isArray(value)) {
                value = await interpolateWithResultDescriptor(value, env);
              } else if (variable.internal?.templateAst && Array.isArray(variable.internal.templateAst)) {
                value = await interpolateWithResultDescriptor(variable.internal.templateAst, env);
              }
            }
            
            // Handle field access (e.g., @user.name)
            if (varRef.fields && varRef.fields.length > 0) {
              const { accessFields } = await import('../utils/field-access');
              const accessed = await accessFields(value, varRef.fields, {
                env,
                preserveContext: false,
                sourceLocation: (varRef as any).location
              });
              value = accessed;
            }
            
            if (isStructuredValue(value)) {
              argValueAny = value;
              argValue = asText(value);
            } else {
              // Preserve the type of the final value
              argValueAny = value;
              // For objects and arrays, use JSON.stringify to get proper string representation
              if (value === undefined) {
                argValue = 'undefined';
              } else if (typeof value === 'object' && value !== null) {
                try {
                  argValue = JSON.stringify(value);
                } catch (e) {
                  argValue = String(value);
                }
              } else {
                argValue = String(value);
              }
            }
          } else {
            // Variable not found - use interpolation which will throw appropriate error
            argValue = await interpolateWithResultDescriptor([arg], env, InterpolationContext.Default);
            argValueAny = argValue;
          }
          break;

        case 'load-content': {
          const { processContentLoader } = await import('./content-loader');
          const { wrapLoadContentValue } = await import('../utils/load-content-structured');
          const loadResult = await processContentLoader(arg as any, env);
          const structured = wrapLoadContentValue(loadResult);
          argValueAny = structured;
          argValue = asText(structured);
          break;
        }
        
        case 'ExecInvocation': {
          const nestedResult = await evaluateExecInvocation(arg as ExecInvocation, env);
          if (nestedResult && nestedResult.value !== undefined) {
            argValueAny = nestedResult.value;
          } else if (nestedResult && nestedResult.stdout !== undefined) {
            argValueAny = nestedResult.stdout;
          } else {
            argValueAny = undefined;
          }

          if (argValueAny === undefined) {
            argValue = 'undefined';
          } else if (isStructuredValue(argValueAny)) {
            argValue = asText(argValueAny);
          } else if (typeof argValueAny === 'object') {
            try {
              argValue = JSON.stringify(argValueAny);
            } catch {
              argValue = String(argValueAny);
            }
          } else {
            argValue = String(argValueAny);
          }
          break;
        }
        case 'Text':
          // Plain text nodes should remain strings; avoid JSON coercion that can
          // truncate large numeric identifiers (e.g., Discord snowflakes)
          argValue = await interpolateWithResultDescriptor([arg], env, InterpolationContext.Default);
          argValueAny = argValue;
          break;
        default:
          // Other nodes: interpolate normally
          argValue = await interpolateWithResultDescriptor([arg], env, InterpolationContext.Default);
          // Try to preserve structured data if it's JSON
          try {
            argValueAny = JSON.parse(argValue);
          } catch {
            argValueAny = argValue;
          }
          break;
      }
    } else {
      // Fallback for unexpected types
      argValue = String(arg);
      argValueAny = arg;
    }
    
    evaluatedArgStrings.push(argValue);
    evaluatedArgs.push(argValueAny);
  }

  if (process.env.MLLD_DEBUG_FIX === 'true') {
    console.error('[evaluateExecInvocation] evaluated args', {
      commandName,
      argCount: evaluatedArgs.length,
      argTypes: evaluatedArgs.map(a => (a === null ? 'null' : Array.isArray(a) ? 'array' : typeof a)),
      argPreview: evaluatedArgs.map(a => {
        if (isStructuredValue(a)) return { structured: true, type: a.type, dataType: typeof a.data };
        if (a && typeof a === 'object') return { keys: Object.keys(a).slice(0, 5) };
        return a;
      })
    });
  }
  
  // Track original Variables for arguments
  const originalVariables: (Variable | undefined)[] = new Array(args.length);
  const guardVariableCandidates: (Variable | undefined)[] = new Array(args.length);
  const expressionSourceVariables: (Variable | undefined)[] = new Array(args.length);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg && typeof arg === 'object' && 'type' in arg && arg.type === 'VariableReference') {
      const varRef = arg as any;
      const varName = varRef.identifier;
      const variable = env.getVariable(varName);
      if (variable && !varRef.fields) {
        // GOTCHA: Don't preserve template variables after interpolation,
        //         use the interpolated string value instead
        const { isTemplate } = await import('@core/types/variable');
        if (isTemplate(variable) && typeof evaluatedArgs[i] === 'string') {
          originalVariables[i] = undefined;
        } else {
          originalVariables[i] = variable;
          guardVariableCandidates[i] = variable;
        }
        
        if (process.env.MLLD_DEBUG === 'true') {
          const subtype = variable.type === 'primitive' && 'primitiveType' in variable 
            ? (variable as any).primitiveType 
            : variable.subtype;
            
          logger.debug(`Preserving original Variable for arg ${i}:`, {
            varName,
            variableType: variable.type,
            variableSubtype: subtype,
            isPrimitive: typeof variable.value !== 'object' || variable.value === null
          });
        }
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
    }
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

  for (let i = 0; i < args.length; i++) {
    if (!guardVariableCandidates[i] && expressionSourceVariables[i]) {
      const source = expressionSourceVariables[i]!;
      const cloned = cloneVariableWithNewValue(
        source,
        evaluatedArgs[i],
        evaluatedArgStrings[i]
      );
      guardVariableCandidates[i] = cloned;
    }
  }

  const guardInputsWithMapping = materializeGuardInputsWithMapping(
    Array.from({ length: guardVariableCandidates.length }, (_unused, index) =>
      guardVariableCandidates[index] ?? evaluatedArgs[index]
    ),
    {
      nameHint: '__guard_input__'
    }
  );
  const guardInputs = guardInputsWithMapping.map(entry => entry.variable);
  let postHookInputs: readonly Variable[] = guardInputs;
  const hookManager = env.getHookManager();
  const execDescriptor = getVariableSecurityDescriptor(variable);
  const operationContext: OperationContext = {
    type: 'exe',
    name: variable.name ?? commandName,
    labels: execDescriptor?.labels,
    location: node.location ?? null,
    metadata: {
      executableType: definition.type,
      command: commandName,
      sourceRetryable: true
    }
  };
  const finalizeResult = async (result: EvalResult): Promise<EvalResult> => {
    try {
      return await hookManager.runPost(node, result, postHookInputs, env, operationContext);
    } catch (error) {
      if (whenExprNode) {
        const handled = await handleExecGuardDenial(error, {
          execEnv,
          env,
          whenExprNode
        });
        if (handled) {
          return handled;
        }
      }
      throw error;
    }
  };

  return await env.withOpContext(operationContext, async () => {
    return AutoUnwrapManager.executeWithPreservation(async () => {
      const preDecision = await hookManager.runPre(node, guardInputs, env, operationContext);
      const transformedGuardInputs = getGuardTransformedInputs(preDecision, guardInputs);
      const transformedGuardSet =
        transformedGuardInputs && transformedGuardInputs.length > 0
          ? new Set(transformedGuardInputs as readonly Variable[])
          : null;
      if (transformedGuardInputs && transformedGuardInputs.length > 0) {
        postHookInputs = transformedGuardInputs;
        applyGuardTransformsToExecArgs({
          guardInputEntries: guardInputsWithMapping,
          transformedInputs: transformedGuardInputs,
          guardVariableCandidates,
          evaluatedArgs,
          evaluatedArgStrings
        });
      }
      // Bind evaluated arguments to parameters
      for (let i = 0; i < params.length; i++) {
        const paramName = params[i];
        const argValue = evaluatedArgs[i];
        const argStringValue = evaluatedArgStrings[i];
        const originalVar = originalVariables[i];
        const guardCandidate = guardVariableCandidates[i];
        const isShellCode =
          definition.type === 'code' &&
          typeof definition.language === 'string' &&
          (definition.language === 'bash' || definition.language === 'sh');
        const preferGuardReplacement =
          transformedGuardSet?.has(guardCandidate as Variable) ?? false;
        const allowOriginalReuse =
          !preferGuardReplacement && Boolean(originalVar) && !isShellCode && definition.type !== 'command';

        if (guardCandidate && (!originalVar || !allowOriginalReuse || preferGuardReplacement)) {
          const candidateClone = cloneGuardCandidateForParameter(
            paramName,
            guardCandidate,
            argValue,
            argStringValue
          );
          execEnv.setParameterVariable(paramName, candidateClone);
          continue;
        }

        if (argValue !== undefined) {
          const paramVar = createParameterVariable({
            name: paramName,
            value: evaluatedArgs[i], // Use evaluatedArgs (preserves StructuredValue), not argValue (string)
            stringValue: argStringValue,
            originalVariable: originalVar,
            allowOriginalReuse,
            metadataFactory: createParameterMetadata,
            origin: 'exec-param'
          });

          if (paramVar) {
            execEnv.setParameterVariable(paramName, paramVar);
          }
        }
      }

      // Capture descriptors from executable definition and parameters
      const descriptorPieces: SecurityDescriptor[] = [];
      const variableDescriptor = getVariableSecurityDescriptor(variable);
      if (variableDescriptor) {
        descriptorPieces.push(variableDescriptor);
      }
      const mergedParamDescriptor = collectAndMergeParameterDescriptors(params, execEnv);
      if (mergedParamDescriptor) {
        descriptorPieces.push(mergedParamDescriptor);
      }
      if (descriptorPieces.length > 0) {
        resultSecurityDescriptor =
          descriptorPieces.length === 1
            ? descriptorPieces[0]
            : env.mergeSecurityDescriptors(...descriptorPieces);
        env.recordSecurityDescriptor(resultSecurityDescriptor);
      }

      const guardInputVariable =
        preDecision && preDecision.metadata && (preDecision.metadata as Record<string, unknown>).guardInput;
      try {
        await handleGuardDecision(preDecision, node, env, operationContext);
      } catch (error) {
        if (guardInputVariable) {
          const existingInput = execEnv.getVariable('input');
          if (!existingInput) {
            const clonedInput: Variable = {
              ...(guardInputVariable as Variable),
              name: 'input',
              ctx: { ...(guardInputVariable as Variable).ctx },
              internal: {
                ...((guardInputVariable as Variable).internal ?? {}),
                isSystem: true,
                isParameter: true
              }
            };
            execEnv.setParameterVariable('input', clonedInput);
          }
        }
        if (whenExprNode) {
          const handled = await handleExecGuardDenial(error, {
            execEnv,
            env,
            whenExprNode
          });
          if (handled) {
            return finalizeResult(handled);
          }
        }
        throw error;
      }
  
  let result: unknown;
  let workingDirectory: string | undefined;
  if ('workingDir' in definition && (definition as any).workingDir) {
    workingDirectory = await resolveWorkingDirectory(
      (definition as any).workingDir as any,
      execEnv,
      {
        sourceLocation: node.location ?? undefined,
        directiveType: 'exec'
      }
    );
  }
  
  // Handle template executables
  if (isTemplateExecutable(definition)) {
    // Interpolate the template with the bound parameters
    const templateResult = await interpolateWithResultDescriptor(definition.template, execEnv);
    if (isStructuredValue(templateResult)) {
      result = templateResult;
    } else if (typeof templateResult === 'string') {
      const parsed = parseAndWrapJson(templateResult, {
        metadata: resultSecurityDescriptor ? { security: resultSecurityDescriptor } : undefined,
        preserveText: true
      });
      result = parsed ?? templateResult;
    } else {
      result = templateResult;
    }

  if (!isStructuredValue(result) && result && typeof result === 'object') {
    const templateType = Array.isArray(result) ? 'array' : 'object';
    const metadata = resultSecurityDescriptor ? { security: resultSecurityDescriptor } : undefined;
    result = wrapStructured(result as Record<string, unknown>, templateType, undefined, metadata);
  }

  const templateWithClause = (definition as any).withClause;
  if (templateWithClause) {
    if (templateWithClause.pipeline && templateWithClause.pipeline.length > 0) {
      const { processPipeline } = await import('./pipeline/unified-processor');
      const pipelineInputValue = toPipelineInput(result);
      const pipelineResult = await processPipeline({
        value: pipelineInputValue,
        env: execEnv,
        pipeline: templateWithClause.pipeline,
        format: templateWithClause.format as string | undefined,
        isRetryable: false,
        identifier: commandName,
        location: node.location,
        descriptorHint: resultSecurityDescriptor
      });
      result = pipelineResult;
    } else {
      const withClauseResult = await applyWithClause(result, templateWithClause, execEnv);
      result = withClauseResult.value ?? withClauseResult;
    }
  }
}
// Handle data executables
  else if (isDataExecutable(definition)) {
    const { evaluateDataValue } = await import('./data-value-evaluator');
    const dataValue = await evaluateDataValue(definition.dataTemplate as any, execEnv);
    const text = typeof dataValue === 'string' ? dataValue : JSON.stringify(dataValue);
    const dataDescriptor = extractSecurityDescriptor(dataValue, {
      recursive: true,
      mergeArrayElements: true
    });
    const mergedDescriptor =
      dataDescriptor && resultSecurityDescriptor
        ? execEnv.mergeSecurityDescriptors(dataDescriptor, resultSecurityDescriptor)
        : dataDescriptor || resultSecurityDescriptor || undefined;
    result = wrapStructured(
      dataValue as any,
      Array.isArray(dataValue) ? 'array' : 'object',
      text,
      mergedDescriptor ? { security: mergedDescriptor } : undefined
    );
  }
  // Handle pipeline executables
  else if (isPipelineExecutable(definition)) {
    const { processPipeline } = await import('./pipeline/unified-processor');
    const pipelineInputValue =
      evaluatedArgs.length > 0
        ? toPipelineInput(evaluatedArgs[0])
        : '';
    const pipelineResult = await processPipeline({
      value: pipelineInputValue,
      env: execEnv,
      pipeline: definition.pipeline,
      format: definition.format,
      identifier: commandName,
      location: node.location,
      isRetryable: false,
      descriptorHint: resultSecurityDescriptor
    });
    result = typeof pipelineResult === 'string' ? pipelineResult : String(pipelineResult ?? '');
  }
  // Handle command executables
  else if (isCommandExecutable(definition)) {
    // First, detect which parameters are referenced in the template BEFORE interpolation
    // This is crucial for deciding when to use bash fallback for large variables
    const referencedInTemplate = new Set<string>();
    try {
      const nodes = definition.commandTemplate as any[];
      if (Array.isArray(nodes)) {
        for (const n of nodes) {
          if (n && typeof n === 'object' && n.type === 'VariableReference' && typeof n.identifier === 'string') {
            referencedInTemplate.add(n.identifier);
          } else if (n && typeof n === 'object' && n.type === 'Text' && typeof (n as any).content === 'string') {
            // Also detect literal @name patterns in text segments
            for (const pname of params) {
              const re = new RegExp(`@${pname}(?![A-Za-z0-9_])`);
              if (re.test((n as any).content)) {
                referencedInTemplate.add(pname);
              }
            }
          }
        }
      }
    } catch {}
    
    // Interpolate the command template with parameters using ShellCommand context
    let command = await interpolateWithResultDescriptor(
      definition.commandTemplate,
      execEnv,
      InterpolationContext.ShellCommand
    );
    // DISABLED (2025-11-25, issue #456): This escape sequence normalization was
    // intended to allow \n in literal string arguments to become actual newlines
    // (e.g., /exe @echo(msg) = run { echo @msg } with @echo("line1\nline2")).
    // However, it runs on the ENTIRE interpolated command, including properly-escaped
    // JSON data. When JSON containing "\n" (literal backslash-n) passes through,
    // shell-quote correctly escapes it to "\\n", but this code then converts it
    // back to actual newlines, corrupting the JSON.
    //
    // Result of disabling: Literal \n in string arguments will no longer become
    // newlines. Users who need multiline output should use actual newlines in
    // their mlld source or use heredocs/printf in their shell commands.
    //
    // command = command
    //   .replace(/\\n/g, '\n')
    //   .replace(/\\t/g, '\t')
    //   .replace(/\\r/g, '\r')
    //   .replace(/\\0/g, '\0');
    
    if (process.env.DEBUG_WHEN || process.env.DEBUG_EXEC) {
      logger.debug('Executing command', {
        command,
        commandTemplate: definition.commandTemplate
      });
    }
    
    // Build environment variables from parameters for shell execution
    // Only include parameters that are referenced in the command string to avoid
    // passing oversized, unused values into the environment (E2BIG risk).
    const envVars: Record<string, string> = {};
    const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Cache compiled regex per parameter for performance on large templates
    const paramRegexCache: Record<string, { simple: RegExp; braced: RegExp }> = {};
    const referencesParam = (cmd: string, name: string) => {
      // Prefer original template reference detection so interpolation doesn't hide usage
      if (referencedInTemplate.has(name)) return true;
      // Also check for $name (not followed by word char) or ${name}, avoiding escaped dollars (\$)
      if (!paramRegexCache[name]) {
        const n = escapeRegex(name);
        paramRegexCache[name] = {
          simple: new RegExp(`(^|[^\\\\])\\$${n}(?![A-Za-z0-9_])`),
          braced: new RegExp(`\\$\\{${n}\\}`)
        };
      }
      const { simple, braced } = paramRegexCache[name];
      return simple.test(cmd) || braced.test(cmd);
    };
    for (let i = 0; i < params.length; i++) {
      const paramName = params[i];
      if (!referencesParam(command, paramName)) continue; // skip unused params
      
      // Properly serialize proxy objects for execution
      const paramVar = execEnv.getVariable(paramName);
      if (paramVar && typeof paramVar.value === 'object' && paramVar.value !== null) {
        try {
          envVars[paramName] = JSON.stringify(paramVar.value);
        } catch {
          envVars[paramName] = evaluatedArgStrings[i];
        }
      } else {
        envVars[paramName] = evaluatedArgStrings[i];
      }
    }
    
    // Check if any referenced env var is oversized; if so, optionally fallback to bash heredoc
    const perVarMax = (() => {
      const v = process.env.MLLD_MAX_SHELL_ENV_VAR_SIZE;
      if (!v) return 128 * 1024; // 128KB default
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 128 * 1024;
    })();
    const needsBashFallback = Object.values(envVars).some(v => Buffer.byteLength(v || '', 'utf8') > perVarMax);
    const fallbackDisabled = (() => {
      const v = (process.env.MLLD_DISABLE_COMMAND_BASH_FALLBACK || '').toLowerCase();
      return v === '1' || v === 'true' || v === 'yes' || v === 'on';
    })();
    
    if (needsBashFallback && !fallbackDisabled) {
      // Build a bash-friendly command string where param refs stay as "$name"
      // so BashExecutor can inject them via heredoc.
      let fallbackCommand = '';
      try {
        const nodes = definition.commandTemplate as any[];
        if (Array.isArray(nodes)) {
          for (const n of nodes) {
            if (n && typeof n === 'object' && n.type === 'VariableReference' && typeof n.identifier === 'string' && params.includes(n.identifier)) {
              fallbackCommand += `"$${n.identifier}"`;
            } else if (n && typeof n === 'object' && 'content' in n) {
              fallbackCommand += String((n as any).content || '');
            } else if (typeof n === 'string') {
              fallbackCommand += n;
            } else {
              // Fallback: interpolate conservatively for unexpected nodes
              fallbackCommand += await interpolateWithResultDescriptor(
                [n as any],
                execEnv,
                InterpolationContext.ShellCommand
              );
            }
          }
        } else {
          fallbackCommand = command;
        }
      } catch {
        fallbackCommand = command;
      }

      // Validate base command semantics (keep same security posture)
      try {
        CommandUtils.validateAndParseCommand(fallbackCommand);
      } catch (error) {
        throw new MlldCommandExecutionError(
          error instanceof Error ? error.message : String(error),
          context?.sourceLocation,
          {
            command: fallbackCommand,
            exitCode: 1,
            duration: 0,
            stderr: error instanceof Error ? error.message : String(error),
            workingDirectory: (execEnv as any).getProjectRoot?.() || '',
            directiveType: context?.directiveType || 'run'
          }
        );
      }

      // Build params for bash execution using evaluated argument values, but only those referenced
      const codeParams: Record<string, any> = {};
      for (let i = 0; i < params.length; i++) {
        const paramName = params[i];
        if (!referencesParam(command, paramName)) continue;
        codeParams[paramName] = evaluatedArgs[i];
      }
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[exec-invocation] Falling back to bash heredoc for oversized command params', {
          fallbackSnippet: fallbackCommand.slice(0, 120),
          paramCount: Object.keys(codeParams).length
        });
      }
      const commandOutput = await execEnv.executeCode(
        fallbackCommand,
        'sh',
        codeParams,
        undefined,
        workingDirectory ? { workingDirectory } : undefined,
        {
          directiveType: 'exec',
          sourceLocation: node.location,
          workingDirectory
        }
      );
      // Normalize structured output when possible
      if (typeof commandOutput === 'string') {
        const parsed = parseAndWrapJson(commandOutput);
        result = parsed ?? commandOutput;
      } else {
        result = commandOutput;
      }
    } else {
      // Check for stdin support in withClause
      let stdinInput: string | undefined;
      if (definition.withClause && 'stdin' in definition.withClause) {
        // Resolve stdin input similar to run.ts
        stdinInput = await resolveStdinInput(definition.withClause.stdin, execEnv);
      }

      // Execute the command with environment variables and optional stdin
      const commandOptions = stdinInput !== undefined
        ? { env: envVars, input: stdinInput }
        : { env: envVars };
      if (workingDirectory) {
        (commandOptions as any).workingDirectory = workingDirectory;
      }
      const commandOutput = await execEnv.executeCommand(
        command,
        commandOptions,
        {
          directiveType: 'exec',
          streamingEnabled,
          pipelineId,
          stageIndex: 0,
          sourceLocation: node.location,
          emitEffect: chunkEffect,
          workingDirectory,
          suppressTerminal: hasStreamFormat || streamingOptions.suppressTerminal === true
        }
      );
      
      // Normalize structured output when possible
      if (typeof commandOutput === 'string') {
        const parsed = parseAndWrapJson(commandOutput);
        result = parsed ?? commandOutput;
      } else {
        result = commandOutput;
      }
    }

    if (definition.withClause) {
      if (definition.withClause.pipeline && definition.withClause.pipeline.length > 0) {
        const { processPipeline } = await import('./pipeline/unified-processor');
        const pipelineInput = typeof result === 'string'
          ? result
          : result === undefined || result === null
            ? ''
            : isStructuredValue(result)
              ? asText(result)
              : JSON.stringify(result);
        const pipelineResult = await processPipeline({
          value: pipelineInput,
          env: execEnv,
          pipeline: definition.withClause.pipeline,
          format: definition.withClause.format as string | undefined,
          isRetryable: false,
          identifier: commandName,
          location: variable.ctx?.definedAt || node.location,
          descriptorHint: resultSecurityDescriptor
        });

        if (typeof pipelineResult === 'string') {
          const parsed = parseAndWrapJson(pipelineResult);
          result = parsed ?? pipelineResult;
        } else {
          result = pipelineResult;
        }
      }
    }
  }
  // Handle code executables
  else if (isCodeExecutable(definition)) {
    // Special handling for mlld-when expressions
    if (definition.language === 'mlld-when') {
      const activeWhenExpr = whenExprNode;
      if (!activeWhenExpr) {
        throw new MlldInterpreterError('mlld-when executable missing WhenExpression node');
      }

      // Evaluate the when expression with the parameter environment
      const { evaluateWhenExpression } = await import('./when-expression');
      let whenResult: EvalResult;
      try {
        whenResult = await evaluateWhenExpression(activeWhenExpr, execEnv);
      } catch (error) {
        const handled = await handleExecGuardDenial(error, {
          execEnv,
          env,
          whenExprNode: activeWhenExpr
        });
        if (handled) {
          const finalHandled = await finalizeResult(handled);
          return finalHandled;
        }
        throw error;
      }
      const normalization = normalizeWhenShowEffect(whenResult.value);
      result = normalization.normalized;
      // Update execEnv to the result which contains merged nodes
      execEnv = whenResult.env;
    } else if (definition.language === 'mlld-foreach') {
      // Special handling for mlld-foreach expressions
      const foreachNode = definition.codeTemplate[0];
      // Evaluate the foreach expression with the parameter environment
      const { evaluateForeachCommand } = await import('./foreach');
      result = await evaluateForeachCommand(foreachNode, execEnv);
    } else if (definition.language === 'mlld-for') {
      // Special handling for mlld-for expressions
      const forExprNode = definition.codeTemplate[0];
      if (!forExprNode || forExprNode.type !== 'ForExpression') {
        throw new MlldInterpreterError('mlld-for executable missing ForExpression node');
      }
      
      // Evaluate the for expression with the parameter environment
      const { evaluateForExpression } = await import('./for');
      result = await evaluateForExpression(forExprNode, execEnv);
    } else if (definition.language === 'mlld-exe-block') {
      const blockNode = Array.isArray(definition.codeTemplate)
        ? (definition.codeTemplate[0] as ExeBlockNode | undefined)
        : undefined;
      if (!blockNode || !blockNode.values) {
        throw new MlldInterpreterError('mlld-exe-block executable missing block content');
      }

      const blockResult = await evaluateExeBlock(blockNode, execEnv);
      result = blockResult.value;
      execEnv = blockResult.env;
    } else {
      // For bash/sh, don't interpolate the code template - bash handles its own variable substitution
      let code: string;
      if (definition.language === 'bash' || definition.language === 'sh') {
        // For bash/sh, just extract the raw code without interpolation
        if (Array.isArray(definition.codeTemplate)) {
          // If it's an array of nodes, concatenate their content
          code = definition.codeTemplate.map(node => {
            if (typeof node === 'string') return node;
            if (node && typeof node === 'object' && 'content' in node) return node.content || '';
            return '';
          }).join('');
        } else if (typeof definition.codeTemplate === 'string') {
          code = definition.codeTemplate;
        } else {
          code = '';
        }
      } else {
        // For other languages (JS, Python), interpolate as before
        code = await interpolateWithResultDescriptor(definition.codeTemplate, execEnv);
      }
      
      // Import ASTEvaluator for normalizing array values
      const { ASTEvaluator } = await import('../core/ast-evaluator');
    
    // Build params object for code execution
    const codeParams: Record<string, any> = {};
    const variableMetadata: Record<string, any> = {};
    
    for (let i = 0; i < params.length; i++) {
      const paramName = params[i];
      
      // Check if this parameter is a pipeline input variable
      const paramVar = execEnv.getVariable(paramName);
      if (process.env.MLLD_DEBUG === 'true') {
        logger.debug('Checking parameter:', {
          paramName,
          hasParamVar: !!paramVar,
          paramVarType: paramVar?.type,
          isPipelineInput: paramVar?.type === 'pipeline-input'
        });
      }
      if (paramVar && paramVar.type === 'pipeline-input') {
        // Pass the pipeline input object directly for code execution
        codeParams[paramName] = paramVar.value;
      } else if (paramVar) {
        // Always use enhanced Variable passing
        if (definition.language === 'bash' || definition.language === 'sh') {
          const rawValue = paramVar.value;
          if (typeof rawValue === 'string') {
            codeParams[paramName] = rawValue;
          } else if (isStructuredValue(rawValue)) {
            codeParams[paramName] = asText(rawValue);
          } else {
            codeParams[paramName] = prepareValueForShadow(paramVar);
          }
        } else {
          if (env.shouldSuppressGuards() && paramVar.internal?.isSystem && paramVar.internal?.isParameter) {
            const rawValue = isStructuredValue(paramVar.value)
              ? paramVar.value.data
              : paramVar.value;
            codeParams[paramName] = rawValue;
          } else {
            // Other languages (JS, Python, Node, etc.) get deferred conversion to proxies
            // so that prepareParamsForShadow can record primitive metadata.
            let variableForShadow: Variable = paramVar;

            // But first, check if it's a complex Variable that needs resolution
            if ((paramVar as any).isComplex && paramVar.value && typeof paramVar.value === 'object' && 'type' in paramVar.value) {
              // Complex Variable with AST - extract value - WHY: Shadow environments need evaluated values
              const { extractVariableValue: extractVal } = await import('../utils/variable-resolution');
              const resolvedValue = await extractVal(paramVar, execEnv);
              const resolvedVar = {
                ...paramVar,
                value: resolvedValue,
                isComplex: false
              };
              variableForShadow = resolvedVar;
            } else {
              // Auto-unwrap LoadContentResult objects for JS/Python
              const unwrappedValue = AutoUnwrapManager.unwrap(paramVar.value);
              if (unwrappedValue !== paramVar.value) {
                // Value was unwrapped, create a new variable with the unwrapped content
                const unwrappedVar = {
                  ...paramVar,
                  value: unwrappedValue,
                  // Update type based on unwrapped value
                  type: Array.isArray(unwrappedValue) ? 'array' : 'text'
                };
                variableForShadow = unwrappedVar;
              } else {
                variableForShadow = paramVar;
              }
            }

            codeParams[paramName] = variableForShadow;
          }
        }
        
        // Store metadata for primitives that can't be proxied (only for non-bash languages)
        if ((definition.language !== 'bash' && definition.language !== 'sh') && 
            (paramVar.value === null || typeof paramVar.value !== 'object')) {
          // Handle PrimitiveVariable which has primitiveType instead of subtype
          const subtype = paramVar.type === 'primitive' && 'primitiveType' in paramVar 
            ? (paramVar as any).primitiveType 
            : paramVar.subtype;
          
          variableMetadata[paramName] = {
            type: paramVar.type,
            subtype: subtype,
            ctx: paramVar.ctx,
            internal: paramVar.internal,
            isVariable: true
          };
        }
        
        if (process.env.DEBUG_EXEC || process.env.MLLD_DEBUG === 'true') {
          const subtype = paramVar.type === 'primitive' && 'primitiveType' in paramVar 
            ? (paramVar as any).primitiveType 
            : paramVar.subtype;
            
          logger.debug(`Variable passing for ${paramName}:`, {
            variableType: paramVar.type,
            variableSubtype: subtype,
            hasInternal: !!paramVar.internal,
            isPrimitive: paramVar.value === null || typeof paramVar.value !== 'object',
            language: definition.language
          });
        }
      } else {
        // Use the evaluated argument value directly - this preserves primitives
        const argValue = evaluatedArgs[i];
        // Normalize arrays to ensure plain JavaScript values
        codeParams[paramName] = await ASTEvaluator.evaluateToRuntime(argValue, execEnv);
        
        // Debug primitive values
        if (process.env.DEBUG_EXEC) {
          logger.debug(`Code parameter ${paramName}:`, {
            argValue,
            type: typeof argValue,
            isNumber: typeof argValue === 'number',
            evaluatedArgs_i: evaluatedArgs[i],
            evaluatedArgStrings_i: evaluatedArgStrings[i]
          });
        }
      }
    }

    // NEW: Pass captured shadow environments for JS/Node execution
    const capturedModuleEnv =
      (variable.internal?.capturedModuleEnv as Map<string, Variable> | undefined);
    if (
      capturedModuleEnv instanceof Map &&
      (definition.language === 'js' || definition.language === 'javascript' ||
        definition.language === 'node' || definition.language === 'nodejs')
    ) {
      for (const [capturedName, capturedVar] of capturedModuleEnv) {
        if (codeParams[capturedName] !== undefined) {
          continue;
        }

        if (params.includes(capturedName)) {
          continue;
        }

        if (capturedVar.type === 'executable') {
          continue;
        }

        codeParams[capturedName] = capturedVar;

        if ((capturedVar.value === null || typeof capturedVar.value !== 'object') && capturedVar.type !== 'executable') {
          const subtype = capturedVar.type === 'primitive' && 'primitiveType' in capturedVar
            ? (capturedVar as any).primitiveType
            : (capturedVar as any).subtype;
          variableMetadata[capturedName] = {
            type: capturedVar.type,
            subtype,
            ctx: capturedVar.ctx,
            isVariable: true
          };
        }
      }
    }

    // NEW: Pass captured shadow environments for JS/Node execution
    const capturedEnvs =
      variable.internal?.capturedShadowEnvs;
    if (capturedEnvs && (definition.language === 'js' || definition.language === 'javascript' || 
                         definition.language === 'node' || definition.language === 'nodejs')) {
      (codeParams as any).__capturedShadowEnvs = capturedEnvs;
      
    }
    
    // Execute the code with parameters and metadata
    const codeResult = await execEnv.executeCode(
      code,
      definition.language || 'javascript',
      codeParams,
      Object.keys(variableMetadata).length > 0 ? variableMetadata : undefined,
      workingDirectory ? { workingDirectory } : undefined,
      workingDirectory
        ? { directiveType: 'exec', sourceLocation: node.location, workingDirectory }
        : { directiveType: 'exec', sourceLocation: node.location }
    );
    
    // Process the result
    let processedResult: any;
    
    // If the result looks like JSON (from return statement), parse it
    if (typeof codeResult === 'string' && 
        (codeResult.startsWith('"') || codeResult.startsWith('{') || codeResult.startsWith('[') || 
         codeResult === 'null' || codeResult === 'true' || codeResult === 'false' ||
         /^-?\d+(\.\d+)?$/.test(codeResult))) {
      try {
        const parsed = JSON.parse(codeResult);
        processedResult = parsed;
      } catch {
        // Not valid JSON, use as-is
        processedResult = codeResult;
      }
    } else {
      processedResult = codeResult;
    }

    // Attempt to restore metadata from the auto-unwrap shelf
    result = AutoUnwrapManager.restore(processedResult);
    if (process.env.MLLD_DEBUG_STRUCTURED === 'true' && result && typeof result === 'object') {
      try {
        const debugData = (result as any).data;
        console.error('[exec-invocation] rehydrate candidate', {
          hasType: 'type' in (result as Record<string, unknown>),
          hasText: 'text' in (result as Record<string, unknown>),
          dataType: typeof debugData,
          dataKeys: debugData && typeof debugData === 'object' ? Object.keys(debugData) : undefined
        });
      } catch {}
    }
    if (
      result &&
      typeof result === 'object' &&
      !isStructuredValue(result) &&
      'type' in result &&
      'text' in result &&
      'data' in result
    ) {
      const payload = (result as any).data;
      result = wrapStructured(payload, (result as any).type, (result as any).text, (result as any).metadata);
    }

    if (definition.withClause) {
      if (definition.withClause.pipeline && definition.withClause.pipeline.length > 0) {
        const { processPipeline } = await import('./pipeline/unified-processor');
        const pipelineInput = toPipelineInput(result);
        const pipelineResult = await processPipeline({
          value: pipelineInput,
          env: execEnv,
          pipeline: definition.withClause.pipeline,
          format: definition.withClause.format as string | undefined,
          isRetryable: false,
          identifier: commandName,
          location: node.location,
          descriptorHint: resultSecurityDescriptor
        });
        result = pipelineResult;
      } else {
        const withClauseResult = await applyWithClause(result, definition.withClause, execEnv);
        result = withClauseResult.value ?? withClauseResult;
      }
    }

    const inputDescriptors = Object.values(variableMetadata)
      .map(meta => getSecurityDescriptorFromCarrier(meta))
      .filter((descriptor): descriptor is SecurityDescriptor => Boolean(descriptor));

    if (inputDescriptors.length > 0) {
      const mergedInputDescriptor =
        inputDescriptors.length === 1
          ? inputDescriptors[0]
          : env.mergeSecurityDescriptors(...inputDescriptors);
      env.recordSecurityDescriptor(mergedInputDescriptor);
      mergeResultDescriptor(mergedInputDescriptor);
    }
    }
  }
  // Handle command reference executables
  else if (isCommandRefExecutable(definition)) {
    const refName = definition.commandRef;
    if (!refName) {
      throw new MlldInterpreterError(`Command reference ${commandName} has no target command`);
    }
    
    // Look up the referenced command
    // First check in the captured module environment (for imported executables)
    let refCommand = null;
    if (variable?.internal?.capturedModuleEnv) {
      const capturedEnv =
        (variable.internal?.capturedModuleEnv as Map<string, Variable> | undefined);
      if (capturedEnv instanceof Map) {
        // If it's a Map, we have proper Variables
        refCommand = capturedEnv.get(refName);
      } else if (capturedEnv && typeof capturedEnv === 'object') {
        // This shouldn't happen with proper deserialization, but handle it for safety
        refCommand = capturedEnv[refName];
      }
    }

    // Fall back to current environment if not found in captured environment
    if (!refCommand) {
      refCommand = env.getVariable(refName);
    }

    if (!refCommand) {
      throw new MlldInterpreterError(`Referenced command not found: ${refName}`);
    }

    // The commandArgs contains the original AST nodes for how to call the referenced command
    // We need to evaluate these nodes with the current invocation's parameters bound
    if (definition.commandArgs && definition.commandArgs.length > 0) {
      if (process.env.MLLD_DEBUG === 'true') {
        try {
          console.error('[EXEC INVOC] commandRef args shape:', (definition.commandArgs as any[]).map((a: any) => Array.isArray(a) ? 'array' : (a && typeof a === 'object' && a.type) || typeof a));
        } catch {}
      }
      // Evaluate each arg; handle interpolated string args that are arrays of parts
      let refArgs: any[] = [];
      const { evaluate } = await import('../core/interpreter');
      
      for (const argNode of definition.commandArgs) {
        let value: any;
        // If this arg is an array of parts (from DataString with interpolation),
        // interpolate the whole array into a single string argument
        if (Array.isArray(argNode)) {
          value = await interpolateWithResultDescriptor(argNode as any[], execEnv, InterpolationContext.Default);
        } else {
          // Evaluate the individual argument node
          const argResult = await evaluate(argNode as any, execEnv, { isExpression: true });
          value = argResult?.value;
        }
        if (typeof value === 'string') {
          const paramVar = execEnv.getVariable(value);
          if (paramVar?.internal?.isParameter) {
            value = isStructuredValue(paramVar.value) ? paramVar.value : paramVar.value;
          }
        }
        if (value !== undefined) {
          refArgs.push(value);
        }
      }
      
      // Create a child environment that can access the referenced command
      const refEnv = env.createChild();
      // Set the captured module env so getVariable can find the command
      if (
        variable?.internal?.capturedModuleEnv instanceof Map
      ) {
        const captured =
          (variable.internal?.capturedModuleEnv as Map<string, Variable> | undefined);
        if (captured instanceof Map) {
          refEnv.setCapturedModuleEnv(captured);
        }
      }

      // Create a new invocation node for the referenced command with the evaluated args
      const refInvocation: ExecInvocation = {
        type: 'ExecInvocation',
        commandRef: {
          identifier: refName,
          args: refArgs  // Pass values directly like foreach does
        },
        // Pass along the pipeline if present
        ...(definition.withClause ? { withClause: definition.withClause } : {})
      };

      // Recursively evaluate the referenced command in the environment that has it
      const refResult = await evaluateExecInvocation(refInvocation, refEnv);
      result = refResult.value as string;
    } else {
      // Create a child environment that can access the referenced command
      const refEnv = env.createChild();
      // Set the captured module env so getVariable can find the command
      if (variable?.internal?.capturedModuleEnv instanceof Map) {
        refEnv.setCapturedModuleEnv(variable.internal.capturedModuleEnv);
      }

      // No commandArgs means just pass through the current invocation's args
      const refInvocation: ExecInvocation = {
        type: 'ExecInvocation',
        commandRef: {
          identifier: refName,
          args: evaluatedArgs  // Pass values directly like foreach does
        },
        // Pass along the pipeline if present
        ...(definition.withClause ? { withClause: definition.withClause } : {})
      };

      // Recursively evaluate the referenced command in the environment that has it
      const refResult = await evaluateExecInvocation(refInvocation, refEnv);
      result = refResult.value as string;
    }
  }
  // Handle section executables
  else if (isSectionExecutable(definition)) {
    // Interpolate the path template to get the file path
    const filePath = await interpolateWithResultDescriptor(definition.pathTemplate, execEnv);
    
    // Interpolate the section template to get the section name
    const sectionName = await interpolateWithResultDescriptor(definition.sectionTemplate, execEnv);
    
    // Read the file content
    const fileContent = await execEnv.readFile(filePath);
    
    // Extract the section using llmxml or fallback to basic extraction
    const llmxmlInstance = env.getLlmxml();
    let sectionContent: string;
    
    try {
      // getSection expects just the title without the # prefix
      const titleWithoutHash = sectionName.replace(/^#+\s*/, '');
      sectionContent = await llmxmlInstance.getSection(fileContent, titleWithoutHash, {
        includeNested: true
      });
    } catch (error) {
      // Fallback to basic extraction if llmxml fails
      sectionContent = extractSection(fileContent, sectionName);
    }
    
    // Handle rename if present
    if (definition.renameTemplate) {
      const newTitle = await interpolateWithResultDescriptor(definition.renameTemplate, execEnv);
      const lines = sectionContent.split('\n');
      if (lines.length > 0 && lines[0].match(/^#+\s/)) {
        const newTitleTrimmed = newTitle.trim();
        const newHeadingMatch = newTitleTrimmed.match(/^(#+)(\s+(.*))?$/);
        
        if (newHeadingMatch) {
          if (!newHeadingMatch[3]) {
            // Just header level
            const originalText = lines[0].replace(/^#+\s*/, '');
            lines[0] = `${newHeadingMatch[1]} ${originalText}`;
          } else {
            // Full replacement
            lines[0] = newTitleTrimmed;
          }
        } else {
          // Just text - keep original level
          const originalLevel = lines[0].match(/^#+/)?.[0] || '#';
          lines[0] = `${originalLevel} ${newTitleTrimmed}`;
        }
        
        sectionContent = lines.join('\n');
      }
    }
    
    result = sectionContent;
  }
  // Handle resolver executables
  else if (isResolverExecutable(definition)) {
    // For resolver executables, we need to construct the full resolver path
    // with parameter interpolation
    let resolverPath = definition.resolverPath;
    
    // Replace parameter placeholders in the resolver path
    for (let i = 0; i < params.length; i++) {
      const paramName = params[i];
      const argValue = evaluatedArgs[i];
      if (argValue !== undefined) {
        // Replace @paramName in the resolver path
        resolverPath = resolverPath.replace(new RegExp(`@${paramName}\\b`, 'g'), argValue);
      }
    }
    
    // Prepare payload if present
    let payload: any = undefined;
    if (definition.payloadTemplate) {
      // Interpolate the payload template
      const payloadStr = await interpolateWithResultDescriptor(definition.payloadTemplate, execEnv);
      try {
        // Try to parse as JSON
        payload = JSON.parse(payloadStr);
      } catch {
        // If not valid JSON, use as string
        payload = payloadStr;
      }
    }
    
    // Invoke the resolver through the ResolverManager
    const resolverManager = env.getResolverManager();
    if (!resolverManager) {
      throw new MlldInterpreterError('Resolver manager not available');
    }
    
    // Resolve the resolver with the appropriate context
    const resolverResult = await resolverManager.resolve(resolverPath, {
      context: 'exec-invocation',
      basePath: env.getBasePath(),
      payload
    });
    
    // Extract content from resolver result
    if (resolverResult && typeof resolverResult === 'object' && 'content' in resolverResult) {
      // ResolverContent interface
      result = resolverResult.content;
    } else if (typeof resolverResult === 'string') {
      result = resolverResult;
    } else if (resolverResult && typeof resolverResult === 'object') {
      // For objects, serialize to JSON
      result = JSON.stringify(resolverResult, null, 2);
    } else {
      result = String(resolverResult);
    }
  } else {
    throw new MlldInterpreterError(`Unknown executable type: ${(definition as any).type}`);
  }
  
  // Apply post-invocation field/index access if present (e.g., @func()[1], @obj.method().2)
  const postFields: any[] = (node as any).fields || [];
  if (postFields && postFields.length > 0) {
    try {
      const { accessField } = await import('../utils/field-access');
      let current: any = result;
      for (const f of postFields) {
        current = await accessField(current, f, { env, sourceLocation: nodeSourceLocation });
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
      const extracted = await extractVariableValue(result, execEnv);
      const typeHint = Array.isArray(extracted)
        ? 'array'
        : typeof extracted === 'object' && extracted !== null
          ? 'object'
          : 'text';
      const structured = wrapStructured(extracted as any, typeHint as any);
      result = structured;
    }
  }

  mergeResultDescriptor(extractSecurityDescriptor(result));

  if (resultSecurityDescriptor) {
    const structured = wrapExecResult(result);
    const existing = getStructuredSecurityDescriptor(structured);
    const merged = existing
      ? env.mergeSecurityDescriptors(existing, resultSecurityDescriptor)
      : resultSecurityDescriptor;
    setStructuredSecurityDescriptor(structured, merged);
    result = structured;
  }

  // Clean up resolution tracking after executable body completes, before pipeline/with clause processing
  // This allows pipelines to retry/re-execute the same function without false circular reference detection
  // Skip builtin methods and reserved names as they were never added to the resolution stack
  const cleanupShouldTrack = !builtinMethods.includes(commandName) &&
    !(env.hasVariable(commandName) && (env.getVariable(commandName) as any)?.internal?.isReserved);
  if (commandName && cleanupShouldTrack) {
    env.endResolving(commandName);
  }

  if (process.env.MLLD_DEBUG_FIX === 'true') {
    try {
      const summary = {
        commandName,
        type: typeof result,
        isStructured: isStructuredValue(result),
        keys: result && typeof result === 'object' ? Object.keys(result as any).slice(0, 5) : undefined,
        preview:
          isStructuredValue(result) && typeof (result as any).data === 'object'
            ? Object.keys((result as any).data || {}).slice(0, 5)
            : undefined,
        text:
          isStructuredValue(result) && typeof (result as any).text === 'string'
            ? String((result as any).text).slice(0, 120)
            : undefined
      };
      console.error('[evaluateExecInvocation] result summary', summary);
      if (
        commandName === 'needsMeta' ||
        commandName === 'jsDefault' ||
        commandName === 'jsKeep' ||
        commandName === 'agentsContext'
      ) {
        try {
          const fs = require('fs');
          fs.appendFileSync('/tmp/mlld-debug.log', JSON.stringify(summary) + '\n');
        } catch {}
      }
    } catch {}
  }

  // Apply withClause transformations if present
  if (node.withClause) {
    if (node.withClause.pipeline) {
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[exec-invocation] Handling pipeline:', {
          pipelineLength: node.withClause.pipeline.length,
          stages: node.withClause.pipeline.map((p: any) => Array.isArray(p) ? '[parallel]' : (p.rawIdentifier || 'unknown'))
        });
      }
      
      // When an ExecInvocation has a pipeline, we need to create a special pipeline
      // where the ExecInvocation itself becomes stage 0, retryable
      const { executePipeline } = await import('./pipeline');
      
      // Create a source function that re-executes this ExecInvocation (without the pipeline)
      const sourceFunction = async () => {
        if (process.env.MLLD_DEBUG === 'true') {
          console.error('[exec-invocation] sourceFunction called - re-executing ExecInvocation');
        }
        // Re-execute this same ExecInvocation but without the pipeline
        // IMPORTANT: Use execEnv not env, so the function parameters are available
        const nodeWithoutPipeline = { ...node, withClause: undefined };
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
      
      // Prepend synthetic source stage and attach builtin effects consistently
      let normalizedPipeline = [SOURCE_STAGE, ...node.withClause.pipeline];
      try {
        const { attachBuiltinEffects } = await import('./pipeline/effects-attachment');
        const { functionalPipeline } = attachBuiltinEffects(normalizedPipeline as any);
        normalizedPipeline = functionalPipeline as any;
      } catch {
        // If helper import fails, proceed without effect attachment
      }
      
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[exec-invocation] Creating pipeline with synthetic source:', {
          originalLength: node.withClause.pipeline.length,
          normalizedLength: normalizedPipeline.length,
          stages: normalizedPipeline.map((p: any) => Array.isArray(p) ? '[parallel]' : (p.rawIdentifier || 'unknown'))
        });
      }
      
      // Execute the pipeline with the ExecInvocation result as initial input
      // Mark it as retryable with the source function
      const pipelineInput = wrapExecResult(result);
      const pipelineResult = await executePipeline(
        pipelineInput,
        normalizedPipeline,
        execEnv,  // Use execEnv which has merged nodes
        node.location,
        node.withClause.format,
        true,  // isRetryable
        sourceFunction,
        true,  // hasSyntheticSource
        undefined,
        undefined,
        { returnStructured: true }
      );
      
      // Still need to handle other withClause features (trust, needs)
      let pipelineValue = wrapPipelineResult(pipelineResult);
      const pipelineDescriptor = getStructuredSecurityDescriptor(pipelineValue);
      const combinedDescriptor = pipelineDescriptor
        ? (resultSecurityDescriptor
            ? env.mergeSecurityDescriptors(pipelineDescriptor, resultSecurityDescriptor)
            : pipelineDescriptor)
        : resultSecurityDescriptor;
      if (combinedDescriptor) {
        setStructuredSecurityDescriptor(pipelineValue, combinedDescriptor);
        mergeResultDescriptor(combinedDescriptor);
      }
      const withClauseResult = await applyWithClause(
        pipelineValue,
        { ...node.withClause, pipeline: undefined },
        execEnv
      );
      const finalWithClauseResult = await finalizeResult(withClauseResult);
      return finalWithClauseResult;
    } else {
      const withClauseResult = await applyWithClause(result, node.withClause, execEnv);
      const finalWithClauseResult = await finalizeResult(withClauseResult);
      return finalWithClauseResult;
    }
  }
  
  if (process.env.MLLD_DEBUG === 'true') {
    try {
      console.log('[exec-invocation] returning result', {
        commandName,
        typeofResult: typeof result,
        isArrayResult: Array.isArray(result)
      });
    } catch {}
  }
  const finalEvalResult = await finalizeResult(createEvalResult(result, execEnv));
  return finalEvalResult;
    });
  });
  } finally {
    // Ensure resolution tracking is always cleaned up, even on error paths
    // Check if we added it to the tracking (skip builtins/reserved)
    if (commandName) {
      const wasTracked = !builtinMethods.includes(commandName) &&
        !(env.hasVariable(commandName) && (env.getVariable(commandName) as any)?.internal?.isReserved);
      if (wasTracked) {
        env.endResolving(commandName);
      }
    }

    const finalizedStreaming = streamingManager.finalizeResults();
    env.setStreamingResult(finalizedStreaming.streaming);
  }
}

type SecurityCarrier = {
  ctx?: VariableContext | StructuredValueContext;
};

function getVariableSecurityDescriptor(variable?: Variable): SecurityDescriptor | undefined {
  if (!variable) {
    return undefined;
  }
  return getSecurityDescriptorFromCarrier({ ctx: variable.ctx });
}

function getStructuredSecurityDescriptor(
  value?: { ctx?: StructuredValueContext; metadata?: { security?: SecurityDescriptor } }
): SecurityDescriptor | undefined {
  return getSecurityDescriptorFromCarrier(value);
}

function setStructuredSecurityDescriptor(
  value: { ctx?: StructuredValueContext },
  descriptor?: SecurityDescriptor
): void {
  if (!descriptor || !value || typeof value !== 'object') {
    return;
  }
  applySecurityDescriptorToStructuredValue(value as LegacyStructuredValue, descriptor);
}

function getSecurityDescriptorFromCarrier(carrier?: SecurityCarrier): SecurityDescriptor | undefined {
  if (!carrier) {
    return undefined;
  }
  return descriptorFromCtx(carrier.ctx);
}

function descriptorFromCtx(
  ctx?: VariableContext | StructuredValueContext
): SecurityDescriptor | undefined {
  if (!ctx) {
    return undefined;
  }
  const labels = Array.isArray(ctx.labels) ? ctx.labels : [];
  const sources = Array.isArray(ctx.sources) ? ctx.sources : [];
  const taint = (ctx as any).taint ?? 'unknown';
  if (labels.length === 0 && sources.length === 0 && taint === 'unknown') {
    return undefined;
  }
  return ctxToSecurityDescriptor(ctx as VariableContext);
}

/**
 * Deserialize shadow environments after import (objects to Maps)
 * WHY: Shadow environments are expected as Maps internally
 */
function deserializeShadowEnvs(envs: any): ShadowEnvironmentCapture {
  const result: ShadowEnvironmentCapture = {};
  
  for (const [lang, shadowObj] of Object.entries(envs)) {
    if (shadowObj && typeof shadowObj === 'object') {
      // Convert object to Map
      const map = new Map<string, any>();
      for (const [name, func] of Object.entries(shadowObj)) {
        map.set(name, func);
      }
      result[lang as keyof ShadowEnvironmentCapture] = map;
    }
  }
  
  return result;
}
