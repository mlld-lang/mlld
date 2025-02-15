import { IStateService } from '../../StateService/IStateService';
import { ResolutionContext, ResolutionErrorCode } from '../IResolutionService';
import { ResolutionError } from '../errors/ResolutionError';
import type { MeldNode, DirectiveNode, TextNode } from 'meld-spec';

/**
 * Handles resolution of path variables ($path)
 */
export class PathResolver {
  constructor(private stateService: IStateService) {}

  /**
   * Resolve path variables in a node
   */
  async resolve(node: MeldNode, context: ResolutionContext): Promise<string> {
    // Return text node content unchanged
    if (node.type === 'Text') {
      return (node as TextNode).content;
    }

    // Validate node type
    if (node.type !== 'Directive' || (node as DirectiveNode).directive.kind !== 'path') {
      throw new ResolutionError(
        'Invalid node type for path resolution',
        ResolutionErrorCode.SYNTAX_ERROR,
        { value: String(node) }
      );
    }

    // Validate path variables are allowed
    if (!context.allowedVariableTypes.path) {
      throw new ResolutionError(
        'Path variables are not allowed in this context',
        ResolutionErrorCode.INVALID_CONTEXT,
        { value: (node as DirectiveNode).directive.value, context }
      );
    }

    // Get the path variable name and handle aliases
    const { name } = this.parseDirective(node as DirectiveNode);

    // Handle special aliases
    const resolvedName = this.resolveAlias(name);

    // Get variable value
    const value = this.stateService.getPathVar(resolvedName);

    if (value === undefined) {
      throw new ResolutionError(
        `Undefined path variable: ${name}`,
        ResolutionErrorCode.UNDEFINED_VARIABLE,
        { value: name, context }
      );
    }

    // Validate the resolved path
    return this.validatePath(value, context);
  }

  /**
   * Extract references from a node
   */
  extractReferences(node: MeldNode): string[] {
    if (node.type !== 'Directive' || (node as DirectiveNode).directive.kind !== 'path') {
      return [];
    }

    const directiveNode = node as DirectiveNode;
    const name = directiveNode.directive.name;
    if (!name) return [];

    // Return the resolved alias name if it's an alias
    return [this.resolveAlias(name)];
  }

  /**
   * Parse a directive node to extract name
   */
  private parseDirective(node: DirectiveNode): { name: string } {
    if (!node.directive || node.directive.kind !== 'path') {
      throw new ResolutionError(
        'Invalid node type for path resolution',
        ResolutionErrorCode.SYNTAX_ERROR,
        { value: String(node) }
      );
    }

    const name = node.directive.name;
    if (!name) {
      throw new ResolutionError(
        'Path variable name is required',
        ResolutionErrorCode.SYNTAX_ERROR,
        { value: String(node) }
      );
    }

    return { name };
  }

  /**
   * Resolve special path aliases
   */
  private resolveAlias(name: string): string {
    switch (name) {
      case '~':
        return 'HOMEPATH';
      case '.':
        return 'PROJECTPATH';
      default:
        return name;
    }
  }

  /**
   * Validate a resolved path against context requirements
   */
  private validatePath(path: string, context: ResolutionContext): string {
    if (context.pathValidation) {
      if (context.pathValidation.requireAbsolute && !path.startsWith('/')) {
        throw new ResolutionError(
          'Path must be absolute',
          ResolutionErrorCode.INVALID_PATH,
          { value: path, context }
        );
      }

      if (context.pathValidation.allowedRoots?.length) {
        const hasAllowedRoot = context.pathValidation.allowedRoots.some(root => {
          const resolvedRoot = this.stateService.getPathVar(root);
          return resolvedRoot && (
            path.startsWith(resolvedRoot + '/') || 
            path === resolvedRoot
          );
        });

        if (!hasAllowedRoot) {
          throw new ResolutionError(
            `Path must start with one of: ${context.pathValidation.allowedRoots.join(', ')}`,
            ResolutionErrorCode.INVALID_PATH,
            { value: path, context }
          );
        }
      }
    }

    return path;
  }
} 