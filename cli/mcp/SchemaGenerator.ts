import type { ExecutableVariable } from '@core/types/variable';
import type { ToolDefinition } from '@core/types/tools';
import type { MCPToolSchema, JSONSchemaProperty } from './types';
import { mlldNameToMCPName, mcpNameToMlldName } from '@core/mcp/names';
import type { EffectiveToolMetadata } from '@interpreter/eval/exec/tool-metadata';

export { mlldNameToMCPName, mcpNameToMlldName };

export function generateToolSchema(
  name: string,
  execVar: ExecutableVariable,
  toolDef?: ToolDefinition,
  metadata?: Pick<EffectiveToolMetadata, 'params' | 'optionalParams' | 'description' | 'inputSchema'>
): MCPToolSchema {
  const paramNames = Array.isArray(execVar.paramNames) ? execVar.paramNames : [];
  const boundKeys = toolDef?.bind ? Object.keys(toolDef.bind) : [];
  const boundSet = new Set(boundKeys);
  const exposedParams = metadata?.params ?? paramNames.filter(param => !boundSet.has(param));
  const optionalSet = new Set(
    Array.isArray(metadata?.optionalParams)
      ? metadata.optionalParams
      : Array.isArray(toolDef?.optional)
        ? toolDef.optional
      : Array.isArray(execVar.internal?.executableDef?.optionalParams)
        ? execVar.internal.executableDef.optionalParams
        : []
  );
  const exposedSet = new Set(exposedParams);
  const visibleParams = [...exposedParams];
  const properties: Record<string, JSONSchemaProperty> = {};
  const description =
    toolDef?.description ??
    metadata?.description ??
    execVar.description ??
    execVar.internal?.executableDef?.description ??
    execVar.mx?.description ??
    '';
  const paramTypes =
    execVar.paramTypes ??
    execVar.internal?.executableDef?.paramTypes ??
    {};
  const paramSchemas =
    ((execVar.internal?.executableDef as { paramSchemas?: Record<string, JSONSchemaProperty> } | undefined)?.paramSchemas)
    ?? {};

  for (const param of visibleParams) {
    const schemaField = metadata?.inputSchema?.fields.find(field => field.name === param);
    if (schemaField?.valueType) {
      const type = schemaField.valueType === 'handle'
        ? 'object'
        : schemaField.valueType;
      properties[param] = { type };
      continue;
    }
    const explicitSchema = paramSchemas[param];
    if (explicitSchema && typeof explicitSchema === 'object') {
      properties[param] = explicitSchema;
      continue;
    }
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
      required: visibleParams.filter(param => !optionalSet.has(param)),
    },
  };
}
