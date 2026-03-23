import { MlldImportError } from '@core/errors';
import { mlldNameToMCPName, mcpNameToMlldName } from '@core/mcp/names';
import {
  deriveMcpParamInfo as _deriveMcpParamInfo,
  coerceMcpArgs as _coerceMcpArgs,
  type McpParamInfo
} from '@core/mcp/coerce';
import type { MCPToolSchema } from '../../mcp/McpImportManager';
import type { Environment } from '../../env/Environment';

export type { McpParamInfo };

export interface McpToolIndex {
  tools: MCPToolSchema[];
  byMcpName: Map<string, MCPToolSchema>;
  byMlldName: Map<string, MCPToolSchema>;
  mlldNameByMcp: Map<string, string>;
}

export function buildMcpToolIndex(tools: MCPToolSchema[], source: string): McpToolIndex {
  const byMcpName = new Map<string, MCPToolSchema>();
  const byMlldName = new Map<string, MCPToolSchema>();
  const mlldNameByMcp = new Map<string, string>();

  for (const tool of tools) {
    if (!tool?.name) {
      continue;
    }
    const mcpName = tool.name;
    const mlldName = mcpNameToMlldName(mcpName);
    const existing = byMlldName.get(mlldName);
    if (existing) {
      throw new MlldImportError(
        `MCP tool name collision - '${mcpName}' and '${existing.name}' both map to '@${mlldName}' in '${source}'`,
        { code: 'IMPORT_NAME_CONFLICT' }
      );
    }
    byMcpName.set(mcpName, tool);
    byMlldName.set(mlldName, tool);
    mlldNameByMcp.set(mcpName, mlldName);
  }

  return {
    tools,
    byMcpName,
    byMlldName,
    mlldNameByMcp
  };
}

export function resolveMcpTool(
  requestedName: string,
  index: McpToolIndex,
  source: string
): { tool: MCPToolSchema; mlldName: string } {
  const direct = index.byMcpName.get(requestedName);
  if (direct) {
    return { tool: direct, mlldName: index.mlldNameByMcp.get(direct.name) ?? direct.name };
  }
  const byMlld = index.byMlldName.get(requestedName);
  if (byMlld) {
    return { tool: byMlld, mlldName: requestedName };
  }
  const mcpName = mlldNameToMCPName(requestedName);
  const converted = index.byMcpName.get(mcpName);
  if (converted) {
    return { tool: converted, mlldName: index.mlldNameByMcp.get(converted.name) ?? requestedName };
  }
  throw new MlldImportError(`Import '${requestedName}' not found in MCP server '${source}'`, {
    code: 'IMPORT_EXPORT_MISSING',
    details: { source, missing: requestedName }
  });
}

export function deriveMcpParamInfo(tool: MCPToolSchema): McpParamInfo {
  return _deriveMcpParamInfo(tool.inputSchema);
}

export function coerceMcpArgs(
  payload: Record<string, unknown>,
  paramTypesOrInfo: Record<string, string> | McpParamInfo
): Record<string, unknown> {
  if ('paramTypes' in paramTypesOrInfo && 'requiredParams' in paramTypesOrInfo) {
    return _coerceMcpArgs(payload, paramTypesOrInfo as McpParamInfo);
  }
  return _coerceMcpArgs(payload, {
    paramNames: Object.keys(paramTypesOrInfo),
    paramTypes: paramTypesOrInfo as Record<string, string>,
    paramNullable: {},
    requiredParams: Object.keys(paramTypesOrInfo)
  });
}

export function buildMcpArgs(paramNames: string[], args: unknown[]): Record<string, unknown> {
  if (args.length === 0) {
    return {};
  }
  if (args.length === 1 && isPlainObject(args[0])) {
    const keys = Object.keys(args[0] as Record<string, unknown>);
    const matchesParamNames = paramNames.length === 0 || keys.every(key => paramNames.includes(key));
    if (matchesParamNames) {
      return args[0] as Record<string, unknown>;
    }
  }
  const payload: Record<string, unknown> = {};
  for (let i = 0; i < paramNames.length && i < args.length; i++) {
    if (args[i] !== undefined) {
      payload[paramNames[i]] = args[i];
    }
  }
  return payload;
}

export async function resolveMcpServerSpec(spec: string, env: Environment): Promise<string> {
  const trimmed = spec.trim();
  if (!trimmed) {
    throw new MlldImportError('MCP tool import path resolves to an empty string', {
      code: 'IMPORT_PATH_EMPTY'
    });
  }
  if (/\s/.test(trimmed)) {
    return trimmed;
  }
  if (looksLikePath(trimmed)) {
    return await env.resolvePath(trimmed);
  }
  return trimmed;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function looksLikePath(value: string): boolean {
  if (value.startsWith('.') || value.startsWith('/')) {
    return true;
  }
  return /\.(mld|mlld|md|mld\.md|mlld\.md)$/.test(value);
}
