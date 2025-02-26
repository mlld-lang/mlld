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
      const path = directivePath.path;

      // Log path information
      logger.debug('Path directive details', {
        identifier,
        path,
        directiveProperties: Object.keys(directive),
        hasPath: !!path,
        pathType: path ? typeof path : 'undefined',
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

      if (!path || !path.raw) {
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
        value: path.raw,
        allowedVariableTypes: resolutionContext.allowedVariableTypes,
        pathValidation: resolutionContext.pathValidation,
        stateExists: !!resolutionContext.state,
        specialPathVars: {
          PROJECTPATH: newState.getPathVar('PROJECTPATH'),
          HOMEPATH: newState.getPathVar('HOMEPATH')
        }
      });

      // Resolve the path using the resolution service
      // Pass the entire StructuredPath object, not just the raw value
      const resolvedValue = await this.resolutionService.resolveInContext(
        path,
        resolutionContext
      );

      console.log('*** Resolved path value:', resolvedValue);

      // 4. Store in state as both path variable and text variable
      newState.setPathVar(identifier, resolvedValue);
      
      // It's critical to also set the text variable with the same name,
      // this allows it to be accessed as {{identifier}} in text directives
      newState.setTextVar(identifier, resolvedValue);

      // Log the final state of the path variable
      logger.debug('Stored path variable', {
        identifier,
        resolvedValue,
        storedPathVar: newState.getPathVar(identifier),
        storedTextVar: newState.getTextVar(identifier)
      });

      logger.debug('Path directive processed successfully', {
        identifier,
        path: resolvedValue,
        location: node.location
      });

      return newState;
    } catch (error: any) {
      logger.error('Failed to process path directive', {
        location: node.location,
        error
      });

      // Wrap in DirectiveError if needed
      if (error instanceof DirectiveError) {
        throw error;
      }
      throw new DirectiveError(
        error?.message || 'Unknown error',
        this.kind,
        DirectiveErrorCode.EXECUTION_FAILED,
        {
          node,
          context,
          cause: error instanceof Error ? error : new Error(String(error))
        }
      );
    }
  }
} 