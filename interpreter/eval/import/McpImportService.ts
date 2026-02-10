import type { SourceLocation } from '@core/types';
import type { NodeFunctionExecutable } from '@core/types/executable';
import { createExecutableVariable } from '@core/types/variable/VariableFactories';
import type { VariableSource, Variable } from '@core/types/variable';
import { MlldImportError } from '@core/errors';
import type { Environment } from '../../env/Environment';
import type { MCPToolSchema } from '../../mcp/McpImportManager';
import { buildMcpArgs, deriveMcpParamInfo } from './McpImportResolver';

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
    const manager = this.env.getMcpImportManager();
    const execFn = async (...args: unknown[]) => {
      const payload = buildMcpArgs(paramInfo.paramNames, args);
      return await manager.callTool(importPath, mcpName, payload);
    };
    const execDef: NodeFunctionExecutable = {
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
          mcpTool: { name: mcpName }
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
