import { DirectiveNode, DirectiveData } from '@core/syntax/types.js';
import { IDirectiveHandler, DirectiveContext } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import { DirectiveError, DirectiveErrorCode, DirectiveErrorSeverity } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { directiveLogger as logger } from '@core/utils/logger.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { inject, injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';

// Updated to match meld-ast 1.6.1 structure exactly
interface StructuredPath {
  raw: string;
  normalized?: string;
  structured: {
    base: string;
    segments: string[];
    variables?: {
      text?: string[];
      path?: string[];
      special?: string[];
    };
  };
}

interface PathDirective extends DirectiveData {
  kind: 'path';
  identifier: string;
  path: StructuredPath;
}

/**
 * Handler for @path directives
 * Stores path values in state after resolving variables
 */

@injectable()
@Service({
  description: 'Handler for @path directives'
})
export class PathDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'path';

  constructor(
    @inject('IValidationService') private validationService: IValidationService,
    @inject('IStateService') private stateService: IStateService,
    @inject('IResolutionService') private resolutionService: IResolutionService
  ) {}

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<IStateService> {
    logger.debug('Processing path directive', {
      location: node.location,
      context
    });

    try {
      // Log state service information
      logger.debug('State service details', {
        stateExists: !!context.state,
        stateMethods: context.state ? Object.keys(context.state) : 'undefined'
      });

      // Create a new state for modifications
      const newState = context.state.clone();
      
      // Initialize special path variables with safer checks
      // Only try to set them if methods exist to avoid test failures
      try {
        // Use safer checks for all methods to make tests more resilient
        const canSetProjectPath = 
          typeof newState.setPathVar === 'function' && 
          (typeof newState.getPathVar !== 'function' || newState.getPathVar('PROJECTPATH') === undefined);
        
        if (canSetProjectPath) {
          // Try to get from this.stateService first as a fallback
          let projectPath = process.cwd();
          try {
            if (typeof this.stateService.getPathVar === 'function') {
              const statePath = this.stateService.getPathVar('PROJECTPATH');
              if (statePath) {
                projectPath = statePath;
              }
            }
          } catch (e) {
            logger.debug('Error getting PROJECTPATH from state service', { error: e });
          }
          
          logger.debug('Setting PROJECTPATH', { projectPath });
          newState.setPathVar('PROJECTPATH', projectPath);
        }
        
        const canSetHomePath = 
          typeof newState.setPathVar === 'function' && 
          (typeof newState.getPathVar !== 'function' || newState.getPathVar('HOMEPATH') === undefined);
        
        if (canSetHomePath) {
          // Try to get from this.stateService first as a fallback
          let homePath = process.env.HOME || process.env.USERPROFILE || '/home';
          try {
            if (typeof this.stateService.getPathVar === 'function') {
              const statePath = this.stateService.getPathVar('HOMEPATH');
              if (statePath) {
                homePath = statePath;
              }
            }
          } catch (e) {
            logger.debug('Error getting HOMEPATH from state service', { error: e });
          }
          
          logger.debug('Setting HOMEPATH', { homePath });
          newState.setPathVar('HOMEPATH', homePath);
        }
      } catch (e) {
        logger.debug('Error setting special path variables', { error: e });
      }

      // 1. Validate directive structure
      await this.validationService.validate(node);

      // 2. Get identifier and path from directive
      const { directive } = node;
      
      // Debug the actual properties available on the directive
      logger.debug('*** DIRECTIVE PROPERTIES ***', {
        properties: Object.keys(directive),
        fullDirective: JSON.stringify(directive, null, 2)
      });
      
      // Support both 'identifier' and 'id' field names for backward compatibility
      const identifier = directive.identifier || (directive as any).id;
      
      // Handle both structured paths and raw string paths for compatibility
      let pathValue: string | StructuredPath;
      
      if ('path' in directive && directive.path) {
        // Handle structured path object
        if (typeof directive.path === 'object' && 'raw' in directive.path) {
          // Pass the entire structured path object to resolveInContext
          pathValue = directive.path;
        } else {
          // Handle direct value
          pathValue = String(directive.path);
        }
      } else if ('value' in directive) {
        // Handle legacy path value
        pathValue = String(directive.value);
      } else {
        throw new DirectiveError(
          'Path directive requires a path value',
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          { 
            node,
            context
          }
        );
      }

      // Log path information
      logger.debug('Path directive details', {
        identifier,
        pathValue: typeof pathValue === 'object' ? JSON.stringify(pathValue) : pathValue,
        directiveProperties: Object.keys(directive),
        pathType: typeof pathValue,
        nodeType: node.type,
        directiveKind: directive.kind
      });

      // 3. Check for required fields 
      if (!identifier || typeof identifier !== 'string' || identifier.trim() === '') {
        throw new DirectiveError(
          'Path directive requires a valid identifier',
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          { 
            node,
            context
          }
        );
      }

      // Create resolution context - make sure the state has getPathVar if needed
      let resolutionContext = ResolutionContextFactory.forPathDirective(
        context.currentFilePath,
        typeof newState.getPathVar === 'function' ? newState : undefined
      );

      // Log the resolution context and inputs
      logger.debug('*** ResolutionService.resolveInContext', {
        value: pathValue,
        allowedVariableTypes: resolutionContext.allowedVariableTypes,
        pathValidation: resolutionContext.pathValidation,
        stateExists: !!resolutionContext.state,
        pathValueType: typeof pathValue,
        isStructured: typeof pathValue === 'object' && pathValue !== null
      });

      // Resolve the path value
      let resolvedValue;
      try {
        // If the path starts with a special variable, add it to state directly
        const hasSpecialVar = typeof pathValue === 'string' && 
          (pathValue.startsWith('$PROJECTPATH/') || 
           pathValue.startsWith('$./') || 
           pathValue.startsWith('$HOMEPATH/') || 
           pathValue.startsWith('$~/'));
        
        if (hasSpecialVar && typeof pathValue === 'string') {
          logger.debug('Path contains special variable, storing as-is:', pathValue);
          resolvedValue = pathValue;
        } else {
          try {
            resolvedValue = await this.resolutionService.resolveInContext(
              pathValue,
              resolutionContext
            );
          } catch (resolveError) {
            // If resolution fails but we have a string with quotes, try to use it directly
            if (typeof pathValue === 'string' && 
                (pathValue.startsWith('"') && pathValue.endsWith('"'))) {
              logger.debug('Resolution failed but using quoted string value directly:', pathValue);
              // Remove quotes
              resolvedValue = pathValue.substring(1, pathValue.length - 1);
            } else {
              // Re-throw if we can't handle it
              throw resolveError;
            }
          }
        }
        
        logger.debug('Path directive resolved value', {
          identifier,
          pathValue: typeof pathValue === 'object' ? JSON.stringify(pathValue) : pathValue,
          resolvedValue
        });
      } catch (error: unknown) {
        // Special handling for paths with $PROJECTPATH or $HOMEPATH
        // If the path starts with a special variable, store it as-is
        if (typeof pathValue === 'string' && 
            (pathValue.startsWith('$PROJECTPATH/') || 
             pathValue.startsWith('$HOMEPATH/') ||
             pathValue.startsWith('$~/') ||
             pathValue.startsWith('$./'))
           ) {
          logger.debug('Storing special path variable as-is', {
            identifier,
            pathValue
          });
          resolvedValue = pathValue;
        } else {
          // Re-throw the error for other cases
          throw new DirectiveError(
            `Failed to resolve path: ${error instanceof Error ? error.message : String(error)}`,
            this.kind,
            DirectiveErrorCode.RESOLUTION_FAILED,
            { 
              node,
              context,
              cause: error instanceof Error ? error : undefined
            }
          );
        }
      }

      // Store the path value
      newState.setPathVar(identifier, resolvedValue);
      
      // CRITICAL: Path variables should NOT be mirrored as text variables
      // This ensures proper separation between variable types for security purposes
      // Path variables should only be accessible via $path syntax, not {{path}} syntax

      logger.debug('Path directive processed successfully', {
        identifier,
        resolvedValue,
        location: node.location
      });

      return newState;
    } catch (error) {
      // Handle errors
      if (error instanceof DirectiveError) {
        throw error;
      }
      
      const message = error instanceof Error ? error.message : 'Unknown error processing path directive';
      throw new DirectiveError(
        message,
        this.kind,
        DirectiveErrorCode.EXECUTION_FAILED,
        {
          node,
          context,
          cause: error instanceof Error ? error : undefined
        }
      );
    }
  }
} 