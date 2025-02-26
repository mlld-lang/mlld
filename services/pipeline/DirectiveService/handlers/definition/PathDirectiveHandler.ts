import { DirectiveNode, DirectiveData } from 'meld-spec';
import { IDirectiveHandler, DirectiveContext } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import { DirectiveError, DirectiveErrorCode, DirectiveErrorSeverity } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { directiveLogger as logger } from '@core/utils/logger';
import { ErrorSeverity } from '@core/errors/MeldError.js';

// Updated to match meld-ast 1.6.1 structure
interface PathDirective extends DirectiveData {
  kind: 'path';
  identifier: string;
  value: string;
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

      // 2. Get identifier and value from directive
      const { directive } = node;
      const identifier = directive.identifier;
      const value = directive.value;

      // Log path information
      logger.debug('Path directive details', {
        identifier,
        value,
        valueType: typeof value,
        nodeType: node.type,
        directiveKind: directive.kind
      });

      // 3. Process value based on type
      if (!value) {
        throw new DirectiveError(
          'Path directive requires a value',
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

      // Get the raw path value to resolve
      const rawPath = value;

      // Log the resolution context that was created
      logger.debug('Created resolution context for path directive', {
        currentFilePath: resolutionContext.currentFilePath,
        allowedVariableTypes: resolutionContext.allowedVariableTypes,
        pathValidation: resolutionContext.pathValidation,
        stateIsPresent: !!resolutionContext.state,
        specialPathVars: {
          PROJECTPATH: resolutionContext.state?.getPathVar('PROJECTPATH'),
          HOMEPATH: resolutionContext.state?.getPathVar('HOMEPATH')
        }
      });

      // Resolve variables in the value
      const resolvedValue = await this.resolutionService.resolveInContext(
        rawPath,
        resolutionContext
      );

      // 4. Store in state
      newState.setPathVar(identifier, resolvedValue);
      
      // Also set a corresponding text variable with the same name so it can be accessed
      // in text directives using ${identifier} syntax
      newState.setTextVar(identifier, resolvedValue);

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