import type { GuardDefinition, GuardScope } from '../guards';
import type { OperationContext } from '../env/ContextManager';
import type { Environment } from '../env/Environment';
import type { HookableNode } from '@core/types/hooks';
import type {
  GuardDecisionType,
  GuardHint,
  GuardResult
} from '@core/types/guard';
import { interpreterLogger } from '@core/utils/logger';
import { isDirectiveHookTarget, isEffectHookTarget } from '@core/types/hooks';
import { isVariable } from '../utils/variable-resolution';
import { appendFileSync } from 'fs';

const GUARD_DEBUG_PREVIEW_LIMIT = 100;

let guardLoggerPrimed = false;

function isGuardDebugEnabled(): boolean {
  const value = process.env.MLLD_DEBUG_GUARDS;
  if (!value) {
    return false;
  }
  return value === '1' || value.toLowerCase() === 'true';
}

function ensureGuardLoggerLevel(): void {
  if (guardLoggerPrimed) {
    return;
  }
  guardLoggerPrimed = true;
  try {
    interpreterLogger.level = 'debug';
  } catch {
    // Ignore logger level adjustments in restricted environments
  }
}

function logGuardDebug(message: string, context?: Record<string, unknown>): void {
  if (!isGuardDebugEnabled()) {
    return;
  }
  ensureGuardLoggerLevel();
  interpreterLogger.debug(message, context);
}

function formatGuardLabel(guard: GuardDefinition): string {
  const label = guard.name ?? 'anonymous';
  const filter = `${guard.filterKind}:${guard.filterValue}`;
  return `${label} (for ${filter})`;
}

function formatOperationDescription(operation?: OperationContext): string {
  if (!operation || !operation.type) {
    return 'operation';
  }
  const base = operation.type.startsWith('/') ? operation.type : `/${operation.type}`;
  const subtype = operation.subtype ? ` (${operation.subtype})` : '';
  return `${base}${subtype}`;
}

function sanitizePreviewForLog(preview?: string | null): string | null {
  if (!preview) {
    return null;
  }
  if (preview.length <= GUARD_DEBUG_PREVIEW_LIMIT) {
    return preview;
  }
  return `${preview.slice(0, GUARD_DEBUG_PREVIEW_LIMIT)}…`;
}

function describeHookTarget(node: HookableNode): string {
  if (isDirectiveHookTarget(node)) {
    return node.kind;
  }
  if (isEffectHookTarget(node)) {
    return `effect:${(node as any).rawIdentifier ?? 'unknown'}`;
  }
  return 'exe';
}

export function logGuardEvaluationStart(options: {
  guard: GuardDefinition;
  node: HookableNode;
  operation: OperationContext;
  scope: GuardScope;
  attempt: number;
  inputPreview?: string | null;
}): void {
  const operationDescription = formatOperationDescription(options.operation);
  logGuardDebug(
    `Guard ${formatGuardLabel(options.guard)} evaluating ${operationDescription}`,
    {
      guard: options.guard.name ?? null,
      filter: `${options.guard.filterKind}:${options.guard.filterValue}`,
      target: describeHookTarget(options.node),
      operationType: options.operation.type ?? null,
      operationSubtype: options.operation.subtype ?? null,
      scope: options.scope,
      attempt: options.attempt,
      inputPreview: sanitizePreviewForLog(options.inputPreview)
    }
  );
}

export function logGuardDecisionEvent(options: {
  guard: GuardDefinition;
  node: HookableNode;
  operation: OperationContext;
  scope: GuardScope;
  attempt: number;
  decision: GuardDecisionType;
  reason?: string | null;
  hint?: string | null;
  inputPreview?: string | null;
}): void {
  const reason = options.reason ?? options.hint ?? 'No reason provided';
  const operationDescription = formatOperationDescription(options.operation);
  logGuardDebug(
    `Guard decision: ${options.decision} (${reason}) on ${operationDescription}`,
    {
      guard: options.guard.name ?? null,
      filter: `${options.guard.filterKind}:${options.guard.filterValue}`,
      target: describeHookTarget(options.node),
      operationType: options.operation.type ?? null,
      scope: options.scope,
      attempt: options.attempt,
      hint: options.hint ?? null,
      inputPreview: sanitizePreviewForLog(options.inputPreview)
    }
  );
  if (options.decision === 'retry') {
    logGuardDebug(
      `Guard retry attempt ${options.attempt} for ${formatGuardLabel(options.guard)}`,
      {
        guard: options.guard.name ?? null,
        filter: `${options.guard.filterKind}:${options.guard.filterValue}`,
        operationType: options.operation.type ?? null,
        hint: options.hint ?? null
      }
    );
  }
}

export function logGuardEmitContextDebug(env: Environment, operation: OperationContext): void {
  if (process.env.MLLD_DEBUG_GUARDS !== '1' || operation.name !== 'emit') {
    return;
  }
  try {
    const names = Array.from(env.getAllVariables().keys()).slice(0, 50);
    interpreterLogger.debug('guard-pre debug emit context', {
      parentHasPrefix: env.hasVariable('prefixWith'),
      names
    });
  } catch {
    // ignore debug failures
  }
}

export function logGuardHelperAvailability(
  sourceEnv: Environment,
  guardEnv: Environment,
  guard: GuardDefinition
): void {
  if (process.env.MLLD_DEBUG_GUARDS !== '1' || (guard.name !== 'prep' && guard.name !== 'tagOutput')) {
    return;
  }
  try {
    console.error('[guard-pre-hook] prefixWith availability', {
      envHas: sourceEnv.hasVariable('prefixWith'),
      childHas: guardEnv.hasVariable('prefixWith'),
      envHasEmit: sourceEnv.hasVariable('emit'),
      envHasTag: sourceEnv.hasVariable('tagValue'),
      childHasTag: guardEnv.hasVariable('tagValue')
    });
  } catch {
    // ignore debug
  }
}

export function logGuardDecisionSummary(options: {
  decision: 'allow' | 'deny' | 'retry';
  operation: OperationContext;
  inputs: readonly unknown[] | unknown;
  reasons: readonly string[];
  hints: readonly GuardHint[];
  guardTrace: readonly GuardResult[];
}): void {
  if (process.env.MLLD_DEBUG_GUARDS !== '1') {
    return;
  }

  try {
    const inputPreview = Array.isArray(options.inputs)
      ? options.inputs
          .slice(0, 3)
          .map(entry =>
            isVariable(entry as any)
              ? {
                  name: (entry as any).name,
                  text: (entry as any).value?.text ?? (entry as any).text ?? (entry as any).value,
                  labels: (entry as any).mx?.labels
                }
              : entry
          )
      : options.inputs;

    const payload = {
      decision: options.decision,
      operation: {
        type: options.operation?.type,
        subtype: options.operation?.subtype,
        name: options.operation?.name,
        labels: options.operation?.labels,
        metadata: options.operation?.metadata
      },
      reasons: [...options.reasons],
      hints: options.hints.map(h => (typeof h === 'string' ? h : h?.hint ?? h)),
      guardTrace: options.guardTrace.map(trace => ({
        guard: trace.guard?.name ?? trace.guard?.filterKind,
        decision: trace.decision,
        reason: trace.reason,
        hint: trace.hint
      }))
    };

    console.error('[guard-pre-hook] decision', {
      ...payload,
      inputs: inputPreview
    });
    try {
      appendFileSync('/tmp/mlld_guard_pre.log', JSON.stringify(payload, null, 2) + '\n');
    } catch {
      // ignore file debug failures
    }
  } catch {
    // ignore debug logging failures
  }
}
