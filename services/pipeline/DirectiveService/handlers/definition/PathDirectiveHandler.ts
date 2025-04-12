import { DirectiveNode, DirectiveData } from '@core/syntax/types.js';
import { IDirectiveHandler, DirectiveContext } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import { DirectiveError, DirectiveErrorCode, DirectiveErrorSeverity } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { directiveLogger as logger } from '@core/utils/logger.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { inject, injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
// Import necessary types for path state
import { MeldPath, PathContentType, IFilesystemPathState, IUrlPathState, StructuredPath as AstStructuredPath } from '@core/types'; 

// Remove local StructuredPath interface, use imported AstStructuredPath
// interface StructuredPath { ... }

// Update PathDirective interface to use imported AstStructuredPath
interface PathDirective extends DirectiveData {
  kind: 'path';
  identifier: string;
  path: AstStructuredPath;
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
      logger.debug('[PathDirectiveHandler] newState details:', {
        type: typeof newState,
        hasGetPathVar: typeof newState?.getPathVar === 'function',
        hasGetCurrentFilePath: typeof newState?.getCurrentFilePath === 'function',
        methods: typeof newState === 'object' && newState !== null ? Object.keys(newState) : 'N/A'
      });
      
      // REMOVED logic for setting PROJECTPATH/HOMEPATH manually

      // 1. Validate directive structure
      await this.validationService.validate(node);

      // 2. Get identifier and path object from directive
      const { directive } = node;
      const { identifier, path: pathObject } = directive as PathDirective; // Use PathDirective type
      
      if (!identifier || typeof identifier !== 'string' || identifier.trim() === '') {
        throw new DirectiveError('Path directive requires a valid identifier', this.kind, DirectiveErrorCode.VALIDATION_FAILED, { node, context });
      }
      if (!pathObject) {
        throw new DirectiveError('Path directive requires a path object', this.kind, DirectiveErrorCode.VALIDATION_FAILED, { node, context });
      }

      // Create resolution context
      // Path directives might define paths used later, context needs state
      const resolutionContext = ResolutionContextFactory.forPathDirective(
        context.currentFilePath,
        newState, // Pass the current state being modified
        context.currentFilePath // Explicitly pass currentFilePath again to ensure it's available for validation
      );

      // 3. Resolve the path object (handles internal interpolation)
      let resolvedPathString: string;
      try {
          resolvedPathString = await this.resolutionService.resolveInContext(
              pathObject, 
              resolutionContext
          );
      } catch (error: unknown) {
           throw new DirectiveError(
            `Failed to resolve path value: ${error instanceof Error ? error.message : String(error)}`,
            this.kind,
            DirectiveErrorCode.RESOLUTION_FAILED,
            { node, context, cause: error instanceof Error ? error : undefined }
          );
      }
      
      logger.debug('Path directive resolved path string', { identifier, pathObject, resolvedPathString });

      // 4. Validate the resolved path string
      let validatedMeldPath: MeldPath;
      try {
          validatedMeldPath = await this.resolutionService.resolvePath(resolvedPathString, resolutionContext);
      } catch (error: unknown) {
          throw new DirectiveError(
            `Path validation failed for resolved path "${resolvedPathString}": ${error instanceof Error ? error.message : String(error)}`,
            this.kind,
            DirectiveErrorCode.VALIDATION_FAILED, // Validation happens in resolvePath now
            { node, context, cause: error instanceof Error ? error : undefined }
          );
      }
      
      // 5. Store the validated path *state* (IFilesystemPathState or IUrlPathState)
      // The value property of MeldPath holds the appropriate state object.
      if (!validatedMeldPath.value) {
           // This shouldn't happen if validation succeeded, but check defensively
           throw new DirectiveError('Validated path object is missing internal state', this.kind, DirectiveErrorCode.EXECUTION_FAILED, { node, context });
      }
      newState.setPathVar(identifier, validatedMeldPath.value);

      logger.debug('Path directive processed successfully', {
        identifier,
        storedValue: validatedMeldPath.value,
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