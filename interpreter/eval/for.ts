import type {
  ForDirective,
  ForExpression,
  Environment,
  ArrayVariable,
  Variable,
  FieldAccessNode,
  SourceLocation,
  TimeDurationNode,
  VariableReferenceNode
} from '@core/types';
import { isTimeDurationNode, isVariableReferenceNode } from '@core/types';
import { evaluate, type EvalResult } from '../core/interpreter';
import { FieldAccessError, MlldDirectiveError } from '@core/errors';
import { toIterable } from './for-utils';
import { getParallelLimit, runWithConcurrency } from '@interpreter/utils/parallel';
import { RateLimitRetry, isRateLimitError } from '../eval/pipeline/rate-limit-retry';
import { createArrayVariable, createObjectVariable, createPrimitiveVariable, createSimpleTextVariable } from '@core/types/variable';
import { isVariable, extractVariableValue } from '../utils/variable-resolution';
import { VariableImporter } from './import/VariableImporter';
import { logger } from '@core/utils/logger';
import { DebugUtils } from '../env/DebugUtils';
import { isLoadContentResult } from '@core/types/load-content';
import { isFileLoadedValue } from '@interpreter/utils/load-content-structured';
import {
  asData,
  asText,
  isStructuredValue,
  looksLikeJsonString,
  normalizeWhenShowEffect,
  type StructuredValue
} from '../utils/structured-value';
import { materializeDisplayValue } from '../utils/display-materialization';
import { accessFields } from '../utils/field-access';
import { inheritExpressionProvenance } from '@core/types/provenance/ExpressionProvenance';
import { evaluateWhenExpression } from './when-expression';
import { isAugmentedAssignment, isLetAssignment } from '@core/types/when';
import { evaluateAugmentedAssignment, evaluateLetAssignment } from './when';
import { isExeReturnControl } from './exe-return';

interface ForIterationError {
  index: number;
  key?: string | number | null;
  message: string;
  error: string;
  value?: unknown;
}

interface ForContextSnapshot {
  index: number;
  total: number;
  key: string | number | null;
  parallel: boolean;
}

type ForParallelOptions = {
  parallel?: boolean;
  cap?: number | VariableReferenceNode;
  rateMs?: number | VariableReferenceNode | TimeDurationNode;
};

function durationNodeToMs(duration: TimeDurationNode): number {
  const multipliers: Record<TimeDurationNode['unit'], number> = {
    milliseconds: 1,
    seconds: 1000,
    minutes: 60 * 1000,
    hours: 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
    weeks: 7 * 24 * 60 * 60 * 1000,
    years: 365 * 24 * 60 * 60 * 1000
  };
  return duration.value * multipliers[duration.unit];
}

function parseDurationString(value: string): number | null {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w|y)?$/i);
  if (!match) return null;
  const amount = parseFloat(match[1]);
  if (!Number.isFinite(amount)) return null;
  const unit = (match[2] || 'ms').toLowerCase();
  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    y: 365 * 24 * 60 * 60 * 1000
  };
  const multiplier = multipliers[unit];
  if (!multiplier) return null;
  return amount * multiplier;
}

async function resolveParallelValue(node: VariableReferenceNode, env: Environment): Promise<unknown> {
  const result = await evaluate(node as any, env, { isExpression: true });
  let value = result.value;
  if (isVariable(value)) {
    value = await extractVariableValue(value, env);
  }
  if (isStructuredValue(value)) {
    try {
      value = asData(value);
    } catch {
      value = asText(value);
    }
  }
  return value;
}

async function resolveParallelCap(
  cap: ForParallelOptions['cap'],
  env: Environment,
  sourceLocation?: SourceLocation
): Promise<number | undefined> {
  if (cap === null || cap === undefined) return undefined;
  if (typeof cap === 'number') return cap;
  if (isVariableReferenceNode(cap as any)) {
    const value = await resolveParallelValue(cap, env);
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed)) return parsed;
    }
    throw new MlldDirectiveError(
      'for parallel cap expects a number.',
      'for',
      { location: sourceLocation, context: { value } }
    );
  }
  throw new MlldDirectiveError(
    'for parallel cap expects a number.',
    'for',
    { location: sourceLocation, context: { value: cap } }
  );
}

