import { GuardError } from '@core/errors/GuardError';
import { GuardRetrySignal, isGuardRetrySignal } from '@core/errors/GuardRetrySignal';
import type { GuardHint, GuardResult } from '@core/types/guard';
import type { GuardContextSnapshot, OperationContext } from '../env/ContextManager';
import type { Environment } from '../env/Environment';
import { BufferedEffectHandler, type EffectHandler } from '../env/EffectHandler';
import { appendFileSync } from 'fs';

const DEFAULT_GUARD_MAX = 3;
const afterRetryDebugEnabled = process.env.DEBUG_AFTER_RETRY === '1';
const GUARD_WARNING_PREFIX = '[Guard Warning]';

interface GuardRetryAttempt {
  attempt: number;
  decision: 'retry';
  hint?: string | null;
}

interface GuardRetryState {
  attempt: number;
  max: number;
  history: GuardRetryAttempt[];
  hintHistory: Array<string | null>;
}

interface GuardRetryErrorDetails {
  guardName?: string | null;
  guardFilter?: string;
  scope?: any;
  operation?: OperationContext;
  inputPreview?: string | null;
  outputPreview?: string | null;
  guardContext?: GuardContextSnapshot;
  guardResults?: GuardResult[];
  hints?: GuardHint[];
}

interface GuardRetryOptions<T> {
  env: Environment;
  execute: () => Promise<T>;
  operationContext?: OperationContext;
  sourceRetryable?: boolean;
}

function logAfterRetryDebug(label: string, payload: Record<string, unknown>): void {
  if (!afterRetryDebugEnabled) {
    return;
  }
  try {
    console.error(`[after-guard-retry] ${label}`, payload);
  } catch {
    // ignore debug logging failures
  }
}

function shouldBufferEffects(env: Environment, operationContext?: OperationContext): boolean {
  if (env.shouldSuppressGuards()) {
    return false;
  }
  const guards = env.getGuardRegistry().getAllGuards();
  const hasAfterGuard = guards.some(def => def.timing === 'after' || def.timing === 'always');
  if (!hasAfterGuard) {
    return false;
  }
  const streaming =
    Boolean(operationContext?.metadata && (operationContext.metadata as Record<string, unknown>).streaming);
  return !streaming;
}

function extractGuardRetryDetails(error: unknown): GuardRetryErrorDetails {
  if (!error || typeof error !== 'object') {
    return {};
  }
  const candidate = error as any;
  const details = (candidate.details as GuardRetryErrorDetails | undefined) ?? {};
  return {
    guardName: candidate.guardName ?? details.guardName,
    guardFilter: candidate.guardFilter ?? details.guardFilter,
    scope: candidate.scope ?? details.scope,
    operation: candidate.operation ?? details.operation,
    inputPreview: candidate.inputPreview ?? details.inputPreview,
    outputPreview: candidate.outputPreview ?? details.outputPreview,
    guardContext: candidate.guardContext ?? details.guardContext,
    guardResults: candidate.guardResults ?? details.guardResults,
    hints: candidate.hints ?? details.hints
  };
}

function replayBufferedGuardWarnings(
  bufferHandler: BufferedEffectHandler,
  originalHandler: EffectHandler
): void {
  const bufferedEffects = bufferHandler.getEffects();
  for (const effect of bufferedEffects) {
    if (effect.type !== 'stderr') {
      continue;
    }
    if (!effect.content.includes(GUARD_WARNING_PREFIX)) {
      continue;
    }
    originalHandler.handleEffect(effect);
  }
}

