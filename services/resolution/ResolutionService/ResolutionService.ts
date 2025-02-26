import { IStateService } from '@services/state/StateService/IStateService.js';
import { IResolutionService, ResolutionContext, ResolutionErrorCode } from './IResolutionService.js';
import { TextResolver } from './resolvers/TextResolver.js';
import { DataResolver } from './resolvers/DataResolver.js';
import { PathResolver } from './resolvers/PathResolver.js';
import { CommandResolver } from './resolvers/CommandResolver.js';
import { ContentResolver } from './resolvers/ContentResolver.js';
import { resolutionLogger as logger } from '@core/utils/logger.js';
import { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { MeldNode, DirectiveNode, TextNode, DirectiveKind, CodeFenceNode, StructuredPath } from 'meld-spec';
import { MeldFileNotFoundError } from '@core/errors/MeldFileNotFoundError.js';
import { MeldResolutionError } from '@core/errors/MeldResolutionError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';

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
  const headingMatch = node.content.match(/^(#{1,6})\s+(.+)$/);
  if (!headingMatch) {
    return null;
  }
  return {
    level: headingMatch[1].length,
    content: headingMatch[2].trim()
  };
}

/**
 * Check if a node is a text node that represents a heading
 */
function isHeadingTextNode(node: MeldNode): node is TextNode {
  return node.type === 'Text' && (node as TextNode).content.match(/^#{1,6}\s+.+$/) !== null;
}

/**
 * Service responsible for resolving variables, commands, and paths in different contexts
 */
export class ResolutionService implements IResolutionService {
  private textResolver: TextResolver;
  private dataResolver: DataResolver;
  private pathResolver: PathResolver;
  private commandResolver: CommandResolver;
  private contentResolver: ContentResolver;
  private readonly variablePattern = /\${([^}]+)}/g;

  constructor(
    private stateService: IStateService,
    private fileSystemService: IFileSystemService,
    private parserService: IParserService
  ) {
    this.textResolver = new TextResolver(stateService);
    this.dataResolver = new DataResolver(stateService);
    this.pathResolver = new PathResolver(stateService);
    this.commandResolver = new CommandResolver(stateService);
    this.contentResolver = new ContentResolver(stateService);
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
    console.log('*** ResolutionService.resolveInContext', {
      value: typeof value === 'string' ? value : value.raw,
      allowedVariableTypes: context.allowedVariableTypes,
      pathValidation: context.pathValidation,
      stateExists: !!context.state,
      specialPathVars: context.state ? {
        PROJECTPATH: context.state.getPathVar('PROJECTPATH'),
        HOMEPATH: context.state.getPathVar('HOMEPATH')
      } : 'state not available'
    });
    
    // Convert StructuredPath to string if needed
    const stringValue = typeof value === 'string' ? value : value.raw;
    
    // 1. Validate resolution is allowed in this context
    await this.validateResolution(stringValue, context);

    // 2. Initialize resolution tracking
    const resolutionPath: string[] = [];

    // 3. First pass: resolve nested variables
    let result = stringValue;
    let hasNested = true;
    let iterations = 0;
    const MAX_ITERATIONS = 100;

    // Handle text variables (${...}) first since they may contain other variable types
    const textVarRegex = /\${([^}]+)}/g;
    let match: RegExpExecArray | null;
    
    while ((match = textVarRegex.exec(result)) !== null) {
      const [fullMatch, varName] = match;
      
      // Add debug logging for text variables
      console.log('*** Resolving text variable', {
        fullMatch,
        varName,
        variableExists: context.state.getTextVar(varName) !== undefined,
        resolutionPath
      });
      
      // Check for circular references
      if (resolutionPath.includes(varName)) {
        const path = [...resolutionPath, varName].join(' -> ');
        throw new MeldResolutionError(
          `Circular reference detected: ${path}`,
          {
            code: ResolutionErrorCode.CIRCULAR_REFERENCE,
            details: { 
              value: value, 
              context: JSON.stringify(context),
              variableName: varName,
              variableType: 'text'
            },
            severity: ErrorSeverity.Fatal
          }
        );
      }

      resolutionPath.push(varName);

      try {
        const varValue = context.state.getTextVar(varName);
        if (varValue === undefined) {
          throw new MeldResolutionError(
            `Undefined variable: ${varName}`,
            {
              code: ResolutionErrorCode.UNDEFINED_VARIABLE,
              details: { 
                value: varName, 
                context: JSON.stringify(context),
                variableName: varName,
                variableType: 'text'
              },
              severity: ErrorSeverity.Recoverable
            }
          );
        }
        result = result.replace(fullMatch, varValue);
      } finally {
        resolutionPath.pop();
      }
    }

    // Handle data variables (#{...})
    const dataVarRegex = /#{([^}]+)}/g;
    while ((match = dataVarRegex.exec(result)) !== null) {
      const [fullMatch, fieldRef] = match;
      
      // Handle field access (e.g., user.name)
      const parts = fieldRef.split('.');
      const varName = parts[0];
      
      // Check for circular references
      if (resolutionPath.includes(varName)) {
        const path = [...resolutionPath, varName].join(' -> ');
        throw new MeldResolutionError(
          `Circular reference detected: ${path}`,
          {
            code: ResolutionErrorCode.CIRCULAR_REFERENCE,
            details: { 
              value: value, 
              context: JSON.stringify(context),
              fieldPath: parts.slice(1).join('.'),
              variableName: varName,
              variableType: 'data'
            },
            severity: ErrorSeverity.Recoverable
          }
        );
      }

      resolutionPath.push(varName);

      try {
        const dataVar = context.state.getDataVar(varName);
        if (dataVar === undefined) {
          throw new MeldResolutionError(
            `Undefined data variable: ${varName}`,
            {
              code: ResolutionErrorCode.UNDEFINED_VARIABLE,
              details: { 
                value: varName, 
                context: JSON.stringify(context),
                variableName: varName,
                variableType: 'data'
              },
              severity: ErrorSeverity.Recoverable
            }
          );
        }
        
        // Access nested fields if they exist
        let fieldValue = dataVar;
        
        // Follow the field path
        if (parts.length > 1) {
          try {
            fieldValue = parts.slice(1).reduce((obj: any, field) => {
              if (obj === undefined || obj === null) {
                throw new Error(`Cannot access field ${field} on undefined or null value`);
              }
              return obj[field];
            }, dataVar);
          } catch (e) {
            throw new MeldResolutionError(
              `Error accessing field '${parts.slice(1).join('.')}' in data variable '${varName}'`,
              {
                code: ResolutionErrorCode.FIELD_ACCESS_ERROR,
                details: { 
                  value: fieldRef, 
                  context: JSON.stringify(context),
                  fieldPath: parts.slice(1).join('.'),
                  variableName: varName,
                  variableType: 'data'
                },
                severity: ErrorSeverity.Recoverable
              }
            );
          }
        }
        
        // Convert to string if necessary
        const stringValue = typeof fieldValue === 'object' 
          ? (Array.isArray(fieldValue) ? fieldValue.join(',') : JSON.stringify(fieldValue))
          : String(fieldValue);
        
        result = result.replace(fullMatch, stringValue);
      } finally {
        resolutionPath.pop();
      }
    }

    // Handle command references ($command(args)) first
    const commandVarRegex = /\$([A-Za-z0-9_]+)\((.*?)\)/g;
    while ((match = commandVarRegex.exec(result)) !== null) {
      const [fullMatch, commandName, argsStr] = match;
      
      // Check for circular references
      if (resolutionPath.includes(commandName)) {
        const path = [...resolutionPath, commandName].join(' -> ');
        throw new MeldResolutionError(
          `Circular reference detected: ${path}`,
          {
            code: ResolutionErrorCode.CIRCULAR_REFERENCE,
            details: { 
              value: value, 
              context: JSON.stringify(context),
              variableName: commandName,
              variableType: 'command'
            },
            severity: ErrorSeverity.Fatal
          }
        );
      }

      resolutionPath.push(commandName);

      try {
        const command = context.state.getCommand(commandName);
        if (command === undefined) {
          throw new MeldResolutionError(
            `Undefined command: ${commandName}`,
            {
              code: ResolutionErrorCode.UNDEFINED_VARIABLE,
              details: { 
                value: commandName, 
                context: JSON.stringify(context),
                variableName: commandName,
                variableType: 'command'
              },
              severity: ErrorSeverity.Recoverable
            }
          );
        }
        const args = argsStr.split(',').map(arg => arg.trim());
        result = result.replace(fullMatch, await this.resolveCommand(commandName, args, context));
      } finally {
        resolutionPath.pop();
      }
    }

    // Handle path variables ($path)
    // Before using regex, check if value is already a structured path object
    if (typeof result === 'object' && result !== null && 'structured' in result) {
      // Value is already a structured path object, use as is
      logger.debug('Using structured path object directly', {
        rawPath: result.raw,
        normalizedPath: result.normalized
      });
      return result.normalized;
    }

    // If value is not a structured path, process with regex as before
    const pathVarRegex = /\$(PROJECTPATH|HOMEPATH|\.\/|~\/|[A-Za-z0-9_]+)(\/?[^$\s]*)/g;
    while ((match = pathVarRegex.exec(result)) !== null) {
      const [fullMatch, varName, pathRemainder] = match;
      
      // Add debug logging for path variables
      console.log('*** Resolving path variable', {
        fullMatch,
        varName,
        pathRemainder,
        resolutionPath
      });
      
      // Handle special path variables
      let varValue;
      let actualVarName = varName;
      
      // Handle aliases and special path variables
      if (varName === 'PROJECTPATH' || varName.startsWith('./')) {
        actualVarName = 'PROJECTPATH';
      } else if (varName === 'HOMEPATH' || varName.startsWith('~/')) {
        actualVarName = 'HOMEPATH';
      }
      
      // Check for circular references
      if (resolutionPath.includes(actualVarName)) {
        const path = [...resolutionPath, actualVarName].join(' -> ');
        throw new MeldResolutionError(
          `Circular reference detected: ${path}`,
          {
            code: ResolutionErrorCode.CIRCULAR_REFERENCE,
            details: { 
              value: value, 
              context: JSON.stringify(context),
              variableName: actualVarName,
              variableType: 'path'
            },
            severity: ErrorSeverity.Fatal
          }
        );
      }

      resolutionPath.push(actualVarName);

      try {
        varValue = context.state.getPathVar(actualVarName);
        if (varValue === undefined) {
          throw new MeldResolutionError(
            `Undefined path variable: ${actualVarName}`,
            {
              code: ResolutionErrorCode.UNDEFINED_VARIABLE,
              details: { 
                value: varName, 
                context: JSON.stringify(context),
                variableName: actualVarName,
                variableType: 'path'
              },
              severity: ErrorSeverity.Recoverable
            }
          );
        }

        // Handle structured path objects
        if (typeof varValue === 'object' && varValue !== null) {
          if ('normalized' in varValue) {
            varValue = varValue.normalized;
          } else if ('raw' in varValue) {
            varValue = varValue.raw;
          }
        }

        // Handle path segments for special variables
        if (varName.startsWith('./') && varName.length > 2) {
          // Extract the path segment after $./
          const segment = varName.substring(2);  
          varValue = path.join(varValue, segment);
        } else if (varName.startsWith('~/') && varName.length > 2) {
          // Extract the path segment after $~/
          const segment = varName.substring(2);
          varValue = path.join(varValue, segment);
        }

        // Join the base path with any remaining path parts
        if (pathRemainder && pathRemainder.length > 0) {
          // Remove leading slash if present to avoid double slashes
          const cleanRemainder = pathRemainder.startsWith('/') ? pathRemainder.substring(1) : pathRemainder;
          varValue = path.join(varValue, cleanRemainder);
        }

        result = result.replace(fullMatch, varValue);
      } finally {
        resolutionPath.pop();
      }
    }

    return result;
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
} 