async function resolveParallelRate(
  rate: ForParallelOptions['rateMs'],
  env: Environment,
  sourceLocation?: SourceLocation
): Promise<number | undefined> {
  if (rate === null || rate === undefined) return undefined;
  if (typeof rate === 'number') return rate;
  if (isTimeDurationNode(rate)) {
    return durationNodeToMs(rate);
  }
  if (isVariableReferenceNode(rate as any)) {
    const value = await resolveParallelValue(rate, env);
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = parseDurationString(value);
      if (parsed !== null) return parsed;
    }
    if (isTimeDurationNode(value as any)) {
      return durationNodeToMs(value as TimeDurationNode);
    }
    throw new MlldDirectiveError(
      'for parallel pacing expects a duration like 1s or 500ms.',
      'for',
      { location: sourceLocation, context: { value } }
    );
  }
  throw new MlldDirectiveError(
    'for parallel pacing expects a duration like 1s or 500ms.',
    'for',
    { location: sourceLocation, context: { value: rate } }
  );
}

async function resolveParallelOptions(
  options: ForParallelOptions | undefined,
  env: Environment,
  sourceLocation?: SourceLocation
): Promise<ForParallelOptions | undefined> {
  if (!options || !options.parallel) return options;
  const cap = await resolveParallelCap(options.cap, env, sourceLocation);
  const rateMs = await resolveParallelRate(options.rateMs, env, sourceLocation);
  return { ...options, cap, rateMs };
}

// Check if an object looks like file content data (e.g., from glob iteration)
function looksLikeFileData(value: unknown): value is Record<string, unknown> & { content: string; filename?: string; relative?: string; absolute?: string } {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  // Must have content (the file's text content)
  if (typeof obj.content !== 'string') return false;
  // Should have at least one file path property
  return typeof obj.filename === 'string' || typeof obj.relative === 'string' || typeof obj.absolute === 'string';
}

function shouldKeepStructuredForForExpression(value: StructuredValue): boolean {
  if (value.internal && (value.internal as any).keepStructured) {
    return true;
  }
  return isFileLoadedValue(value);
}

