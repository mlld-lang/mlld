import { IStateService } from '@services/StateService/IStateService.js';
import { IResolutionService, ResolutionContext, ResolutionErrorCode } from './IResolutionService.js';
import { ResolutionError } from './errors/ResolutionError.js';
import { TextResolver } from './resolvers/TextResolver.js';
import { DataResolver } from './resolvers/DataResolver.js';
import { PathResolver } from './resolvers/PathResolver.js';
import { CommandResolver } from './resolvers/CommandResolver.js';
import { resolutionLogger as logger } from '@core/utils/logger.js';
import { IFileSystemService } from '@services/FileSystemService/IFileSystemService.js';
import { IParserService } from '@services/ParserService/IParserService.js';
import type { MeldNode, DirectiveNode, TextNode, DirectiveKind } from 'meld-spec';

/**
 * Service responsible for resolving variables, commands, and paths in different contexts
 */
export class ResolutionService implements IResolutionService {
  private textResolver: TextResolver;
  private dataResolver: DataResolver;
  private pathResolver: PathResolver;
  private commandResolver: CommandResolver;

  constructor(
    private stateService: IStateService,
    private fileSystemService: IFileSystemService,
    private parserService: IParserService
  ) {
    this.textResolver = new TextResolver(stateService);
    this.dataResolver = new DataResolver(stateService);
    this.pathResolver = new PathResolver(stateService);
    this.commandResolver = new CommandResolver(stateService);
  }

  /**
   * Parse a string into AST nodes for resolution
   */
  private async parseForResolution(value: string): Promise<MeldNode[]> {
    try {
      return await this.parserService.parse(value);
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
        args
      }
    };
    return this.commandResolver.resolve(node, context);
  }

  /**
   * Resolve content from a file path
   */
  async resolveContent(path: string): Promise<string> {
    if (!await this.fileSystemService.exists(path)) {
      throw new ResolutionError(
        `File not found: ${path}`,
        ResolutionErrorCode.INVALID_PATH,
        { value: path }
      );
    }
    return this.fileSystemService.readFile(path);
  }

  /**
   * Resolve any value based on the provided context rules
   */
  async resolveInContext(value: string, context: ResolutionContext): Promise<string> {
    // 1. Validate resolution is allowed in this context
    await this.validateResolution(value, context);

    // 2. Check for circular references
    await this.detectCircularReferences(value);

    // 3. Parse the value into AST nodes
    const nodes = await this.parseForResolution(value);

    // 4. Resolve each node
    let result = '';
    for (const node of nodes) {
      if (node.type === 'Text') {
        result += (node as TextNode).content;
        continue;
      }

      if (node.type === 'Directive') {
        const directiveNode = node as DirectiveNode;
        // Handle directive nodes based on their kind
        switch (directiveNode.directive.kind) {
          case 'text':
            if (!context.allowedVariableTypes.text) {
              throw new ResolutionError(
                'Text variables are not allowed in this context',
                ResolutionErrorCode.INVALID_CONTEXT,
                { value, context }
              );
            }
            result += await this.textResolver.resolve(directiveNode, context);
            break;

          case 'data':
            if (!context.allowedVariableTypes.data) {
              throw new ResolutionError(
                'Data variables are not allowed in this context',
                ResolutionErrorCode.INVALID_CONTEXT,
                { value, context }
              );
            }
            result += await this.dataResolver.resolve(directiveNode, context);
            break;

          case 'path':
            if (!context.allowedVariableTypes.path) {
              throw new ResolutionError(
                'Path variables are not allowed in this context',
                ResolutionErrorCode.INVALID_CONTEXT,
                { value, context }
              );
            }
            result += await this.pathResolver.resolve(directiveNode, context);
            break;

          case 'run':
            if (!context.allowedVariableTypes.command) {
              throw new ResolutionError(
                'Command references are not allowed in this context',
                ResolutionErrorCode.INVALID_CONTEXT,
                { value, context }
              );
            }
            result += await this.commandResolver.resolve(directiveNode, context);
            break;
        }
      }
    }

    return result;
  }

  /**
   * Validate that resolution is allowed in the given context
   */
  async validateResolution(value: string, context: ResolutionContext): Promise<void> {
    // Parse the value to check for variable types
    const nodes = await this.parseForResolution(value);

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
  async extractSection(content: string, section: string): Promise<string> {
    // Split content into lines
    const lines = content.split('\n');
    
    // Find the section heading
    const sectionStart = lines.findIndex(line => {
      // Remove heading markers and trim
      const heading = line.replace(/^#+\s*/, '').trim();
      return heading === section;
    });

    if (sectionStart === -1) {
      throw new ResolutionError(
        `Section not found: ${section}`,
        ResolutionErrorCode.INVALID_PATH,
        { value: section }
      );
    }

    // Find the next heading of same or higher level
    const currentLine = lines[sectionStart];
    const headingLevel = (currentLine.match(/^#+/) || [''])[0].length;
    
    let sectionEnd = lines.length;
    for (let i = sectionStart + 1; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/^#+/);
      if (match && match[0].length <= headingLevel) {
        sectionEnd = i;
        break;
      }
    }

    // Extract the section content and trim trailing newlines
    return lines.slice(sectionStart, sectionEnd).join('\n').trimEnd();
  }
} 