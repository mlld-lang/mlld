import { MlldInterpreterError } from '@core/errors';
import type { LoadContentResult } from '@core/types/load-content';
import { isLoadContentResult } from '@core/types/load-content';
import type { FieldAccessNode } from '@core/types/primitives';
import { isShelfSlotRefValue } from '@core/types/shelf';
import type { Environment } from '@interpreter/env/Environment';
import {
  getCapturedModuleEnv,
  sealCapturedModuleEnv
} from '@interpreter/eval/import/variable-importer/executable/CapturedModuleEnvKeychain';
import { resolveDirectToolCollection } from '@interpreter/eval/var/tool-scope';
import { inheritExpressionProvenance } from './expression-provenance';
import {
  accessFields,
  type FieldAccessOptions,
  type FieldAccessResult
} from './field-access';
import {
  materializeDisplayValue,
  type MaterializedDisplayValue
} from './display-materialization';
import { classifyShellValue } from './shell-value';
import { asText, isStructuredValue } from './structured-value';
import { extractVariableValue, isVariable } from './variable-resolution';
import * as shellQuote from 'shell-quote';

export type BoundaryProfile =
  | 'plainData'
  | 'config'
  | 'field'
  | 'identity'
  | 'display'
  | 'interpolate'
  | 'serialize';

export type BoundaryViolationKind =
  | 'structured_children_remain'
  | 'identity_lost'
  | 'wrong_field_path'
  | 'wrapper_survived_serialize';

export interface BoundaryPlainDataOptions {
  preserveProvenance?: boolean;
  unwrapSpecialWrappers?: boolean;
}

export interface BoundaryConfigOptions extends BoundaryPlainDataOptions {
  allowAstEvaluation?: boolean;
}

export class BoundaryViolation extends MlldInterpreterError {
  public readonly profile: BoundaryProfile;
  public readonly violation: BoundaryViolationKind;
  public readonly siteHint?: string;
  public readonly value?: unknown;

  public constructor(
    profile: BoundaryProfile,
    violation: BoundaryViolationKind,
    siteHint?: string,
    value?: unknown
  ) {
    const detail = siteHint ? ` at ${siteHint}` : '';
    super(`Boundary ${profile} violated contract (${violation})${detail}`, 'boundary', undefined, {
      code: 'BOUNDARY_VIOLATION'
    });
    this.name = 'BoundaryViolation';
    this.profile = profile;
    this.violation = violation;
    this.siteHint = siteHint;
    this.value = value;
    Object.setPrototypeOf(this, BoundaryViolation.prototype);
  }
}

function boundaryAssertionsEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.MLLD_STRICT_BOUNDARIES === '1';
}

function isPlainObject(value: unknown): value is { [key: string]: unknown } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  if (isStructuredValue(value) || isVariable(value) || isLoadContentResult(value) || isShelfSlotRefValue(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isAstLikeInterpreterValue(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }
  if (isStructuredValue(value) || isVariable(value) || isLoadContentResult(value) || isShelfSlotRefValue(value)) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some(entry => isAstLikeInterpreterValue(entry));
  }

  const candidate = value as {
    wrapperType?: unknown;
    content?: unknown;
    type?: unknown;
    entries?: unknown[];
    properties?: unknown;
    items?: unknown[];
    elements?: unknown[];
    nodeId?: unknown;
    location?: unknown;
  };
  if (candidate.wrapperType !== undefined && Array.isArray(candidate.content)) {
    return true;
  }
  if (
    candidate.type === 'object' &&
    (Array.isArray(candidate.entries)
      || isPlainObject(candidate.properties))
  ) {
    return true;
  }
  if (
    candidate.type === 'array' &&
    (Array.isArray(candidate.items)
      || Array.isArray(candidate.elements))
  ) {
    return true;
  }

  return Boolean(
    typeof candidate.type === 'string' &&
    (Object.prototype.hasOwnProperty.call(candidate, 'nodeId')
      || Object.prototype.hasOwnProperty.call(candidate, 'location'))
  );
}

function unwrapSpecialWrapper(
  value: unknown,
  options: Required<BoundaryPlainDataOptions>,
  seen: WeakMap<object, unknown>
): unknown {
  if (isShelfSlotRefValue(value)) {
    return plainDataInternal(value.data, options, seen);
  }
  if (isLoadContentResult(value)) {
    const loadValue = value as LoadContentResult;
    if (loadValue.json !== undefined) {
      return plainDataInternal(loadValue.json, options, seen);
    }
    return loadValue.content ?? '';
  }
  return value;
}

