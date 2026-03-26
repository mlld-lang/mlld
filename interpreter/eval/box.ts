import type { BaseMlldNode } from '@core/types';
import type { BoxDirectiveNode } from '@core/types/box';
import type { Environment } from '../env/Environment';
import type { EvalResult, EvaluationContext } from '../core/interpreter';
import type { EnvironmentConfig } from '@core/types/environment';
import type { Variable } from '@core/types/variable';
import type { WorkspaceValue } from '@core/types/workspace';
import { isWorkspaceValue } from '@core/types/workspace';
import { evaluate } from '../core/interpreter';
import { MlldDirectiveError, MlldSecurityError } from '@core/errors';
import { normalizeProfilesDeclaration, selectProfile } from '@core/policy/needs';
import { isExecutableVariable } from '@core/types/variable';
import { isVariable, extractVariableValue } from '../utils/variable-resolution';
import { asData, isStructuredValue } from '../utils/structured-value';
import { evaluateExeBlock } from './exe';
import { normalizeMcpConfig, registerMcpToolsFromConfig } from '../mcp/config-spawner';
import { VirtualFS } from '@services/fs/VirtualFS';
import { applyEnvironmentDefaults } from '@interpreter/env/environment-provider';
import { resolveFyiConfig } from '@interpreter/fyi/config';
import {
  createPolicyAuthorizationValidationError,
  validateRuntimePolicyAuthorizations
} from './exec/policy-fragment';

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

