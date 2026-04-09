import type { GuardResult } from '@core/types/guard';
import type { OperationContext } from '@interpreter/env/ContextManager';
import type { Environment } from '@interpreter/env/Environment';
import type { HookDecision } from '@interpreter/hooks/HookManager';
import {
  traceAuthCheck,
  traceAuthDecision
} from '@interpreter/tracing/events';

type AuthorizationTraceMetadata = {
  tool: string;
  args: unknown;
  controlArgs: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readAuthorizationTraceMetadata(
  operationContext: OperationContext
): AuthorizationTraceMetadata | null {
  const metadata = operationContext.metadata;
  if (!isRecord(metadata)) {
    return null;
  }

  const trace = metadata.authorizationTrace;
  if (!isRecord(trace) || typeof trace.tool !== 'string' || trace.tool.length === 0) {
    return null;
  }

  return {
    tool: trace.tool,
    args: trace.args,
    controlArgs: Array.isArray(trace.controlArgs)
      ? trace.controlArgs.filter(
          (entry): entry is string => typeof entry === 'string' && entry.length > 0
        )
      : []
  };
}

function getAuthorizationGuardResult(preDecision: HookDecision): GuardResult | null {
  const guardResults = preDecision.metadata?.guardResults;
  if (!Array.isArray(guardResults)) {
    return null;
  }

  const authorizationResults = guardResults.filter(
    (result): result is GuardResult =>
      isRecord(result)
      && (result.decision === 'allow' || result.decision === 'deny')
      && isRecord(result.metadata)
      && result.metadata.authorizationGuard === true
  );

  if (authorizationResults.length === 0) {
    return null;
  }

  return authorizationResults[authorizationResults.length - 1] ?? null;
}

export function emitResolvedAuthorizationTrace(params: {
  env: Environment;
  operationContext: OperationContext;
  preDecision: HookDecision;
}): void {
  const traceMetadata = readAuthorizationTraceMetadata(params.operationContext);
  if (!traceMetadata) {
    return;
  }

  const authorizationResult = getAuthorizationGuardResult(params.preDecision);
  if (!authorizationResult) {
    return;
  }

  if (authorizationResult.decision === 'deny' && params.preDecision.action !== 'abort') {
    return;
  }

  const metadata = isRecord(authorizationResult.metadata)
    ? authorizationResult.metadata
    : {};

  params.env.emitRuntimeTraceEvent(traceAuthCheck({
    tool: traceMetadata.tool,
    args: traceMetadata.args,
    controlArgs: traceMetadata.controlArgs
  }));

  if (authorizationResult.decision === 'allow') {
    params.env.emitRuntimeTraceEvent(traceAuthDecision('allow', {
      tool: traceMetadata.tool,
      matched: metadata.authorizationMatched ?? null,
      code: metadata.authorizationCode ?? null,
      reason: metadata.authorizationReason ?? null,
      matchedAttestationCount: metadata.authorizationMatchedAttestationCount ?? 0
    }));
    return;
  }

  params.env.emitRuntimeTraceEvent(traceAuthDecision('deny', {
    tool: traceMetadata.tool,
    matched: metadata.authorizationMatched ?? null,
    code: metadata.authorizationCode ?? null,
    reason: metadata.authorizationReason ?? authorizationResult.reason ?? null,
    matchedAttestationCount: metadata.authorizationMatchedAttestationCount ?? 0
  }));
}
