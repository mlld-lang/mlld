import type { WithClause } from '@core/types';
import type { AuthConfig } from '@core/policy/union';
import type { Environment } from '@interpreter/env/Environment';
import { MlldInterpreterError } from '@core/errors';
import { getKeychainProvider } from '@core/resolvers/builtin/KeychainResolver';
import { makeSecurityDescriptor, mergeDescriptors, type SecurityDescriptor } from '@core/types/security';
import { coerceValueForStdin } from '@interpreter/utils/shell-value';
import { extractSecurityDescriptor } from '@interpreter/utils/structured-value';
import { extractVariableValue } from '@interpreter/utils/variable-resolution';
import { enforceKeychainAccess, requireKeychainProjectName } from '@interpreter/policy/keychain-policy';

type UsingConfig = { var?: unknown; as?: unknown };

export type AuthBindingSource = 'policy' | 'standalone';

export type AuthBinding = AuthConfig & {
  source: AuthBindingSource;
};

export type AuthResolutionOptions = {
  capturedAuthBindings?: Record<string, AuthBinding | AuthConfig>;
};

export type UsingEnvParts = {
  vars: Record<string, string>;
  secrets: Record<string, string>;
  merged: Record<string, string>;
  descriptor?: SecurityDescriptor;
};

export async function resolveUsingEnv(
  env: Environment,
  ...withClauses: Array<WithClause | undefined>
): Promise<Record<string, string>> {
  const parts = await resolveUsingEnvPartsWithOptions(env, undefined, ...withClauses);
  return parts.merged;
}

export async function resolveUsingEnvParts(
  env: Environment,
  ...withClauses: Array<WithClause | undefined>
): Promise<UsingEnvParts> {
  return resolveUsingEnvPartsWithOptions(env, undefined, ...withClauses);
}

export async function resolveUsingEnvPartsWithOptions(
  env: Environment,
  options: AuthResolutionOptions | undefined,
  ...withClauses: Array<WithClause | undefined>
): Promise<UsingEnvParts> {
  const vars: Record<string, string> = {};
  const secrets: Record<string, string> = {};
  const merged: Record<string, string> = {};
  let descriptor: SecurityDescriptor | undefined;

  const mergeDescriptor = (next?: SecurityDescriptor): void => {
    if (!next) {
      return;
    }
    descriptor = descriptor ? mergeDescriptors(descriptor, next) : next;
  };

  for (const withClause of withClauses) {
    if (!withClause) {
      continue;
    }

    if (withClause.auth !== undefined) {
      const authSecrets = await resolveAuthSecrets(env, withClause.auth, options);
      for (const [key, value] of Object.entries(authSecrets)) {
        secrets[key] = value;
        merged[key] = value;
      }
      mergeDescriptor(buildAuthDescriptor(withClause.auth));
    }

    if ((withClause as { using?: UsingConfig }).using) {
      const using = (withClause as { using?: UsingConfig }).using as UsingConfig;
      const envName = normalizeEnvName(using.as);
      const varName = normalizeUsingVarName(using.var);
      const variable = env.getVariable(varName);
      if (!variable) {
        throw new MlldInterpreterError(`Variable not found: ${varName}`, {
          code: 'USING_VARIABLE_NOT_FOUND'
        });
      }
      mergeDescriptor(extractSecurityDescriptor(variable, { recursive: true, mergeArrayElements: true }));
      const value = await extractVariableValue(variable, env);
      const coerced = coerceValueForStdin(value);
      vars[envName] = coerced;
      merged[envName] = coerced;
    }
  }

  return { vars, secrets, merged, descriptor };
}

export function buildAuthDescriptor(auth: unknown): SecurityDescriptor | undefined {
  if (auth === undefined || auth === null) {
    return undefined;
  }
  const entries = Array.isArray(auth) ? auth : [auth];
  if (entries.length === 0) {
    return undefined;
  }
  const sources = entries.map(entry => `auth:${normalizeAuthName(entry)}`);
  return makeSecurityDescriptor({
    labels: ['secret'],
    sources
  });
}

export async function resolveAuthSecrets(
  env: Environment,
  auth: unknown,
  options?: AuthResolutionOptions
): Promise<Record<string, string>> {
  if (auth === undefined || auth === null) {
    return {};
  }
  const authNames = Array.isArray(auth) ? auth : [auth];
  const secrets: Record<string, string> = {};
  for (const entry of authNames) {
    const authName = normalizeAuthName(entry);
    const authConfig = getAuthConfig(env, authName, options);
    const authValue = await resolveAuthValue(authConfig, env);
    secrets[authConfig.as] = authValue;
  }
  return secrets;
}

function normalizeAuthName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new MlldInterpreterError('Auth name must be a string', {
      code: 'INVALID_AUTH_NAME'
    });
  }
  const name = value.trim();
  if (!name) {
    throw new MlldInterpreterError('Auth name is required', {
      code: 'INVALID_AUTH_NAME'
    });
  }
  return name;
}

export function captureAuthBindings(
  env: Environment
): Record<string, AuthBinding> | undefined {
  const bindings = resolveAvailableAuthBindings(env);
  return Object.keys(bindings).length > 0 ? bindings : undefined;
}

