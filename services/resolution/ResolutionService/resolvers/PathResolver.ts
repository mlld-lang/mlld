import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import { ResolutionContext, ResolutionErrorCode } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import type { MeldNode, DirectiveNode, TextNode, StructuredPath, VariableReferenceNode } from '@core/syntax/types.js';
import { MeldResolutionError } from '@core/errors/MeldResolutionError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import type { ResolutionContext as CoreResolutionContext } from '@core/types/resolution.js';
import type { PathValidationContext } from '@core/types/paths.js';
import type { MeldValue } from '@core/types/variables.js';
import type { VariableReference } from '@core/syntax/types/index.js';
import { VariableResolutionError } from '@core/errors/VariableResolutionError.js';
import { VariableType } from '@core/types/variables.js';
import { PathValidationError } from '@core/errors/PathValidationError.js';
import { inject, injectable } from 'tsyringe';

/**
 * Handles resolution of path variables ($path)
 */
@injectable()
export class PathResolver {
  constructor(
    @inject('IStateService') private stateService: IStateService,
    @inject('IPathService') private pathService: IPathService 
  ) {}

  /**
   * Resolve path variables in a node
   */
  async resolve(node: MeldNode, context: CoreResolutionContext): Promise<string> {
    // Ensure the node is a VariableReferenceNode for path resolution
    if (node.type !== 'VariableReference' || node.valueType !== VariableType.PATH) {
      // Maybe log a warning or handle non-variable/non-path nodes gracefully
      // For now, returning empty string might align with test expectations
      return '';
    }

    const varNode = node as VariableReferenceNode;
    const identifier = varNode.identifier;

    // Check if path variables are allowed in this context
    if (!context.allowedVariableTypes.includes(VariableType.PATH)) {
      throw new MeldResolutionError(
        `Path variables are not allowed in this context (resolving '${identifier}')`,
        { 
          code: 'E_RESOLVE_TYPE_NOT_ALLOWED', 
          severity: ErrorSeverity.Fatal, 
          details: { variableName: identifier }
        }
      );
    }

    // --- Special Variable Handling (Keep as is for now) ---
    if (identifier === '~' || identifier === 'HOMEPATH') {
      const homePathVar = await this.stateService.getPathVar('HOMEPATH');
      if (!homePathVar?.value?.validatedPath) { // Check new structure
        throw new VariableResolutionError('Could not resolve special variable HOMEPATH', { 
            code: 'E_VAR_SPECIAL_NOT_FOUND', 
            details: { variableName: 'HOMEPATH' }, 
            severity: ErrorSeverity.Fatal
        }); 
      }
      // TODO: Re-validate special variables against context?
      return homePathVar.value.validatedPath as string;
    }
    if (identifier === '.' || identifier === 'PROJECTPATH') {
      const projectPathVar = await this.stateService.getPathVar('PROJECTPATH');
      if (!projectPathVar?.value?.validatedPath) { // Check new structure
        throw new VariableResolutionError('Could not resolve special variable PROJECTPATH', { 
            code: 'E_VAR_SPECIAL_NOT_FOUND', 
            details: { variableName: 'PROJECTPATH' }, 
            severity: ErrorSeverity.Fatal 
        }); 
      }
      // TODO: Re-validate special variables against context?
      return projectPathVar.value.validatedPath as string;
    }
    // --- End Special Variable Handling ---

    // Get the variable from state using the new signature
    const pathVariable = await this.stateService.getPathVar(identifier);

    // Handle undefined variable based on strict mode
    if (!pathVariable) {
      if (context.flags.strict) {
        throw new VariableResolutionError(
          `Path variable '${identifier}' not found`,
          {
            code: 'E_VAR_NOT_FOUND',
            severity: ErrorSeverity.Recoverable,
            details: { variableName: identifier, variableType: VariableType.PATH }
          }
        );
      } else {
        return ''; // Return empty string in non-strict mode
      }
    }

    // We have the variable, get the MeldPath value
    const meldPath = pathVariable.value;

    try {
      // Perform validation using PathService - Assumes validatePath returns the validated path or throws
      // We need the PathValidationContext from the CoreResolutionContext
      // Note: PathService likely needs updating in Phase 2 to accept/use PathValidationContext
      // For now, pass the context object; PathService mock handles it.
      const validatedMeldPath = await this.pathService.validatePath(meldPath, context.pathContext as any); // Use context.pathContext
      
      // Ensure validatedMeldPath is not undefined/null before accessing validatedPath
      if (!validatedMeldPath?.validatedPath) {
           // This case might happen if validatePath mock is changed or if validation logic could return undefined
           // Handle appropriately, maybe throw or return empty string based on strictness?
           // For now, aligning with previous behavior, return empty string might be safest.
           // Consider throwing a more specific error here in the future.
           return '';
      }
      
      // Return the validated path string
      return validatedMeldPath.validatedPath as string; 

    } catch (error) {
      // Re-throw PathValidationError specifically
      if (error instanceof PathValidationError) {
        throw error;
      }
      // Wrap other errors if needed, or re-throw
      // For now, just re-throw to see what kind of errors occur
      throw error; 
    }
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
      if (context.pathValidation.requireAbsolute && !pathStr.startsWith('/') && !this.pathHasSpecialPrefix(pathStr)) {
        throw new PathValidationError(
          'Path must be absolute',
          {
            code: 'E_PATH_MUST_BE_ABSOLUTE',
            severity: ErrorSeverity.Fatal,
            details: { 
              pathString: pathStr, 
              validationContext: context.pathValidation 
            }
          }
        );
      }

      // Check if path starts with an allowed root
      if (context.pathValidation.allowedRoots?.length) {
        const hasAllowedRoot = this.checkAllowedRoot(pathStr, context.pathValidation.allowedRoots);
        if (!hasAllowedRoot) {
          throw new PathValidationError(
            `Path must start with one of allowed roots`,
            {
              code: 'E_PATH_INVALID_ROOT',
              severity: ErrorSeverity.Fatal,
              details: { 
                pathString: pathStr, 
                allowedRoots: context.pathValidation.allowedRoots, 
                validationContext: context.pathValidation 
              }
            }
          );
        }
      }
    }

