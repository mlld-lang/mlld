import type { IStateService } from '@services/state/StateService/IStateService.js';
import { ResolutionContext, ResolutionErrorCode } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import type { MeldNode, DirectiveNode, TextNode, StructuredPath, VariableReferenceNode } from '@core/syntax/types.js';
import { MeldResolutionError } from '@core/errors/MeldResolutionError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';

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
      throw new MeldResolutionError(
        'Path variables are not allowed in this context',
        {
          code: ResolutionErrorCode.INVALID_CONTEXT,
          severity: ErrorSeverity.Fatal,
          details: {
            value: directiveNode.directive.value,
            context: JSON.stringify(context)
          }
        }
      );
    }

    // Validate node type
    if (directiveNode.directive.kind !== 'path') {
      throw new MeldResolutionError(
        'Invalid node type for path resolution',
        {
          code: ResolutionErrorCode.INVALID_NODE_TYPE,
          severity: ErrorSeverity.Fatal,
          details: {
            value: directiveNode.directive.kind
          }
        }
      );
    }

    // Get the variable identifier
    const identifier = directiveNode.directive.identifier;
    if (!identifier) {
      throw new MeldResolutionError(
        'Path variable identifier is required',
        {
          code: ResolutionErrorCode.SYNTAX_ERROR,
          severity: ErrorSeverity.Fatal,
          details: {
            value: JSON.stringify(directiveNode.directive)
          }
        }
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
      throw new MeldResolutionError(
        `Undefined path variable: ${identifier}`,
        {
          code: ResolutionErrorCode.UNDEFINED_VARIABLE,
          severity: ErrorSeverity.Recoverable,
          details: {
            variableName: identifier,
            variableType: 'path'
          }
        }
      );
    }

    // Handle structured path objects
    if (typeof value === 'object' && value !== null && 'raw' in value) {
      const structuredPath = value as StructuredPath;

      // Validate path if required
      if (context.pathValidation) {
        return this.validatePath(structuredPath, context);
      }

      // Use normalized path if available, otherwise use raw
      return structuredPath.normalized || structuredPath.raw;
    }

    // Handle string paths (legacy support)
    // Validate path if required
    if (context.pathValidation) {
      return this.validatePath(value as string, context);
    }

    return value as string;
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

    // Extract references from structured path if available
    const value = directiveNode.directive.value;
    if (value && typeof value === 'object' && 'structured' in value) {
      const structuredPath = value as StructuredPath;
      const references = [identifier]; // Always include the path variable itself
      
      // Add special variables
      if (structuredPath.structured.variables.special.length > 0) {
        references.push(...structuredPath.structured.variables.special);
      }
      
      // Add path variables
      if (structuredPath.structured.variables.path.length > 0) {
        references.push(...structuredPath.structured.variables.path);
      }
      
      return references;
    }

    return [identifier];
  }

  /**
   * Validate a resolved path against context requirements
   */
  private validatePath(path: string | StructuredPath, context: ResolutionContext): string {
    // Convert structured path to string if needed
    const pathStr = typeof path === 'object' && 'normalized' in path
      ? (path.normalized || path.raw)
      : path as string;

    // Special handling for paths with special variables
    const hasSpecialVar = pathStr.startsWith('$PROJECTPATH/') || 
                          pathStr.startsWith('$./') || 
                          pathStr.startsWith('$HOMEPATH/') || 
                          pathStr.startsWith('$~/');
    
    // If it has a special variable, we can return it directly
    if (hasSpecialVar) {
      return pathStr;
    }

    if (context.pathValidation) {
      // Check if path is absolute or starts with a special variable
      if (context.pathValidation.requireAbsolute && !pathStr.startsWith('/')) {
        throw new MeldResolutionError(
          'Path must be absolute',
          {
            code: ResolutionErrorCode.INVALID_PATH,
            severity: ErrorSeverity.Fatal,
            details: {
              value: pathStr,
              context: JSON.stringify(context.pathValidation)
            }
          }
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
          throw new MeldResolutionError(
            `Path must start with one of: ${context.pathValidation.allowedRoots.join(', ')}`,
            {
              code: ResolutionErrorCode.INVALID_PATH,
              severity: ErrorSeverity.Fatal,
              details: {
                value: pathStr,
                context: JSON.stringify(context.pathValidation)
              }
            }
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
    // Extract the path variable from the node
    const pathVar = this.getPathVarFromNode(node);
    if (!pathVar || pathVar.isSpecial) {
      return [];
    }
    
    // For structured paths, extract all variables
    if (node.type === 'Directive' && 
        (node as DirectiveNode).directive.value && 
        typeof (node as DirectiveNode).directive.value === 'object' &&
        'structured' in (node as DirectiveNode).directive.value) {
      
      const structuredPath = (node as DirectiveNode).directive.value as StructuredPath;
      const references: string[] = [pathVar.identifier];
      
      // Add special variables
      if (structuredPath.structured.variables.special.length > 0) {
        references.push(...structuredPath.structured.variables.special);
      }
      
      // Add path variables
      if (structuredPath.structured.variables.path.length > 0) {
        references.push(...structuredPath.structured.variables.path);
      }
      
      return references;
    }
    
    return [pathVar.identifier];
  }

  /**
   * Helper to extract PathVarNode from a node
   */
  private getPathVarFromNode(node: MeldNode): VariableReferenceNode | null {
    if (node.type === 'Directive' && 
        (node as DirectiveNode).directive.kind === 'path' &&
        'structured' in (node as DirectiveNode).directive.value) {
      
      const identifier = (node as DirectiveNode).directive.identifier;
      if (!identifier) return null;
      
      // Create a synthetic VariableReferenceNode
      return {
        type: 'VariableReference',
        identifier,
        valueType: 'path',
        isVariableReference: true
      };
    }
    return null;
  }
} 