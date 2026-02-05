import type { BaseMlldNode } from '@core/types';
import type { EnvDirectiveNode } from '@core/types/env';
import type { Environment } from '../env/Environment';
import type { EvalResult, EvaluationContext } from '../core/interpreter';
import type { EnvironmentConfig } from '@core/types/environment';
import type { Variable } from '@core/types/variable';
import { evaluate } from '../core/interpreter';
import { MlldDirectiveError } from '@core/errors';
import { normalizeProfilesDeclaration, selectProfile } from '@core/policy/needs';
import { isExecutableVariable } from '@core/types/variable';
import { isVariable, extractVariableValue } from '../utils/variable-resolution';
import { asData, isStructuredValue } from '../utils/structured-value';
import { evaluateExeBlock } from './exe';
import { normalizeMcpConfig, registerMcpToolsFromConfig } from '../mcp/config-spawner';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

async function resolveExpressionValue(
  nodes: BaseMlldNode[],
  env: Environment,
  context?: EvaluationContext
): Promise<unknown> {
  const exprContext = context ? { ...context, isExpression: true } : { isExpression: true };
  const result = await evaluate(nodes, env, exprContext);
  let value = result.value;
  if (isVariable(value)) {
    value = await extractVariableValue(value, env);
  }
  if (isStructuredValue(value)) {
    value = asData(value);
  }
  return value;
}

async function resolveEnvConfig(
  nodes: BaseMlldNode[] | undefined,
  env: Environment,
  context?: EvaluationContext,
  location?: any
): Promise<EnvironmentConfig> {
  if (!nodes || nodes.length === 0) {
    throw new MlldDirectiveError('env config is required.', 'env', {
      location,
      env
    });
  }
  const value = await resolveExpressionValue(nodes, env, context);
  if (!isPlainObject(value)) {
    throw new MlldDirectiveError('env config must be an object.', 'env', {
      location,
      env,
      context: { value }
    });
  }
  return value as EnvironmentConfig;
}

async function resolveToolsValue(
  value: unknown,
  env: Environment,
  context?: EvaluationContext
): Promise<unknown> {
  if (!value || typeof value !== 'object' || !('type' in (value as any))) {
    return value;
  }
  return resolveExpressionValue([value as BaseMlldNode], env, context);
}

function toProfileString(
  value: unknown,
  env: Environment,
  location?: any
): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new MlldDirectiveError('profile must be a string.', 'env', {
      location,
      env,
      context: { value }
    });
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeVariableName(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('@')) {
    return trimmed.slice(1);
  }
  return trimmed;
}

