import type { WithClause } from '@core/types';
import type { AuthConfig, PolicyConfig } from '@core/policy/union';
import type { Environment } from '@interpreter/env/Environment';
import { MlldInterpreterError } from '@core/errors';
import { getKeychainProvider } from '@core/resolvers/builtin/KeychainResolver';
import { coerceValueForStdin } from '@interpreter/utils/shell-value';
import { extractVariableValue } from '@interpreter/utils/variable-resolution';

type UsingConfig = { var?: unknown; as?: unknown };

export async function resolveUsingEnv(
  env: Environment,
  ...withClauses: Array<WithClause | undefined>
): Promise<Record<string, string>> {
  const envVars: Record<string, string> = {};

  for (const withClause of withClauses) {
    if (!withClause) {
      continue;
    }

    if (withClause.auth !== undefined) {
      const authName = normalizeAuthName(withClause.auth);
      const authConfig = getAuthConfig(env.getPolicySummary(), authName);
      const authValue = await resolveAuthValue(authConfig.from, env);
      envVars[authConfig.as] = authValue;
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
      const value = await extractVariableValue(variable, env);
      envVars[envName] = coerceValueForStdin(value);
    }
  }

  return envVars;
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

function getAuthConfig(policy: PolicyConfig | undefined, name: string): AuthConfig {
  const authConfig = policy?.auth?.[name];
  if (!authConfig) {
    throw new MlldInterpreterError(`Auth config '${name}' is not defined in policy`, {
      code: 'AUTH_NOT_CONFIGURED'
    });
  }
  if (!authConfig.from || !authConfig.as) {
    throw new MlldInterpreterError(`Auth config '${name}' is missing 'from' or 'as'`, {
      code: 'AUTH_CONFIG_INVALID'
    });
  }
  return authConfig;
}

async function resolveAuthValue(source: string, env: Environment): Promise<string> {
  if (source.startsWith('keychain:')) {
    const path = source.slice('keychain:'.length);
    const [service, ...rest] = path.split('/');
    const account = rest.join('/');
    if (!service || !account) {
      throw new MlldInterpreterError(`Invalid keychain path '${source}'`, {
        code: 'KEYCHAIN_PATH_INVALID'
      });
    }
    const needs = env.getModuleNeeds();
    if (!needs?.keychain) {
      throw new MlldInterpreterError(
        'Keychain access requires /needs { keychain } declaration.',
        { code: 'NEEDS_UNMET' }
      );
    }
    const provider = getKeychainProvider();
    const value = await provider.get(service, account);
    if (value === null || value === undefined) {
      throw new MlldInterpreterError(`Keychain entry '${service}/${account}' not found`, {
        code: 'KEYCHAIN_ENTRY_MISSING'
      });
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

  throw new MlldInterpreterError(`Unsupported auth source '${source}'`, {
    code: 'AUTH_SOURCE_INVALID'
  });
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
