import { DirectiveNode, DirectiveData } from 'meld-spec';
import { IDirectiveHandler, DirectiveContext } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import { DirectiveError, DirectiveErrorCode, DirectiveErrorSeverity } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { directiveLogger as logger } from '@core/utils/logger';
import { ErrorSeverity } from '@core/errors/MeldError.js';

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
export class PathDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'path';

  constructor(
    private validationService: IValidationService,
    private stateService: IStateService,
    private resolutionService: IResolutionService
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
      
      // Initialize special path variables if not already set
      if (newState.getPathVar('PROJECTPATH') === undefined) {
        const projectPath = this.stateService.getPathVar('PROJECTPATH') || process.cwd();
        logger.debug('Setting PROJECTPATH', { projectPath });
        newState.setPathVar('PROJECTPATH', projectPath);
      }
      
      if (newState.getPathVar('HOMEPATH') === undefined) {
        const homePath = this.stateService.getPathVar('HOMEPATH') || 
                        (process.env.HOME || process.env.USERPROFILE || '/home');
        logger.debug('Setting HOMEPATH', { homePath });
        newState.setPathVar('HOMEPATH', homePath);
      }

      // 1. Validate directive structure
      await this.validationService.validate(node);

      // 2. Get identifier and path from directive
      const { directive } = node;
      
      // Debug the actual properties available on the directive
      console.log('*** DIRECTIVE PROPERTIES ***');
      console.log('Properties:', Object.keys(directive));
      console.log('Full directive:', JSON.stringify(directive, null, 2));
      
      const directivePath = directive as PathDirective;
      
      // Check if we have identifier and path before accessing them
      console.log('*** DIRECTIVE CASTING RESULT ***');
      console.log('directivePath has identifier?', 'identifier' in directivePath);
      console.log('directivePath has path?', 'path' in directivePath);
      
      // Support both 'identifier' and 'id' field names for backward compatibility
      const identifier = directivePath.identifier || (directivePath as any).id;
      
      // Handle both structured paths and raw string paths for compatibility
      // Check for both 'path' and 'value' properties to handle different formats
      let pathValue: string | undefined;
      
      if ('path' in directivePath && directivePath.path) {
        // Handle structured path object
        if (typeof directivePath.path === 'object' && 'raw' in directivePath.path) {
          pathValue = directivePath.path.raw;
        } else {
          // Handle direct value
          pathValue = String(directivePath.path);
        }
      } else if ('value' in directive) {
        // Handle legacy path value
        pathValue = String(directive.value);
      }

      // Log path information
      logger.debug('Path directive details', {
        identifier,
        pathValue,
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

      if (!pathValue) {
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

      // Create resolution context
      const resolutionContext = ResolutionContextFactory.forPathDirective(
        context.currentFilePath,
        newState
      );

      // Log the resolution context and inputs
      console.log('*** ResolutionService.resolveInContext', {
        value: pathValue,
        allowedVariableTypes: resolutionContext.allowedVariableTypes,
        pathValidation: resolutionContext.pathValidation,
        stateExists: !!resolutionContext.state,
        specialPathVars: {
          PROJECTPATH: newState.getPathVar('PROJECTPATH'),
          HOMEPATH: newState.getPathVar('HOMEPATH')
        }
      });

      // Resolve the path value
      const resolvedValue = await this.resolutionService.resolveInContext(
        pathValue,
        resolutionContext
      );

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