function looksLikeJsonString(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

async function resolveMcpConfigPayload(
  value: unknown,
  env: Environment,
  location?: any
): Promise<Record<string, unknown> | null> {
  if (value === undefined || value === null) {
    return null;
  }

  let resolved = value;
  if (isVariable(resolved)) {
    resolved = await extractVariableValue(resolved, env);
  }
  if (isStructuredValue(resolved)) {
    resolved = asData(resolved);
  }
  if (typeof resolved === 'string') {
    if (!looksLikeJsonString(resolved)) {
      throw new MlldDirectiveError('mcpConfig output is not valid JSON', 'env', {
        location,
        env
      });
    }
    try {
      resolved = JSON.parse(resolved);
    } catch (error) {
      throw new MlldDirectiveError('mcpConfig output is not valid JSON', 'env', {
        location,
        env,
        context: { error: error instanceof Error ? error.message : String(error) }
      });
    }
  }
  if (!isPlainObject(resolved)) {
    throw new MlldDirectiveError('mcpConfig output must be an object', 'env', {
      location,
      env,
      context: { value: resolved }
    });
  }
  return resolved;
}

function findModuleMcpConfigVariables(env: Environment): Variable[] {
  const candidates: Variable[] = [];
  const seen = new Set<Variable>();
  const allVars = env.getAllVariables();

  for (const variable of allVars.values()) {
    const captured = variable.internal?.capturedModuleEnv;
    if (!(captured instanceof Map)) {
      continue;
    }
    const candidate = captured.get('mcpConfig');
    if (!candidate || !isExecutableVariable(candidate)) {
      continue;
    }
    if (!seen.has(candidate)) {
      seen.add(candidate);
      candidates.push(candidate);
    }
  }

  return candidates;
}

function bindTemporaryExecutable(
  env: Environment,
  variable: Variable
): string {
  let attempt = 0;
  let name = '__env_mcp_config';
  while (env.hasVariable(name)) {
    attempt += 1;
    name = `__env_mcp_config_${attempt}`;
  }

  const clone: Variable = {
    ...variable,
    name,
    mx: {
      ...(variable.mx ?? {}),
      name,
      importPath: 'let'
    },
    internal: {
      ...(variable.internal ?? {}),
      importPath: 'let',
      isSystem: true
    }
  };
  env.setVariable(name, clone);
  return name;
}

async function resolveMcpConfigExecutableName(
  envConfig: EnvironmentConfig,
  scopedEnv: Environment,
  env: Environment,
  context: EvaluationContext | undefined,
  location?: any
): Promise<string | null> {
  const configured = (envConfig as any).mcpConfig;
  if (configured !== undefined) {
    const resolvedConfigured = await resolveToolsValue(configured, env, context);
    if (typeof resolvedConfigured === 'string') {
      const name = normalizeVariableName(resolvedConfigured);
      const variable = scopedEnv.getVariable(name);
      if (!variable || !isExecutableVariable(variable)) {
        throw new MlldDirectiveError(`mcpConfig reference '@${name}' is not executable`, 'env', {
          location,
          env
        });
      }
      return name;
    }
    if (isExecutableVariable(resolvedConfigured as any)) {
      return bindTemporaryExecutable(scopedEnv, resolvedConfigured as Variable);
    }
    throw new MlldDirectiveError('mcpConfig must reference an executable or executable variable name', 'env', {
      location,
      env
    });
  }

  const direct = scopedEnv.getVariable('mcpConfig');
  if (direct && isExecutableVariable(direct)) {
    return 'mcpConfig';
  }

  const moduleCandidates = findModuleMcpConfigVariables(scopedEnv);
  if (moduleCandidates.length > 1) {
    throw new MlldDirectiveError(
      'Multiple environment module mcpConfig functions are available. Set env.mcpConfig explicitly.',
      'env',
      { location, env }
    );
  }
  if (moduleCandidates.length === 1) {
    return bindTemporaryExecutable(scopedEnv, moduleCandidates[0]);
  }

  return null;
}

async function invokeMcpConfig(
  executableName: string,
  env: Environment,
  location?: any
): Promise<unknown> {
  const { evaluateExecInvocation } = await import('./exec-invocation');
  const invocation = {
    type: 'ExecInvocation',
    nodeId: 'env-mcp-config',
    location: location ?? null,
    commandRef: {
      type: 'CommandReference',
      nodeId: 'env-mcp-config-ref',
      location: location ?? null,
      identifier: executableName,
      name: executableName,
      args: []
    }
  } as any;

  const result = await evaluateExecInvocation(invocation, env);
  return result.value;
}

async function applyMcpConfigForEnv(
  envConfig: EnvironmentConfig,
  scopedEnv: Environment,
  env: Environment,
  context: EvaluationContext | undefined,
  location?: any
): Promise<void> {
  const executableName = await resolveMcpConfigExecutableName(envConfig, scopedEnv, env, context, location);
  if (!executableName) {
    return;
  }

  const resultValue = await invokeMcpConfig(executableName, scopedEnv, location);
  const payload = await resolveMcpConfigPayload(resultValue, scopedEnv, location);
  if (!payload) {
    return;
  }

  let normalized;
  try {
    normalized = normalizeMcpConfig(payload);
  } catch (error) {
    throw new MlldDirectiveError(
      error instanceof Error ? error.message : 'Invalid mcpConfig output',
      'env',
      { location, env }
    );
  }

  try {
    await registerMcpToolsFromConfig(scopedEnv, normalized);
  } catch (error) {
    throw new MlldDirectiveError(
      error instanceof Error ? error.message : 'Failed to configure MCP tools for env',
      'env',
      { location, env }
    );
  }
}

function resolveProfileFromConfig(
  envConfig: EnvironmentConfig,
  env: Environment,
  location?: any
): string | null | undefined {
  const explicitProfileRaw = (envConfig as any).profile;
  const profilesRaw = (envConfig as any).profiles;
  const profiles = normalizeProfilesDeclaration(profilesRaw);
  const profileNames = Object.keys(profiles);

  if (explicitProfileRaw !== undefined) {
    const explicitProfile = toProfileString(explicitProfileRaw, env, location);
    if (explicitProfile && profileNames.length > 0 && !profiles[explicitProfile]) {
      throw new MlldDirectiveError(`Unknown profile '${explicitProfile}' for env config.`, 'env', {
        location,
        env,
        context: { availableProfiles: profileNames }
      });
    }
    return explicitProfile;
  }

  if (profileNames.length === 0) {
    return undefined;
  }

  const match = selectProfile(profiles, env.getPolicyCapabilities(), env.getPolicySummary());
  const fallback = profileNames[profileNames.length - 1] ?? null;
  return match?.name ?? fallback;
}

function normalizeToolScope(
  value: unknown,
  env: Environment,
  location?: any
): { tools?: string[]; hasTools: boolean } {
  if (value === undefined) {
    return { hasTools: false };
  }
  if (value === null) {
    throw new MlldDirectiveError('tools must be an array or object.', 'env', {
      location,
      env
    });
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '*') {
      return { hasTools: false };
    }
    const parts = trimmed.length > 0
      ? trimmed.split(',').map(part => part.trim()).filter(Boolean)
      : [];
    return { tools: parts, hasTools: true };
  }
  if (Array.isArray(value)) {
    const tools: string[] = [];
    for (const entry of value) {
      if (typeof entry !== 'string') {
        throw new MlldDirectiveError('tools entries must be strings.', 'env', {
          location,
          env,
          context: { entry }
        });
      }
      const trimmed = entry.trim();
      if (trimmed.length > 0) {
        tools.push(trimmed);
      }
    }
    return { tools, hasTools: true };
  }
  if (isPlainObject(value)) {
    return { tools: Object.keys(value), hasTools: true };
  }
  throw new MlldDirectiveError('tools must be an array or object.', 'env', {
    location,
    env,
    context: { value }
  });
}

