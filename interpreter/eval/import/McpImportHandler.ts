import type { DirectiveNode, ImportDirectiveNode } from '@core/types';
import { astLocationToSourceLocation } from '@core/types';
import type { Environment } from '../../env/Environment';
import type { EvalResult } from '../../core/interpreter';
import { interpolate } from '../../core/interpreter';
import { InterpolationContext } from '../../core/interpolation-context';
import { MlldImportError } from '@core/errors';
import type { VariableSource, Variable } from '@core/types/variable';
import { createObjectVariable } from '@core/types/variable/VariableFactories';
import { McpImportService } from './McpImportService';
import { buildMcpToolIndex, resolveMcpServerSpec, resolveMcpTool } from './McpImportResolver';
import {
  buildImportTraceData,
  emitImportFailure,
  emitImportTrace
} from './runtime-trace';

export class McpImportHandler {
  constructor(private readonly mcpImportService: McpImportService) {}

  async evaluateImport(directive: DirectiveNode, env: Environment): Promise<EvalResult> {
    const importDirective = directive as ImportDirectiveNode;
    const traceData = buildImportTraceData(directive, {
      ref: 'mcp',
      transport: 'mcp'
    });
    const pathNodes = importDirective.values?.path;
    if (!pathNodes || pathNodes.length === 0) {
      const error = new MlldImportError('MCP tool import requires a server path', {
        code: 'IMPORT_PATH_MISSING',
        details: { directiveType: directive.subtype }
      });
      emitImportFailure(env, {
        ...traceData,
        phase: 'resolve',
        error
      });
      throw error;
    }

    let rawSpec: string;
    let resolvedSpec: string;
    try {
      rawSpec = await interpolate(pathNodes, env, InterpolationContext.FilePath);
      resolvedSpec = await resolveMcpServerSpec(rawSpec, env);
    } catch (error) {
      emitImportFailure(env, {
        ...traceData,
        phase: 'resolve',
        error
      });
      throw error;
    }
    const importDisplay = this.getImportDisplayPath(importDirective, resolvedSpec);
    emitImportTrace(env, 'import.resolve', {
      ...traceData,
      ref: importDisplay,
      resolvedPath: resolvedSpec
    });

    let tools: Awaited<ReturnType<ReturnType<Environment['getMcpImportManager']>['listTools']>>;
    try {
      tools = await env.getMcpImportManager().listTools(resolvedSpec);
    } catch (error) {
      emitImportFailure(env, {
        ...traceData,
        ref: importDisplay,
        resolvedPath: resolvedSpec,
        phase: 'read',
        error
      });
      throw error;
    }
    emitImportTrace(env, 'import.read', {
      ...traceData,
      ref: importDisplay,
      resolvedPath: resolvedSpec,
      entryCount: tools.length
    });
    const toolIndex = buildMcpToolIndex(tools, importDisplay);

    if (directive.subtype === 'importMcpNamespace') {
      const namespaceNodes = importDirective.values?.namespace;
      const namespaceNode = namespaceNodes && Array.isArray(namespaceNodes) ? namespaceNodes[0] : undefined;
      const alias = namespaceNode?.identifier ?? namespaceNode?.content ?? importDirective.values?.imports?.[0]?.alias;
      if (!alias) {
        const error = new MlldImportError('MCP tool namespace import requires an alias', {
          code: 'IMPORT_ALIAS_MISSING',
          details: { path: importDisplay }
        });
        emitImportFailure(env, {
          ...traceData,
          ref: importDisplay,
          resolvedPath: resolvedSpec,
          phase: 'evaluate',
          error
        });
        throw error;
      }

      const aliasLocationNode = namespaceNodes && Array.isArray(namespaceNodes) ? namespaceNodes[0] : undefined;
      const aliasLocation = aliasLocationNode?.location
        ? astLocationToSourceLocation(aliasLocationNode.location, env.getCurrentFilePath())
        : astLocationToSourceLocation(directive.location, env.getCurrentFilePath());

      this.mcpImportService.ensureImportBindingAvailable(alias, importDisplay, aliasLocation);

      const namespaceObject: Record<string, Variable> = {};
      const usedNames = new Set<string>();
      for (const tool of toolIndex.tools) {
        const mlldName = toolIndex.mlldNameByMcp.get(tool.name) ?? tool.name;
        if (usedNames.has(mlldName)) {
          const error = new MlldImportError(
            `MCP tool name collision - '${mlldName}' appears more than once in '${importDisplay}'`,
            { code: 'IMPORT_NAME_CONFLICT' }
          );
          emitImportFailure(env, {
            ...traceData,
            ref: importDisplay,
            resolvedPath: resolvedSpec,
            phase: 'evaluate',
            error
          });
          throw error;
        }
        usedNames.add(mlldName);
        namespaceObject[mlldName] = this.mcpImportService.createMcpToolVariable({
          alias: mlldName,
          tool,
          mcpName: tool.name,
          importPath: resolvedSpec,
          definedAt: aliasLocation
        });
      }

      const namespaceSource: VariableSource = {
        directive: 'var',
        syntax: 'object',
        hasInterpolation: false,
        isMultiLine: false
      };
      const namespaceVar = createObjectVariable(alias, namespaceObject, true, namespaceSource, {
        metadata: {
          isImported: true,
          importPath: resolvedSpec,
          definedAt: aliasLocation
        },
        internal: { isNamespace: true }
      });

      this.setVariableWithImportBinding(env, alias, namespaceVar, {
        source: importDisplay,
        location: aliasLocation
      });
      emitImportTrace(env, 'import.exports', {
        ...traceData,
        ref: importDisplay,
        resolvedPath: resolvedSpec,
        exportCount: Object.keys(namespaceObject).length
      });

      return { value: undefined, env };
    }

    const imports = importDirective.values?.imports ?? [];
    if (!Array.isArray(imports) || imports.length === 0) {
      const error = new MlldImportError('MCP tool import requires at least one tool name', {
        code: 'IMPORT_NAME_MISSING',
        details: { path: importDisplay }
      });
      emitImportFailure(env, {
        ...traceData,
        ref: importDisplay,
        resolvedPath: resolvedSpec,
        phase: 'evaluate',
        error
      });
      throw error;
    }

    const usedNames = new Set<string>();
    for (const importItem of imports) {
      const importName = importItem.identifier;
      const resolved = resolveMcpTool(importName, toolIndex, importDisplay);
      const alias = importItem.alias || resolved.mlldName;
      const importLocation = importItem.location
        ? astLocationToSourceLocation(importItem.location, env.getCurrentFilePath())
        : astLocationToSourceLocation(directive.location, env.getCurrentFilePath());

      if (usedNames.has(alias)) {
        const error = new MlldImportError(`Import collision - '${alias}' already requested in this directive`, {
          code: 'IMPORT_NAME_CONFLICT',
          details: { variableName: alias }
        });
        emitImportFailure(env, {
          ...traceData,
          ref: importDisplay,
          resolvedPath: resolvedSpec,
          phase: 'evaluate',
          error
        });
        throw error;
      }
      usedNames.add(alias);

      this.mcpImportService.ensureImportBindingAvailable(alias, importDisplay, importLocation);

      const variable = this.mcpImportService.createMcpToolVariable({
        alias,
        tool: resolved.tool,
        mcpName: resolved.tool.name,
        importPath: resolvedSpec,
        definedAt: importLocation
      });

      this.setVariableWithImportBinding(env, alias, variable, {
        source: importDisplay,
        location: importLocation
      });
    }

    emitImportTrace(env, 'import.exports', {
      ...traceData,
      ref: importDisplay,
      resolvedPath: resolvedSpec,
      exportCount: usedNames.size
    });

    return { value: undefined, env };
  }

  private setVariableWithImportBinding(
    env: Environment,
    alias: string,
    variable: Variable,
    binding: { source: string; location?: ReturnType<typeof astLocationToSourceLocation> }
  ): void {
    env.setVariable(alias, variable);
    env.setImportBinding(alias, binding);
  }

  private getImportDisplayPath(directive: ImportDirectiveNode, fallback: string): string {
    const raw = directive.raw;
    if (raw && typeof raw.path === 'string' && raw.path.trim().length > 0) {
      const trimmed = raw.path.trim();
      return trimmed.replace(/^['"]|['"]$/g, '');
    }
    return fallback;
  }
}