function plainDataInternal(
  value: unknown,
  options: Required<BoundaryPlainDataOptions>,
  seen: WeakMap<object, unknown>
): unknown {
  if (isVariable(value)) {
    return plainDataInternal(value.value, options, seen);
  }
  if (isStructuredValue(value)) {
    return plainDataInternal(value.data, options, seen);
  }
  if (options.unwrapSpecialWrappers && (isShelfSlotRefValue(value) || isLoadContentResult(value))) {
    return unwrapSpecialWrapper(value, options, seen);
  }
  if (Array.isArray(value)) {
    const existing = seen.get(value);
    if (existing) {
      return existing;
    }
    const arrayResult: unknown[] = [];
    seen.set(value, arrayResult);
    for (const entry of value) {
      arrayResult.push(plainDataInternal(entry, options, seen));
    }
    if (options.preserveProvenance) {
      inheritExpressionProvenance(arrayResult, value);
    }
    return arrayResult;
  }
  if (isPlainObject(value)) {
    const existing = seen.get(value);
    if (existing) {
      return existing;
    }
    const objectResult: { [key: string]: unknown } = {};
    seen.set(value, objectResult);
    for (const [key, entry] of Object.entries(value)) {
      objectResult[key] = plainDataInternal(entry, options, seen);
    }
    if (options.preserveProvenance) {
      inheritExpressionProvenance(objectResult, value);
    }
    return objectResult;
  }
  return value;
}

function containsStructuredChildren(value: unknown, seen: WeakSet<object> = new WeakSet()): boolean {
  if (isVariable(value) || isStructuredValue(value)) {
    return true;
  }
  if (!value || typeof value !== 'object') {
    return false;
  }
  if (isLoadContentResult(value) || isShelfSlotRefValue(value)) {
    return false;
  }
  if (seen.has(value)) {
    return false;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.some(entry => containsStructuredChildren(entry, seen));
  }

  if (!isPlainObject(value)) {
    return false;
  }

  return Object.values(value).some(entry => containsStructuredChildren(entry, seen));
}

function collectIdentityMarkers(value: unknown): {
  toolCollection?: unknown;
  capturedModuleEnv: boolean;
  shelfRef: boolean;
} {
  return {
    toolCollection: resolveDirectToolCollection(value),
    capturedModuleEnv:
      getCapturedModuleEnv(isVariable(value) ? value.internal : value) !== undefined
      || getCapturedModuleEnv(value) !== undefined,
    shelfRef: isShelfSlotRefValue(value) || (isVariable(value) && isShelfSlotRefValue(value.value))
  };
}

function assertBoundaryContract(
  profile: BoundaryProfile,
  result: unknown,
  options: {
    input?: unknown;
    siteHint?: string;
    allowAstLike?: boolean;
  } = {}
): void {
  if (!boundaryAssertionsEnabled()) {
    return;
  }

  if ((profile === 'plainData' || profile === 'config') && containsStructuredChildren(result)) {
    throw new BoundaryViolation(profile, 'structured_children_remain', options.siteHint, result);
  }

  if (profile === 'config' && options.allowAstLike !== true && isAstLikeInterpreterValue(result)) {
    throw new BoundaryViolation(profile, 'structured_children_remain', options.siteHint, result);
  }

  if (profile === 'identity' && options.input !== undefined) {
    const inputMarkers = collectIdentityMarkers(options.input);
    const resultMarkers = collectIdentityMarkers(result);
    const toolCollectionLost =
      inputMarkers.toolCollection !== undefined
      && resultMarkers.toolCollection === undefined
      && result !== inputMarkers.toolCollection;
    if (
      toolCollectionLost
      || (inputMarkers.capturedModuleEnv && !resultMarkers.capturedModuleEnv)
      || (inputMarkers.shelfRef && !resultMarkers.shelfRef)
    ) {
      throw new BoundaryViolation(profile, 'identity_lost', options.siteHint, result);
    }
  }

  if (profile === 'display') {
    const displayResult = result as { text?: unknown; descriptor?: unknown };
    if (
      !result
      || typeof result !== 'object'
      || !('text' in displayResult)
      || !('descriptor' in displayResult)
    ) {
      throw new BoundaryViolation(profile, 'wrong_field_path', options.siteHint, result);
    }
  }

  if (profile === 'interpolate' && typeof result !== 'string') {
    throw new BoundaryViolation(profile, 'wrong_field_path', options.siteHint, result);
  }
}

function normalizePlainDataOptions(
  options?: BoundaryPlainDataOptions
): Required<BoundaryPlainDataOptions> {
  return {
    preserveProvenance: options?.preserveProvenance ?? true,
    unwrapSpecialWrappers: options?.unwrapSpecialWrappers ?? false
  };
}

async function resolveConfigInput(
  value: unknown,
  env: Environment,
  options: Required<BoundaryConfigOptions>
): Promise<unknown> {
  if (value === null || value === undefined) {
    return value;
  }

  if (options.allowAstEvaluation && isAstLikeInterpreterValue(value)) {
    const { evaluate } = await import('@interpreter/core/interpreter');
    const result = await evaluate(value as never, env, { isExpression: true });
    return resolveConfigInput(result.value, env, options);
  }

  if (isVariable(value)) {
    return resolveConfigInput(await extractVariableValue(value, env), env, options);
  }

  if (isStructuredValue(value)) {
    return resolveConfigInput(value.data, env, options);
  }

  if (options.unwrapSpecialWrappers && isShelfSlotRefValue(value)) {
    return resolveConfigInput(value.data, env, options);
  }

  if (Array.isArray(value)) {
    const items: unknown[] = [];
    for (const entry of value) {
      items.push(await resolveConfigInput(entry, env, options));
    }
    if (options.preserveProvenance) {
      inheritExpressionProvenance(items, value);
    }
    return items;
  }

  if (isPlainObject(value)) {
    const result: { [key: string]: unknown } = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = await resolveConfigInput(entry, env, options);
    }
    if (options.preserveProvenance) {
      inheritExpressionProvenance(result, value);
    }
    return result;
  }

  return value;
}