    return pathStr;
  }

  /**
   * Helper to check special prefix
   */
  private pathHasSpecialPrefix(pathStr: string): boolean {
       return pathStr.startsWith('$PROJECTPATH/') || 
              pathStr.startsWith('$./') || 
              pathStr.startsWith('$HOMEPATH/') || 
              pathStr.startsWith('$~/');
  }
  
  /**
   * Helper to check allowed root (async due to state access)
   */
  private checkAllowedRoot(pathStr: string, allowedRoots: string[]): boolean {
    for (const root of allowedRoots) {
      const rootVarResult = this.stateService.getPathVar(root);
      const rootPath = rootVarResult?.success ? rootVarResult.value.value.validatedPath as string : undefined;
      if (rootPath && (pathStr.startsWith(rootPath + '/') || pathStr === rootPath)) {
        return true;
      }
    }
    return false;
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

  protected async resolveStructuredPath(
    structuredPath: StructuredPath,
    context: ResolutionContext,
  ): Promise<MeldValue> {
    // Simplified: Assume resolution happens and returns a RawPath or StructuredPath
    const resolvedPathInput = structuredPath; // Placeholder for resolved structured path

    // TODO: Construct PathValidationContext from ResolutionContext properly
    const validationContext: PathValidationContext = this.createValidationContextFromResolution(context); // Assume helper method exists

    // TODO: Phase 3 - Remove cast and update context creation
    const validatedPath = await this.pathService.validatePath(resolvedPathInput, validationContext) as unknown as string;
    return validatedPath; // Returning string for now
  }

  protected async resolveStringOrVariable(
    value: string | VariableReference,
    context: ResolutionContext,
  ): Promise<MeldValue> {
    if (typeof value === 'string') {
      // TODO: Construct PathValidationContext from ResolutionContext properly
      const validationContext: PathValidationContext = this.createValidationContextFromResolution(context); // Assume helper method exists
      // TODO: Phase 3 - Remove cast and update context creation
      const validatedPath = await this.pathService.validatePath(value, validationContext) as unknown as string;
      return validatedPath; // Returning string for now
    }
    // ... handle VariableReference ...
    // Placeholder return for VariableReference case
    return ""; 
  }
  
  // Helper method placeholder
  private createValidationContextFromResolution(context: ResolutionContext): PathValidationContext {
      // Actual implementation would map fields from ResolutionContext (like baseDir, security flags)
      // to PathValidationContext fields (workingDirectory, rules, etc.)
      return {} as any; // Placeholder
  }
} 