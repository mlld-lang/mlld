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
    // Early return if not a directive node
    if (node.type !== 'Directive') {
      return node.type === 'Text' ? (node as TextNode).content : '';
    }

    const directiveNode = node as DirectiveNode;

    // Validate path variables are allowed
    if (!context.allowedVariableTypes.path) {
      throw new ResolutionError(
        'Path variables are not allowed in this context',
        ResolutionErrorCode.INVALID_CONTEXT,
        { value: directiveNode.directive.value, context }
      );
    }

    // Get the variable identifier and resolve any aliases
    const { identifier } = this.parseDirective(directiveNode);
    const resolvedIdentifier = this.resolveAlias(identifier);

    // Get variable value
    const value = this.stateService.getPathVar(resolvedIdentifier);

    if (value === undefined) {
      throw new ResolutionError(
        `Undefined path variable: ${identifier}`,
        ResolutionErrorCode.UNDEFINED_VARIABLE,
        { value: identifier, context }
      );
    }

    // Validate path against context requirements
    return this.validatePath(value, context);
  }

  /**
   * Extract references from a node
   */
  extractReferences(node: MeldNode): string[] {
    if (node.type !== 'Directive' || (node as DirectiveNode).directive.kind !== 'path') {
      return [];
    }

    const { identifier } = (node as DirectiveNode).directive;
    return [this.resolveAlias(identifier)];
  }

  /**
   * Parse a directive node to extract identifier
   */
  private parseDirective(node: DirectiveNode): { identifier: string } {
    if (node.directive.kind !== 'path') {
      throw new ResolutionError(
        'Invalid node type for path resolution',
        ResolutionErrorCode.SYNTAX_ERROR,
        { value: JSON.stringify(node) }
      );
    }

    const identifier = node.directive.identifier;
    if (!identifier) {
      throw new ResolutionError(
        'Path variable identifier is required',
        ResolutionErrorCode.SYNTAX_ERROR,
        { value: JSON.stringify(node) }
      );
    }

    return { identifier };
  }

  /**
   * Resolve special path aliases
   */
  private resolveAlias(identifier: string): string {
    switch (identifier) {
      case '~':
        return 'HOMEPATH';
      case '.':
        return 'PROJECTPATH';
      default:
        return identifier;
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