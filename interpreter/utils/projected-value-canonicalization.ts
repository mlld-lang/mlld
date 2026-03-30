import type { Environment } from '@interpreter/env/Environment';
import { resolveValueHandles } from '@interpreter/utils/handle-resolution';

export interface ProjectedValueCanonicalizationOptions {
  sessionId?: string | null | undefined;
  matchScope?: 'session' | 'global';
  collapseEquivalentMatches?: boolean;
}

export async function canonicalizeProjectedValue(
  value: unknown,
  env: Environment,
  _options: ProjectedValueCanonicalizationOptions = {}
): Promise<unknown> {
  return resolveValueHandles(value, env);
}