// Helper to ensure a value is wrapped as a Variable
function ensureVariable(name: string, value: unknown, env: Environment): Variable {
  // If already a Variable, return as-is
  if (isVariable(value)) {
    return value;
  }

  // Special handling for LoadContentResult objects and StructuredValue arrays
  // These need to be preserved as objects with their special metadata
  if (isLoadContentResult(value)) {
    const variable = createObjectVariable(
      name,
      value,
      false, // Not complex - it's already evaluated
      {
        directive: 'var',
        syntax: 'object',
        hasInterpolation: false,
        isMultiLine: false
      },
      {
        isLoadContentResult: true,
        source: 'for-loop'
      }
    );
    // Preserve file metadata in .mx so @f.mx.relative etc. works
    const absLastSlash = value.absolute.lastIndexOf('/');
    const absoluteDir = absLastSlash === 0 ? '/' : absLastSlash > 0 ? value.absolute.substring(0, absLastSlash) : value.absolute;
    const relLastSlash = value.relative.lastIndexOf('/');
    const relativeDir = relLastSlash === 0 ? '/' : relLastSlash > 0 ? value.relative.substring(0, relLastSlash) : '.';
    let dirname: string;
    if (absoluteDir === '/') {
      dirname = '/';
    } else {
      const dirLastSlash = absoluteDir.lastIndexOf('/');
      dirname = dirLastSlash >= 0 ? absoluteDir.substring(dirLastSlash + 1) : absoluteDir;
    }
    variable.mx = {
      ...(variable.mx ?? {}),
      filename: value.filename,
      relative: value.relative,
      absolute: value.absolute,
      dirname,
      relativeDir,
      absoluteDir,
      ext: (value as any).ext ?? (value as any)._extension,
      tokest: (value as any).tokest ?? (value as any)._metrics?.tokest,
      tokens: (value as any).tokens ?? (value as any)._metrics?.tokens
    };
    return variable;
  }

  if (isStructuredValue(value)) {
    // For StructuredValue items (both arrays and individual items like glob file entries),
    // preserve the .mx metadata from the StructuredValue
    const variable = createObjectVariable(
      name,
      value,
      false, // Not complex - it's already evaluated
      {
        directive: 'var',
        syntax: 'object',
        hasInterpolation: false,
        isMultiLine: false
      },
      {
        arrayType: value.type === 'array' ? 'structured-value-array' : undefined,
        source: 'for-loop'
      }
    );
    // Preserve the StructuredValue's .mx metadata on the Variable
    // This ensures file metadata (relative, absolute, filename, etc.) is accessible
    if (value.mx) {
      variable.mx = { ...value.mx };
    }
    return variable;
  }

  // Check if this looks like file data (from normalizeIterableValue stripping StructuredValue wrapper)
  // If so, copy file metadata properties to .mx so @f.mx.relative etc. works
  if (looksLikeFileData(value)) {
    const forSource = { directive: 'var' as const, syntax: 'object' as const, hasInterpolation: false, isMultiLine: false };
    const variable = createObjectVariable(name, value, false, forSource, { source: 'for-loop' });
    // Copy file metadata to .mx
    const absLastSlash = value.absolute?.lastIndexOf('/') ?? -1;
    const absoluteDir = absLastSlash === 0 ? '/' : absLastSlash > 0 ? value.absolute!.substring(0, absLastSlash) : value.absolute;
    const relLastSlash = value.relative?.lastIndexOf('/') ?? -1;
    const relativeDir = relLastSlash === 0 ? '/' : relLastSlash > 0 ? value.relative!.substring(0, relLastSlash) : '.';
    let dirname: string | undefined;
    if (absoluteDir === '/') {
      dirname = '/';
    } else if (absoluteDir) {
      const dirLastSlash = absoluteDir.lastIndexOf('/');
      dirname = dirLastSlash >= 0 ? absoluteDir.substring(dirLastSlash + 1) : absoluteDir;
    }
    variable.mx = {
      ...(variable.mx ?? {}),
      filename: value.filename,
      relative: value.relative,
      absolute: value.absolute,
      dirname,
      relativeDir,
      absoluteDir,
      ext: (value as any).ext,
      tokest: (value as any).tokest,
      tokens: (value as any).tokens
    };
    return variable;
  }

  // Create variables directly without VariableImporter to avoid deep-copy
  // in unwrapArraySnapshots. For-loop iteration values are already evaluated
  // data and don't contain __arraySnapshot/__executable markers.
  const forSource = { directive: 'var' as const, syntax: 'object' as const, hasInterpolation: false, isMultiLine: false };
  if (Array.isArray(value)) {
    return createArrayVariable(name, value, false, { ...forSource, syntax: 'array' as const }, { source: 'for-loop' });
  }
  if (value && typeof value === 'object') {
    return createObjectVariable(name, value as Record<string, unknown>, false, forSource, { source: 'for-loop' });
  }
  if (typeof value === 'string') {
    return createSimpleTextVariable(name, value, forSource, { source: 'for-loop' });
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return createPrimitiveVariable(name, value, forSource, { source: 'for-loop' });
  }

  // Fallback: use VariableImporter for unknown types
  const importer = new VariableImporter();
  return importer.createVariableFromValue(name, value, 'for-loop', undefined, { env });
}

function formatFieldPath(fields?: FieldAccessNode[]): string | null {
  if (!fields || fields.length === 0) {
    return null;
  }
  const parts: string[] = [];
  for (const field of fields) {
    const value = field.value;
    switch (field.type) {
      case 'field':
      case 'stringIndex':
      case 'bracketAccess':
      case 'numericField':
        parts.push(typeof value === 'number' ? String(value) : String(value ?? ''));
        break;
      case 'arrayIndex':
      case 'variableIndex':
        parts.push(`[${typeof value === 'number' ? value : String(value ?? '')}]`);
        break;
      case 'arraySlice':
        parts.push(`[${field.start ?? ''}:${field.end ?? ''}]`);
        break;
      case 'arrayFilter':
        parts.push('[?]');
        break;
      default:
        parts.push(String(value ?? ''));
        break;
    }
  }

  return parts
    .map((part, index) => (part.startsWith('[') || index === 0 ? part : `.${part}`))
    .join('');
}

function formatKeyField(fields?: FieldAccessNode[]): string {
  if (!fields || fields.length === 0) return '@field';
  const field = fields[0] as any;
  let name = '';
  if (typeof field?.value === 'string' || typeof field?.value === 'number') {
    name = String(field.value);
  } else if (typeof field?.name === 'string') {
    name = field.name;
  }
  return `@${name || 'field'}`;
}

function assertKeyVariableHasNoFields(
  keyNode: VariableReferenceNode | undefined,
  sourceLocation?: SourceLocation
): void {
  if (!keyNode?.fields || keyNode.fields.length === 0) return;
  const renderedField = formatKeyField(keyNode.fields);
  throw new MlldDirectiveError(
    `Cannot access field "${renderedField}" on loop key "@${keyNode.identifier}" - keys are primitive values (strings)`,
    'for',
    { location: sourceLocation ?? keyNode.location }
  );
}

