import type { DirectiveNode, ImportDirectiveNode } from '@core/types';
import type { ImportType } from '@core/types/security';
import type { Environment } from '../../env/Environment';
import type { EvalResult } from '../../core/interpreter';
import { ImportPathResolver, ImportResolution } from './ImportPathResolver';
import { ImportSecurityValidator } from './ImportSecurityValidator';
import { ModuleContentProcessor } from './ModuleContentProcessor';
import { VariableImporter } from './VariableImporter';
import { ObjectReferenceResolver } from './ObjectReferenceResolver';
import { MlldImportError } from '@core/errors';
// createVariableFromValue is now part of VariableImporter
import { interpolate } from '../../core/interpreter';

const MODULE_SOURCE_EXTENSIONS = ['.mld', '.mlld', '.mld.md', '.mlld.md', '.md'] as const;

function matchesModuleExtension(candidate: string): boolean {
  return MODULE_SOURCE_EXTENSIONS.some(ext => candidate.endsWith(ext));
}

/**
 * Main coordinator for import directive evaluation
 * Orchestrates all import processing components
 */
export class ImportDirectiveEvaluator {
  private pathResolver: ImportPathResolver;
  private securityValidator: ImportSecurityValidator;
  private contentProcessor: ModuleContentProcessor;
  private variableImporter: VariableImporter;
  private objectResolver: ObjectReferenceResolver;
  // TODO: Integrate capability context construction when import types and security descriptors land.

  constructor(env: Environment) {
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
      // 1. Resolve the import path and determine import type
      const resolution = await this.pathResolver.resolveImportPath(directive);

      const importContext = this.resolveImportType(directive, resolution);
      resolution.importType = importContext.importType;
      if (importContext.cacheDurationMs !== undefined) {
        resolution.cacheDurationMs = importContext.cacheDurationMs;
      }

      // 2. Route to appropriate handler based on import type
      return await this.routeImportRequest(resolution, directive, env);

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
      
      case 'file':
      case 'url':
        return this.evaluateFileImport(resolution, directive, env);
      
      default:
        throw new Error(`Unknown import type: ${(resolution as any).type}`);
    }
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

    if (name === 'base' || name === 'project') {
      return 'static';
    }

    return 'live';
  }

  private validateDeclaredImportType(type: ImportType, resolution: ImportResolution): void {
    const resolverName = resolution.resolverName?.toLowerCase();

    switch (type) {
      case 'module':
        if (resolution.type !== 'module') {
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
        if (resolution.type === 'resolver' && (resolverName === 'base' || resolverName === 'project')) {
          return;
        }
        throw new MlldImportError("Import type 'static' supports local files or @base/@project resolver paths.", {
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

    // Try case-sensitive first, then uppercase for backward compatibility
    const resolver = resolverManager.getResolver(resolverName) || 
                    resolverManager.getResolver(resolverName.toUpperCase());
    if (!resolver) {
      throw new Error(`Resolver '${resolverName}' not found`);
    }

    // Check if resolver supports imports
    if (!resolver.capabilities.contexts.import) {
      const { ResolverError } = await import('@core/errors');
      throw ResolverError.unsupportedCapability(resolver.name, 'imports', 'import');
    }

    // Get export data from resolver
    let exportData: Record<string, any> = {};
    
    if ('getExportData' in resolver) {
      exportData = await this.getResolverExportData(resolver as any, directive, resolverName);
    } else {
      exportData = await this.fallbackResolverData(resolver, directive, resolverName);
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
    const candidates = this.buildModuleCandidates(resolution);
    let lastError: unknown = undefined;

    for (const candidate of candidates) {
      try {
        const resolverContent = await env.resolveModule(candidate, 'import');

        const treatAsModule = resolverContent.contentType === 'module'
          || matchesModuleExtension(candidate);

        if (!treatAsModule) {
          lastError = new Error(
            `Import target is not a module: ${candidate} (content type: ${resolverContent.contentType})`
          );
          continue;
        }

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
   * Handle file and URL imports
   */
  private async evaluateFileImport(
    resolution: ImportResolution,
    directive: DirectiveNode,
    env: Environment
  ): Promise<EvalResult> {
    // Process the file/URL content (handles its own import tracking)
    const processingResult = await this.contentProcessor.processModuleContent(resolution, directive);

    // Import variables into environment
    await this.variableImporter.importVariables(processingResult, directive, env);

    return { value: undefined, env };
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
      // Mark that we're importing this reference
      env.beginImport(ref);
      
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
        resolverContent.contentType
      );
      

      if (process.env.MLLD_DEBUG === 'true') {
        console.log(`[ImportDirectiveEvaluator] Processing result for ${ref}:`, {
          moduleObjectKeys: Object.keys(processingResult.moduleObject),
          moduleObjectSize: Object.keys(processingResult.moduleObject).length,
          hasFrontmatter: processingResult.frontmatter !== null
        });
      }

      // Import variables into environment
      await this.variableImporter.importVariables(processingResult, directive, env);

      return { value: undefined, env };
    } finally {
      // End import tracking
      env.endImport(ref);
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
    resolverName: string
  ): Promise<Record<string, any>> {
    const requestedImports = directive.subtype === 'importSelected' 
      ? (directive.values?.imports || []).map((imp: any) => imp.identifier)
      : undefined;
    
    const result = await resolver.resolve(`@${resolverName}`, {
      context: 'import',
      requestedImports
    });
    
    // If content is JSON string (data type), parse it
    if (result.contentType === 'data' && typeof result.content === 'string') {
      try {
        return JSON.parse(result.content);
      } catch (e) {
        return { value: result.content };
      }
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
    if (directive.subtype === 'importSelected') {
      const imports = directive.values?.imports || [];
      for (const importItem of imports) {
        let varName = importItem.identifier.replace(/^["']|["']$/g, ''); // Remove quotes
        const alias = importItem.alias || varName;
        
        if (varName in exportData) {
          const value = exportData[varName];
          const variable = this.variableImporter.createVariableFromValue(alias, value, sourcePath, varName);
          env.setVariable(alias, variable);
        } else {
          throw new Error(`Export '${varName}' not found in resolver '${sourcePath}'`);
        }
      }
    } else {
      // Import all exports
      for (const [name, value] of Object.entries(exportData)) {
        const variable = this.variableImporter.createVariableFromValue(name, value, sourcePath);
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

  /**
   * Handle import errors with detailed context
   */
  private handleImportError(error: any, directive: DirectiveNode, env: Environment): EvalResult {
    // Enhanced error context could be added here
    throw error;
  }
}
