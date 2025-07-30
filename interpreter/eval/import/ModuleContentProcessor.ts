import type { DirectiveNode } from '@core/types';
import type { Environment } from '../../env/Environment';
import { ImportResolution } from './ImportSecurityValidator';
import { ImportSecurityValidator } from './ImportSecurityValidator';
import { VariableImporter } from './VariableImporter';
import { parse } from '@grammar/parser';
import { interpolate, evaluate } from '../../core/interpreter';
import { MlldError } from '@core/errors';
import { logger } from '@core/utils/logger';
import * as path from 'path';

export interface ModuleProcessingResult {
  moduleObject: Record<string, any>;
  frontmatter: Record<string, any> | null;
  childEnvironment: Environment;
}

/**
 * Handles content reading, parsing, and AST evaluation for imported modules
 */
export class ModuleContentProcessor {
  constructor(
    private env: Environment,
    private securityValidator: ImportSecurityValidator,
    private variableImporter: VariableImporter
  ) {}

  /**
   * Process module content from reading through evaluation
   */
  async processModuleContent(
    resolution: ImportResolution,
    directive: DirectiveNode
  ): Promise<ModuleProcessingResult> {
    const { resolvedPath } = resolution;
    const isURL = this.env.isURL(resolvedPath);

    // Begin import tracking for security
    this.securityValidator.beginImport(resolvedPath);

    try {
      // Read content from source
      const content = await this.readContentFromSource(resolvedPath, isURL);

      // Cache the source content for error reporting
      this.env.cacheSource(resolvedPath, content);

      // Validate security (including hash validation, but NOT circular imports since we're tracking now)
      await this.securityValidator.validateContentSecurity(resolution, content);

      // Parse content based on type
      const parseResult = await this.parseContentByType(content, resolvedPath, directive);

      // Check if this is a JSON file (special handling)
      if (resolvedPath.endsWith('.json')) {
        return this.processJSONContent(parseResult, directive, resolvedPath);
      }

      // Process mlld content
      return this.processMLLDContent(parseResult, resolvedPath, isURL);
    } finally {
      // End import tracking
      this.securityValidator.endImport(resolvedPath);
    }
  }

  /**
   * Process module content from resolver (content already fetched)
   */
  async processResolverContent(
    content: string,
    ref: string,
    directive: DirectiveNode
  ): Promise<ModuleProcessingResult> {
    // Begin import tracking for security
    this.securityValidator.beginImport(ref);

    try {
      if (process.env.MLLD_DEBUG === 'true') {
        console.log(`[ModuleContentProcessor] Processing resolver content for: ${ref}`);
        console.log(`[ModuleContentProcessor] Content length: ${content.length}`);
        console.log(`[ModuleContentProcessor] Content preview: ${content.substring(0, 200)}`);
      }

      // Cache the source content for error reporting
      this.env.cacheSource(ref, content);

      // Parse content based on type
      const parseResult = await this.parseContentByType(content, ref, directive);

      // Check if this is a JSON file (special handling)
      if (ref.endsWith('.json')) {
        return this.processJSONContent(parseResult, directive, ref);
      }

      // Process mlld content
      const result = await this.processMLLDContent(parseResult, ref, false);
      
      if (process.env.MLLD_DEBUG === 'true') {
        console.log(`[ModuleContentProcessor] Module object keys: ${Object.keys(result.moduleObject).join(', ')}`);
        console.log(`[ModuleContentProcessor] Has frontmatter: ${result.frontmatter !== null}`);
        console.log(`[ModuleContentProcessor] Child env vars: ${result.childEnvironment.getCurrentVariables().size}`);
        console.log(`[ModuleContentProcessor] Child env var names: ${Array.from(result.childEnvironment.getCurrentVariables().keys()).join(', ')}`);
      }
      
      return result;
    } finally {
      // End import tracking
      this.securityValidator.endImport(ref);
    }
  }