function enhanceFieldAccessError(
  error: unknown,
  options: { fieldPath?: string | null; varName: string; index: number; key: string | null; sourceLocation?: SourceLocation }
): unknown {
  if (!(error instanceof FieldAccessError)) {
    return error;
  }
  const pathSuffix = options.fieldPath ? `.${options.fieldPath}` : '';
  const contextParts: string[] = [];
  if (options.key !== null && options.key !== undefined) {
    contextParts.push(`key ${String(options.key)}`);
  } else if (options.index >= 0) {
    contextParts.push(`index ${options.index}`);
  }
  const context = contextParts.length > 0 ? ` (${contextParts.join(', ')})` : '';
  const message = `${error.message} in for binding @${options.varName}${pathSuffix}${context}`;
  const enhancedDetails = {
    ...(error.details || {}),
    iterationIndex: options.index,
    iterationKey: options.key
  };
  return new FieldAccessError(message, enhancedDetails, {
    cause: error,
    sourceLocation: (error as any).sourceLocation ?? options.sourceLocation
  });
}

function withIterationMxKey(variable: Variable, key: unknown): Variable {
  if (key === null || typeof key === 'undefined') {
    return variable;
  }
  if (typeof key !== 'string' && typeof key !== 'number') {
    return variable;
  }
  return {
    ...variable,
    mx: { ...(variable.mx ?? {}), key }
  };
}

