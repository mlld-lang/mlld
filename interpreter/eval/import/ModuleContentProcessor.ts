import type { DirectiveNode } from '@core/types';
import type { Environment } from '../../env/Environment';
import { ImportResolution } from './ImportSecurityValidator';
import { ImportSecurityValidator } from './ImportSecurityValidator';
import { VariableImporter } from './VariableImporter';
import { ExportManifest } from './ExportManifest';
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
      // Disallow importing template files (.att/.mtt). Use /exe ... = template "path" instead.
      const lowerPath = resolvedPath.toLowerCase();
      if (lowerPath.endsWith('.att') || lowerPath.endsWith('.mtt')) {
        const { MlldImportError } = await import('@core/errors');
        // Try to infer a friendly suggested name from the directive
        let suggestedName = 'template';
        try {
          const ns = (directive as any)?.values?.namespace;
          if (Array.isArray(ns) && ns[0]?.content) suggestedName = ns[0].content;
          const firstImport = (directive as any)?.values?.imports?.[0];
          if (firstImport?.alias) suggestedName = firstImport.alias;
        } catch {}
        const example = `/exe @${suggestedName}(param1, param2) = template "${resolvedPath}"
/show @${suggestedName}("value1", "value2")`;
        throw new MlldImportError(
          `Template files cannot be imported: ${resolvedPath}. Use an executable template instead.`,
          {
            code: 'TEMPLATE_IMPORT_NOT_ALLOWED',
            context: {
              hint: 'Define an /exe that loads the template file and declares parameters.',
              example
            },
            details: { filePath: resolvedPath }
          }
        );
      }

      // Read content from source
      const content = await this.readContentFromSource(resolvedPath, isURL);

      // Cache the source content for error reporting
      this.env.cacheSource(resolvedPath, content);

      // Validate security (including hash validation, but NOT circular imports since we're tracking now)
      await this.securityValidator.validateContentSecurity(resolution, content);

      // Parse content based on type and capture processed content
      const { parsed, processedContent, isPlainText, templateSyntax } = await this.parseContentByType(
        content,
        resolvedPath,
        directive
      );

      // Check if this is a JSON file (special handling)
      if (resolvedPath.endsWith('.json')) {
        return this.processJSONContent(parsed, directive, resolvedPath);
      }

      // Check if this is plain text content (not mlld)
      if (isPlainText) {
        return this.processPlainTextContent(resolvedPath);
      }

      // Handle raw template files (.att for @var, .mtt for mustache)
      if (!parsed && templateSyntax) {
        return this.processRawTemplate(processedContent, templateSyntax, resolvedPath);
      }

      // Process mlld content
      return this.processMLLDContent(parsed, processedContent, resolvedPath, isURL);
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
      // Disallow importing template files (.att/.mtt). Use /exe ... = template "path" instead.
      const lowerRef = ref.toLowerCase();
      if (lowerRef.endsWith('.att') || lowerRef.endsWith('.mtt')) {
        const { MlldImportError } = await import('@core/errors');
        let suggestedName = 'template';
        try {
          const ns = (directive as any)?.values?.namespace;
          if (Array.isArray(ns) && ns[0]?.content) suggestedName = ns[0].content;
          const firstImport = (directive as any)?.values?.imports?.[0];
          if (firstImport?.alias) suggestedName = firstImport.alias;
        } catch {}
        const example = `/exe @${suggestedName}(param1, param2) = template "${ref}"
/show @${suggestedName}("value1", "value2")`;
        throw new MlldImportError(
          `Template files cannot be imported: ${ref}. Use an executable template instead.`,
          {
            code: 'TEMPLATE_IMPORT_NOT_ALLOWED',
            context: {
              hint: 'Define an /exe that loads the template file and declares parameters.',
              example
            },
            details: { filePath: ref }
          }
        );
      }

      if (process.env.MLLD_DEBUG === 'true') {
        console.log(`[ModuleContentProcessor] Processing resolver content for: ${ref}`);
        console.log(`[ModuleContentProcessor] Content length: ${content.length}`);
        console.log(`[ModuleContentProcessor] Content preview: ${content.substring(0, 200)}`);
      }

      // Cache the source content for error reporting
      this.env.cacheSource(ref, content);

      // Parse content based on type
      const { parsed, processedContent, isPlainText, templateSyntax } = await this.parseContentByType(
        content,
        ref,
        directive
      );

      // Check if this is a JSON file (special handling)
      if (ref.endsWith('.json')) {
        return this.processJSONContent(parsed, directive, ref);
      }

      // Check if this is plain text content (not mlld)
      if (isPlainText) {
        return this.processPlainTextContent(ref);
      }

      // Handle raw template files (.att for @var, .mtt for mustache)
      if (!parsed && templateSyntax) {
        return this.processRawTemplate(processedContent, templateSyntax, ref);
      }

      // Process mlld content
      const result = await this.processMLLDContent(parsed, processedContent, ref, false);
      
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
  ): Promise<{ parsed: any | null; processedContent: string; isPlainText: boolean; templateSyntax?: 'tripleColon' | 'doubleColon' }> {
    // Check if this is a JSON file
    if (resolvedPath.endsWith('.json')) {
      try {
        return { parsed: JSON.parse(content), processedContent: content, isPlainText: false };
      } catch (error) {
        throw new Error(`Failed to parse JSON file '${resolvedPath}': ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // New: explicit template file handling
    // .att = "at template" using @var references
    if (resolvedPath.endsWith('.att')) {
      return { parsed: null, processedContent: content, isPlainText: false, templateSyntax: 'doubleColon' };
    }
    // .mtt = mustache-template using {{var}} references
    if (resolvedPath.endsWith('.mtt')) {
      return { parsed: null, processedContent: content, isPlainText: false, templateSyntax: 'tripleColon' };
    }

    // Only parse .mld and .md files as mlld content
    // All other files (like .txt) should be treated as plain text
    if (!resolvedPath.endsWith('.mld') && !resolvedPath.endsWith('.md')) {
      // Return a marker indicating this is plain text content
      return { parsed: { isPlainText: true }, processedContent: content, isPlainText: true };
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

    // Removed: triple-colon detection for .mld/.mld.md imports.
    // External template detection now uses .att and .mtt extensions.

    // Parse the imported mlld content
    const parseResult = await parse(processedContent);

    // Check if parsing succeeded
    if (!parseResult.success) {
      this.handleParseError(parseResult.error, resolvedPath);
    }

    return { parsed: parseResult, processedContent, isPlainText: false };
  }

  /**
   * Process plain text content (non-mlld files like .txt)
   */
  private async processPlainTextContent(
    resolvedPath: string
  ): Promise<ModuleProcessingResult> {
    // Plain text files create an empty namespace
    const moduleObject: Record<string, any> = {};

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
   * Process raw template content without parsing
   */
  private async processRawTemplate(
    content: string,
    templateSyntax: 'doubleColon' | 'tripleColon',
    resolvedPath: string
  ): Promise<ModuleProcessingResult> {
    let finalContent = content;
    let finalSyntax: 'doubleColon' | 'tripleColon' = templateSyntax;
    if (templateSyntax === 'tripleColon') {
      // Convert {{var}} to @var for our internal template AST
      finalContent = content.replace(/{{\s*([\w\.]+)\s*}}/g, '@$1');
      finalSyntax = 'doubleColon';
    }

    const moduleObject: Record<string, any> = {
      default: {
        __template: true,
        content: finalContent,
        templateSyntax: finalSyntax,
        templateAst: this.buildTemplateAst(finalContent)
      }
    };

    const childEnv = this.env.createChild(path.dirname(resolvedPath));
    childEnv.setCurrentFilePath(resolvedPath);

    return {
      moduleObject,
      frontmatter: null,
      childEnvironment: childEnv
    };
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
    sourceContent: string,
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

    if (this.containsExportDirective(ast)) {
      // Seed the child environment with an empty manifest so subsequent
      // /export directives can accumulate entries during evaluation.
      childEnv.setExportManifest(new ExportManifest());
    } else {
      // Use `null` to signal the auto-export fallback (no explicit manifest).
      childEnv.setExportManifest(null);
    }

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
    const exportManifest = childEnv.getExportManifest();
    const { moduleObject, frontmatter } = this.variableImporter.processModuleExports(
      childVars,
      { frontmatter: frontmatterData },
      undefined,
      exportManifest
    );

    // Add __meta__ property with frontmatter if available
    if (frontmatter) {
      moduleObject.__meta__ = frontmatter;
    }

    // If no variables were exported, treat the entire file as a template
    if (Object.keys(moduleObject).length === 0 && (resolvedPath.endsWith('.mld') || resolvedPath.endsWith('.mld.md'))) {
      // Only wrap as template if the file has substantive content (not just comments/whitespace)
      const hasSubstantive = this.hasSubstantiveContent(sourceContent);
      if (!hasSubstantive) {
        return {
          moduleObject,
          frontmatter,
          childEnvironment: childEnv
        };
      }
      let templateSyntax: 'doubleColon' | 'tripleColon' = 'doubleColon';
      let templateContent = sourceContent;
      const trimmedSource = sourceContent.trim();
      if (trimmedSource.startsWith(':::')) {
        templateSyntax = 'tripleColon';
        templateContent = trimmedSource.slice(3).trimStart();
        if (templateContent.endsWith(':::')) {
          templateContent = templateContent.slice(0, -3).trimEnd();
        }
      }

      moduleObject.default = {
        __template: true,
        content: templateContent,
        templateSyntax,
        templateAst: this.buildTemplateAst(templateContent)
      };
    }

    return {
      moduleObject,
      frontmatter,
      childEnvironment: childEnv
    };
  }

  /**
   * Determine if content has substantive (non-comment, non-whitespace) text
   */
  private hasSubstantiveContent(content: string): boolean {
    const lines = content.split('\n');
    const filtered = lines.filter(l => !/^\s*(>>|<<)/.test(l) && l.trim() !== '');
    return filtered.join('').trim().length > 0;
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
   * Build a simple template AST from content with @var placeholders
   */
  private buildTemplateAst(content: string): any[] {
    const ast: any[] = [];
    const regex = /@([A-Za-z_][\w\.]*)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        ast.push({ type: 'Text', content: content.slice(lastIndex, match.index) });
      }
      ast.push({ type: 'VariableReference', identifier: match[1] });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < content.length) {
      ast.push({ type: 'Text', content: content.slice(lastIndex) });
    }
    return ast;
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

  private containsExportDirective(ast: any[]): boolean {
    return ast.some((node) => node?.type === 'Directive' && node.kind === 'export');
  }

  /**
   * Evaluate AST in child environment with error handling
   */
  private async evaluateInChildEnvironment(
    ast: any[],
    childEnv: Environment,
    resolvedPath: string
  ): Promise<any> {
    // Set the importing flag to prevent directive side effects
    childEnv.setImporting(true);

    try {
      // Pass isExpression: true to prevent markdown content from being emitted as effects
      // Imports should only process directives and create variables, not emit document content
      return await evaluate(ast, childEnv, { isExpression: true });
    } catch (error) {
      throw new Error(
        `Error evaluating imported file '${resolvedPath}': ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      // Always clear the importing flag, even if evaluation fails
      childEnv.setImporting(false);
    }
  }
}
