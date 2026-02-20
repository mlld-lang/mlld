import type {
  Environment,
  SourceLocation,
  TimeDurationNode,
  VariableReferenceNode
} from '@core/types';
import { isTimeDurationNode, isVariableReferenceNode } from '@core/types';
import { MlldDirectiveError } from '@core/errors';
import { evaluate } from '@interpreter/core/interpreter';
import { isVariable, extractVariableValue } from '@interpreter/utils/variable-resolution';
import {
  asData,
  asText,
  isStructuredValue
} from '@interpreter/utils/structured-value';

export type ForParallelOptions = {
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

export async function resolveParallelOptions(
  options: ForParallelOptions | undefined,
  env: Environment,
  sourceLocation?: SourceLocation
): Promise<ForParallelOptions | undefined> {
  if (!options || !options.parallel) return options;
  const cap = await resolveParallelCap(options.cap, env, sourceLocation);
  const rateMs = await resolveParallelRate(options.rateMs, env, sourceLocation);
  return { ...options, cap, rateMs };
}