function formatIterationError(error: unknown): string {
  if (error instanceof Error) {
    let message = error.message;
    // Strip directive wrapper noise for user-facing markers
    if (message.startsWith('Directive error (')) {
      const prefixEnd = message.indexOf(': ');
      if (prefixEnd >= 0) {
        message = message.slice(prefixEnd + 2);
      }
      const lineIndex = message.indexOf(' at line ');
      if (lineIndex >= 0) {
        message = message.slice(0, lineIndex);
      }
    }
    return message;
  }
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function resetForErrorsContext(env: Environment, errors: ForIterationError[]): void {
  const mxManager = env.getContextManager?.();
  if (!mxManager) return;
  while (mxManager.popGenericContext('for')) {
    // clear previous loop context
  }
  mxManager.pushGenericContext('for', { errors, timestamp: Date.now() });
  mxManager.setLatestErrors(errors);
}

function findVariableOwner(env: Environment, name: string): Environment | undefined {
  let current: Environment | undefined = env;
  while (current) {
    if (current.getCurrentVariables().has(name)) return current;
    current = current.getParent();
  }
  return undefined;
}

function isDescendantEnvironment(env: Environment, ancestor: Environment): boolean {
  let current: Environment | undefined = env;
  while (current) {
    if (current === ancestor) return true;
    current = current.getParent();
  }
  return false;
}

export async function evaluateForDirective(
  directive: ForDirective,
  env: Environment
): Promise<EvalResult> {
  const varNode = directive.values.variable[0];
  const keyNode = directive.values.key?.[0];
  assertKeyVariableHasNoFields(keyNode, directive.location);
  const varName = varNode.identifier;
  const keyVarName = keyNode?.identifier;
  const varFields = varNode.fields;
  const fieldPathString = formatFieldPath(varFields);
  
  // Debug support
  const debugEnabled = process.env.DEBUG_FOR === '1' || process.env.DEBUG_FOR === 'true' || process.env.MLLD_DEBUG === 'true';

  // Trace support
  env.pushDirective('/for', `@${varName} in ...`, directive.location);

  try {
    // Evaluate source collection
    // The source is an array containing the actual source node
    const sourceNode = Array.isArray(directive.values.source) 
      ? directive.values.source[0] 
      : directive.values.source;
    
    const sourceResult = await evaluate(sourceNode, env);
    const sourceValue = sourceResult.value;
    const iterable = toIterable(sourceValue);

    if (!iterable) {
      const receivedType = typeof sourceValue;
      const preview = (() => {
        try {
          if (receivedType === 'object') return JSON.stringify(sourceValue)?.slice(0, 120);
          return String(sourceValue)?.slice(0, 120);
        } catch { return String(sourceValue); }
      })();
      throw new MlldDirectiveError(
        `Type mismatch: /for expects an array. Received: ${receivedType}${preview ? ` (${preview})` : ''}`,
        'for',
        { location: directive.location, context: { expected: 'array', receivedType } }
      );
    }

    // Determine parallel options (directive-specified or inherited from parent scope)
    const specified = (directive.values as any).forOptions as ForParallelOptions | undefined;
    const inherited = (env as any).__forOptions as ForParallelOptions | undefined;
    const effective = await resolveParallelOptions(specified ?? inherited, env, directive.location);

    const iterableArray = Array.from(iterable);
    const forErrors = effective?.parallel ? ([] as ForIterationError[]) : null;
    if (forErrors) {
      resetForErrorsContext(env, forErrors);
    }

    const runOne = async (entry: [any, any], idx: number) => {
      const [key, value] = entry;
      const iterationRoot = env.createChildEnvironment();
      if (effective?.parallel) {
        (iterationRoot as any).__parallelIsolationRoot = iterationRoot;
      }
      let childEnv = iterationRoot;
      // Inherit forOptions for nested loops if set
      if (effective) (childEnv as any).__forOptions = effective;
      let derivedValue: unknown;
      if (varFields && varFields.length > 0) {
        try {
          const accessed = await accessFields(value, varFields, {
            env: childEnv,
            preserveContext: true,
            sourceLocation: varNode.location
          });
          derivedValue = (accessed as any)?.value ?? accessed;
          inheritExpressionProvenance(derivedValue, value);
        } catch (error) {
          throw enhanceFieldAccessError(error, {
            fieldPath: fieldPathString,
            varName,
            index: idx,
            key: key ?? null,
            sourceLocation: varNode.location
          }) as Error;
        }
      }
      const iterationVar = ensureVariable(varName, value, env);
      childEnv.setVariable(varName, withIterationMxKey(iterationVar, key));
      if (typeof derivedValue !== 'undefined' && fieldPathString) {
        const derivedVar = ensureVariable(`${varName}.${fieldPathString}`, derivedValue, env);
        childEnv.setVariable(`${varName}.${fieldPathString}`, derivedVar);
      }
      if (key !== null && typeof key === 'string') {
        if (keyVarName) {
          const keyVar = ensureVariable(keyVarName, key, env);
          childEnv.setVariable(keyVarName, keyVar);
        } else {
          const keyVar = ensureVariable(`${varName}_key`, key, env);
          childEnv.setVariable(`${varName}_key`, keyVar);
        }
      }

      // Set up for context for @mx.for access
      const forCtx: ForContextSnapshot = {
        index: idx,
        total: iterableArray.length,
        key: key ?? null,
        parallel: !!effective?.parallel
      };
      childEnv.pushExecutionContext('for', forCtx);

      const actionNodes = directive.values.action;
      const retry = new RateLimitRetry();
      let returnControl: unknown = null;
      while (true) {
        try {
          if (directive.meta?.actionType === 'block') {
            let blockEnv = childEnv;
            for (const actionNode of actionNodes) {
              if (isLetAssignment(actionNode)) {
                blockEnv = await evaluateLetAssignment(actionNode, blockEnv);
              } else if (isAugmentedAssignment(actionNode)) {
                if (effective?.parallel) {
                  const owner = findVariableOwner(blockEnv, actionNode.identifier);
                  if (!owner || !isDescendantEnvironment(owner, iterationRoot)) {
                    throw new MlldDirectiveError(
                      `Parallel for block cannot mutate outer variable @${actionNode.identifier}.`,
                      'for',
                      { location: actionNode.location }
                    );
                  }
                }
                blockEnv = await evaluateAugmentedAssignment(actionNode, blockEnv);
              } else if (actionNode.type === 'WhenExpression') {
                const actionResult = await evaluateWhenExpression(actionNode as any, blockEnv);
                blockEnv = actionResult.env || blockEnv;
                if (isExeReturnControl(actionResult.value)) {
                  returnControl = actionResult.value;
                  break;
                }
              } else {
                const actionResult = await evaluate(actionNode, blockEnv);
                blockEnv = actionResult.env || blockEnv;
                if (isExeReturnControl(actionResult.value)) {
                  returnControl = actionResult.value;
                  break;
                }
              }
            }
            childEnv = blockEnv;
            if (returnControl) {
              retry.reset();
              break;
            }
          } else {
            let actionResult: any = { value: undefined, env: childEnv };
            for (const actionNode of actionNodes) {
              if (actionNode.type === 'WhenExpression') {
                actionResult = await evaluateWhenExpression(actionNode as any, childEnv);
              } else {
                actionResult = await evaluate(actionNode, childEnv);
              }
              if (actionResult.env) childEnv = actionResult.env;
              if (isExeReturnControl(actionResult.value)) {
                returnControl = actionResult.value;
                break;
              }
            }
            if (returnControl) {
              retry.reset();
              break;
            }
            // Emit bare exec output as effect (legacy behavior)
            if (
              directive.values.action.length === 1 &&
              directive.values.action[0].type === 'ExecInvocation' &&
              actionResult.value !== undefined && actionResult.value !== null
            ) {
              const materialized = materializeDisplayValue(
                actionResult.value,
                undefined,
                actionResult.value
              );
              let outputContent = materialized.text;
              if (!outputContent.endsWith('\n')) {
                outputContent += '\n';
              }
              if (materialized.descriptor) {
                env.recordSecurityDescriptor(materialized.descriptor);
              }
              env.emitEffect('both', outputContent, { source: directive.values.action[0].location });
            }
          }
          retry.reset();
          break;
        } catch (err: any) {
          if (isRateLimitError(err)) {
            const again = await retry.wait();
            if (again) continue;
          }
          childEnv.popExecutionContext('for');
          if (forErrors) {
            forErrors.push({
              index: idx,
              key: key ?? null,
              message: formatIterationError(err),
              error: formatIterationError(err),
              value
            });
            return;
          }
          throw err;
        }
      }
      childEnv.popExecutionContext('for');
      return returnControl;
    };

    if (effective?.parallel) {
      const cap = Math.min(effective.cap ?? getParallelLimit(), iterableArray.length);
      const results = await runWithConcurrency(iterableArray, cap, runOne, { ordered: false, paceMs: effective.rateMs });
      const returnControl = results.find(result => isExeReturnControl(result));
      if (returnControl) {
        return { value: returnControl, env };
      }
    } else {
      for (let i = 0; i < iterableArray.length; i++) {
        const result = await runOne(iterableArray[i], i);
        if (isExeReturnControl(result)) {
          return { value: result, env };
        }
      }
    }
    
  } finally {
    env.popDirective();
  }
  
  // For directives don't produce a direct output value
  return { value: undefined, env };
}

export async function evaluateForExpression(
  expr: ForExpression,
  env: Environment
): Promise<ArrayVariable> {
  const keyNode = expr.keyVariable;
  assertKeyVariableHasNoFields(keyNode, expr.location);
  const keyVarName = keyNode?.identifier;
  const varName = expr.variable.identifier;
  const varFields = expr.variable.fields;
  const fieldPathString = formatFieldPath(varFields);

  // Evaluate source collection
  const sourceResult = await evaluate(expr.source, env, { isExpression: true });
  const sourceValue = sourceResult.value;
  const iterable = toIterable(sourceValue);

  if (!iterable) {
    const receivedType = typeof sourceValue;
    const preview = (() => {
      try {
        if (receivedType === 'object') return JSON.stringify(sourceValue)?.slice(0, 120);
        return String(sourceValue)?.slice(0, 120);
      } catch { return String(sourceValue); }
    })();
    throw new MlldDirectiveError(
      `Type mismatch: /for expects an array. Received: ${receivedType}${preview ? ` (${preview})` : ''}`,
      'for',
      { location: expr.location, context: { expected: 'array', receivedType } }
    );
  }

  const results: unknown[] = [];
  const errors: ForIterationError[] = [];

  const specified = (expr.meta as any)?.forOptions as ForParallelOptions | undefined;
  const inherited = (env as any).__forOptions as ForParallelOptions | undefined;
  const effective = await resolveParallelOptions(specified ?? inherited, env, expr.location);
  if (effective?.parallel) {
    resetForErrorsContext(env, errors);
  }

  const iterableArray = Array.from(iterable);

  const SKIP = Symbol('skip');
  const runOne = async (entry: [any, any], idx: number) => {
    const [key, value] = entry;
    const iterationRoot = env.createChildEnvironment();
    if (effective?.parallel) {
      (iterationRoot as any).__parallelIsolationRoot = iterationRoot;
    }
    let childEnv = iterationRoot;
    if (effective) (childEnv as any).__forOptions = effective;
    let derivedValue: unknown;
    if (varFields && varFields.length > 0) {
      try {
        const accessed = await accessFields(value, varFields, {
          env: childEnv,
          preserveContext: true,
          sourceLocation: expr.variable.location
        });
        derivedValue = (accessed as any)?.value ?? accessed;
        inheritExpressionProvenance(derivedValue, value);
      } catch (error) {
        throw enhanceFieldAccessError(error, {
          fieldPath: fieldPathString,
          varName,
          index: idx,
          key: key ?? null,
          sourceLocation: expr.variable.location
        }) as Error;
      }
    }
    const iterationVar = ensureVariable(varName, value, env);
    childEnv.setVariable(varName, withIterationMxKey(iterationVar, key));
    if (typeof derivedValue !== 'undefined' && fieldPathString) {
      const derivedVar = ensureVariable(`${varName}.${fieldPathString}`, derivedValue, env);
      childEnv.setVariable(`${varName}.${fieldPathString}`, derivedVar);
    }
    if (key !== null && typeof key === 'string') {
      if (keyVarName) {
        const keyVar = ensureVariable(keyVarName, key, env);
        childEnv.setVariable(keyVarName, keyVar);
      } else {
        const keyVar = ensureVariable(`${varName}_key`, key, env);
        childEnv.setVariable(`${varName}_key`, keyVar);
      }
    }

    // Set up for context for @mx.for access (matching directive path)
    const forCtx: ForContextSnapshot = {
      index: idx,
      total: iterableArray.length,
      key: key ?? null,
      parallel: !!effective?.parallel
    };
    childEnv.pushExecutionContext('for', forCtx);

    try {
      let exprResult: unknown = null;
      if (Array.isArray(expr.expression) && expr.expression.length > 0) {
        let nodesToEvaluate = expr.expression;
        if (
          expr.expression.length === 1 &&
          (expr.expression[0] as any).content &&
          (expr.expression[0] as any).wrapperType &&
          !(expr.expression[0] as any).hasInterpolation
        ) {
          nodesToEvaluate = (expr.expression[0] as any).content;
        }

        const simpleVarRef = (() => {
          if (nodesToEvaluate.length !== 1) return null;
          const node = nodesToEvaluate[0] as any;
          if (!node || node.type !== 'VariableReference') return null;
          const hasFields = Array.isArray(node.fields) && node.fields.length > 0;
          const hasPipes = Array.isArray(node.pipes) && node.pipes.length > 0;
          if (hasFields || hasPipes) return null;
          return node as VariableReferenceNode;
        })();

        const evaluateSequence = async (nodes: unknown[], startEnv: Environment): Promise<EvalResult> => {
          let currentEnv = startEnv;
          let lastResult: EvalResult = { value: undefined, env: currentEnv };

          for (const node of nodes) {
            if (isLetAssignment(node as any)) {
              currentEnv = await evaluateLetAssignment(node as any, currentEnv);
              lastResult = { value: undefined, env: currentEnv };
              continue;
            }

            if (isAugmentedAssignment(node as any)) {
              currentEnv = await evaluateAugmentedAssignment(node as any, currentEnv);
              lastResult = { value: undefined, env: currentEnv };
              continue;
            }

            if ((node as any)?.type === 'WhenExpression') {
              lastResult = await evaluateWhenExpression(node as any, currentEnv);
              currentEnv = lastResult.env || currentEnv;
              // Early return: if when matched and returned a value, exit the sequence
              // BUT don't break for side-effect tags (show, output) - those aren't real return values
              if (lastResult.value !== null && lastResult.value !== undefined) {
                if (typeof lastResult.value === 'object' && (lastResult.value as any).__whenEffect) {
                  continue;
                }
                break;
              }
              continue;
            }

            // Allow side effects (show, output) in for-expressions for progress logging
            lastResult = await evaluate(node as any, currentEnv, { isExpression: true, allowEffects: true });
            currentEnv = lastResult.env || currentEnv;
          }

          return { value: lastResult.value, env: currentEnv };
        };

        const result = await evaluateSequence(nodesToEvaluate, childEnv);

        if (result.env) childEnv = result.env;
        let branchValue = result?.value;
        if (simpleVarRef) {
          const refVar = childEnv.getVariable(simpleVarRef.identifier);
          const refValue = refVar?.value;
          if (isStructuredValue(refValue) && shouldKeepStructuredForForExpression(refValue)) {
            branchValue = refValue;
          }
        }
        if (isStructuredValue(branchValue)) {
          if (shouldKeepStructuredForForExpression(branchValue)) {
            const derived = (() => {
              try {
                return asData(branchValue);
              } catch {
                return asText(branchValue);
              }
            })();
            if (derived === 'skip') {
              return SKIP as any;
            }
          } else {
            try {
              branchValue = asData(branchValue);
            } catch {
              branchValue = asText(branchValue);
            }
          }
        }
        if (branchValue === 'skip') {
          return SKIP as any;
        }
        if (isVariable(branchValue)) {
          exprResult = await extractVariableValue(branchValue, childEnv);
        } else {
          exprResult = branchValue;
        }

        // Preserve directive-produced text (e.g., show/run) when they tag side effects
        exprResult = normalizeWhenShowEffect(exprResult).normalized;

        if (typeof exprResult === 'string' && looksLikeJsonString(exprResult)) {
          try {
            exprResult = JSON.parse(exprResult.trim());
          } catch {
            // keep original string if parsing fails
          }
        }
      }
      childEnv.popExecutionContext('for');
      return exprResult as any;
    } catch (error) {
      childEnv.popExecutionContext('for');
      const message = formatIterationError(error);
      const marker: ForIterationError = {
        index: idx,
        key: key ?? null,
        message,
        error: message,
        value
      };
      errors.push(marker);
      if (effective?.parallel) {
        return marker as any;
      }
      return null as any;
    }
  };

  if (effective?.parallel) {
    const cap = Math.min(effective.cap ?? getParallelLimit(), iterableArray.length);
    const orderedResults = await runWithConcurrency(iterableArray, cap, runOne, { ordered: true, paceMs: effective.rateMs });
    for (const r of orderedResults) if (r !== SKIP) results.push(r);
  } else {
    for (let i = 0; i < iterableArray.length; i++) {
      const r = await runOne(iterableArray[i], i);
      if (r !== SKIP) results.push(r);
    }
  }

  let finalResults: unknown = results;
  const batchPipelineConfig = expr.meta?.batchPipeline;
  const batchStages = Array.isArray(batchPipelineConfig)
    ? batchPipelineConfig
    : batchPipelineConfig?.pipeline;

  if (batchStages && batchStages.length > 0) {
    const { processPipeline } = await import('./pipeline/unified-processor');
    const batchInput = createArrayVariable(
      'for-batch-input',
      results,
      false,
      {
        directive: 'for',
        syntax: 'expression',
        hasInterpolation: false,
        isMultiLine: false
      },
      { isBatchInput: true }
    );

    try {
      const pipelineResult = await processPipeline({
        value: batchInput,
        env,
        pipeline: batchStages,
        identifier: `for-batch-${expr.variable.identifier}`,
        location: expr.location,
        isRetryable: false
      });

      if (isStructuredValue(pipelineResult)) {
        finalResults = asData(pipelineResult);
      } else if (isVariable(pipelineResult)) {
        finalResults = await extractVariableValue(pipelineResult, env);
      } else {
        finalResults = pipelineResult;
      }
    } catch (error) {
      logger.warn(
        `Batch pipeline failed for for-expression: ${error instanceof Error ? error.message : String(error)}`
      );
      errors.push({
        index: -1,
        error: error as Error,
        value: results
      });
      finalResults = results;
    }
  }

  const variableSource = {
    directive: 'for',
    syntax: 'expression',
    hasInterpolation: false,
    isMultiLine: false
  };

  const metadata: Record<string, unknown> = {
    sourceExpression: expr.expression,
    iterationVariable: expr.variable.identifier
  };

  if (batchStages && batchStages.length > 0) {
    metadata.hadBatchPipeline = true;
  }

  if (errors.length > 0) {
    metadata.forErrors = errors;
  }

  if (Array.isArray(finalResults)) {
    return createArrayVariable(
      'for-result',
      finalResults,
      false,
      variableSource,
      {
        metadata,
        internal: {
          arrayType: 'for-expression-result'
        }
      }
    );
  }

  if (finalResults === undefined) {
    return createPrimitiveVariable(
      'for-result',
      null,
      variableSource,
      { mx: metadata }
    );
  }

  if (
    finalResults === null ||
    typeof finalResults === 'number' ||
    typeof finalResults === 'boolean'
  ) {
    return createPrimitiveVariable(
      'for-result',
      finalResults as number | boolean | null,
      variableSource,
      { mx: metadata }
    );
  }

  if (typeof finalResults === 'string') {
    return createSimpleTextVariable(
      'for-result',
      finalResults,
      variableSource,
      { mx: metadata }
    );
  }

  if (typeof finalResults === 'object') {
    return createObjectVariable(
      'for-result',
      finalResults,
      false,
      variableSource,
      { mx: metadata }
    );
  }

  return createSimpleTextVariable(
    'for-result',
    String(finalResults),
    variableSource,
    { mx: metadata }
  );
}
