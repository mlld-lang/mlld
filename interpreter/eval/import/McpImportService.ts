import type { SourceLocation } from '@core/types';
import type { NodeFunctionExecutable } from '@core/types/executable';
import { createExecutableVariable } from '@core/types/variable/VariableFactories';
import type { VariableSource, Variable } from '@core/types/variable';
import { MlldImportError } from '@core/errors';
import { asData, isStructuredValue } from '@interpreter/utils/structured-value';
import type { Environment } from '../../env/Environment';
import type { MCPToolSchema } from '../../mcp/McpImportManager';
import { buildMcpArgs, coerceMcpArgs, deriveMcpParamInfo } from './McpImportResolver';

interface McpToolVariableOptions {
  alias: string;
  tool: MCPToolSchema;
  mcpName: string;
  importPath: string;
  definedAt?: SourceLocation;
}

export class McpImportService {
  constructor(private readonly env: Environment) {}

  createMcpToolVariable(options: McpToolVariableOptions): Variable {
    const { alias, tool, mcpName, importPath, definedAt } = options;
    const paramInfo = deriveMcpParamInfo(tool);
    const optionalParams = paramInfo.paramNames.filter(name => !paramInfo.requiredParams.includes(name));
    const manager = this.env.getMcpImportManager();
    const execFn = async (...args: unknown[]) => {
      const rawArgs = args.map(arg => unwrapMcpArgValue(arg));
      const payload = coerceMcpArgs(unwrapMcpArgPayload(buildMcpArgs(paramInfo.paramNames, rawArgs)), paramInfo);
      return await manager.callTool(importPath, mcpName, payload);
    };
    const execDef: NodeFunctionExecutable = {
      type: 'nodeFunction',
      name: alias,
      fn: execFn,
      paramNames: paramInfo.paramNames,
      paramTypes: paramInfo.paramTypes,
      ...(optionalParams.length > 0 ? { optionalParams } : {}),
      description: tool.description,
      sourceDirective: 'exec'
    };
    const source: VariableSource = {
      directive: 'var',
      syntax: 'reference',
      hasInterpolation: false,
      isMultiLine: false
    };
    const metadata = {
      isImported: true,
      importPath,
      definedAt
    };
    const variable = createExecutableVariable(
      alias,
      'code',
      '',
      paramInfo.paramNames,
      'js',
      source,
      {
        metadata,
        internal: {
          executableDef: execDef,
          mcpTool: { name: mcpName, source: importPath }
        }
      }
    ) as Variable;
    (variable as any).paramTypes = paramInfo.paramTypes;
    (variable as any).description = tool.description;
    return variable;
  }

  ensureImportBindingAvailable(
    name: string,
    importSource: string,
    location?: SourceLocation
  ): void {
    if (!name || name.trim().length === 0) return;

    const existingBinding = this.env.getImportBinding(name);
    if (existingBinding) {
      throw new MlldImportError(
        `Import collision - '${name}' already imported from ${existingBinding.source}. Alias one of the imports.`,
        {
          code: 'IMPORT_NAME_CONFLICT',
          context: {
            name,
            existingSource: existingBinding.source,
            attemptedSource: importSource,
            existingLocation: existingBinding.location,
            newLocation: location,
            suggestion: "Use 'as' to alias one of the imports"
          },
          details: {
            filePath: location?.filePath || existingBinding.location?.filePath,
            variableName: name
          }
        }
      );
    }

    if (this.env.hasVariable(name)) {
      throw new MlldImportError(
        `Import collision - '${name}' already defined. Alias the import.`,
        {
          code: 'IMPORT_NAME_CONFLICT',
          details: {
            filePath: location?.filePath,
            variableName: name
          }
        }
      );
    }
  }
}

function unwrapMcpArgPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const unwrapped = unwrapMcpArgValue(payload);
  return isPlainRecord(unwrapped) ? unwrapped : payload;
}

function unwrapMcpArgValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (isStructuredValue(value)) {
    return unwrapMcpArgValue(asData(value), seen);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return value;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    let result: unknown[] | undefined;
    for (let i = 0; i < value.length; i++) {
      const current = value[i];
      const next = unwrapMcpArgValue(current, seen);
      if (next !== current) {
        result ??= value.slice();
        result[i] = next;
      }
    }
    return result ?? value;
  }

  if (!isPlainRecord(value)) {
    return value;
  }

  let result: Record<string, unknown> | undefined;
  for (const [key, current] of Object.entries(value)) {
    const next = unwrapMcpArgValue(current, seen);
    if (next !== current) {
      result ??= { ...value };
      result[key] = next;
    }
  }
  return result ?? value;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