export async function evaluateEnv(
  directive: EnvDirectiveNode,
  env: Environment,
  context?: EvaluationContext
): Promise<EvalResult> {
  const config = await resolveEnvConfig(directive.values?.config, env, context, directive.location);
  const withClauseTools = directive.values?.withClause?.tools;
  const withClauseProfile = (directive.values?.withClause as any)?.profile;
  const resolvedTools =
    withClauseTools !== undefined
      ? await resolveToolsValue(withClauseTools, env, context)
      : config.tools;
  const resolvedProfileOverride =
    withClauseProfile !== undefined
      ? await resolveToolsValue(withClauseProfile, env, context)
      : undefined;

  const mergedConfig =
    withClauseTools !== undefined || withClauseProfile !== undefined
      ? {
          ...config,
          ...(withClauseTools !== undefined ? { tools: resolvedTools } : {}),
          ...(withClauseProfile !== undefined ? { profile: resolvedProfileOverride } : {})
        }
      : config;

  const scopedEnv = env.createChild();
  scopedEnv.setScopedEnvironmentConfig(mergedConfig);

  const toolScope = normalizeToolScope(resolvedTools, env, directive.location);
  if (toolScope.hasTools) {
    scopedEnv.setAllowedTools(toolScope.tools);
  }

  const block = directive.values?.block;
  if (!block) {
    return { value: undefined, env };
  }

  const contextManager = env.getContextManager();
  const previousProfile = contextManager.getProfile();
  let nextProfile: string | null | undefined;
  try {
    nextProfile = resolveProfileFromConfig(mergedConfig, env, directive.location);
  } catch (error) {
    if (error instanceof MlldDirectiveError) {
      throw error;
    }
    throw new MlldDirectiveError(
      error instanceof Error ? error.message : 'Failed to resolve env profile',
      'env',
      { location: directive.location, env }
    );
  }

  if (nextProfile !== undefined) {
    contextManager.setProfile(nextProfile);
  }

  try {
    await applyMcpConfigForEnv(mergedConfig, scopedEnv, env, context, directive.location);
    const result = await evaluateExeBlock(block, scopedEnv, {}, { scope: 'block' });
    env.mergeChild(scopedEnv);
    return { value: result.value, env };
  } finally {
    contextManager.setProfile(previousProfile);
  }
}