async function resolveBoxConfig(
  nodes: BaseMlldNode[] | undefined,
  env: Environment,
  context?: EvaluationContext,
  location?: any
): Promise<{
  config: EnvironmentConfig;
  workspace?: WorkspaceValue;
  hasConfigExpression: boolean;
}> {
  if (!nodes || nodes.length === 0) {
    return {
      config: {},
      hasConfigExpression: false
    };
  }

  const value = await resolveExpressionValue(nodes, env, context);
  if (isWorkspaceValue(value)) {
    return {
      config: {},
      workspace: value,
      hasConfigExpression: true
    };
  }
  if (!isPlainObject(value)) {
    throw new MlldDirectiveError('box config must be an object.', 'box', {
      location,
      env,
      context: { value }
    });
  }

  const config: EnvironmentConfig = { ...(value as EnvironmentConfig) };
  let workspace: WorkspaceValue | undefined;
  if ((config as any).fs !== undefined) {
    const resolvedFs = await resolveRuntimeValue((config as any).fs, env);
    if (isWorkspaceValue(resolvedFs)) {
      workspace = resolvedFs;
      // Keep provider config payload serializable and avoid leaking runtime-only fs objects.
      delete (config as any).fs;
    }
  }

  return {
    config,
    workspace,
    hasConfigExpression: true
  };
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

async function resolveRuntimeValue(value: unknown, env: Environment): Promise<unknown> {
  let resolved = value;
  if (isVariable(resolved)) {
    resolved = await extractVariableValue(resolved, env);
  }
  if (isStructuredValue(resolved)) {
    resolved = asData(resolved);
  }
  return resolved;
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
    throw new MlldDirectiveError('profile must be a string.', 'box', {
      location,
      env,
      context: { value }
    });
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toDisplayMode(
  value: unknown,
  env: Environment,
  location?: any
): 'strict' | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new MlldDirectiveError('display must be "strict".', 'box', {
      location,
      env,
      context: { value }
    });
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized === 'strict') {
    return 'strict';
  }

  throw new MlldDirectiveError('display must be "strict".', 'box', {
    location,
    env,
    context: { value }
  });
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
      throw new MlldDirectiveError('mcpConfig output is not valid JSON', 'box', {
        location,
        env
      });
    }
    try {
      resolved = JSON.parse(resolved);
    } catch (error) {
      throw new MlldDirectiveError('mcpConfig output is not valid JSON', 'box', {
        location,
        env,
        context: { error: error instanceof Error ? error.message : String(error) }
      });
    }
  }
  if (!isPlainObject(resolved)) {
    throw new MlldDirectiveError('mcpConfig output must be an object', 'box', {
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
  let name = '__box_mcp_config';
  while (env.hasVariable(name)) {
    attempt += 1;
    name = `__box_mcp_config_${attempt}`;
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
        throw new MlldDirectiveError(`mcpConfig reference '@${name}' is not executable`, 'box', {
          location,
          env
        });
      }
      return name;
    }
    if (isExecutableVariable(resolvedConfigured as any)) {
      return bindTemporaryExecutable(scopedEnv, resolvedConfigured as Variable);
    }
    throw new MlldDirectiveError('mcpConfig must reference an executable or executable variable name', 'box', {
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
      'Multiple environment module mcpConfig functions are available. Set box.mcpConfig explicitly.',
      'box',
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
    nodeId: 'box-mcp-config',
    location: location ?? null,
    commandRef: {
      type: 'CommandReference',
      nodeId: 'box-mcp-config-ref',
      location: location ?? null,
      identifier: executableName,
      name: executableName,
      args: []
    }
  } as any;

  const result = await evaluateExecInvocation(invocation, env);
  return result.value;
}

async function applyMcpConfigForBox(
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
      'box',
      { location, env }
    );
  }

  try {
    const configuredTools = await registerMcpToolsFromConfig(scopedEnv, normalized);
    const allowed: string[] = [];
    const denied: string[] = [];
    for (const toolName of configuredTools) {
      if (scopedEnv.isToolAllowed(toolName)) {
        allowed.push(toolName);
      } else {
        denied.push(toolName);
      }
    }
    scopedEnv.setToolsAvailability(allowed, denied);
  } catch (error) {
    throw new MlldDirectiveError(
      error instanceof Error ? error.message : 'Failed to configure MCP tools for box',
      'box',
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
      throw new MlldDirectiveError(`Unknown profile '${explicitProfile}' for box config.`, 'box', {
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
    throw new MlldDirectiveError('tools must be an array or object.', 'box', {
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
        throw new MlldDirectiveError('tools entries must be strings.', 'box', {
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
  throw new MlldDirectiveError('tools must be an array or object.', 'box', {
    location,
    env,
    context: { value }
  });
}

function looksLikeMcpPath(value: string): boolean {
  if (value.startsWith('.') || value.startsWith('/')) {
    return true;
  }
  return /\.(mld|mlld|md|mld\.md|mlld\.md)$/.test(value);
}

function normalizeStringArray(
  value: unknown,
  label: string,
  env: Environment,
  location?: any
): string[] {
  if (!Array.isArray(value)) {
    throw new MlldDirectiveError(`${label} must be an array of strings.`, 'box', {
      location,
      env,
      context: { value }
    });
  }
  const normalized: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') {
      throw new MlldDirectiveError(`${label} entries must be strings.`, 'box', {
        location,
        env,
        context: { entry }
      });
    }
    const trimmed = entry.trim();
    if (trimmed.length > 0) {
      normalized.push(trimmed);
    }
  }
  return normalized;
}

function resolveMcpEntrySpec(entry: Record<string, unknown>, env: Environment, location?: any): string {
  const module = typeof entry.module === 'string' ? entry.module.trim() : '';
  const command = typeof entry.command === 'string' ? entry.command.trim() : '';
  const npm = typeof entry.npm === 'string' ? entry.npm.trim() : '';
  const sourceCount = [module, command, npm].filter(Boolean).length;
  if (sourceCount === 0) {
    throw new MlldDirectiveError(
      'mcps entries must define one of module, command, or npm.',
      'box',
      { location, env, context: { entry } }
    );
  }
  if (sourceCount > 1) {
    throw new MlldDirectiveError(
      'mcps entries cannot combine module, command, and npm sources.',
      'box',
      { location, env, context: { entry } }
    );
  }
  if (command) {
    const args = entry.args === undefined ? [] : normalizeStringArray(entry.args, 'mcps.args', env, location);
    return [command, ...args].join(' ');
  }
  return module || npm;
}

async function resolveMcpScopeToken(token: string, env: Environment): Promise<string> {
  const trimmed = token.trim();
  if (!trimmed) {
    return '';
  }
  if (/\s/.test(trimmed)) {
    return trimmed;
  }
  if (looksLikeMcpPath(trimmed)) {
    return await env.resolvePath(trimmed);
  }
  return trimmed;
}

async function normalizeMcpScope(
  value: unknown,
  env: Environment,
  location?: any
): Promise<{ mcps?: string[]; hasMcps: boolean }> {
  if (value === undefined) {
    return { hasMcps: false };
  }
  if (value === null) {
    throw new MlldDirectiveError('mcps must be an array or string.', 'box', { location, env });
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '*') {
      return { hasMcps: false };
    }
    const parts = trimmed.length > 0
      ? trimmed.split(',').map(part => part.trim()).filter(Boolean)
      : [];
    const resolved = new Set<string>();
    for (const part of parts) {
      const spec = await resolveMcpScopeToken(part, env);
      if (spec) {
        resolved.add(spec);
      }
    }
    return { mcps: Array.from(resolved), hasMcps: true };
  }
  if (!Array.isArray(value)) {
    throw new MlldDirectiveError('mcps must be an array or string.', 'box', {
      location,
      env,
      context: { value }
    });
  }

  const resolved = new Set<string>();
  for (const entry of value) {
    let spec = '';
    if (typeof entry === 'string') {
      spec = entry;
    } else if (isPlainObject(entry)) {
      spec = resolveMcpEntrySpec(entry, env, location);
    } else {
      throw new MlldDirectiveError('mcps entries must be strings or server objects.', 'box', {
        location,
        env,
        context: { entry }
      });
    }
    const normalizedSpec = await resolveMcpScopeToken(spec, env);
    if (normalizedSpec) {
      resolved.add(normalizedSpec);
    }
  }

  return { mcps: Array.from(resolved), hasMcps: true };
}

function createScopedWorkspace(): WorkspaceValue {
  return {
    type: 'workspace',
    fs: VirtualFS.empty(),
    descriptions: new Map<string, string>()
  };
}

const DEFAULT_VFS_TOOLS = ['Bash', 'Read', 'Write', 'Glob', 'Grep'] as const;

function attenuateDefaultToolsToParent(
  tools: string[],
  env: Environment
): string[] {
  const parentAllowed = env.getAllowedTools();
  if (!parentAllowed) {
    return tools;
  }
  const normalizedParent = new Set<string>();
  for (const entry of parentAllowed) {
    if (typeof entry !== 'string') {
      continue;
    }
    const trimmed = entry.trim().toLowerCase();
    if (trimmed.length > 0) {
      normalizedParent.add(trimmed);
    }
  }
  return tools.filter(tool => normalizedParent.has(tool.trim().toLowerCase()));
}

export async function evaluateBox(
  directive: BoxDirectiveNode,
  env: Environment,
  context?: EvaluationContext
): Promise<EvalResult> {
  const resolvedConfig = await resolveBoxConfig(directive.values?.config, env, context, directive.location);
  const config = resolvedConfig.config;
  const withClauseTools = directive.values?.withClause?.tools;
  const withClauseProfile = (directive.values?.withClause as any)?.profile;
  const withClauseFyi = (directive.values?.withClause as any)?.fyi;
  const withClauseDisplay = (directive.values?.withClause as any)?.display;
  const resolvedConfigFyi = await resolveFyiConfig((config as any).fyi, env);
  const resolvedWithClauseFyi =
    withClauseFyi !== undefined
      ? await resolveFyiConfig(withClauseFyi, env)
      : undefined;
  const resolvedConfigDisplay = toDisplayMode((config as any).display, env, directive.location);
  const resolvedWithClauseDisplay =
    withClauseDisplay !== undefined
      ? toDisplayMode(await resolveToolsValue(withClauseDisplay, env, context), env, directive.location)
      : undefined;
  const inheritedScopedConfig = env.getScopedEnvironmentConfig() as
    | (EnvironmentConfig & { fyi?: unknown; display?: 'strict' })
    | undefined;
  let resolvedTools =
    withClauseTools !== undefined
      ? await resolveToolsValue(withClauseTools, env, context)
      : config.tools;
  const resolvedProfileOverride =
    withClauseProfile !== undefined
      ? await resolveToolsValue(withClauseProfile, env, context)
      : undefined;

  let mergedConfig =
    withClauseTools !== undefined || withClauseProfile !== undefined
      ? {
          ...config,
          ...(withClauseTools !== undefined ? { tools: resolvedTools } : {}),
          ...(withClauseProfile !== undefined ? { profile: resolvedProfileOverride } : {})
        }
      : config;

  if (resolvedConfigFyi !== undefined) {
    mergedConfig = {
      ...mergedConfig,
      fyi: resolvedConfigFyi
    };
  }

  if (resolvedConfigDisplay !== undefined) {
    mergedConfig = {
      ...mergedConfig,
      display: resolvedConfigDisplay
    };
  }

  if (inheritedScopedConfig?.fyi !== undefined && withClauseFyi === undefined) {
    mergedConfig = {
      ...mergedConfig,
      fyi: inheritedScopedConfig.fyi
    };
  }

  if (
    inheritedScopedConfig?.display !== undefined &&
    withClauseDisplay === undefined &&
    resolvedConfigDisplay === undefined
  ) {
    mergedConfig = {
      ...mergedConfig,
      display: inheritedScopedConfig.display
    };
  }

  if (resolvedWithClauseFyi !== undefined) {
    mergedConfig = {
      ...mergedConfig,
      fyi: resolvedWithClauseFyi
    };
  }

  if (resolvedWithClauseDisplay !== undefined) {
    mergedConfig = {
      ...mergedConfig,
      display: resolvedWithClauseDisplay
    };
  }

  let workspace = resolvedConfig.workspace;
  if (!workspace) {
    workspace = createScopedWorkspace();
  }

  const usingVfsWorkspace = Boolean(workspace);
  const shouldApplyVfsDefaults =
    usingVfsWorkspace && (!resolvedConfig.hasConfigExpression || Boolean(resolvedConfig.workspace));
  const usingDefaultVfsTools = shouldApplyVfsDefaults && resolvedTools === undefined;
  if (shouldApplyVfsDefaults) {
    if (resolvedTools === undefined) {
      resolvedTools = Array.from(DEFAULT_VFS_TOOLS);
      mergedConfig = {
        ...mergedConfig,
        tools: resolvedTools
      };
    }
    if ((mergedConfig as any).mcps === undefined) {
      mergedConfig = {
        ...mergedConfig,
        mcps: []
      };
    }
    if ((mergedConfig as any).net === undefined) {
      mergedConfig = {
        ...mergedConfig,
        net: { allow: [] }
      };
    }
  }

  mergedConfig = applyEnvironmentDefaults(mergedConfig, env.getPolicySummary()) ?? mergedConfig;
  resolvedTools = mergedConfig.tools;

  const scopedEnv = env.createChild();
  scopedEnv.setScopedEnvironmentConfig(mergedConfig);
  const policyAuthorizationValidation = validateRuntimePolicyAuthorizations(
    scopedEnv.getPolicySummary(),
    scopedEnv
  );
  if (policyAuthorizationValidation && policyAuthorizationValidation.errors.length > 0) {
    throw createPolicyAuthorizationValidationError(policyAuthorizationValidation);
  }

  const toolScope = normalizeToolScope(resolvedTools, env, directive.location);
  if (toolScope.hasTools) {
    const scopedTools =
      usingDefaultVfsTools && toolScope.tools
        ? attenuateDefaultToolsToParent(toolScope.tools, scopedEnv)
        : toolScope.tools;
    scopedEnv.setAllowedTools(scopedTools);
  }
  const mcpScope = await normalizeMcpScope((mergedConfig as any).mcps, scopedEnv, directive.location);
  if (mcpScope.hasMcps) {
    scopedEnv.setAllowedMcpServers(mcpScope.mcps);
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
      error instanceof Error ? error.message : 'Failed to resolve box profile',
      'box',
      { location: directive.location, env }
    );
  }

  if (nextProfile !== undefined) {
    contextManager.setProfile(nextProfile);
  }

  try {
    let pushedWorkspace = false;
    let bridgePushed = false;
    if (workspace) {
      scopedEnv.pushActiveWorkspace(workspace);
      pushedWorkspace = true;
      const { createWorkspaceMcpBridge } = await import('@interpreter/env/executors/workspace-mcp-bridge');
      const bridge = await createWorkspaceMcpBridge({
        workspace,
        getShellSession: async () => {
          if (!workspace.shellSession) {
            const { ShellSession } = await import('@services/fs/ShellSession');
            workspace.shellSession = await ShellSession.create(workspace.fs, {
              cwd: scopedEnv.getProjectRoot()
            });
          }
          return workspace.shellSession;
        },
        isToolAllowed: (toolName) => scopedEnv.isToolAllowed(toolName, toolName),
        workingDirectory: scopedEnv.getProjectRoot()
      });
      scopedEnv.pushBridge(bridge);
      bridgePushed = true;
    }

    try {
      await applyMcpConfigForBox(mergedConfig, scopedEnv, env, context, directive.location);
      const result = await evaluateExeBlock(block, scopedEnv, {}, { scope: 'block' });
      env.mergeChild(scopedEnv);
      const resolvedValue = result.value === undefined && workspace ? workspace : result.value;
      return { value: resolvedValue, env };
    } finally {
      if (pushedWorkspace) {
        if (bridgePushed) {
          const bridge = scopedEnv.popBridge();
          if (bridge) {
            await bridge.cleanup();
          }
        }
        scopedEnv.popActiveWorkspace();
      }
    }
  } finally {
    contextManager.setProfile(previousProfile);
  }
}
