import type { DirectiveNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { normalizeProfilesDeclaration, selectProfile } from '@core/policy/needs';

export async function evaluateProfiles(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  const profilesRaw = (directive.values as any)?.profiles ?? {};
  const profiles = normalizeProfilesDeclaration(profilesRaw);

  env.recordModuleProfiles(profiles);

  const policy = env.getPolicyCapabilities();
  const policyConfig = env.getPolicySummary();
  const match = selectProfile(profiles, policy, policyConfig);
  const fallback = Object.keys(profiles).pop() ?? null;
  const selected = match?.name ?? fallback;

  env.getContextManager().setProfile(selected);

  return {
    value: selected,
    env,
    stdout: '',
    stderr: '',
    exitCode: 0
  };
}
