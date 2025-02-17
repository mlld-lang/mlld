import { IStateService } from '@services/StateService/IStateService.js';
import { IResolutionService, ResolutionContext, ResolutionErrorCode } from './IResolutionService.js';
import { ResolutionError } from './errors/ResolutionError.js';
import { TextResolver } from './resolvers/TextResolver.js';
import { DataResolver } from './resolvers/DataResolver.js';
import { PathResolver } from './resolvers/PathResolver.js';
import { CommandResolver } from './resolvers/CommandResolver.js';
import { ContentResolver } from './resolvers/ContentResolver.js';
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
  private contentResolver: ContentResolver;

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
  async resolveFile(path: string): Promise<string> {
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
   * Resolve raw content nodes, preserving formatting but skipping comments
   */
  async resolveContent(nodes: MeldNode[], context: ResolutionContext): Promise<string> {
    return this.contentResolver.resolve(nodes, context);
  }

  /**
   * Resolve any value based on the provided context rules
   */
  async resolveInContext(value: string, context: ResolutionContext): Promise<string> {
    // 1. Validate resolution is allowed in this context
    await this.validateResolution(value, context);

    // 2. Check for circular references
    await this.detectCircularReferences(value);

    // 3. Handle variable interpolation
    let result = value;

    // Handle ${var} text/data variables
    const textVarRegex = /\${([^}]+)}/g;
    let match;
    while ((match = textVarRegex.exec(value)) !== null) {
      const [fullMatch, varPath] = match;
      const [varName, ...fieldPath] = varPath.split('.');
      
      // Try text variable first
      let varValue = this.stateService.getTextVar(varName);
      
      // If not found in text vars, try data vars
      if (varValue === undefined) {
        varValue = this.stateService.getDataVar(varName);
      }
      
      if (varValue === undefined) {
        throw new ResolutionError(
          `Undefined variable: ${varName}`,
          ResolutionErrorCode.UNDEFINED_VARIABLE,
          { value: varName, context }
        );
      }

      // Handle field access if needed
      if (fieldPath.length > 0) {
        const field = fieldPath.join('.');
        const dataNode: DirectiveNode = {
          type: 'Directive',
          directive: {
            kind: 'data' as const,
            identifier: varName,
            fields: field,
            value: varValue
          },
          location: undefined
        };

        // Create a new context for field resolution
        const fieldContext: ResolutionContext = {
          ...context,
          allowDataFields: true,
          allowedVariableTypes: {
            ...context.allowedVariableTypes,
            data: true
          }
        };

        varValue = await this.dataResolver.resolve(dataNode, fieldContext);
      }

      // Replace the variable reference with its value
      result = result.replace(fullMatch, String(varValue));
    }

    // Handle #{data} variables
    const dataVarRegex = /#{([^}]+)}/g;
    while ((match = dataVarRegex.exec(value)) !== null) {
      const [fullMatch, varPath] = match;
      const [varName, ...fieldPath] = varPath.split('.');
      
      const varValue = this.stateService.getDataVar(varName);
      
      if (varValue === undefined) {
        throw new ResolutionError(
          `Undefined data variable: ${varName}`,
          ResolutionErrorCode.UNDEFINED_VARIABLE,
          { value: varName, context }
        );
      }

      // Handle field access if needed
      let resolvedValue = varValue;
      if (fieldPath.length > 0) {
        const field = fieldPath.join('.');
        const dataNode: DirectiveNode = {
          type: 'Directive',
          directive: {
            kind: 'data' as const,
            identifier: varName,
            fields: field,
            value: varValue
          },
          location: undefined
        };
        resolvedValue = await this.dataResolver.resolve(dataNode, context);
      }

      // Replace the variable reference with its value
      result = result.replace(fullMatch, String(resolvedValue));
    }

    // Handle $path variables
    const pathVarRegex = /\$([A-Za-z0-9_]+)/g;
    while ((match = pathVarRegex.exec(value)) !== null) {
      const [fullMatch, varName] = match;
      
      const varValue = this.stateService.getPathVar(varName);
      
      if (varValue === undefined) {
        throw new ResolutionError(
          `Undefined path variable: ${varName}`,
          ResolutionErrorCode.UNDEFINED_VARIABLE,
          { value: varName, context }
        );
      }

      // Replace the variable reference with its value
      result = result.replace(fullMatch, varValue);
    }

    // Handle $command(args) references
    const cmdRegex = /\$([A-Za-z0-9_]+)\(([^)]*)\)/g;
    while ((match = cmdRegex.exec(value)) !== null) {
      const [fullMatch, cmdName, argsStr] = match;
      const args = argsStr.split(',').map(arg => arg.trim());
      
      const cmdValue = await this.commandResolver.resolve({
        type: 'Directive' as const,
        directive: {
          kind: 'run' as const,
          identifier: cmdName,
          args
        },
        location: undefined
      } as DirectiveNode, context);

      // Replace the command reference with its value
      result = result.replace(fullMatch, cmdValue);
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