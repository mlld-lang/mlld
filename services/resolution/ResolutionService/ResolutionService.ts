import { IStateService } from '@services/state/StateService/IStateService.js';
import { IResolutionService, ResolutionContext, ResolutionErrorCode } from './IResolutionService.js';
import { ResolutionError } from './errors/ResolutionError.js';
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
        throw new ResolutionError(
          `File not found: ${path}`,
          ResolutionErrorCode.INVALID_PATH,
          { value: path }
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
      
      // Check for circular references
      if (resolutionPath.includes(varName)) {
        const path = [...resolutionPath, varName].join(' -> ');
        throw new ResolutionError(
          `Circular reference detected: ${path}`,
          ResolutionErrorCode.CIRCULAR_REFERENCE,
          { value, context }
        );
      }

      resolutionPath.push(varName);

      try {
        const varValue = context.state.getTextVar(varName);
        if (varValue === undefined) {
          throw new ResolutionError(
            `Undefined variable: ${varName}`,
            ResolutionErrorCode.UNDEFINED_VARIABLE,
            { value: varName, context }
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
      const [fullMatch, varName] = match;
      
      // Check for circular references
      if (resolutionPath.includes(varName)) {
        const path = [...resolutionPath, varName].join(' -> ');
        throw new ResolutionError(
          `Circular reference detected: ${path}`,
          ResolutionErrorCode.CIRCULAR_REFERENCE,
          { value, context }
        );
      }

      resolutionPath.push(varName);

      try {
        const varValue = context.state.getDataVar(varName);
        if (varValue === undefined) {
          throw new ResolutionError(
            `Undefined data variable: ${varName}`,
            ResolutionErrorCode.UNDEFINED_VARIABLE,
            { value: varName, context }
          );
        }
        result = result.replace(fullMatch, JSON.stringify(varValue));
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
        throw new ResolutionError(
          `Circular reference detected: ${path}`,
          ResolutionErrorCode.CIRCULAR_REFERENCE,
          { value, context }
        );
      }

      resolutionPath.push(commandName);

      try {
        const command = context.state.getCommand(commandName);
        if (command === undefined) {
          throw new ResolutionError(
            `Undefined command: ${commandName}`,
            ResolutionErrorCode.UNDEFINED_VARIABLE,
            { value: commandName, context }
          );
        }
        const args = argsStr.split(',').map(arg => arg.trim());
        result = result.replace(fullMatch, await this.resolveCommand(commandName, args, context));
      } finally {
        resolutionPath.pop();
      }
    }

    // Handle path variables ($path)
    const pathVarRegex = /\$([A-Za-z0-9_]+)/g;
    while ((match = pathVarRegex.exec(result)) !== null) {
      const [fullMatch, varName] = match;
      
      // Check for circular references
      if (resolutionPath.includes(varName)) {
        const path = [...resolutionPath, varName].join(' -> ');
        throw new ResolutionError(
          `Circular reference detected: ${path}`,
          ResolutionErrorCode.CIRCULAR_REFERENCE,
          { value, context }
        );
      }

      resolutionPath.push(varName);

      try {
        const varValue = context.state.getPathVar(varName);
        if (varValue === undefined) {
          throw new ResolutionError(
            `Undefined path variable: ${varName}`,
            ResolutionErrorCode.UNDEFINED_VARIABLE,
            { value: varName, context }
          );
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
            throw new ResolutionError(
              'Text variables are not allowed in this context',
              ResolutionErrorCode.INVALID_CONTEXT,
              { value, context }
            );
          }
          break;

        case 'data':
          if (!context.allowedVariableTypes.data) {
            throw new ResolutionError(
              'Data variables are not allowed in this context',
              ResolutionErrorCode.INVALID_CONTEXT,
              { value, context }
            );
          }
          break;

        case 'path':
          if (!context.allowedVariableTypes.path) {
            throw new ResolutionError(
              'Path variables are not allowed in this context',
              ResolutionErrorCode.INVALID_CONTEXT,
              { value, context }
            );
          }
          break;

        case 'run':
          if (!context.allowedVariableTypes.command) {
            throw new ResolutionError(
              'Command references are not allowed in this context',
              ResolutionErrorCode.INVALID_CONTEXT,
              { value, context }
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
        throw new ResolutionError(
          'Invalid parse result',
          ResolutionErrorCode.SYNTAX_ERROR,
          { value: text }
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
          throw new ResolutionError(
            `Circular reference detected: ${path} -> ${ref}`,
            ResolutionErrorCode.CIRCULAR_REFERENCE,
            { value: text }
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
        throw new ResolutionError(
          'Section not found: ' + heading,
          ResolutionErrorCode.SECTION_NOT_FOUND
        );
      }
      
      return section;
    } catch (error) {
      if (error instanceof ResolutionError) {
        throw error;
      }
      throw new ResolutionError(
        'Section not found: ' + heading,
        ResolutionErrorCode.SECTION_NOT_FOUND
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