export async function runWithGuardRetry<T>(options: GuardRetryOptions<T>): Promise<T> {
  const state: GuardRetryState = {
    attempt: 1,
    max: DEFAULT_GUARD_MAX,
    history: [],
    hintHistory: []
  };

  // Re-evaluate until success or a non-retry error
  for (;;) {
    const guardRetryContext = {
      attempt: state.attempt,
      try: state.attempt,
      tries: state.history.map(entry => ({ ...entry })),
      max: state.max,
      hintHistory: state.hintHistory.slice()
    };

    const bufferEffects = shouldBufferEffects(options.env, options.operationContext);
    const originalHandler = bufferEffects ? options.env.getEffectHandler() : null;
    const bufferHandler =
      bufferEffects && originalHandler ? new BufferedEffectHandler(originalHandler) : null;
    if (bufferHandler && originalHandler) {
      options.env.setEffectHandler(bufferHandler);
    }

    try {
      const result = await options.env
        .getContextManager()
        .withGenericContext('guardRetry', guardRetryContext, options.execute);
      if (bufferHandler && originalHandler) {
        options.env.setEffectHandler(originalHandler);
        bufferHandler.flush();
      }
      return result;
    } catch (error) {
      const isRetrySignal =
        (error instanceof GuardError && error.decision === 'retry') || isGuardRetrySignal(error);
      if (bufferHandler && originalHandler) {
        options.env.setEffectHandler(originalHandler);
        if (!isRetrySignal) {
          replayBufferedGuardWarnings(bufferHandler, originalHandler);
        }
        bufferHandler.discard();
      }
      const debugPayload = {
        attempt: state.attempt,
        isRetrySignal,
        sourceRetryable: options.sourceRetryable ?? null,
        pipeline: Boolean(options.env.getPipelineContext())
      };
      logAfterRetryDebug('guard retry caught', debugPayload);
      try {
        appendFileSync(
          '/tmp/mlld_guard_retry.log',
          JSON.stringify(
            {
              event: 'caught',
              ...debugPayload,
              hint:
                (error as any)?.retryHint ??
                extractGuardRetryDetails(error).hints?.[0]?.hint ??
                (error as GuardError).reason ??
                null
            },
            null,
            2
          ) + '\n'
        );
      } catch {
        // ignore file debug failures
      }
      if (!isRetrySignal) {
        throw error;
      }

      // Allow pipeline executor to handle retries inside pipelines
      if (options.env.getPipelineContext()) {
        const rethrowPayload = {
          attempt: state.attempt,
          hint:
            (error as GuardError).retryHint ??
            (error as any)?.retryHint ??
            extractGuardRetryDetails(error).hints?.[0]?.hint ??
            null
        };
        logAfterRetryDebug('rethrow to pipeline executor', rethrowPayload);
        try {
          appendFileSync(
            '/tmp/mlld_guard_retry.log',
            JSON.stringify({ event: 'rethrow', ...rethrowPayload }, null, 2) + '\n'
          );
        } catch {
          // ignore file debug failures
        }
        throw error;
      }

      const details = extractGuardRetryDetails(error);
      const guardContext = details.guardContext;
      if (typeof guardContext?.max === 'number') {
        state.max = guardContext.max;
      }
      const hint =
        (error as GuardError).retryHint ??
        (typeof details.hints?.[0]?.hint === 'string' ? details.hints![0]!.hint : null) ??
        (error as GuardError).reason ??
        null;
      state.history.push({ attempt: state.attempt, decision: 'retry', hint });
      state.hintHistory.push(hint ?? null);
      state.attempt += 1;

      if (!options.sourceRetryable) {
        const denyPayload = {
          attempt: state.attempt - 1,
          hint,
          sourceRetryable: options.sourceRetryable ?? null,
          guardName: details.guardName ?? guardContext?.name ?? null
        };
        logAfterRetryDebug('guard retry denied (non-retryable source)', denyPayload);
        try {
          appendFileSync(
            '/tmp/mlld_guard_retry.log',
            JSON.stringify({ event: 'deny-non-retryable', ...denyPayload }, null, 2) + '\n'
          );
        } catch {
          // ignore file debug failures
        }
        throw new GuardError({
          decision: 'deny',
          guardName: details.guardName ?? guardContext?.name ?? null,
          guardFilter: details.guardFilter ?? guardContext?.guardFilter,
          scope: details.scope,
          operation: details.operation ?? options.operationContext,
          inputPreview: details.inputPreview ?? null,
          outputPreview: details.outputPreview ?? null,
          retryHint: hint,
          reason: `Cannot retry: ${hint ?? 'source not retryable'}`,
          guardContext: guardContext ?? undefined,
          guardResults: details.guardResults,
          hints: details.hints
        });
      }

      if (state.attempt > state.max) {
        logAfterRetryDebug('guard retry budget exceeded', {
          attempt: state.attempt - 1,
          max: state.max,
          hint,
          guardName: details.guardName ?? guardContext?.name ?? null
        });
        throw new GuardError({
          decision: 'deny',
          guardName: details.guardName ?? guardContext?.name ?? null,
          guardFilter: details.guardFilter ?? guardContext?.guardFilter,
          scope: details.scope,
          operation: details.operation ?? options.operationContext,
          inputPreview: details.inputPreview ?? null,
          outputPreview: details.outputPreview ?? null,
          reason: `Guard retry limit exceeded (${state.max})`,
          guardContext: {
            ...(guardContext ?? {}),
            attempt: state.attempt - 1,
            try: state.attempt - 1,
            tries: state.history.map(entry => ({ ...entry })),
            max: state.max
          } as GuardContextSnapshot,
          guardResults: details.guardResults,
          hints: details.hints
        });
      }
    }
  }
}
