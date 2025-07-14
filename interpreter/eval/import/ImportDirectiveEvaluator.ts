import type { DirectiveNode } from '@core/types';
import type { Environment } from '../../env/Environment';
import type { EvalResult } from '../../core/interpreter';
import { ImportPathResolver, ImportResolution } from './ImportPathResolver';
import { ImportSecurityValidator } from './ImportSecurityValidator';
import { ModuleContentProcessor } from './ModuleContentProcessor';
import { VariableImporter } from './VariableImporter';
import { ObjectReferenceResolver } from './ObjectReferenceResolver';
// createVariableFromValue is now part of VariableImporter
import { interpolate } from '../../core/interpreter';

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
    try {
      // ResolverManager will handle all @prefix/ patterns including @user/module
      const resolverContent = await env.resolveModule(resolution.resolvedPath, 'import');
      
      // Validate content type for imports
      if (resolverContent.contentType !== 'module') {
        throw new Error(
          `Import target is not a module: ${resolution.resolvedPath} (content type: ${resolverContent.contentType})`
        );
      }
      
      // Process module content directly from resolver
      return this.importFromResolverContent(directive, resolution.resolvedPath, resolverContent, env);
    } catch (error) {
      // If resolver fails, let the original error bubble up so dev mode can handle it
      throw error;
    }
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
      
      // Create a mock resolution for content processing
      const resolution: ImportResolution = {
        type: 'module',
        resolvedPath: ref
      };

      // Process the content through our content processor
      // We'll need to create a temporary file-like interface for this
      const processingResult = await this.processResolverContent(
        resolverContent.content,
        ref,
        directive,
        env
      );

      // Import variables into environment
      await this.variableImporter.importVariables(processingResult, directive, env);

      return { value: undefined, env };
    } finally {
      // End import tracking
      env.endImport(ref);
    }
  }

  /**
   * Process resolver content (similar to file content but from resolver)
   */
  private async processResolverContent(
    content: string,
    ref: string,
    directive: DirectiveNode,
    env: Environment
  ): Promise<{ moduleObject: Record<string, any>; frontmatter: Record<string, any> | null; childEnvironment: Environment }> {
    // Handle section extraction if specified
    let processedContent = content;
    const sectionNodes = directive.values?.section;
    if (sectionNodes && Array.isArray(sectionNodes)) {
      const section = await interpolate(sectionNodes, env);
      if (section) {
        processedContent = this.extractSection(content, section);
      }
    }

    // This would use the ModuleContentProcessor logic but adapted for resolver content
    // For now, we'll create a simplified version
    const { parse } = await import('@grammar/parser');
    const parseResult = await parse(processedContent);
    
    if (!parseResult.success) {
      throw new Error(`Failed to parse resolver content from '${ref}': ${parseResult.error?.message}`);
    }

    // Create child environment
    const childEnv = env.createChild(env.getBasePath());
    childEnv.setCurrentFilePath(ref);

    // Evaluate in child environment
    const { evaluate } = await import('../../core/interpreter');
    await evaluate(parseResult.ast, childEnv);

    // Process module exports
    const childVars = childEnv.getCurrentVariables();
    const { moduleObject, frontmatter } = this.variableImporter.processModuleExports(
      childVars, 
      { frontmatter: null }
    );

    return {
      moduleObject,
      frontmatter,
      childEnvironment: childEnv
    };
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
   * Handle import errors with detailed context
   */
  private handleImportError(error: any, directive: DirectiveNode, env: Environment): EvalResult {
    // Enhanced error context could be added here
    throw error;
  }
}