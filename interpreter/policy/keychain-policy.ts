import minimatch from 'minimatch';
import type { Environment } from '@interpreter/env/Environment';
import type { SourceLocation } from '@core/types';
import type { PolicyKeychainConfig } from '@core/policy/union';
import { MlldInterpreterError, MlldSecurityError } from '@core/errors';
import { isDangerAllowedForKeychain, normalizeDangerEntries } from '@core/policy/danger';
import { isValidProjectName } from '@core/utils/project-name';

export type KeychainAction = 'get' | 'set' | 'delete';

export type KeychainAccess = {
  service: string;
  account: string;
  action?: KeychainAction;
};

export function enforceKeychainAccess(
  env: Environment,
  access?: KeychainAccess,
  sourceLocation?: SourceLocation
): void {
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
      env,
      sourceLocation
    });
  }

  if (!access) {
    return;
  }

  const config = policy.keychain;
  if (!config) {
    return;
  }

  const target = `${access.service}/${access.account}`;
  const allowPatterns = expandKeychainPatterns(config.allow, projectName);
  const denyPatterns = expandKeychainPatterns(config.deny, projectName);

  if (allowPatterns !== undefined && !matchesKeychainPatterns(target, allowPatterns)) {
    throw new MlldSecurityError('Keychain access denied by policy', {
      code: 'POLICY_CAPABILITY_DENIED',
      env,
      sourceLocation
    });
  }

  if (denyPatterns && matchesKeychainPatterns(target, denyPatterns)) {
    throw new MlldSecurityError('Keychain access denied by policy', {
      code: 'POLICY_CAPABILITY_DENIED',
      env,
      sourceLocation
    });
  }
}

function expandKeychainPatterns(
  patterns: PolicyKeychainConfig['allow'] | PolicyKeychainConfig['deny'],
  projectName: string
): string[] | undefined {
  if (patterns === undefined) {
    return undefined;
  }
  return patterns.map(pattern => expandProjectName(pattern, projectName)).filter(Boolean);
}

function expandProjectName(pattern: string, projectName: string): string {
  if (!pattern) {
    return '';
  }
  return pattern.split('{projectname}').join(projectName);
}

function matchesKeychainPatterns(target: string, patterns: string[]): boolean {
  if (patterns.length === 0) {
    return false;
  }
  return patterns.some(pattern => {
    const trimmed = pattern.trim();
    if (!trimmed) {
      return false;
    }
    if (trimmed === '*' || trimmed === '**') {
      return true;
    }
    return minimatch(target, trimmed, { dot: true });
  });
}
