import { IStateService } from '@services/state/StateService/IStateService.js';
import { ResolutionContext, ResolutionErrorCode } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import type { MeldNode, DirectiveNode, TextNode, PathVarNode, StructuredPath } from 'meld-spec';

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

    // Validate node type
    if (directiveNode.directive.kind !== 'path') {
      throw new ResolutionError(
        'Invalid node type for path resolution',
        ResolutionErrorCode.INVALID_NODE_TYPE,
        { value: directiveNode.directive.kind }
      );
    }

    // Get the variable identifier
    const identifier = directiveNode.directive.identifier;
    if (!identifier) {
      throw new ResolutionError(
        'Path variable identifier is required',
        ResolutionErrorCode.SYNTAX_ERROR,
        { value: JSON.stringify(directiveNode.directive) }
      );
    }

    // Handle special path variables
    if (identifier === '~' || identifier === 'HOMEPATH') {
      return this.stateService.getPathVar('HOMEPATH') || '';
    }
    if (identifier === '.' || identifier === 'PROJECTPATH') {
      return this.stateService.getPathVar('PROJECTPATH') || '';
    }

    // For regular path variables, get value from state
    const value = this.stateService.getPathVar(identifier);

    if (value === undefined) {
      throw new ResolutionError(
        `Undefined path variable: ${identifier}`,
        ResolutionErrorCode.UNDEFINED_VARIABLE,
        { value: identifier }
      );
    }

    // Validate path if required
    if (context.pathValidation) {
      return this.validatePath(value, context);
    }

    return value;
  }

  /**
   * Extract references from a node
   */
  extractReferences(node: MeldNode): string[] {
    if (node.type !== 'Directive') {
      return [];
    }

    const directiveNode = node as DirectiveNode;
    if (directiveNode.directive.kind !== 'path') {
      return [];
    }

    const identifier = directiveNode.directive.identifier;
    if (!identifier) {
      return [];
    }

    // Map special variables to their full names
    if (identifier === '~') {
      return ['HOMEPATH'];
    }
    if (identifier === '.') {
      return ['PROJECTPATH'];
    }

    return [identifier];
  }

  /**
   * Validate a resolved path against context requirements
   */
  private validatePath(path: string | StructuredPath, context: ResolutionContext): string {
    // Convert structured path to string if needed
    const pathStr = typeof path === 'string' ? path : path.raw;
    
    if (context.pathValidation) {
      // Check if path is absolute or starts with a special variable
      if (context.pathValidation.requireAbsolute && !pathStr.startsWith('/')) {
        throw new ResolutionError(
          'Path must be absolute',
          ResolutionErrorCode.INVALID_PATH,
          { value: pathStr, context }
        );
      }

      // Check if path starts with an allowed root
      if (context.pathValidation.allowedRoots?.length) {
        const hasAllowedRoot = context.pathValidation.allowedRoots.some(root => {
          const rootVar = this.stateService.getPathVar(root);
          return rootVar && (
            pathStr.startsWith(rootVar + '/') || 
            pathStr === rootVar
          );
        });

        if (!hasAllowedRoot) {
          throw new ResolutionError(
            `Path must start with one of: ${context.pathValidation.allowedRoots.join(', ')}`,
            ResolutionErrorCode.INVALID_PATH,
            { value: pathStr, context }
          );
        }
      }
    }

    return pathStr;
  }

  /**
   * Get all path variables referenced in a node
   */
  getReferencedVariables(node: MeldNode): string[] {
    const pathVar = this.getPathVarFromNode(node);
    if (!pathVar || pathVar.isSpecial) {
      return [];
    }
    return [pathVar.identifier];
  }

  /**
   * Helper to extract PathVarNode from a node
   */
  private getPathVarFromNode(node: MeldNode): PathVarNode | null {
    if (node.type !== 'Directive' || (node as DirectiveNode).directive.kind !== 'path') {
      return null;
    }

    const pathVar = (node as DirectiveNode).directive.value as PathVarNode;
    if (!pathVar || pathVar.type !== 'PathVar') {
      return null;
    }

    return pathVar;
  }
} 