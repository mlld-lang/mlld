import type { DirectiveNode, ImportDirectiveNode } from '@core/types';
import { astLocationToSourceLocation } from '@core/types';
import type { DataLabel } from '@core/types/security';
import { makeSecurityDescriptor, mergeDescriptors } from '@core/types/security';
import { deriveImportTaint } from '@core/security/taint';
import type { Environment } from '../../env/Environment';
import type { EvalResult } from '../../core/interpreter';
import { ImportPathResolver, ImportResolution } from './ImportPathResolver';
import { resolveImportType } from './ImportTypePolicy';
import { ImportSecurityValidator } from './ImportSecurityValidator';
import { ModuleContentProcessor, type ModuleProcessingResult } from './ModuleContentProcessor';
import { VariableImporter } from './VariableImporter';
import { ObjectReferenceResolver } from './ObjectReferenceResolver';
import { MlldImportError } from '@core/errors';
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
import { createObjectVariable } from '@core/types/variable/VariableFactories';
import type { VariableSource, Variable } from '@core/types/variable';
import { McpImportService } from './McpImportService';
import { buildMcpToolIndex, resolveMcpServerSpec, resolveMcpTool } from './McpImportResolver';
import { ResolverImportDataAdapter } from './ResolverImportDataAdapter';
import { InputImportHandler } from './InputImportHandler';
import { ResolverImportHandler } from './ResolverImportHandler';
import { ModuleImportHandler } from './ModuleImportHandler';
import { NodeImportHandler } from './NodeImportHandler';
const DIRECTORY_INDEX_FILENAME = 'index.mld';
const DEFAULT_DIRECTORY_IMPORT_SKIP_DIRS = ['_*', '.*'] as const;

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
  private mcpImportService: McpImportService;
  private resolverImportDataAdapter: ResolverImportDataAdapter;
  private inputImportHandler: InputImportHandler;
  private resolverImportHandler: ResolverImportHandler;
  private moduleImportHandler: ModuleImportHandler;
  private nodeImportHandler: NodeImportHandler;
  // TODO: Integrate capability context construction when import types and security descriptors land.

  constructor(env: Environment) {
    this.env = env;
    this.objectResolver = new ObjectReferenceResolver();
    this.pathResolver = new ImportPathResolver(env);
    this.securityValidator = new ImportSecurityValidator(env);
    this.variableImporter = new VariableImporter(this.objectResolver);
    this.mcpImportService = new McpImportService(env);
    this.resolverImportDataAdapter = new ResolverImportDataAdapter(this.variableImporter);
    this.inputImportHandler = new InputImportHandler(this.resolverImportDataAdapter);
    this.resolverImportHandler = new ResolverImportHandler(this.resolverImportDataAdapter);
    this.moduleImportHandler = new ModuleImportHandler();
    this.nodeImportHandler = new NodeImportHandler(
      this.variableImporter,
      (result, directive, source) => this.validateModuleResult(result, directive, source),
      (directive, policyEnv, source) => this.applyPolicyImportContext(directive, policyEnv, source)
    );
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

      const importContext = resolveImportType(directive as ImportDirectiveNode, resolution);
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
        return this.inputImportHandler.evaluateInputImport(directive, env);
      
      case 'resolver':
        return this.resolverImportHandler.evaluateResolverImport(
          directive,
          resolution.resolverName!,
          env,
          async (resolverDirective, ref, resolverContent, handlerEnv) =>
            this.importFromResolverContent(resolverDirective, ref, resolverContent, handlerEnv)
        );
      
      case 'module':
        return this.moduleImportHandler.evaluateModuleImport(
          resolution,
          directive,
          env,
          async (moduleDirective, ref, resolverContent, handlerEnv) =>
            this.importFromResolverContent(moduleDirective, ref, resolverContent, handlerEnv)
        );

      case 'node':
        return this.nodeImportHandler.evaluateNodeImport(resolution, directive, env);
      
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
    const resolvedSpec = await resolveMcpServerSpec(rawSpec, env);
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

      this.mcpImportService.ensureImportBindingAvailable(alias, importDisplay, aliasLocation);

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
    this.validateExportBindings(result.moduleObject, directive, source, result.guardDefinitions);
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

  private validateExportBindings(
    moduleObject: Record<string, any>,
    directive: DirectiveNode,
    source?: string,
    guardDefinitions: readonly SerializedGuardDefinition[] = []
  ): void {
    if (!directive.values) {
      return;
    }

    const exportKeySet = new Set(
      Object.keys(moduleObject || {}).filter(key => !key.startsWith('__'))
    );
    for (const guardDefinition of guardDefinitions) {
      if (typeof guardDefinition?.name === 'string' && guardDefinition.name.length > 0) {
        exportKeySet.add(guardDefinition.name);
      }
    }

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
      if (!exportKeySet.has(name)) {
        throw new MlldImportError(`Import '${name}' not found in module '${source ?? 'import'}'`, {
          code: 'IMPORT_EXPORT_MISSING',
          details: { source, missing: name }
        });
      }
    }
  }
}
