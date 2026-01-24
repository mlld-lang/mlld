import type { ExecutableVariable } from '@core/types/variable';
import type { MCPToolSchema } from './types';

const UPPERCASE_PATTERN = /([A-Z])/g;
const NON_ALPHANUMERIC_PATTERN = /[^a-z0-9_]/g;

export function mlldNameToMCPName(name: string): string {
  return name
    .replace(UPPERCASE_PATTERN, '_$1')
    .toLowerCase()
    .replace(NON_ALPHANUMERIC_PATTERN, '_')
    .replace(/^_+/, '')
    .replace(/_+/g, '_');
}

export function mcpNameToMlldName(name: string): string {
  return name.replace(/_([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());
}

export function generateToolSchema(name: string, execVar: ExecutableVariable): MCPToolSchema {
  const paramNames = Array.isArray(execVar.paramNames) ? execVar.paramNames : [];
  const properties: Record<string, { type: 'string' }> = {};
  const description =
    execVar.description ??
    execVar.internal?.executableDef?.description ??
    execVar.mx?.description ??
    '';

  for (const param of paramNames) {
    properties[param] = { type: 'string' };
  }

  return {
    name: mlldNameToMCPName(name),
    description,
    inputSchema: {
      type: 'object',
      properties,
      required: [...paramNames],
    },
  };
}
