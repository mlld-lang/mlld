import type { DirectiveNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import {
  normalizeNeedsDeclaration,
  normalizeWantsDeclaration,
  selectWantsTier
} from '@core/policy/needs';

export async function evaluateNeeds(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  const needsRaw = (directive.values as any)?.needs ?? {};
  const needs = normalizeNeedsDeclaration(needsRaw);

  env.recordModuleNeeds(needs);

  return {
    value: undefined,
    env,
    stdout: '',
    stderr: '',
    exitCode: 0
  };
}

export async function evaluateWants(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  const wantsRaw = (directive.values as any)?.wants ?? [];
  const wants = normalizeWantsDeclaration(wantsRaw);

  env.recordModuleWants(wants);

  const policy = env.getPolicyCapabilities();
  const match = selectWantsTier(wants, policy);

  const existingContext = env.getPolicyContext();
  const policyContext = {
    tier: match?.tier ?? null,
    configs: existingContext?.configs ?? {},
    activePolicies: existingContext?.activePolicies ?? [],
    ...(existingContext?.environment ? { environment: existingContext.environment } : {})
  };
  env.setPolicyContext(policyContext);

  return {
    value: match?.tier ?? null,
    env,
    stdout: '',
    stderr: '',
    exitCode: 0
  };
}
