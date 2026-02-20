import { mcpNameToMlldName, mlldNameToMCPName } from '@core/mcp/names';
import type { NodeFunctionExecutable } from '@core/types/executable';
import type { VariableSource } from '@core/types/variable';
import { createExecutableVariable, createObjectVariable } from '@core/types/variable';
import type { Environment } from '@interpreter/env/Environment';
import type { MCPToolSchema } from './McpImportManager';

export interface McpServerConfig {
  module?: string;
  command?: string;
  args?: string[];
  npm?: string;
  as?: string;
  tools?: string[] | '*';
  name?: string;
}

export interface McpConfig {
  servers?: McpServerConfig[];
  lifecycle?: Record<string, unknown>;
}

interface NormalizedServerConfig {
  spec: string;
  source: string;
  tools: string[] | '*';
  namespace: string | null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function normalizeString(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string`);
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeStringArray(value: unknown, label: string): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array of strings`);
  }
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') {
      throw new Error(`${label} entries must be strings`);
    }
    const trimmed = entry.trim();
    if (trimmed.length > 0) {
      result.push(trimmed);
    }
  }
  return result;
}

function stripKnownModuleExtensions(value: string): string {
  return value
    .replace(/\.mld\.md$/i, '')
    .replace(/\.mlld\.md$/i, '')
    .replace(/\.mld$/i, '')
    .replace(/\.mlld$/i, '')
    .replace(/\.md$/i, '');
}