function getAuthConfig(
  env: Environment,
  name: string,
  options?: AuthResolutionOptions
): AuthBinding {
  const authConfig = resolveAvailableAuthBindings(env, options)[name];
  if (!authConfig) {
    throw new MlldInterpreterError(
      `Auth config '${name}' is not defined. Declare auth @${name} = ... or policy.auth.${name}.`,
      {
        code: 'AUTH_NOT_CONFIGURED'
      }
    );
  }
  if (!authConfig.from || !authConfig.as) {
    throw new MlldInterpreterError(`Auth config '${name}' is missing 'from' or 'as'`, {
      code: 'AUTH_CONFIG_INVALID'
    });
  }
  return authConfig;
}

function resolveAvailableAuthBindings(
  env: Environment,
  options?: AuthResolutionOptions
): Record<string, AuthBinding> {
  const bindings: Record<string, AuthBinding> = {};
  const captured = options?.capturedAuthBindings;
  if (captured && typeof captured === 'object') {
    for (const [name, config] of Object.entries(captured)) {
      const normalized = toAuthBinding(config);
      if (normalized) {
        bindings[name] = normalized;
      }
    }
  }

  const policy = env.getPolicySummary();
  if (policy?.auth && typeof policy.auth === 'object') {
    for (const [name, config] of Object.entries(policy.auth)) {
      if (isAuthConfig(config)) {
        bindings[name] = { ...config, source: 'policy' };
      }
    }
  }

  const standalone = env.getStandaloneAuthSummary();
  if (standalone && typeof standalone === 'object') {
    for (const [name, config] of Object.entries(standalone)) {
      if (isAuthConfig(config)) {
        bindings[name] = { ...config, source: 'standalone' };
      }
    }
  }

  return bindings;
}

function isAuthConfig(value: unknown): value is AuthConfig {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as { from?: unknown }).from === 'string' &&
      typeof (value as { as?: unknown }).as === 'string'
  );
}

function toAuthBinding(value: unknown): AuthBinding | undefined {
  if (!isAuthConfig(value)) {
    return undefined;
  }
  const source = (value as { source?: unknown }).source;
  return {
    from: value.from,
    as: value.as,
    source: source === 'standalone' ? 'standalone' : 'policy'
  };
}

async function resolveAuthValue(config: AuthBinding, env: Environment): Promise<string> {
  const source = config.from;
  const envVarName = config.as;

  if (source.startsWith('keychain:')) {
    const path = source.slice('keychain:'.length);
    const projectName = requireKeychainProjectName(env);
    const expandedPath = expandProjectName(path, projectName);
    const [service, ...rest] = expandedPath.split('/');
    const account = rest.join('/');
    if (!service || !account) {
      throw new MlldInterpreterError(`Invalid keychain path '${source}'`, {
        code: 'KEYCHAIN_PATH_INVALID'
      });
    }
    enforceKeychainAccess(
      env,
      { service, account, action: 'get' },
      undefined,
      { requireDanger: config.source !== 'standalone' }
    );
    let value: string | null | undefined;
    try {
      const provider = getKeychainProvider();
      value = await provider.get(service, account);
    } catch {
      value = undefined;
    }
    if (value === null || value === undefined) {
      const fallback = process.env[envVarName];
      if (fallback !== undefined) {
        return fallback;
      }
      throw new MlldInterpreterError(
        `Keychain entry '${service}/${account}' not found and environment variable '${envVarName}' is not set`,
        {
          code: 'KEYCHAIN_ENTRY_MISSING'
        }
      );
    }
    return value;
  }

  if (source.startsWith('env:')) {
    const varName = source.slice('env:'.length).trim();
    if (!varName) {
      throw new MlldInterpreterError('Env auth source requires a variable name', {
        code: 'ENV_AUTH_INVALID'
      });
    }
    const value = process.env[varName];
    if (value === undefined) {
      throw new MlldInterpreterError(`Environment variable '${varName}' is not set`, {
        code: 'ENV_AUTH_MISSING'
      });
    }
    return value;
  }

  const providerMatch = source.match(/^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)/);
  if (providerMatch) {
    throw new MlldInterpreterError(`unsupported auth provider: ${providerMatch[1]}`, {
      code: 'AUTH_SOURCE_INVALID'
    });
  }

  throw new MlldInterpreterError(`Unsupported auth source '${source}'`, {
    code: 'AUTH_SOURCE_INVALID'
  });
}

function expandProjectName(path: string, projectName: string): string {
  if (!path) {
    return '';
  }
  return path.split('{projectname}').join(projectName);
}

function normalizeEnvName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new MlldInterpreterError('Env var name must be a string', {
      code: 'INVALID_ENV_NAME'
    });
  }
  const name = value.trim();
  if (!name) {
    throw new MlldInterpreterError('Env var name is required', {
      code: 'INVALID_ENV_NAME'
    });
  }
  return name;
}

function normalizeUsingVarName(value: unknown): string {
  let name: string | undefined;
  if (typeof value === 'string') {
    name = value;
  } else if (value && typeof value === 'object' && 'identifier' in value) {
    const candidate = (value as { identifier?: unknown }).identifier;
    if (typeof candidate === 'string') {
      name = candidate;
    }
  }

  if (!name) {
    throw new MlldInterpreterError('using.var must be a variable name', {
      code: 'INVALID_USING_VAR'
    });
  }

  const normalized = name.startsWith('@') ? name.slice(1) : name;
  if (!normalized) {
    throw new MlldInterpreterError('using.var must be a variable name', {
      code: 'INVALID_USING_VAR'
    });
  }
  return normalized;
}
