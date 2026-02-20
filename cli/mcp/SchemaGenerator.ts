import type { ExecutableVariable } from '@core/types/variable';
import type { ToolDefinition } from '@core/types/tools';
import type { MCPToolSchema, JSONSchemaProperty } from './types';
import { mlldNameToMCPName, mcpNameToMlldName } from '@core/mcp/names';

export { mlldNameToMCPName, mcpNameToMlldName };

export function generateToolSchema(
  name: string,
  execVar: ExecutableVariable,
  toolDef?: ToolDefinition
): MCPToolSchema {
  const paramNames = Array.isArray(execVar.paramNames) ? execVar.paramNames : [];
  const boundKeys = toolDef?.bind ? Object.keys(toolDef.bind) : [];
  const boundSet = new Set(boundKeys);
  const hasExpose = Array.isArray(toolDef?.expose);
  const exposedParams = hasExpose
    ? toolDef!.expose!
    : paramNames.filter(param => !boundSet.has(param));
  const exposedSet = new Set(exposedParams);
  const visibleParams = paramNames.filter(param => exposedSet.has(param));
  const properties: Record<string, JSONSchemaProperty> = {};
  const description =
    execVar.description ??
    execVar.internal?.executableDef?.description ??
    execVar.mx?.description ??
    '';
  const paramTypes =
    execVar.paramTypes ??
    execVar.internal?.executableDef?.paramTypes ??
    {};

  for (const param of visibleParams) {
    const rawType = typeof paramTypes[param] === 'string' ? paramTypes[param].toLowerCase() : '';
    const type = (rawType === 'number' ||
      rawType === 'boolean' ||
      rawType === 'array' ||
      rawType === 'object')
      ? rawType
      : 'string';
    properties[param] = { type };
  }

  return {
    name: mlldNameToMCPName(name),
    description,
    inputSchema: {
      type: 'object',
      properties,
      required: [...visibleParams],
    },
  };
}