function parseFieldPath(path: string): FieldAccessNode[] {
  const trimmed = path.trim();
  if (!trimmed) {
    return [];
  }

  const fields: FieldAccessNode[] = [];
  let index = 0;
  let current = '';

  const pushCurrent = () => {
    const segment = current.trim();
    current = '';
    if (!segment) {
      return;
    }
    if (/^\d+$/.test(segment)) {
      fields.push({ type: 'numericField', value: Number(segment) });
      return;
    }
    fields.push({ type: 'field', value: segment });
  };

  while (index < trimmed.length) {
    const char = trimmed[index];
    if (char === '.') {
      pushCurrent();
      index += 1;
      continue;
    }
    if (char === '[') {
      pushCurrent();
      const closeIndex = trimmed.indexOf(']', index);
      if (closeIndex === -1) {
        throw new Error(`Invalid field path '${path}': missing closing ]`);
      }
      const token = trimmed.slice(index + 1, closeIndex).trim();
      if (token === '*') {
        fields.push({ type: 'wildcardIndex' });
      } else if (/^\d+$/.test(token)) {
        fields.push({ type: 'arrayIndex', value: Number(token) });
      } else if (
        (token.startsWith('"') && token.endsWith('"'))
        || (token.startsWith("'") && token.endsWith("'"))
      ) {
        fields.push({ type: 'bracketAccess', value: token.slice(1, -1) });
      } else {
        fields.push({ type: 'bracketAccess', value: token });
      }
      index = closeIndex + 1;
      continue;
    }
    current += char;
    index += 1;
  }

  pushCurrent();
  return fields;
}

function quoteShellValue(value: unknown): string {
  const classification = classifyShellValue(value);
  if (classification.kind === 'simple') {
    return shellQuote.quote([classification.text]);
  }
  if (classification.kind === 'array-simple') {
    return classification.elements.map(entry => shellQuote.quote([entry])).join(' ');
  }
  return shellQuote.quote([classification.text]);
}

export function plainData<T = unknown>(
  value: unknown,
  options?: BoundaryPlainDataOptions
): T {
  const normalizedOptions = normalizePlainDataOptions(options);
  const result = plainDataInternal(value, normalizedOptions, new WeakMap()) as T;
  assertBoundaryContract('plainData', result);
  return result;
}

export async function config<T = unknown>(
  value: unknown,
  env: Environment,
  options?: BoundaryConfigOptions
): Promise<T> {
  const normalizedOptions: Required<BoundaryConfigOptions> = {
    ...normalizePlainDataOptions(options),
    allowAstEvaluation: options?.allowAstEvaluation ?? true
  };
  const resolved = await resolveConfigInput(value, env, normalizedOptions);
  const result = plainData<T>(resolved, normalizedOptions);
  assertBoundaryContract('config', result);
  return result;
}

export async function field<T = unknown>(
  value: unknown,
  path: string | FieldAccessNode[],
  env: Environment,
  options?: FieldAccessOptions
): Promise<T | FieldAccessResult> {
  const fields = typeof path === 'string' ? parseFieldPath(path) : path;
  const result = await accessFields(value, fields, {
    ...options,
    env
  });
  return result as T | FieldAccessResult;
}

export function identity<T = unknown>(value: unknown): T {
  const directCollection = resolveDirectToolCollection(value);
  if (directCollection) {
    assertBoundaryContract('identity', directCollection, { input: value });
    return directCollection as T;
  }

  if (isVariable(value)) {
    const capturedModuleEnv =
      getCapturedModuleEnv(value.internal)
      ?? getCapturedModuleEnv(value);
    const preservedValue = value.value;
    if (capturedModuleEnv !== undefined && preservedValue && typeof preservedValue === 'object') {
      sealCapturedModuleEnv(preservedValue, capturedModuleEnv);
    }
    assertBoundaryContract('identity', preservedValue, { input: value });
    return preservedValue as T;
  }

  assertBoundaryContract('identity', value, { input: value });
  return value as T;
}

export function display(value: unknown): MaterializedDisplayValue {
  const result = materializeDisplayValue(value, undefined, value);
  assertBoundaryContract('display', result);
  return result;
}

export function interpolate(
  value: unknown,
  context: 'template' | 'shell' | 'plain'
): string {
  const result =
    context === 'shell'
      ? quoteShellValue(value)
      : asText(value);
  assertBoundaryContract('interpolate', result);
  return result;
}

export const boundary = {
  plainData,
  config,
  field,
  identity,
  display,
  interpolate
};