function normalizeNamespaceValue(value: string, label: string): string {
  const trimmed = value.trim();
  const withoutAt = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  if (withoutAt.length === 0) {
    throw new Error(`${label} must not be empty`);
  }
  const normalized = mcpNameToMlldName(withoutAt.replace(/\//g, '_'));
  if (!normalized || normalized === '_') {
    throw new Error(`${label} is invalid`);
  }
  return normalized;
}

export function deriveNamespaceFromModuleSpec(moduleRef: string): string | null {
  const trimmed = moduleRef.trim();
  if (!trimmed) {
    return null;
  }

  let candidate = trimmed;

  if (trimmed.startsWith('@')) {
    const withoutAt = trimmed.slice(1);
    const segments = withoutAt.split('/').filter(Boolean);
    if (segments.length === 0) {
      return null;
    }
    if (segments[0] === 'local' && segments.length > 1) {
      candidate = segments[1];
    } else {
      candidate = segments[0];
    }
  } else if (trimmed.startsWith('.') || trimmed.startsWith('/')) {
    const slashIndex = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
    candidate = slashIndex >= 0 ? trimmed.slice(slashIndex + 1) : trimmed;
  } else if (trimmed.includes('/')) {
    candidate = trimmed.split('/')[0];
  }

  candidate = stripKnownModuleExtensions(candidate).replace(/-server$/i, '');
  if (!candidate) {
    return null;
  }

  const normalized = mcpNameToMlldName(candidate);
  return normalized === '_' ? null : normalized;
}

function resolveServerNamespace(server: McpServerConfig, index: number): string | null {
  if (typeof server.as === 'string' && server.as.trim().length > 0) {
    return normalizeNamespaceValue(server.as, `mcpConfig.servers[${index}].as`);
  }

  if (!server.module) {
    return null;
  }

  return deriveNamespaceFromModuleSpec(server.module);
}

function normalizeServerConfig(raw: unknown, index: number): Omit<McpServerConfig, 'tools'> & { tools: string[] | '*' } {
  if (!isPlainObject(raw)) {
    throw new Error(`mcpConfig.servers[${index}] must be an object`);
  }

  const module = normalizeString(raw.module, `mcpConfig.servers[${index}].module`);
  const command = normalizeString(raw.command, `mcpConfig.servers[${index}].command`);
  const npm = normalizeString(raw.npm, `mcpConfig.servers[${index}].npm`);
  const as = normalizeString(raw.as, `mcpConfig.servers[${index}].as`);
  const name = normalizeString(raw.name, `mcpConfig.servers[${index}].name`);
  const args = normalizeStringArray(raw.args, `mcpConfig.servers[${index}].args`);

  const sourceCount = [module, command, npm].filter(Boolean).length;
  if (sourceCount === 0) {
    throw new Error(`mcpConfig.servers[${index}] must include one of module, command, or npm`);
  }
  if (sourceCount > 1) {
    throw new Error(`mcpConfig.servers[${index}] cannot combine module/command/npm sources`);
  }

  const toolsRaw = raw.tools;
  let tools: string[] | '*' = '*';
  if (toolsRaw !== undefined) {
    if (toolsRaw === '*') {
      tools = '*';
    } else {
      const normalizedTools = normalizeStringArray(toolsRaw, `mcpConfig.servers[${index}].tools`);
      tools = normalizedTools ?? [];
    }
  }

  return {
    module,
    command,
    args,
    npm,
    as,
    name,
    tools
  };
}

export function normalizeMcpConfig(raw: unknown): McpConfig {
  if (!isPlainObject(raw)) {
    throw new Error('mcpConfig output must be an object');
  }

  const config: McpConfig = {};

  if (raw.servers !== undefined) {
    if (!Array.isArray(raw.servers)) {
      throw new Error('mcpConfig.servers must be an array');
    }
    config.servers = raw.servers.map((entry, index) => normalizeServerConfig(entry, index));
  } else {
    config.servers = [];
  }

  if (raw.lifecycle !== undefined) {
    if (!isPlainObject(raw.lifecycle)) {
      throw new Error('mcpConfig.lifecycle must be an object');
    }
    config.lifecycle = raw.lifecycle;
  }

  return config;
}

function looksLikePath(value: string): boolean {
  if (value.startsWith('.') || value.startsWith('/')) {
    return true;
  }
  return /\.(mld|mlld|md|mld\.md|mlld\.md)$/.test(value);
}

function resolveServerSpec(server: McpServerConfig, index: number): NormalizedServerConfig {
  const namespace = resolveServerNamespace(server, index);
  if (server.command) {
    const parts = [server.command.trim()];
    for (const arg of server.args ?? []) {
      const trimmed = arg.trim();
      if (trimmed.length > 0) {
        parts.push(trimmed);
      }
    }
    const spec = parts.join(' ');
    return {
      spec,
      source: server.name ?? server.command,
      tools: server.tools ?? '*',
      namespace
    };
  }

  if (server.npm) {
    return {
      spec: server.npm,
      source: server.name ?? server.npm,
      tools: server.tools ?? '*',
      namespace
    };
  }

  if (!server.module) {
    throw new Error('mcpConfig server source is missing');
  }

  return {
    spec: server.module,
    source: server.name ?? server.module,
    tools: server.tools ?? '*',
    namespace
  };
}

function deriveMcpParamInfo(tool: MCPToolSchema): { paramNames: string[]; paramTypes: Record<string, string> } {
  const properties = tool.inputSchema?.properties ?? {};
  const required = Array.isArray(tool.inputSchema?.required) ? tool.inputSchema.required : [];
  const allParams = Object.keys(properties);
  const optional = allParams.filter(name => !required.includes(name));
  const paramNames = [...required, ...optional];
  const paramTypes: Record<string, string> = {};

  for (const [name, schema] of Object.entries(properties)) {
    const raw = typeof schema?.type === 'string' ? schema.type.toLowerCase() : 'string';
    paramTypes[name] = raw;
  }

  return { paramNames, paramTypes };
}

function buildMcpArgs(paramNames: string[], args: unknown[]): Record<string, unknown> {
  if (args.length === 0) {
    return {};
  }

  const first = args[0];
  if (args.length === 1 && first && typeof first === 'object' && !Array.isArray(first)) {
    const payload = first as Record<string, unknown>;
    const keys = Object.keys(payload);
    const keyMatch = paramNames.length === 0 || keys.every(key => paramNames.includes(key));
    if (keyMatch) {
      return payload;
    }
  }

  const payload: Record<string, unknown> = {};
  for (let i = 0; i < paramNames.length && i < args.length; i += 1) {
    if (args[i] !== undefined) {
      payload[paramNames[i]] = args[i];
    }
  }
  return payload;
}

function filterTools(
  tools: MCPToolSchema[],
  allowList: string[] | '*',
  source: string
): MCPToolSchema[] {
  if (allowList === '*') {
    return tools;
  }

  const byMcp = new Map<string, MCPToolSchema>();
  const byMlld = new Map<string, MCPToolSchema>();
  for (const tool of tools) {
    if (!tool?.name) continue;
    byMcp.set(tool.name, tool);
    byMlld.set(mcpNameToMlldName(tool.name), tool);
  }

  const selected = new Map<string, MCPToolSchema>();
  for (const requested of allowList) {
    const normalized = requested.trim();
    if (normalized.length === 0) {
      continue;
    }
    const tool =
      byMcp.get(normalized) ??
      byMlld.get(normalized) ??
      byMcp.get(mlldNameToMCPName(normalized));
    if (!tool) {
      throw new Error(`mcpConfig requested unknown tool '${requested}' from '${source}'`);
    }
    selected.set(tool.name, tool);
  }

  return Array.from(selected.values());
}

async function resolveSpecForManager(spec: string, env: Environment): Promise<string> {
  const trimmed = spec.trim();
  if (!trimmed) {
    throw new Error('MCP server spec resolves to an empty string');
  }
  if (/\s/.test(trimmed)) {
    return trimmed;
  }
  if (looksLikePath(trimmed)) {
    return await env.resolvePath(trimmed);
  }
  return trimmed;
}

function createMcpToolVariable(
  env: Environment,
  alias: string,
  tool: MCPToolSchema,
  mcpName: string,
  importPath: string
) {
  const manager = env.getMcpImportManager();
  const paramInfo = deriveMcpParamInfo(tool);
  const execFn = async (...args: unknown[]) => {
    const payload = buildMcpArgs(paramInfo.paramNames, args);
    return await manager.callTool(importPath, mcpName, payload);
  };

  const executableDef: NodeFunctionExecutable = {
    type: 'nodeFunction',
    name: alias,
    fn: execFn,
    paramNames: paramInfo.paramNames,
    paramTypes: paramInfo.paramTypes,
    description: tool.description,
    sourceDirective: 'exec'
  };

  const source: VariableSource = {
    directive: 'var',
    syntax: 'reference',
    hasInterpolation: false,
    isMultiLine: false
  };

  const variable = createExecutableVariable(alias, 'code', '', paramInfo.paramNames, 'js', source, {
    mx: {
      importPath: 'let'
    },
    metadata: {
      isImported: true,
      importPath
    },
    internal: {
      executableDef,
      mcpTool: { name: mcpName, source: importPath }
    }
  });

  (variable as any).paramTypes = paramInfo.paramTypes;
  (variable as any).description = tool.description;
  return variable;
}

export async function registerMcpToolsFromConfig(
  env: Environment,
  config: McpConfig
): Promise<string[]> {
  const servers = Array.isArray(config.servers) ? config.servers : [];
  if (servers.length === 0) {
    return [];
  }

  const rootAliases = new Set<string>();
  const namespacedAliases = new Map<string, Set<string>>();
  const rootVariables = new Map<string, ReturnType<typeof createMcpToolVariable>>();
  const namespaceVariables = new Map<string, Map<string, ReturnType<typeof createMcpToolVariable>>>();
  const added: string[] = [];

  for (let index = 0; index < servers.length; index += 1) {
    const server = servers[index];
    const normalized = resolveServerSpec(server, index);
    const resolvedSpec = await resolveSpecForManager(normalized.spec, env);
    const listed = await env.getMcpImportManager().listTools(resolvedSpec);
    const allowed = filterTools(listed, normalized.tools, normalized.source);

    for (const tool of allowed) {
      if (!tool?.name) continue;
      const alias = mcpNameToMlldName(tool.name);
      const namespace = normalized.namespace;
      if (!namespace) {
        if (rootAliases.has(alias)) {
          throw new Error(`mcpConfig tool name collision: '@${alias}' appears multiple times`);
        }
        if (env.hasVariable(alias)) {
          throw new Error(`mcpConfig tool collision: '@${alias}' already exists in scope`);
        }
        rootAliases.add(alias);
        const variable = createMcpToolVariable(env, alias, tool, tool.name, resolvedSpec);
        rootVariables.set(alias, variable);
        added.push(alias);
        continue;
      }

      let bucket = namespaceVariables.get(namespace);
      if (!bucket) {
        bucket = new Map<string, ReturnType<typeof createMcpToolVariable>>();
        namespaceVariables.set(namespace, bucket);
      }
      let bucketNames = namespacedAliases.get(namespace);
      if (!bucketNames) {
        bucketNames = new Set<string>();
        namespacedAliases.set(namespace, bucketNames);
      }
      if (bucketNames.has(alias)) {
        throw new Error(`mcpConfig tool name collision: '@${namespace}.${alias}' appears multiple times`);
      }
      bucketNames.add(alias);
      const variable = createMcpToolVariable(env, alias, tool, tool.name, resolvedSpec);
      bucket.set(alias, variable);
      added.push(`${namespace}.${alias}`);
    }
  }

  for (const [alias, variable] of rootVariables.entries()) {
    env.setVariable(alias, variable);
  }

  const namespaceSource: VariableSource = {
    directive: 'var',
    syntax: 'object',
    hasInterpolation: false,
    isMultiLine: false
  };

  for (const [namespace, bucket] of namespaceVariables.entries()) {
    if (env.hasVariable(namespace)) {
      throw new Error(`mcpConfig namespace collision: '@${namespace}' already exists in scope`);
    }
    const namespaceObject: Record<string, ReturnType<typeof createMcpToolVariable>> = {};
    for (const [toolName, variable] of bucket.entries()) {
      namespaceObject[toolName] = variable;
    }
    const namespaceVar = createObjectVariable(namespace, namespaceObject, true, namespaceSource, {
      mx: { importPath: 'let' },
      metadata: {
        isImported: true,
        importPath: 'mcp-config'
      },
      internal: { isNamespace: true }
    });
    env.setVariable(namespace, namespaceVar);
  }

  return added;
}
