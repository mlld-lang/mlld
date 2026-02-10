import type { ExecInvocation, WithClause } from '@core/types';
import type { OperationContext } from '@interpreter/env/ContextManager';
import type { ShadowEnvironmentCapture } from '@interpreter/env/types/ShadowEnvironmentCapture';

export function buildExecOperationPreview(node: ExecInvocation): OperationContext | undefined {
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

export function resolveOpTypeFromLanguage(
  language?: string
): 'sh' | 'node' | 'js' | 'py' | 'prose' | null {
  if (!language) {
    return null;
  }
  const normalized = language.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === 'bash' || normalized === 'sh' || normalized === 'shell') {
    return 'sh';
  }
  if (normalized === 'node' || normalized === 'nodejs') {
    return 'node';
  }
  if (normalized === 'js' || normalized === 'javascript') {
    return 'js';
  }
  if (normalized === 'py' || normalized === 'python') {
    return 'py';
  }
  if (normalized === 'prose') {
    return 'prose';
  }
  return null;
}

export function mergeAuthUsingIntoWithClause(
  base?: WithClause,
  override?: WithClause
): WithClause | undefined {
  const auth = override?.auth ?? base?.auth;
  const using = override?.using ?? base?.using;
  if (!auth && !using) {
    return base;
  }
  const merged: WithClause = base ? { ...base } : {};
  if (auth) {
    merged.auth = auth;
  }
  if (using) {
    merged.using = using;
  }
  return merged;
}

export function deserializeShadowEnvs(envs: unknown): ShadowEnvironmentCapture {
  const result: ShadowEnvironmentCapture = {};

  if (!envs || typeof envs !== 'object') {
    return result;
  }

  for (const [lang, shadowObj] of Object.entries(envs)) {
    if (!shadowObj || typeof shadowObj !== 'object') {
      continue;
    }
    const map = new Map<string, unknown>();
    for (const [name, func] of Object.entries(shadowObj)) {
      map.set(name, func);
    }
    result[lang as keyof ShadowEnvironmentCapture] = map;
  }

  return result;
}
