import type { DirectiveNode, ExecInvocation } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import type { Variable, VariableSource } from '@core/types/variable';
import { createSimpleTextVariable } from '@core/types/variable';
import { materializeExpressionValue } from '@core/types/provenance/ExpressionProvenance';
import { isVariable } from '../utils/variable-resolution';

interface ReplayEntry {
  result: EvalResult;
  guardVariable?: Variable;
}

const INLINE_SOURCE: VariableSource = {
  directive: 'var',
  syntax: 'expression',
  hasInterpolation: false,
  isMultiLine: false
};

const replayStore = new WeakMap<DirectiveNode, Map<ExecInvocation, ReplayEntry>>();

function getReplayState(directive: DirectiveNode): Map<ExecInvocation, ReplayEntry> {
  let state = replayStore.get(directive);
  if (!state) {
    state = new Map();
    replayStore.set(directive, state);
  }
  return state;
}

async function ensureReplayEntry(
  directive: DirectiveNode,
  env: Environment,
  invocation: ExecInvocation
): Promise<ReplayEntry> {
  const state = getReplayState(directive);
  const existing = state.get(invocation);
  if (existing) {
    return existing;
  }
  const { evaluateExecInvocation } = await import('./exec-invocation');
  const result = await evaluateExecInvocation(invocation, env);
  const entry: ReplayEntry = { result };
  state.set(invocation, entry);
  return entry;
}

function materializeGuardVariable(value: unknown): Variable | undefined {
  if (isVariable(value)) {
    return value;
  }
  const fromProvenance = materializeExpressionValue(value, { name: '__inline_exec__' });
  if (fromProvenance) {
    return fromProvenance;
  }
  if (value && typeof value === 'object') {
    const metadataSecurity = (value as { metadata?: { security?: unknown } }).metadata?.security;
    if (metadataSecurity) {
      const textValue =
        typeof (value as { text?: unknown }).text === 'string'
          ? ((value as { text?: string }).text as string)
          : typeof (value as { data?: unknown }).data === 'string'
            ? ((value as { data?: string }).data as string)
            : String((value as { data?: unknown }).data ?? value);
      return createSimpleTextVariable('__inline_exec__', textValue, INLINE_SOURCE, {
        security: metadataSecurity
      });
    }
  }
  return undefined;
}

export async function replayInlineExecInvocations(
  directive: DirectiveNode,
  env: Environment,
  invocations: readonly ExecInvocation[]
): Promise<Variable[]> {
  if (!invocations || invocations.length === 0) {
    return [];
  }

  const guardVariables: Variable[] = [];
  const unique = Array.from(new Set(invocations));
  for (const invocation of unique) {
    if (!invocation) {
      continue;
    }
    const entry = await ensureReplayEntry(directive, env, invocation);
    if (!entry.guardVariable) {
      entry.guardVariable = materializeGuardVariable(entry.result.value);
    }
    if (entry.guardVariable) {
      guardVariables.push(entry.guardVariable);
    }
  }

  return guardVariables;
}

export async function resolveDirectiveExecInvocation(
  directive: DirectiveNode,
  env: Environment,
  invocation: ExecInvocation
): Promise<EvalResult> {
  const entry = await ensureReplayEntry(directive, env, invocation);
  return entry.result;
}

export function clearDirectiveReplay(directive: DirectiveNode): void {
  replayStore.delete(directive);
}
