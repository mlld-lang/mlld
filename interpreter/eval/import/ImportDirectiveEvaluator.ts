import type { DirectiveNode, ImportDirectiveNode } from '@core/types';
import { astLocationToSourceLocation } from '@core/types';
import type { ImportType, DataLabel } from '@core/types/security';
import { makeSecurityDescriptor, mergeDescriptors } from '@core/types/security';
import { deriveImportTaint } from '@core/security/taint';
import type { Environment } from '../../env/Environment';
import type { EvalResult } from '../../core/interpreter';
import { ImportPathResolver, ImportResolution } from './ImportPathResolver';
import { ImportSecurityValidator } from './ImportSecurityValidator';
import { ModuleContentProcessor, type ModuleProcessingResult } from './ModuleContentProcessor';
import { VariableImporter } from './VariableImporter';
import { ObjectReferenceResolver } from './ObjectReferenceResolver';
import { normalizeNodeModuleExports, resolveNodeModule, wrapNodeExport } from '../../utils/node-interop';
import { MlldImportError, ErrorSeverity } from '@core/errors';
// createVariableFromValue is now part of VariableImporter
import { interpolate } from '../../core/interpreter';
import { InterpolationContext } from '../../core/interpolation-context';
import { mergePolicyConfigs, normalizePolicyConfig, type PolicyConfig } from '@core/policy/union';
import type { NeedsDeclaration, CommandNeeds } from '@core/policy/needs';
import type { IFileSystemService } from '@services/fs/IFileSystemService';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import * as path from 'path';
import minimatch from 'minimatch';
import type { SerializedGuardDefinition } from '../../guards';
import type { NodeFunctionExecutable } from '@core/types/executable';
import { createExecutableVariable, createObjectVariable } from '@core/types/variable/VariableFactories';
import type { VariableSource, Variable } from '@core/types/variable';
import type { MCPToolSchema } from '../../mcp/McpImportManager';
import { mlldNameToMCPName, mcpNameToMlldName } from '@core/mcp/names';

const MODULE_SOURCE_EXTENSIONS = ['.mld.md', '.mld', '.md', '.mlld.md', '.mlld'] as const;
const DIRECTORY_INDEX_FILENAME = 'index.mld';
const DEFAULT_DIRECTORY_IMPORT_SKIP_DIRS = ['_*', '.*'] as const;

function matchesModuleExtension(candidate: string): boolean {
  return MODULE_SOURCE_EXTENSIONS.some(ext => candidate.endsWith(ext));
}

type McpToolIndex = {
  tools: MCPToolSchema[];
  byMcpName: Map<string, MCPToolSchema>;
  byMlldName: Map<string, MCPToolSchema>;
  mlldNameByMcp: Map<string, string>;
};