  /**
   * Read content from file or URL
   */
  private async readContentFromSource(resolvedPath: string, isURL: boolean): Promise<string> {
    try {
      return isURL
        ? await this.env.fetchURL(resolvedPath, true) // true = forImport
        : await this.env.readFile(resolvedPath);
    } catch (error) {
      throw new Error(`Failed to read imported file '${resolvedPath}': ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Parse content by type (JSON vs mlld vs text)
   */
  private async parseContentByType(
    content: string, 
    resolvedPath: string, 
    directive: DirectiveNode
  ): Promise<any> {
    // Check if this is a JSON file
    if (resolvedPath.endsWith('.json')) {
      try {
        return JSON.parse(content);
      } catch (error) {
        throw new Error(`Failed to parse JSON file '${resolvedPath}': ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Handle section extraction if specified
    let processedContent = content;
    const sectionNodes = directive.values?.section;
    if (sectionNodes && Array.isArray(sectionNodes)) {
      const section = await interpolate(sectionNodes, this.env);
      if (section) {
        processedContent = this.extractSectionContent(content, section);
      }
    }

    // Parse the imported mlld content
    const parseResult = await parse(processedContent);

    // Check if parsing succeeded
    if (!parseResult.success) {
      this.handleParseError(parseResult.error, resolvedPath);
    }

    return parseResult;
  }

  /**
   * Process JSON content into module format
   */
  private async processJSONContent(
    jsonData: any,
    directive: DirectiveNode,
    resolvedPath: string
  ): Promise<ModuleProcessingResult> {
    let moduleObject: Record<string, any> = {};

    // Convert JSON properties to module exports
    if (typeof jsonData === 'object' && jsonData !== null && !Array.isArray(jsonData)) {
      moduleObject = jsonData;
    } else {
      // Non-object JSON (array, string, number, etc.) - store as 'content'
      moduleObject = { content: jsonData };
    }

    // Create a dummy child environment for consistency
    const childEnv = this.env.createChild(path.dirname(resolvedPath));
    childEnv.setCurrentFilePath(resolvedPath);

    return {
      moduleObject,
      frontmatter: null,
      childEnvironment: childEnv
    };
  }

  /**
   * Process mlld content through full AST evaluation
   */
  private async processMLLDContent(
    parseResult: any,
    resolvedPath: string,
    isURL: boolean
  ): Promise<ModuleProcessingResult> {
    const ast = parseResult.ast;

    if (process.env.MLLD_DEBUG === 'true') {
      console.log(`[processMLLDContent] Processing ${resolvedPath}:`, {
        astLength: ast.length,
        astTypes: ast.slice(0, 10).map((n: any) => `${n.type}${n.kind ? ':' + n.kind : ''}`)
      });
    }

    // Extract and validate frontmatter
    const frontmatterData = await this.extractAndValidateFrontmatter(ast, resolvedPath);

    // Create child environment for evaluation
    const childEnv = this.createChildEnvironment(resolvedPath, isURL);

    // Evaluate AST in child environment
    const evalResult = await this.evaluateInChildEnvironment(ast, childEnv, resolvedPath);

    // Process module exports
    const childVars = childEnv.getCurrentVariables();
    
    if (process.env.MLLD_DEBUG === 'true') {
      console.log(`[processMLLDContent] After evaluation:`, {
        childVarsSize: childVars.size,
        childVarNames: Array.from(childVars.keys()),
        evalResult: evalResult?.value ? 'has value' : 'no value'
      });
    }
    const { moduleObject, frontmatter } = this.variableImporter.processModuleExports(
      childVars, 
      { frontmatter: frontmatterData }
    );

    // Add __meta__ property with frontmatter if available
    if (frontmatter) {
      moduleObject.__meta__ = frontmatter;
    }

    return {
      moduleObject,
      frontmatter,
      childEnvironment: childEnv
    };
  }

  /**
   * Extract section content from markdown
   */
  private extractSectionContent(content: string, sectionName: string): string {
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
   * Handle parse errors with detailed context
   */
  private handleParseError(parseError: any, resolvedPath: string): never {
    // Create an error that preserves the import context
    const errorMessage = parseError && 'location' in parseError
      ? `Syntax error in imported file '${resolvedPath}' at line ${parseError.location?.start?.line || '?'}: ${parseError.message || 'Unknown parse error'}`
      : `Failed to parse imported file '${resolvedPath}': ${parseError?.message || 'Unknown parse error'}`;
    
    const importError = new Error(errorMessage);
    
    // Add parse error details to the error for trace enhancement
    (importError as any).importParseError = {
      file: path.basename(resolvedPath, '.mld'),
      line: parseError?.location?.start?.line || '?',
      message: parseError?.message || 'Unknown parse error'
    };
    
    // Preserve the current trace context - the import directive is already on the stack
    // The error will be caught by evaluateDirective and enhanced with the trace
    throw importError;
  }

  /**
   * Extract and validate frontmatter from AST
   */
  private async extractAndValidateFrontmatter(
    ast: any[], 
    resolvedPath: string
  ): Promise<Record<string, any> | null> {
    let frontmatterData: Record<string, any> | null = null;
    
    if (ast.length > 0 && ast[0].type === 'Frontmatter') {
      const { parseFrontmatter } = await import('../../utils/frontmatter-parser');
      const frontmatterNode = ast[0] as any;
      frontmatterData = parseFrontmatter(frontmatterNode.content);
      
      // Check mlld version compatibility using security validator
      this.securityValidator.checkVersionCompatibility(frontmatterData, resolvedPath);
    }
    
    return frontmatterData;
  }

  /**
   * Create child environment with proper path configuration
   */
  private createChildEnvironment(resolvedPath: string, isURL: boolean): Environment {
    // For URLs, use the current directory as basePath since URLs don't have directories
    const importDir = isURL ? this.env.getBasePath() : path.dirname(resolvedPath);
    const childEnv = this.env.createChild(importDir);
    
    // Set the current file path for the imported file (for error reporting)
    childEnv.setCurrentFilePath(resolvedPath);
    
    return childEnv;
  }

  /**
   * Evaluate AST in child environment with error handling
   */
  private async evaluateInChildEnvironment(
    ast: any[], 
    childEnv: Environment, 
    resolvedPath: string
  ): Promise<any> {
    try {
      return await evaluate(ast, childEnv);
    } catch (error) {
      throw new Error(
        `Error evaluating imported file '${resolvedPath}': ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}