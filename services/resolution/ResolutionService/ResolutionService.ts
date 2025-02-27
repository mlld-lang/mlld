import * as path from 'path';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { IResolutionService, ResolutionContext, ResolutionErrorCode } from './IResolutionService.js';
import { TextResolver } from './resolvers/TextResolver.js';
import { DataResolver } from './resolvers/DataResolver.js';
import { PathResolver } from './resolvers/PathResolver.js';
import { CommandResolver } from './resolvers/CommandResolver.js';
import { ContentResolver } from './resolvers/ContentResolver.js';
import { VariableReferenceResolver } from './resolvers/VariableReferenceResolver.js';
import { resolutionLogger as logger } from '@core/utils/logger.js';
import { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { MeldNode, DirectiveNode, TextNode, DirectiveKind, CodeFenceNode } from 'meld-spec';
import type { StructuredPath } from 'meld-spec/dist/types';
import { MeldFileNotFoundError } from '@core/errors/MeldFileNotFoundError.js';
import { MeldResolutionError } from '@core/errors/MeldResolutionError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { inject, singleton } from 'tsyringe';
import { CommandContextService } from '../../command/CommandContextService';
import { MeldInterpreterError } from '../../../errors';
import {
  ResolutionContext as DeprecatedContext,
  CommandParameterResolutionContext,
  NestedResolution
} from '../ResolutionContextFactory';
import { ICommandService } from '../../command/ICommandService';
import { Command, ParameterResolutionMap } from '../../command/Command';
import { CommandParameter } from '../../../types';
import { IPathService } from '@services/fs/PathService/IPathService.js';

/**
 * Internal type for heading nodes in the ResolutionService
 * This is converted from TextNode when we detect a heading pattern
 */
interface InternalHeadingNode {
  content: string;
  level: number;
}

/**
 * Convert a TextNode to an InternalHeadingNode if it matches heading pattern
 * Returns null if the node is not a heading
 */
function parseHeadingNode(node: TextNode): InternalHeadingNode | null {
  // Instead of using regex, check the AST properties
  if (!node.content.startsWith('#')) {
    return null;
  }
  
  // Count the number of # characters at the start
  let level = 0;
  for (let i = 0; i < node.content.length && i < 6; i++) {
    if (node.content[i] === '#') {
      level++;
    } else {
      break;
    }
  }
  
  // Validate level and check for space after #s
  if (level === 0 || level > 6 || node.content[level] !== ' ') {
    return null;
  }
  
  // Extract the content after the # characters
  const content = node.content.substring(level + 1).trim();
  
  if (!content) {
    return null;
  }
  
  return {
    level,
    content
  };
}

/**
 * Check if a node is a text node that represents a heading
 */
function isHeadingTextNode(node: MeldNode): node is TextNode {
  if (node.type !== 'Text') {
    return false;
  }
  
  const textNode = node as TextNode;
  
  // Must start with at least one # and at most 6
  if (!textNode.content.startsWith('#')) {
    return false;
  }
  
  // Count the number of # characters
  let hashCount = 0;
  for (let i = 0; i < textNode.content.length && i < 6; i++) {
    if (textNode.content[i] === '#') {
      hashCount++;
    } else {
      break;
    }
  }
  
  // Valid heading must have:
  // 1. Between 1-6 hash characters
  // 2. A space after the hash characters
  // 3. Content after the space
  return (
    hashCount >= 1 && 
    hashCount <= 6 && 
    textNode.content.length > hashCount &&
    textNode.content[hashCount] === ' ' &&
    textNode.content.substring(hashCount + 1).trim().length > 0
  );
}

/**
 * Service responsible for resolving variables, commands, and paths in different contexts
 */
@singleton()
export class ResolutionService implements IResolutionService {
  private textResolver: TextResolver;
  private dataResolver: DataResolver;
  private pathResolver: PathResolver;
  private commandResolver: CommandResolver;
  private contentResolver: ContentResolver;
  private variableReferenceResolver: VariableReferenceResolver;

  constructor(
    private stateService: IStateService,
    private fileSystemService: IFileSystemService,
    private parserService: IParserService,
    private pathService: IPathService
  ) {
    this.textResolver = new TextResolver(stateService);
    this.dataResolver = new DataResolver(stateService);
    this.pathResolver = new PathResolver(stateService);
    this.commandResolver = new CommandResolver(stateService);
    this.contentResolver = new ContentResolver(stateService);
    this.variableReferenceResolver = new VariableReferenceResolver(
      stateService,
      this,
      parserService
    );
  }

  /**
   * Parse a string into AST nodes for resolution
   */
  private async parseForResolution(value: string): Promise<MeldNode[]> {
    try {
      const nodes = await this.parserService.parse(value);
      return nodes || [];
    } catch (error) {
      // If parsing fails, treat the value as literal text
      return [{
        type: 'Text',
        content: value
      } as TextNode];
    }
  }

  /**
   * Resolve text variables in a string
   */
  async resolveText(text: string, context: ResolutionContext): Promise<string> {
    const nodes = await this.parseForResolution(text);
    return this.textResolver.resolve(nodes[0] as DirectiveNode, context);
  }

  /**
   * Resolve data variables and fields
   */
  async resolveData(ref: string, context: ResolutionContext): Promise<any> {
    const nodes = await this.parseForResolution(ref);
    return this.dataResolver.resolve(nodes[0] as DirectiveNode, context);
  }

  /**
   * Resolve path variables
   */
  async resolvePath(path: string, context: ResolutionContext): Promise<string> {
    logger.debug('Resolving path', { path, context });
    const nodes = await this.parseForResolution(path);
    return this.pathResolver.resolve(nodes[0] as DirectiveNode, context);
  }

  /**
   * Resolve command references
   */
  async resolveCommand(cmd: string, args: string[], context: ResolutionContext): Promise<string> {
    const node: DirectiveNode = {
      type: 'Directive',
      directive: {
        kind: 'run',
        name: cmd,
        identifier: cmd,
        args
      }
    };
    return this.commandResolver.resolve(node, context);
  }

  /**
   * Resolve content from a file path
   */
  async resolveFile(path: string): Promise<string> {
    if (!await this.fileSystemService.exists(path)) {
      throw new MeldFileNotFoundError(path);
    }
    return this.fileSystemService.readFile(path);
  }

  /**
   * Resolve raw content nodes, preserving formatting but skipping comments
   */
  async resolveContent(nodes: MeldNode[], context: ResolutionContext): Promise<string> {
    if (!Array.isArray(nodes)) {
      // If a string path is provided, read the file
      const path = String(nodes);
      if (!await this.fileSystemService.exists(path)) {
        throw new MeldResolutionError(
          `File not found: ${path}`,
          {
            code: ResolutionErrorCode.INVALID_PATH,
            details: { value: path },
            severity: ErrorSeverity.Fatal
          }
        );
      }
      return this.fileSystemService.readFile(path);
    }

    // Otherwise, process the nodes
    return this.contentResolver.resolve(nodes, context);
  }

  /**
   * Resolve any value based on the provided context rules
   */
  async resolveInContext(value: string | StructuredPath, context: ResolutionContext): Promise<string> {
    // Add debug logging for debugging path handling issues
    logger.debug('ResolutionService.resolveInContext', {
      value: typeof value === 'string' ? value : value.raw,
      allowedVariableTypes: context.allowedVariableTypes,
      pathValidation: context.pathValidation,
      stateExists: !!context.state,
      specialPathVars: context.state ? {
        PROJECTPATH: context.state.getPathVar('PROJECTPATH'),
        HOMEPATH: context.state.getPathVar('HOMEPATH')
      } : 'state not available'
    });

    // Handle structured path objects by delegating to the dedicated method
    if (typeof value === 'object' && value !== null && 'raw' in value) {
      return this.resolveStructuredPath(value, context);
    }

    // Handle string values
    if (typeof value === 'string') {
      // Check for special direct path variable references
      if (value === '$HOMEPATH' || value === '$~') {
        const homePath = context.state?.getPathVar('HOMEPATH') || this.stateService.getPathVar('HOMEPATH');
        return homePath || '';
      }
      
      if (value === '$PROJECTPATH' || value === '$.') {
        const projectPath = context.state?.getPathVar('PROJECTPATH') || this.stateService.getPathVar('PROJECTPATH');
        return projectPath || '';
      }
      
      // Check for command references in the format $command(args)
      const commandRegex = /^\$(\w+)\(([^)]*)\)$/;
      const commandMatch = value.match(commandRegex);
      
      if (commandMatch) {
        const [, cmdName, argsStr] = commandMatch;
        // Parse args, splitting by comma but respecting quoted strings
        const args = argsStr.split(',').map(arg => arg.trim());
        
        try {
          logger.debug('Resolving command reference', { cmdName, args });
          const result = await this.resolveCommand(cmdName, args, context);
          return result;
        } catch (error) {
          logger.warn('Command execution failed', { cmdName, args, error });
          // Fall back to the command name and args, joining with spaces
          return `${cmdName} ${args.join(' ')}`;
        }
      }
      
      // Try to parse the string as a path using the parser service
      try {
        // Only attempt parsing if the string contains path variable indicators
        if (value.includes('$.') || value.includes('$~') || value.includes('$/') || value.includes('$')) {
          const nodes = await this.parseForResolution(value);
          const pathNode = nodes.find(node => 
            node.type === 'PathVar' || 
            (node.type === 'Directive' && (node as any).directive?.kind === 'path')
          );
          
          if (pathNode) {
            // Extract the structured path from the node
            let structPath: StructuredPath;
            
            if (pathNode.type === 'PathVar' && (pathNode as any).value) {
              structPath = (pathNode as any).value as StructuredPath;
              // Recursive call with the structured path
              return this.resolveStructuredPath(structPath, context);
            } else if (pathNode.type === 'Directive') {
              const directiveNode = pathNode as any;
              if (directiveNode.directive.value && 
                  typeof directiveNode.directive.value === 'object' && 
                  'raw' in directiveNode.directive.value) {
                structPath = directiveNode.directive.value as StructuredPath;
                // Recursive call with the structured path
                return this.resolveStructuredPath(structPath, context);
              }
            }
          }
        }
      } catch (error) {
        // If parsing fails, fall back to variable resolution
        logger.debug('Path parsing failed, falling back to variable resolution', { 
          error: (error as Error).message
        });
      }
    }

    // Handle string values
    return this.resolveVariables(value as string, context);
  }
  
  /**
   * Resolve variables within a string value
   * @internal Used by resolveInContext
   */
  private async resolveVariables(value: string, context: ResolutionContext): Promise<string> {
    // Check if the string contains variable references
    if (value.includes('{{') || value.includes('${') || value.includes('$')) {
      logger.debug('Resolving variables in string:', { value });
      
      // Pass to VariableReferenceResolver for both {{var}} syntax and $pathvar syntax
      return this.variableReferenceResolver.resolve(value, context);
    }
    
    return value;
  }

  /**
   * Validate that resolution is allowed in the given context
   */
  async validateResolution(value: string | StructuredPath, context: ResolutionContext): Promise<void> {
    // Convert StructuredPath to string if needed
    const stringValue = typeof value === 'string' ? value : value.raw;
    
    // Parse the value to check for variable types
    const nodes = await this.parseForResolution(stringValue);

    for (const node of nodes) {
      if (node.type !== 'Directive') continue;

      const directiveNode = node as DirectiveNode;
      // Check if the directive type is allowed
      switch (directiveNode.directive.kind) {
        case 'text':
          if (!context.allowedVariableTypes.text) {
            throw new MeldResolutionError(
              'Text variables are not allowed in this context',
              {
                code: ResolutionErrorCode.INVALID_CONTEXT,
                details: { 
                  value: value, 
                  context: JSON.stringify(context)
                },
                severity: ErrorSeverity.Fatal
              }
            );
          }
          break;

        case 'data':
          if (!context.allowedVariableTypes.data) {
            throw new MeldResolutionError(
              'Data variables are not allowed in this context',
              {
                code: ResolutionErrorCode.INVALID_CONTEXT,
                details: { 
                  value: value, 
                  context: JSON.stringify(context)
                },
                severity: ErrorSeverity.Fatal
              }
            );
          }
          break;

        case 'path':
          if (!context.allowedVariableTypes.path) {
            throw new MeldResolutionError(
              'Path variables are not allowed in this context',
              {
                code: ResolutionErrorCode.INVALID_CONTEXT,
                details: { 
                  value: value, 
                  context: JSON.stringify(context)
                },
                severity: ErrorSeverity.Fatal
              }
            );
          }
          break;

        case 'run':
          if (!context.allowedVariableTypes.command) {
            throw new MeldResolutionError(
              'Command references are not allowed in this context',
              {
                code: ResolutionErrorCode.INVALID_CONTEXT,
                details: { 
                  value: value, 
                  context: JSON.stringify(context)
                },
                severity: ErrorSeverity.Fatal
              }
            );
          }
          break;
      }
    }
  }

  /**
   * Check for circular variable references
   */
  async detectCircularReferences(value: string): Promise<void> {
    const visited = new Set<string>();
    const stack = new Set<string>();

    const checkReferences = async (text: string, currentRef?: string) => {
      // Parse the text to get variable references
      const nodes = await this.parseForResolution(text);
      if (!nodes || !Array.isArray(nodes)) {
        throw new MeldResolutionError(
          'Invalid parse result',
          {
            code: ResolutionErrorCode.SYNTAX_ERROR,
            details: { value: text },
            severity: ErrorSeverity.Fatal
          }
        );
      }

      for (const node of nodes) {
        if (node.type !== 'Directive') continue;

        const directiveNode = node as DirectiveNode;
        const ref = directiveNode.directive.identifier;
        if (!ref) continue;

        // Skip if this is a direct reference to the current variable
        if (ref === currentRef) continue;

        if (stack.has(ref)) {
          const path = Array.from(stack).join(' -> ');
          throw new MeldResolutionError(
            `Circular reference detected: ${path} -> ${ref}`,
            {
              code: ResolutionErrorCode.CIRCULAR_REFERENCE,
              details: { 
                value: text,
                variableName: ref
              },
              severity: ErrorSeverity.Fatal
            }
          );
        }

        if (!visited.has(ref)) {
          visited.add(ref);
          stack.add(ref);

          let refValue: string | undefined;

          switch (directiveNode.directive.kind) {
            case 'text':
              refValue = this.stateService.getTextVar(ref);
              break;
            case 'data':
              const dataValue = this.stateService.getDataVar(ref);
              if (dataValue && typeof dataValue === 'string') {
                refValue = dataValue;
              }
              break;
            case 'path':
              refValue = this.stateService.getPathVar(ref);
              break;
            case 'run':
              const cmdValue = this.stateService.getCommand(ref);
              if (cmdValue) {
                refValue = cmdValue.command;
              }
              break;
          }

          if (refValue) {
            await checkReferences(refValue, ref);
          }

          stack.delete(ref);
        }
      }
    };

    await checkReferences(value);
  }

  /**
   * Extract a section from content by its heading
   */
  async extractSection(content: string, heading: string, fuzzy?: number): Promise<string> {
    try {
      // Use llmxml for section extraction
      const { createLLMXML } = await import('llmxml');
      const llmxml = createLLMXML({
        defaultFuzzyThreshold: fuzzy || 0.7,
        warningLevel: 'none'
      });
      
      // Extract the section directly from markdown
      const section = await llmxml.getSection(content, heading, {
        exact: !fuzzy,
        includeNested: true,
        fuzzyThreshold: fuzzy
      });
      
      if (!section) {
        throw new MeldResolutionError(
          'Section not found: ' + heading,
          {
            code: ResolutionErrorCode.SECTION_NOT_FOUND,
            details: { value: heading },
            severity: ErrorSeverity.Recoverable
          }
        );
      }
      
      return section;
    } catch (error) {
      if (error instanceof MeldResolutionError) {
        throw error;
      }
      throw new MeldResolutionError(
        'Section not found: ' + heading,
        {
          code: ResolutionErrorCode.SECTION_NOT_FOUND,
          details: { value: heading },
          severity: ErrorSeverity.Recoverable
        }
      );
    }
  }

  // TODO: This isn't really necessary as llmxml has built-in 
  private calculateSimilarity(str1: string, str2: string): number {
    // Convert strings to lowercase for case-insensitive comparison
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();

    // If either string is empty, return 0
    if (!s1 || !s2) {
      return 0;
    }

    // If strings are equal, return 1
    if (s1 === s2) {
      return 1;
    }

    // Calculate Levenshtein distance
    const m = s1.length;
    const n = s2.length;
    const d: number[][] = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));

    // Initialize first row and column
    for (let i = 0; i <= m; i++) {
      d[i][0] = i;
    }
    for (let j = 0; j <= n; j++) {
      d[0][j] = j;
    }

    // Fill in the rest of the matrix
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        d[i][j] = Math.min(
          d[i - 1][j] + 1,      // deletion
          d[i][j - 1] + 1,      // insertion
          d[i - 1][j - 1] + cost // substitution
        );
      }
    }

    // Convert distance to similarity score between 0 and 1
    const maxLength = Math.max(m, n);
    const distance = d[m][n];
    return 1 - (distance / maxLength);
  }

  private nodesToString(nodes: MeldNode[]): string {
    return nodes.map(node => {
      switch (node.type) {
        case 'Text':
          return (node as TextNode).content;
        case 'CodeFence':
          const codeFence = node as CodeFenceNode;
          return '```' + (codeFence.language || '') + '\n' + codeFence.content + '\n```';
        case 'Directive':
          const directive = node as DirectiveNode;
          return `@${directive.directive.kind} ${directive.directive.value || ''}`;
        default:
          return '';
      }
    }).join('\n');
  }

  /**
   * Resolve a structured path to an absolute path
   * @private
   */
  private async resolveStructuredPath(path: StructuredPath, context: ResolutionContext): Promise<string> {
    const { structured, raw } = path;
    
    // Get base directory from context if available (use currentFilePath if available)
    const baseDir = context.currentFilePath ? this.pathService.dirname(context.currentFilePath) : process.cwd();
    
    try {
      // Use the PathService to resolve the structured path
      // This handles all special variables and path normalization
      return this.pathService.resolvePath(path, baseDir);
    } catch (error) {
      // Handle error based on severity
      throw new MeldResolutionError(
        `Failed to resolve path: ${(error as Error).message}`,
        {
          code: ResolutionErrorCode.INVALID_PATH,
          details: { value: raw },
          severity: ErrorSeverity.Recoverable
        }
      );
    }
  }
} 