function buildMcpToolIndex(tools: MCPToolSchema[], source: string): McpToolIndex {
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

function resolveMcpTool(
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function looksLikePath(value: string): boolean {
  if (value.startsWith('.') || value.startsWith('/')) {
    return true;
  }
  return /\.(mld|mlld|md|mld\.md|mlld\.md)$/.test(value);
}

/**
 * Main coordinator for import directive evaluation
 * Orchestrates all import processing components
 */
export class ImportDirectiveEvaluator {
  private env: Environment;
  private pathResolver: ImportPathResolver;
  private securityValidator: ImportSecurityValidator;
  private contentProcessor: ModuleContentProcessor;
  private variableImporter: VariableImporter;
  private objectResolver: ObjectReferenceResolver;
  // TODO: Integrate capability context construction when import types and security descriptors land.

  constructor(env: Environment) {
    this.env = env;
    this.objectResolver = new ObjectReferenceResolver();
    this.pathResolver = new ImportPathResolver(env);
    this.securityValidator = new ImportSecurityValidator(env);
    this.variableImporter = new VariableImporter(this.objectResolver);
    this.contentProcessor = new ModuleContentProcessor(
      env, 
      this.securityValidator, 
      this.variableImporter
    );
  }

  /**
   * Main entry point for import directive evaluation
   */
  async evaluateImport(directive: DirectiveNode, env: Environment): Promise<EvalResult> {
    try {
      if (directive.subtype === 'importMcpSelected' || directive.subtype === 'importMcpNamespace') {
        return await this.evaluateMcpImport(directive, env);
      }

      // 1. Resolve the import path and determine import type
      const resolution = await this.pathResolver.resolveImportPath(directive);

      const importContext = this.resolveImportType(directive, resolution);
      resolution.importType = importContext.importType;
      if (importContext.cacheDurationMs !== undefined) {
        resolution.cacheDurationMs = importContext.cacheDurationMs;
      }

      if (resolution.importType === 'templates' && resolution.type !== 'file') {
        const resolvedPath = await env.resolvePath(resolution.resolvedPath);
        resolution.resolvedPath = resolvedPath;
        resolution.type = 'file';
      }

      if (
        (directive as any)?.values?.templateParams &&
        (directive as any).values.templateParams.length > 0 &&
        resolution.importType !== 'templates'
      ) {
        throw new MlldImportError('Import parameters are only supported with templates imports', {
          code: 'IMPORT_TYPE_MISMATCH',
          details: {
            importType: resolution.importType,
            path: resolution.resolvedPath
          }
        });
      }

      const securityLabels = (directive.meta?.securityLabels || directive.values?.securityLabels) as DataLabel[] | undefined;
      const baseDescriptor = makeSecurityDescriptor({ labels: securityLabels });
      const taintSnapshot = deriveImportTaint({
        importType: resolution.importType ?? 'live',
        resolverName: resolution.resolverName,
        source: resolution.resolvedPath,
        resolvedPath: resolution.resolvedPath,
        sourceType: resolution.type,
        labels: resolution.mx?.labels
      });
      const taintDescriptor = makeSecurityDescriptor({
      taint: taintSnapshot.taint,
      labels: taintSnapshot.labels,
      sources: taintSnapshot.sources
    });
      const descriptor = mergeDescriptors(baseDescriptor, taintDescriptor);

      // 2. Route to appropriate handler based on import type
      return await this.withPolicyOverride(
        directive,
        env,
        async () => await this.routeImportRequest(resolution, directive, env)
      );

    } catch (error) {
      return this.handleImportError(error, directive, env);
    }
  }

  /**
   * Route import request to appropriate handler
   */
  private async routeImportRequest(
    resolution: ImportResolution,
    directive: DirectiveNode,
    env: Environment
  ): Promise<EvalResult> {
    switch (resolution.type) {
      case 'input':
        return this.evaluateInputImport(directive, env);
      
      case 'resolver':
        return this.evaluateResolverImport(directive, resolution.resolverName!, env);
      
      case 'module':
        return this.evaluateModuleImport(resolution, directive, env);

      case 'node':
        return this.evaluateNodeImport(resolution, directive, env);
      
      case 'file':
      case 'url':
        return this.evaluateFileImport(resolution, directive, env);
      
      default:
        throw new Error(`Unknown import type: ${(resolution as any).type}`);
    }
  }

  private async evaluateMcpImport(directive: DirectiveNode, env: Environment): Promise<EvalResult> {
    const importDirective = directive as ImportDirectiveNode;
    const pathNodes = importDirective.values?.path;
    if (!pathNodes || pathNodes.length === 0) {
      throw new MlldImportError('MCP tool import requires a server path', {
        code: 'IMPORT_PATH_MISSING',
        details: { directiveType: directive.subtype }
      });
    }

    const rawSpec = await interpolate(pathNodes, env, InterpolationContext.FilePath);
    const resolvedSpec = await this.resolveMcpServerSpec(rawSpec, env);
    const importDisplay = this.getImportDisplayPath(importDirective, resolvedSpec);

    const tools = await env.getMcpImportManager().listTools(resolvedSpec);
    const toolIndex = buildMcpToolIndex(tools, importDisplay);

    if (directive.subtype === 'importMcpNamespace') {
      const namespaceNodes = importDirective.values?.namespace;
      const namespaceNode = namespaceNodes && Array.isArray(namespaceNodes) ? namespaceNodes[0] : undefined;
      // Support both VariableReference (identifier) and Text (content) node types
      const alias = namespaceNode?.identifier ?? namespaceNode?.content ?? importDirective.values?.imports?.[0]?.alias;
      if (!alias) {
        throw new MlldImportError('MCP tool namespace import requires an alias', {
          code: 'IMPORT_ALIAS_MISSING',
          details: { path: importDisplay }
        });
      }

      const aliasLocationNode = namespaceNodes && Array.isArray(namespaceNodes) ? namespaceNodes[0] : undefined;
      const aliasLocation = aliasLocationNode?.location
        ? astLocationToSourceLocation(aliasLocationNode.location, env.getCurrentFilePath())
        : astLocationToSourceLocation(directive.location, env.getCurrentFilePath());

      this.ensureMcpImportBindingAvailable(env, alias, importDisplay, aliasLocation);

      const namespaceObject: Record<string, Variable> = {};
      const usedNames = new Set<string>();
      for (const tool of toolIndex.tools) {
        const mlldName = toolIndex.mlldNameByMcp.get(tool.name) ?? tool.name;
        if (usedNames.has(mlldName)) {
          throw new MlldImportError(
            `MCP tool name collision - '${mlldName}' appears more than once in '${importDisplay}'`,
            { code: 'IMPORT_NAME_CONFLICT' }
          );
        }
        usedNames.add(mlldName);
        namespaceObject[mlldName] = this.createMcpToolVariable(env, {
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

      return { value: undefined, env };
    }

    const imports = importDirective.values?.imports ?? [];
    if (!Array.isArray(imports) || imports.length === 0) {
      throw new MlldImportError('MCP tool import requires at least one tool name', {
        code: 'IMPORT_NAME_MISSING',
        details: { path: importDisplay }
      });
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
        throw new MlldImportError(`Import collision - '${alias}' already requested in this directive`, {
          code: 'IMPORT_NAME_CONFLICT',
          details: { variableName: alias }
        });
      }
      usedNames.add(alias);

      this.ensureMcpImportBindingAvailable(env, alias, importDisplay, importLocation);

      const variable = this.createMcpToolVariable(env, {
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

    return { value: undefined, env };
  }

  private async resolveMcpServerSpec(spec: string, env: Environment): Promise<string> {
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

  private createMcpToolVariable(
    env: Environment,
    options: {
      alias: string;
      tool: MCPToolSchema;
      mcpName: string;
      importPath: string;
      definedAt?: ReturnType<typeof astLocationToSourceLocation>;
    }
  ): Variable {
    const { alias, tool, mcpName, importPath, definedAt } = options;
    const paramInfo = deriveMcpParamInfo(tool);
    const manager = env.getMcpImportManager();
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

  private ensureMcpImportBindingAvailable(
    env: Environment,
    name: string,
    importSource: string,
    location?: ReturnType<typeof astLocationToSourceLocation>
  ): void {
    if (!name || name.trim().length === 0) return;

    const existingBinding = env.getImportBinding(name);
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

    if (env.hasVariable(name)) {
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

  /**
   * Handle input imports (@input, @stdin)
   */
  private resolveImportType(
    directive: DirectiveNode,
    resolution: ImportResolution
  ): { importType: ImportType; cacheDurationMs?: number } {
    const importDirective = directive as ImportDirectiveNode;
    const declaredType = importDirective.values?.importType;
    const cachedDuration = importDirective.values?.cachedDuration;

    if (declaredType) {
      this.validateDeclaredImportType(declaredType, resolution);
    }

    if (declaredType === 'local' && resolution.type === 'module') {
      resolution.preferLocal = true;
    }

    const resolvedType = declaredType ?? this.inferImportType(resolution);
    const cacheDurationMs = resolvedType === 'cached'
      ? this.durationToMilliseconds(cachedDuration)
      : undefined;

    return {
      importType: resolvedType,
      cacheDurationMs
    };
  }

  private inferImportType(resolution: ImportResolution): ImportType {
    switch (resolution.type) {
      case 'module':
      case 'node':
        return 'module';
      case 'file':
        return 'static';
      case 'url':
        return 'cached';
      case 'input':
        return 'live';
      case 'resolver':
        return this.inferResolverImportType(resolution);
      default:
        return 'live';
    }
  }

  private inferResolverImportType(resolution: ImportResolution): ImportType {
    const name = resolution.resolverName?.toLowerCase();
    if (!name) {
      return 'live';
    }

    if (name === 'local') {
      return 'local';
    }

    if (name === 'base' || name === 'root' || name === 'project') {
      return 'static';
    }

    return 'live';
  }

  private validateDeclaredImportType(type: ImportType, resolution: ImportResolution): void {
    const resolverName = resolution.resolverName?.toLowerCase();

    switch (type) {
      case 'module':
        if (resolution.type !== 'module' && resolution.type !== 'node') {
          throw new MlldImportError("Import type 'module' requires a registry module reference.", {
            code: 'IMPORT_TYPE_MISMATCH',
            details: { importType: type, resolvedType: resolution.type }
          });
        }
        return;

      case 'cached':
        if (resolution.type !== 'url') {
          throw new MlldImportError("Import type 'cached' requires an absolute URL source.", {
            code: 'IMPORT_TYPE_MISMATCH',
            details: { importType: type, resolvedType: resolution.type }
          });
        }
        return;

      case 'local':
        if (resolution.type === 'module') {
          resolution.preferLocal = true;
          return;
        }
        if (resolution.type !== 'resolver' || resolverName !== 'local') {
          throw new MlldImportError("Import type 'local' expects an @local/... module.", {
            code: 'IMPORT_TYPE_MISMATCH',
            details: { importType: type, resolvedType: resolution.type }
          });
        }
        return;

      case 'static':
        if (resolution.type === 'file') {
          return;
        }
        if (resolution.type === 'resolver' && (resolverName === 'base' || resolverName === 'root' || resolverName === 'project')) {
          return;
        }
        throw new MlldImportError("Import type 'static' supports local files or @base/@root/@project resolver paths.", {
          code: 'IMPORT_TYPE_MISMATCH',
          details: { importType: type, resolvedType: resolution.type }
        });

      case 'live':
        if (resolution.type === 'url' || resolution.type === 'resolver' || resolution.type === 'input') {
          return;
        }
        throw new MlldImportError("Import type 'live' is only valid for resolvers, URLs, or @input.", {
          code: 'IMPORT_TYPE_MISMATCH',
          details: { importType: type, resolvedType: resolution.type }
        });

      case 'templates': {
        const isAllowedResolver =
          resolution.type === 'resolver' &&
          (resolverName === 'base' || resolverName === 'root' || resolverName === 'project' || resolverName === 'local');
        if (resolution.type === 'file' || isAllowedResolver) {
          return;
        }
        throw new MlldImportError("Import type 'templates' expects a directory from the local filesystem or @base/@root/@project/@local resolvers.", {
          code: 'IMPORT_TYPE_MISMATCH',
          details: { importType: type, resolvedType: resolution.type }
        });
      }

      default:
        return;
    }
  }

  private durationToMilliseconds(duration?: ImportDirectiveNode['values']['cachedDuration']): number | undefined {
    if (!duration) {
      return undefined;
    }

    const multipliers: Record<string, number> = {
      seconds: 1000,
      minutes: 60 * 1000,
      hours: 60 * 60 * 1000,
      days: 24 * 60 * 60 * 1000,
      weeks: 7 * 24 * 60 * 60 * 1000,
      years: 365 * 24 * 60 * 60 * 1000
    };

    const value = multipliers[duration.unit];
    if (!value) {
      return undefined;
    }

    return duration.value * value;
  }

  /**
   * Handle input imports (@input, @stdin)
   */
  private async evaluateInputImport(directive: DirectiveNode, env: Environment): Promise<EvalResult> {
    // Get input resolver
    const resolverManager = env.getResolverManager();
    if (!resolverManager) {
      throw new Error('Resolver manager not available');
    }

    const resolver = resolverManager.getResolver('input');
    if (!resolver) {
      throw new Error('input resolver not found');
    }

    // Extract requested imports for the resolver
    const requestedImports = directive.subtype === 'importSelected' 
      ? (directive.values?.imports || []).map((imp: any) => imp.identifier)
      : undefined;

    // Use resolver to get input data with proper import context
    const result = await resolver.resolve('@input', { 
      context: 'import',
      requestedImports
    });

    const securityLabels = (directive.meta?.securityLabels || directive.values?.securityLabels) as DataLabel[] | undefined;
    const baseDescriptor = makeSecurityDescriptor({ labels: securityLabels });
    const sourceRef = result.mx?.source ?? '@input';
    const taintSnapshot = deriveImportTaint({
      importType: 'live',
      resolverName: 'input',
      source: sourceRef,
      resolvedPath: sourceRef,
      sourceType: 'input',
      labels: result.mx?.labels
    });
    const taintDescriptor = makeSecurityDescriptor({
      taint: taintSnapshot.taint,
      labels: taintSnapshot.labels,
      sources: taintSnapshot.sources
    });
    env.recordSecurityDescriptor(mergeDescriptors(baseDescriptor, taintDescriptor));
    
    let exportData: Record<string, any> = {};
    if (result.contentType === 'data' && typeof result.content === 'string') {
      try {
        exportData = JSON.parse(result.content);
      } catch (e) {
        exportData = { value: result.content };
      }
    } else {
      exportData = { value: result.content };
    }

    // Import variables based on directive type
    await this.importResolverVariables(directive, exportData, env, '@input');

    return { value: undefined, env };
  }

  /**
   * Handle resolver imports (@now, @debug, etc.)
   */
  private async evaluateResolverImport(
    directive: DirectiveNode,
    resolverName: string,
    env: Environment
  ): Promise<EvalResult> {
    const resolverManager = env.getResolverManager();
    if (!resolverManager) {
      throw new Error('Resolver manager not available');
    }

    // Try case-sensitive first, then lowercase (standard resolver name case), then uppercase
    const resolver = resolverManager.getResolver(resolverName) ||
                    resolverManager.getResolver(resolverName.toLowerCase()) ||
                    resolverManager.getResolver(resolverName.toUpperCase());
    if (!resolver) {
      throw new Error(`Resolver '${resolverName}' not found`);
    }

    if (resolverName.toLowerCase() === 'keychain') {
      throw new MlldImportError(
        'Direct keychain imports are not available. Use policy.auth with using auth:*.',
        { code: 'KEYCHAIN_DIRECT_ACCESS_DENIED' }
      );
    }

    // Check if resolver supports imports
    if (!resolver.capabilities.contexts.import) {
      const { ResolverError } = await import('@core/errors');
      throw ResolverError.unsupportedCapability(resolver.name, 'imports', 'import');
    }

    const requestedImports = directive.subtype === 'importSelected'
      ? (directive.values?.imports || []).map((imp: any) => imp.identifier)
      : undefined;

    const resolverResult = await resolver.resolve(`@${resolverName}`, {
      context: 'import',
      requestedImports
    });

    if (resolverResult.contentType === 'module') {
      const ref = resolverResult.mx?.source ?? `@${resolverName}`;
      const taintDescriptor = deriveImportTaint({
        importType: 'module',
        resolverName,
        source: ref,
        resolvedPath: ref,
        sourceType: 'resolver',
        labels: resolverResult.mx?.labels
      });
      env.recordSecurityDescriptor(
        makeSecurityDescriptor({
          taint: taintDescriptor.taint,
          labels: taintDescriptor.labels,
          sources: taintDescriptor.sources
        })
      );
      return this.importFromResolverContent(directive, ref, resolverResult, env);
    }

    // Get export data from resolver
    let exportData: Record<string, any> = {};
    
    if ('getExportData' in resolver) {
      exportData = await this.getResolverExportData(resolver as any, directive, resolverName);
    } else {
      exportData = await this.fallbackResolverData(resolver, directive, resolverName, resolverResult);
    }

    // Import variables based on directive type
    await this.importResolverVariables(directive, exportData, env, `@${resolverName}`);

    return { value: undefined, env };
  }

  /**
   * Handle module imports (@user/module)
   */
  private async evaluateModuleImport(
    resolution: ImportResolution,
    directive: DirectiveNode,
    env: Environment
  ): Promise<EvalResult> {
    if (resolution.preferLocal) {
      const resolverManager = env.getResolverManager();
      if (!resolverManager || !resolverManager.hasLocalModule(resolution.resolvedPath)) {
        throw new MlldImportError(`Local module not found for ${resolution.resolvedPath}`, {
          code: 'LOCAL_MODULE_NOT_FOUND',
          severity: ErrorSeverity.Fatal,
          details: { reference: resolution.resolvedPath }
        });
      }
    }

    const candidates = this.buildModuleCandidates(resolution);
    let lastError: unknown = undefined;

    for (const candidate of candidates) {
      try {
        const resolverContent = await env.resolveModule(candidate, 'import');
        if (resolverContent.resolverName) {
          resolution.resolverName = resolverContent.resolverName;
        }

        const treatAsModule = resolverContent.contentType === 'module'
          || matchesModuleExtension(candidate);

        if (!treatAsModule) {
          lastError = new Error(
            `Import target is not a module: ${candidate} (content type: ${resolverContent.contentType})`
          );
          continue;
        }

        const importDescriptor = deriveImportTaint({
          importType: resolution.importType ?? 'module',
          resolverName: resolverContent.resolverName,
          source: resolverContent.mx?.source ?? resolution.resolvedPath,
          resolvedPath: resolverContent.mx?.source ?? resolution.resolvedPath,
          sourceType: 'module',
          labels: resolverContent.mx?.labels
        });
        env.recordSecurityDescriptor(
          makeSecurityDescriptor({
            taint: importDescriptor.taint,
            labels: importDescriptor.labels,
            sources: importDescriptor.sources
          })
        );

        // Validate version against lock file for registry modules
        await this.validateLockFileVersion(candidate, resolverContent, env);

        return this.importFromResolverContent(directive, candidate, resolverContent, env);
      } catch (error) {
        if ((error as any)?.code === 'IMPORT_NO_EXPORTS') {
          lastError = error;
          break;
        }
        lastError = error;
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error(`Unable to resolve module import: ${resolution.resolvedPath}`);
  }

  /**
   * Handle node package imports
   */
  private async evaluateNodeImport(
    resolution: ImportResolution,
    directive: DirectiveNode,
    env: Environment
  ): Promise<EvalResult> {
    const packageName = resolution.packageName ?? resolution.resolvedPath;
    const { module, spec } = await resolveNodeModule(packageName, env);
    const moduleExports = normalizeNodeModuleExports(module);
    const moduleObject: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(moduleExports)) {
      moduleObject[key] = wrapNodeExport(value, { name: key, moduleName: spec });
    }

    const childEnv = env.createChild();
    childEnv.setCurrentFilePath(`node:${spec}`);
    childEnv.setModuleIsolated(true);

    const processingResult: ModuleProcessingResult = {
      moduleObject,
      frontmatter: null,
      childEnvironment: childEnv,
      guardDefinitions: []
    };

    this.validateModuleResult(processingResult, directive, `node:${spec}`);
    await this.variableImporter.importVariables(processingResult, directive, env);
    this.applyPolicyImportContext(directive, env, `node:${spec}`);

    return { value: undefined, env };
  }

  /**
   * Handle file and URL imports
   */
  private async evaluateFileImport(
    resolution: ImportResolution,
    directive: DirectiveNode,
    env: Environment
  ): Promise<EvalResult> {
    const directoryResult = await this.maybeProcessDirectoryImport(resolution, directive, env);

    // Process the file/URL content (handles its own import tracking)
    const processingResult =
      directoryResult ?? (await this.contentProcessor.processModuleContent(resolution, directive));

    this.validateModuleResult(processingResult, directive, resolution.resolvedPath);

    // Import variables into environment
    await this.variableImporter.importVariables(processingResult, directive, env);
    this.applyPolicyImportContext(directive, env, resolution.resolvedPath);

    return { value: undefined, env };
  }

  private async maybeProcessDirectoryImport(
    resolution: ImportResolution,
    directive: DirectiveNode,
    env: Environment
  ): Promise<ModuleProcessingResult | null> {
    if (resolution.type !== 'file') {
      return null;
    }

    if (resolution.importType === 'templates') {
      return null;
    }

    const fsService = env.getFileSystemService();
    if (typeof fsService.isDirectory !== 'function') {
      return null;
    }

    const baseDir = resolution.resolvedPath;
    const isDir = await fsService.isDirectory(baseDir);
    if (!isDir) {
      return null;
    }

    return await this.processDirectoryImport(fsService, baseDir, resolution, directive, env);
  }

  private async processDirectoryImport(
    fsService: IFileSystemService,
    baseDir: string,
    resolution: ImportResolution,
    directive: DirectiveNode,
    env: Environment
  ): Promise<ModuleProcessingResult> {
    if (typeof fsService.readdir !== 'function' || typeof fsService.stat !== 'function') {
      throw new MlldImportError('Directory import requires filesystem access', {
        code: 'DIRECTORY_IMPORT_FS_UNAVAILABLE',
        details: { path: baseDir }
      });
    }

    const skipDirs = this.getDirectoryImportSkipDirs(directive, baseDir);
    const moduleObject: Record<string, any> = {};
    const guardDefinitions: SerializedGuardDefinition[] = [];

    const entries = await fsService.readdir(baseDir);
    for (const entry of entries) {
      const fullPath = path.join(baseDir, entry);
      const stat = await fsService
        .stat(fullPath)
        .catch(() => ({ isDirectory: () => false, isFile: () => false }));
      if (!stat.isDirectory()) {
        continue;
      }

      if (this.shouldSkipDirectory(entry, skipDirs)) {
        continue;
      }

      const indexPath = path.join(fullPath, DIRECTORY_INDEX_FILENAME);
      const hasIndex = await fsService.exists(indexPath).catch(() => false);
      if (!hasIndex) {
        continue;
      }

      const indexStat = await fsService
        .stat(indexPath)
        .catch(() => ({ isDirectory: () => false, isFile: () => false }));
      if (!indexStat.isFile()) {
        continue;
      }

      const childResolution: ImportResolution = {
        type: 'file',
        resolvedPath: indexPath,
        importType: resolution.importType
      };

      const childResult = await this.contentProcessor.processModuleContent(childResolution, directive);
      this.enforceModuleNeeds(childResult.moduleNeeds, indexPath);

      const key = this.sanitizeDirectoryKey(entry);
      if (key in moduleObject) {
        throw new MlldImportError(`Duplicate directory import key '${key}' under ${baseDir}`, {
          code: 'DIRECTORY_IMPORT_DUPLICATE_KEY',
          details: { path: baseDir, key, entries: [entry] }
        });
      }

      moduleObject[key] = childResult.moduleObject;
      if (childResult.guardDefinitions && childResult.guardDefinitions.length > 0) {
        guardDefinitions.push(...childResult.guardDefinitions);
      }
    }

    if (Object.keys(moduleObject).length === 0) {
      throw new MlldImportError(`No ${DIRECTORY_INDEX_FILENAME} modules found under ${baseDir}`, {
        code: 'DIRECTORY_IMPORT_EMPTY',
        details: { path: baseDir, index: DIRECTORY_INDEX_FILENAME }
      });
    }

    const childEnv = env.createChild(baseDir);
    childEnv.setCurrentFilePath(baseDir);

    return {
      moduleObject,
      frontmatter: null,
      childEnvironment: childEnv,
      guardDefinitions
    };
  }

  private getDirectoryImportSkipDirs(directive: DirectiveNode, baseDir: string): string[] {
    const withClause = (directive.meta?.withClause || directive.values?.withClause) as any | undefined;
    if (!withClause || !('skipDirs' in withClause)) {
      return [...DEFAULT_DIRECTORY_IMPORT_SKIP_DIRS];
    }

    const value = (withClause as any).skipDirs as unknown;
    const parsed = this.parseStringArrayOption(value, { option: 'skipDirs', source: baseDir });
    return parsed;
  }

  private parseStringArrayOption(
    value: unknown,
    context: { option: string; source: string }
  ): string[] {
    if (Array.isArray(value)) {
      const coerced = value.map(item => this.coerceStringLiteral(item)).filter((v): v is string => v !== null);
      if (coerced.length !== value.length) {
        throw new MlldImportError(`Import with { ${context.option}: [...] } only supports string values`, {
          code: 'DIRECTORY_IMPORT_INVALID_OPTION',
          details: { option: context.option, source: context.source }
        });
      }
      return coerced;
    }

    if (this.isArrayLiteralAst(value)) {
      const coerced = value.items.map(item => this.coerceStringLiteral(item)).filter((v): v is string => v !== null);
      if (coerced.length !== value.items.length) {
        throw new MlldImportError(`Import with { ${context.option}: [...] } only supports string values`, {
          code: 'DIRECTORY_IMPORT_INVALID_OPTION',
          details: { option: context.option, source: context.source }
        });
      }
      return coerced;
    }

    throw new MlldImportError(`Import with { ${context.option}: [...] } expects an array`, {
      code: 'DIRECTORY_IMPORT_INVALID_OPTION',
      details: { option: context.option, source: context.source }
    });
  }

  private isArrayLiteralAst(value: unknown): value is { type: 'array'; items: unknown[] } {
    return Boolean(
      value &&
        typeof value === 'object' &&
        'type' in value &&
        (value as any).type === 'array' &&
        'items' in value &&
        Array.isArray((value as any).items)
    );
  }

  private coerceStringLiteral(value: unknown): string | null {
    if (typeof value === 'string') {
      return value;
    }

    if (value && typeof value === 'object') {
      if ((value as any).type === 'Literal' && (value as any).valueType === 'string') {
        return String((value as any).value ?? '');
      }

      if ('content' in value && Array.isArray((value as any).content)) {
        const parts = (value as any).content as any[];
        const hasOnlyLiteralOrText = parts.every(
          node =>
            node &&
            typeof node === 'object' &&
            ((node.type === 'Literal' && 'value' in node) || (node.type === 'Text' && 'content' in node))
        );
        if (!hasOnlyLiteralOrText) {
          return null;
        }
        return parts.map(node => (node.type === 'Literal' ? String(node.value ?? '') : String(node.content ?? ''))).join('');
      }
    }

    return null;
  }

  private shouldSkipDirectory(dirName: string, patterns: string[]): boolean {
    return patterns.some(pattern => minimatch(dirName, pattern, { dot: true }));
  }

  private sanitizeDirectoryKey(name: string): string {
    // Preserve hyphens in directory names - they're valid in mlld identifiers
    const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    return sanitized.length > 0 ? sanitized : 'module';
  }

  /**
   * Import from resolver content (already resolved)
   */
  private async importFromResolverContent(
    directive: DirectiveNode,
    ref: string,
    resolverContent: { content: string; contentType: 'module' | 'data' | 'text'; metadata?: any },
    env: Environment
  ): Promise<EvalResult> {
    // Check for circular imports
    if (this.securityValidator.checkCircularImports(ref)) {
      throw new Error(`Circular import detected: ${ref}`);
    }

    try {
      if (process.env.MLLD_DEBUG === 'true') {
        console.log(`[ImportDirectiveEvaluator] Resolver content for ${ref}:`, {
          contentLength: resolverContent.content.length,
          contentType: resolverContent.contentType,
          firstChars: resolverContent.content.substring(0, 100)
        });
      }
      
      // Process the content through our content processor
      
      const processingRef = typeof resolverContent.metadata?.source === 'string'
        ? resolverContent.metadata.source
        : ref;

      const processingResult = await this.contentProcessor.processResolverContent(
        resolverContent.content,
        processingRef,
        directive,
        resolverContent.contentType,
        resolverContent.mx?.labels
      );

      this.validateModuleResult(processingResult, directive, processingRef);


      if (process.env.MLLD_DEBUG === 'true') {
        console.log(`[ImportDirectiveEvaluator] Processing result for ${ref}:`, {
          moduleObjectKeys: Object.keys(processingResult.moduleObject),
          moduleObjectSize: Object.keys(processingResult.moduleObject).length,
          hasFrontmatter: processingResult.frontmatter !== null
        });
      }

      // Import variables into environment
      await this.variableImporter.importVariables(processingResult, directive, env);
      this.applyPolicyImportContext(directive, env, processingRef);

      const dynamicSource = resolverContent.mx?.source;
      if (dynamicSource && typeof dynamicSource === 'string' && dynamicSource.startsWith('dynamic://')) {
        const childVariables = processingResult.childEnvironment.getAllVariables?.();
        const parentVariables = env.getAllVariables?.();
        const exportedNames =
          env.getExportManifest()?.getNames?.() ??
          (Array.isArray(resolverContent.metadata?.exports)
            ? (resolverContent.metadata.exports as string[])
            : undefined) ??
          processingResult.childEnvironment.getExportManifest?.()?.getNames?.() ??
          (childVariables ? Array.from(childVariables.keys()) : undefined) ??
          (parentVariables ? Array.from(parentVariables.keys()) : undefined) ??
          Object.keys(processingResult.moduleObject ?? {});
        const provenance =
          env.isProvenanceEnabled?.() === true
            ? resolverContent.metadata?.provenance ??
              this.buildDynamicImportProvenance(dynamicSource ?? ref, env)
            : undefined;
        env.emitSDKEvent({
          type: 'debug:import:dynamic',
          path: ref,
          source: dynamicSource,
          tainted: true,
          variables: exportedNames,
          timestamp: Date.now(),
          ...(provenance && { provenance })
        });
      }

      return { value: undefined, env };
    } finally {
      // Import tracking handled by ModuleContentProcessor.processResolverContent
    }
  }


  /**
   * Get export data from resolver with format support
   */
  private async getResolverExportData(
    resolver: any,
    directive: DirectiveNode,
    resolverName: string
  ): Promise<Record<string, any>> {
    // Handle selected imports with format support
    if (directive.subtype === 'importSelected') {
      const imports = directive.values?.imports || [];
      
      // For single format import like: @import { "iso" as date } from @TIME
      if (imports.length === 1) {
        const importNode = imports[0];
        const format = importNode.identifier.replace(/^["']|["']$/g, ''); // Remove quotes
        
        // Check if this is a format string (quoted)
        if (importNode.identifier.startsWith('"') || importNode.identifier.startsWith('\'')) {
          const exportData = await resolver.getExportData(format);
          
          // Return single item for direct import
          return { [importNode.alias || format]: exportData[format] };
        }
      }
      
      // Otherwise get all export data for field selection
      return await resolver.getExportData();
    } else {
      // Import all - get all export data
      return await resolver.getExportData();
    }
  }

  /**
   * Fallback resolver data handling
   */
  private async fallbackResolverData(
    resolver: any,
    directive: DirectiveNode,
    resolverName: string,
    resolvedResult?: { contentType: string; content: any }
  ): Promise<Record<string, any>> {
    const requestedImports = directive.subtype === 'importSelected' 
      ? (directive.values?.imports || []).map((imp: any) => imp.identifier)
      : undefined;
    
    const result =
      resolvedResult ??
      (await resolver.resolve(`@${resolverName}`, {
        context: 'import',
        requestedImports
      }));
    
    // If content is JSON string (data type), parse it
    if (result.contentType === 'data' && typeof result.content === 'string') {
      try {
        return JSON.parse(result.content);
      } catch (e) {
        return { value: result.content };
      }
    } else if (result.contentType === 'data' && typeof result.content === 'object' && result.content !== null) {
      // Content is already an object (e.g., from keychain resolver with executable exports)
      return result.content;
    } else {
      return { value: result.content };
    }
  }

  /**
   * Import variables from resolver data
   */
  private async importResolverVariables(
    directive: DirectiveNode,
    exportData: Record<string, any>,
    env: Environment,
    sourcePath: string
  ): Promise<void> {
    const securityLabels = (directive.meta?.securityLabels || directive.values?.securityLabels) as DataLabel[] | undefined;
    if (directive.subtype === 'importSelected') {
      const imports = directive.values?.imports || [];
      for (const importItem of imports) {
        let varName = importItem.identifier.replace(/^["']|["']$/g, ''); // Remove quotes
        const alias = importItem.alias || varName;
        
        if (varName in exportData) {
          const value = exportData[varName];
        const variable = this.variableImporter.createVariableFromValue(alias, value, sourcePath, varName, {
          securityLabels,
          env
        });
          env.setVariable(alias, variable);
        } else {
          throw new Error(`Export '${varName}' not found in resolver '${sourcePath}'`);
        }
      }
    } else {
      // Import all exports
      for (const [name, value] of Object.entries(exportData)) {
        const variable = this.variableImporter.createVariableFromValue(name, value, sourcePath, undefined, {
          securityLabels,
          env
        });
        env.setVariable(name, variable);
      }
    }
  }

  private buildModuleCandidates(resolution: ImportResolution): string[] {
    const baseRef = resolution.resolvedPath;
    const extension = resolution.moduleExtension;
    const candidates: string[] = [];

    if (extension) {
      candidates.push(`${baseRef}${extension}`);
      candidates.push(baseRef);
      return candidates;
    }

    const seen = new Set<string>();

    for (const ext of MODULE_SOURCE_EXTENSIONS) {
      const candidate = `${baseRef}${ext}`;
      if (!seen.has(candidate)) {
        seen.add(candidate);
        candidates.push(candidate);
      }
    }

    if (!seen.has(baseRef)) {
      candidates.push(baseRef);
    }

    return candidates;
  }
  /**
   * Extract section content from markdown (copied from original)
   */
  private extractSection(content: string, sectionName: string): string {
    const lines = content.split('\n');
    const sectionRegex = new RegExp(`^#+\\s+${sectionName}\\s*$`, 'i');
    
    let inSection = false;
    let sectionLevel = 0;
    const sectionLines: string[] = [];
    
    for (const line of lines) {
      if (!inSection && sectionRegex.test(line)) {
        inSection = true;
        sectionLevel = line.match(/^#+/)?.[0].length || 0;
        continue;
      }
      
      if (inSection) {
        const headerMatch = line.match(/^(#+)\\s+/);
        if (headerMatch && headerMatch[1].length <= sectionLevel) {
          break;
        }
        
        sectionLines.push(line);
      }
    }
    
    return sectionLines.join('\n').trim();
  }

  /**
   * Validate resolved version against lock file version
   */
  private async validateLockFileVersion(
    candidate: string,
    resolverContent: { content: string; contentType: 'module' | 'data' | 'text'; metadata?: any },
    env: Environment
  ): Promise<void> {
    // Only validate registry modules (those with version metadata)
    if (!resolverContent.metadata?.version || !resolverContent.metadata?.source?.startsWith('registry://')) {
      return;
    }

    // Extract the module reference from the source
    const registrySource = resolverContent.metadata.source as string;
    const moduleMatch = registrySource.match(/^registry:\/\/(@[^@]+)@(.+)$/);
    if (!moduleMatch) {
      return; // Not a registry module format
    }

    const [, moduleRef, resolvedVersion] = moduleMatch;

    // Get registry manager to access lock file
    const registryManager = env.getRegistryManager();
    if (!registryManager) {
      return; // No registry manager available
    }

    const lockFile = registryManager.getLockFile();
    const lockEntry = lockFile.getImport(moduleRef);

    if (!lockEntry) {
      // No lock entry found - this is acceptable for new modules
      // Future enhancement: could warn about unlocked modules
      return;
    }

    // Compare versions if lock entry has registryVersion
    if (lockEntry.registryVersion) {
      if (lockEntry.registryVersion !== resolvedVersion) {
        throw new Error(
          `Locked version mismatch for ${moduleRef}: ` +
          `lock file has version ${lockEntry.registryVersion}, ` +
          `but resolved to version ${resolvedVersion}. ` +
          `Run 'mlld install' to update the lock file or specify the locked version explicitly.`
        );
      }
    } else {
      // Legacy lock entry without version - handle gracefully
      if (process.env.MLLD_DEBUG === 'true') {
        console.warn(`[LockFileValidation] No version field in lock entry for ${moduleRef}. Resolved to ${resolvedVersion}.`);
      }
      // Don't fail for legacy entries, but could update the lock entry with the resolved version
      // This provides a migration path for existing lock files
    }
  }

  private buildDynamicImportProvenance(source: string | undefined, env: Environment) {
    const snapshot = env.getSecuritySnapshot?.();
    const normalizedSource = source
      ? source.startsWith('dynamic://')
        ? source
        : `dynamic://${source}`
      : 'dynamic://';
    return makeSecurityDescriptor({
      labels: [],
      taint: snapshot?.taint ?? ['src:dynamic'],
      sources: snapshot?.sources && snapshot.sources.length > 0 ? snapshot.sources : [normalizedSource],
      policyContext: snapshot?.policy
    });
  }

  /**
   * Handle import errors with detailed context
   */
  private handleImportError(error: any, directive: DirectiveNode, env: Environment): EvalResult {
    // Enhanced error context could be added here
    throw error;
  }

  private async withPolicyOverride<T>(
    directive: DirectiveNode,
    env: Environment,
    operation: () => Promise<T>
  ): Promise<T> {
    const overrideConfig = (directive.values as any)?.withClause?.policy as PolicyConfig | undefined;
    if (!overrideConfig) {
      return await operation();
    }

    const previousContext = env.getPolicyContext();
    const mergedConfig = mergePolicyConfigs(
      previousContext?.configs as PolicyConfig | undefined,
      normalizePolicyConfig(overrideConfig)
    );
    const nextContext = {
      tier: previousContext?.tier ?? null,
      configs: mergedConfig ?? {},
      activePolicies: previousContext?.activePolicies ?? []
    };

    env.setPolicyContext(nextContext);
    try {
      return await operation();
    } finally {
      env.setPolicyContext(previousContext ?? null);
    }
  }

  private applyPolicyImportContext(
    directive: DirectiveNode,
    env: Environment,
    source?: string
  ): void {
    const isPolicyImport =
      directive.subtype === 'importPolicy' ||
      (directive.meta as any)?.importType === 'policy' ||
      (directive.values as any)?.importType === 'policy';
    if (!isPolicyImport) {
      return;
    }

    const existing = (env.getPolicyContext() as any) || {};
    const activePolicies = Array.isArray(existing.activePolicies)
      ? [...existing.activePolicies]
      : [];
    // Support both VariableReference (identifier) and Text (content) node types
    const namespaceNode = (directive.values as any)?.namespace?.[0];
    const alias =
      namespaceNode?.identifier ||
      namespaceNode?.content ||
      (directive.values as any)?.imports?.[0]?.alias ||
      (directive.values as any)?.imports?.[0]?.identifier ||
      source ||
      'policy';
    if (!activePolicies.includes(alias)) {
      activePolicies.push(alias);
    }

    const nextContext = {
      tier: existing.tier ?? null,
      configs: existing.configs ?? {},
      activePolicies
    };
    env.setPolicyContext(nextContext);
  }

  private validateModuleResult(
    result: ModuleProcessingResult,
    directive: DirectiveNode,
    source?: string
  ): void {
    this.enforceModuleNeeds(result.moduleNeeds, source);
    this.validateExportBindings(result.moduleObject, directive, source);
  }

  private enforceModuleNeeds(needs: NeedsDeclaration | undefined, source?: string): void {
    if (!needs) {
      return;
    }

    const unmet = this.findUnmetNeeds(needs);
    if (unmet.length === 0) {
      return;
    }

    const detailLines = unmet.map(entry => {
      const valueSegment = entry.value ? ` '${entry.value}'` : '';
      return `- ${entry.capability}${valueSegment}: ${entry.reason}`;
    });
    const label = source ?? 'import';
    const message = `Import needs not satisfied for ${label}:\n${detailLines.join('\n')}`;

    throw new MlldImportError(message, {
      code: 'NEEDS_UNMET',
      details: {
        source: label,
        unmet,
        needs
      }
    });
  }

  private findUnmetNeeds(needs: NeedsDeclaration): Array<{ capability: string; value?: string; reason: string }> {
    const unmet: Array<{ capability: string; value?: string; reason: string }> = [];

    if (needs.sh && !this.isCommandAvailable('sh')) {
      unmet.push({ capability: 'sh', reason: 'shell executable not available (sh)' });
    }

    if (needs.cmd) {
      for (const cmd of this.collectCommandNames(needs.cmd)) {
        if (!this.isCommandAvailable(cmd)) {
          unmet.push({ capability: 'cmd', value: cmd, reason: 'command not found in PATH' });
        }
      }
    }

    if (needs.packages) {
      const basePath = this.env.getBasePath ? this.env.getBasePath() : process.cwd();
      const moduleDir = this.env.getCurrentFilePath ? path.dirname(this.env.getCurrentFilePath() ?? basePath) : basePath;
      for (const [ecosystem, packages] of Object.entries(needs.packages)) {
        if (!Array.isArray(packages)) {
          continue;
        }
        switch (ecosystem) {
          case 'node':
            for (const pkg of packages) {
              if (!this.isNodePackageAvailable(pkg.name, moduleDir)) {
                unmet.push({ capability: 'node', value: pkg.name, reason: 'package not installed' });
              }
            }
            break;
          case 'python':
          case 'py':
            if (!this.isRuntimeAvailable(['python', 'python3'])) {
              unmet.push({ capability: 'python', reason: 'python runtime not available' });
            }
            break;
          case 'ruby':
          case 'rb':
            if (!this.isRuntimeAvailable(['ruby'])) {
              unmet.push({ capability: 'ruby', reason: 'ruby runtime not available' });
            }
            break;
          case 'go':
            if (!this.isRuntimeAvailable(['go'])) {
              unmet.push({ capability: 'go', reason: 'go runtime not available' });
            }
            break;
          case 'rust':
            if (!this.isRuntimeAvailable(['cargo', 'rustc'])) {
              unmet.push({ capability: 'rust', reason: 'rust toolchain not available' });
            }
            break;
          default:
            break;
        }
      }
    }

    return unmet;
  }

  private collectCommandNames(cmdNeeds: CommandNeeds): string[] {
    if (cmdNeeds.type === 'all') {
      return [];
    }
    if (cmdNeeds.type === 'list') {
      return cmdNeeds.commands;
    }
    return Object.keys(cmdNeeds.entries ?? {});
  }

  private isCommandAvailable(command: string): boolean {
    if (!command || typeof command !== 'string') {
      return false;
    }

    const binary = process.platform === 'win32' ? 'where' : 'which';
    const result = spawnSync(binary, [command], {
      stdio: 'ignore'
    });
    return result.status === 0;
  }

  private isRuntimeAvailable(candidates: string[]): boolean {
    return candidates.some(cmd => this.isCommandAvailable(cmd));
  }

  private isNodePackageAvailable(name: string, basePath: string): boolean {
    try {
      // Use createRequire for ESM compatibility
      const esmRequire = createRequire(import.meta.url);
      esmRequire.resolve(name, { paths: [basePath] });
      return true;
    } catch {
      return false;
    }
  }

  private validateExportBindings(moduleObject: Record<string, any>, directive: DirectiveNode, source?: string): void {
    if (!directive.values) {
      return;
    }

    const exportKeys = Object.keys(moduleObject || {}).filter(key => !key.startsWith('__'));

    if (directive.subtype !== 'importSelected') {
      return;
    }

    // @payload and @state are dynamic modules where fields are optional CLI arguments.
    // Missing fields should default to null rather than throwing an error.
    if (source === '@payload' || source === '@state') {
      return;
    }

    const imports = directive.values?.imports ?? [];
    for (const importItem of imports) {
      const name = (importItem as any)?.identifier;
      if (typeof name !== 'string') {
        continue;
      }
      if (!exportKeys.includes(name)) {
        throw new MlldImportError(`Import '${name}' not found in module '${source ?? 'import'}'`, {
          code: 'IMPORT_EXPORT_MISSING',
          details: { source, missing: name }
        });
      }
    }
  }
}
