import type { Environment } from '@interpreter/env/Environment';
import { MlldInterpreterError, MlldSecurityError } from '@core/errors';
import { isDangerAllowedForKeychain, normalizeDangerEntries } from '@core/policy/danger';
import { isValidProjectName } from '@core/utils/project-name';

export function enforceKeychainAccess(env: Environment): void {
  const projectName = env.getProjectConfig()?.getProjectName();
  if (!projectName || !isValidProjectName(projectName)) {
    throw new MlldInterpreterError(
      'Keychain access requires projectname in mlld-config.json. Run mlld init or add projectname: "value" to mlld-config.json.',
      { code: 'PROJECT_NAME_REQUIRED' }
    );
  }
  const policy = env.getPolicySummary();
  if (!policy) {
    return;
  }

  const dangerEntries = normalizeDangerEntries(policy.danger ?? policy.capabilities?.danger);
  if (!isDangerAllowedForKeychain(dangerEntries)) {
    throw new MlldSecurityError('Dangerous capability requires allow.danger', {
      code: 'POLICY_CAPABILITY_DENIED',
      env
    });
  }
}
