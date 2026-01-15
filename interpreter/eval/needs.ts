import type { DirectiveNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { MlldInterpreterError } from '@core/errors';
import {
  normalizeNeedsDeclaration,
  normalizeWantsDeclaration,
  selectWantsTier,
  type NeedsDeclaration
} from '@core/policy/needs';

interface SystemCapabilities {
  keychain: boolean;
  sh: boolean;
  network: boolean;
  filesystem: boolean;
}

function getSystemCapabilities(): SystemCapabilities {
  return {
    keychain: process.platform === 'darwin',
    sh: true,
    network: true,
    filesystem: true
  };
}

function validateNeedsAgainstSystem(needs: NeedsDeclaration): string[] {
  const caps = getSystemCapabilities();
  const unmet: string[] = [];

  if (needs.keychain && !caps.keychain) {
    unmet.push('keychain (requires macOS)');
  }

  return unmet;
}

export async function evaluateNeeds(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  const needsRaw = (directive.values as any)?.needs ?? {};
  const needs = normalizeNeedsDeclaration(needsRaw);

  env.recordModuleNeeds(needs);

  const unmetNeeds = validateNeedsAgainstSystem(needs);
  if (unmetNeeds.length > 0) {
    throw new MlldInterpreterError(
      `Module requires capabilities not available: ${unmetNeeds.join(', ')}`,
      { code: 'NEEDS_UNMET' }
    );
  }

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
  const policyConfig = env.getPolicySummary();
  const match = selectWantsTier(wants, policy, policyConfig);

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
