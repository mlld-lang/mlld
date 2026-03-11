import { parseDuration } from '@core/config/utils';
import {
  DEFAULT_CHECKPOINT_RESUME_MODE,
  DEFAULT_SCRIPT_CHECKPOINT_RESUME_MODE,
  normalizeCheckpointResumeMode
} from '@core/checkpoint/config';
import type {
  ActiveCheckpointScope,
  CheckpointResumeMode,
  EffectiveCheckpointPolicy
} from '@core/types/checkpoint';
import type { TimeDurationNode } from '@core/types';

function durationMultiplier(unit: TimeDurationNode['unit']): number {
  switch (unit) {
    case 'seconds':
      return 1000;
    case 'minutes':
      return 60 * 1000;
    case 'hours':
      return 60 * 60 * 1000;
    case 'days':
      return 24 * 60 * 60 * 1000;
    case 'weeks':
      return 7 * 24 * 60 * 60 * 1000;
    case 'years':
      return 365 * 24 * 60 * 60 * 1000;
    default:
      return 1;
  }
}

export {
  DEFAULT_CHECKPOINT_RESUME_MODE,
  DEFAULT_SCRIPT_CHECKPOINT_RESUME_MODE,
  normalizeCheckpointResumeMode
};

export function checkpointDurationToMs(value: unknown): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === 'number') {
    return parseDuration(value);
  }

  if (typeof value === 'string') {
    return parseDuration(value);
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: string }).type === 'TimeDuration'
  ) {
    const duration = value as TimeDurationNode;
    return Math.floor(duration.value * durationMultiplier(duration.unit));
  }

  return undefined;
}

export function resolveCheckpointPolicy(
  scriptResumeMode: CheckpointResumeMode | undefined,
  activeScope?: ActiveCheckpointScope
): EffectiveCheckpointPolicy {
  return {
    resumeMode:
      activeScope?.resumeMode ??
      scriptResumeMode ??
      DEFAULT_CHECKPOINT_RESUME_MODE,
    ...(activeScope?.name ? { name: activeScope.name } : {}),
    ...(activeScope?.ttlMs !== undefined ? { ttlMs: activeScope.ttlMs } : {}),
    hasCompleteCondition: activeScope?.hasCompleteCondition === true
  };
}

export function shouldPersistCheckpointEntry(options: {
  policy: EffectiveCheckpointPolicy;
  resumeOverride: boolean;
}): boolean {
  if (options.resumeOverride) {
    return true;
  }
  return options.policy.resumeMode !== 'never';
}

export function shouldServeCheckpointHit(options: {
  policy: EffectiveCheckpointPolicy;
  entryTimestamp?: string;
  checkpointComplete?: boolean;
  resumeOverride: boolean;
  now?: () => number;
}): boolean {
  if (options.resumeOverride) {
    return true;
  }

  if (options.policy.resumeMode === 'never' || options.policy.resumeMode === 'manual') {
    return false;
  }

  if (options.policy.hasCompleteCondition && options.checkpointComplete !== true) {
    return false;
  }

  if (options.policy.ttlMs === undefined) {
    return true;
  }

  if (!options.entryTimestamp) {
    return false;
  }

  const cachedAt = Date.parse(options.entryTimestamp);
  if (!Number.isFinite(cachedAt)) {
    return false;
  }

  const now = options.now ? options.now() : Date.now();
  return now - cachedAt <= options.policy.ttlMs;
}
