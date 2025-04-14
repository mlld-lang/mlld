import { DirectiveNode, DirectiveData } from '@core/syntax/types/index.js';
import { IDirectiveHandler } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { directiveLogger as logger } from '@core/utils/logger.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { inject, injectable, container } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import { MeldPath, PathContentType, IFilesystemPathState, IUrlPathState, StructuredPath, VariableMetadata } from '@core/types';
import { VariableOrigin } from '@core/types/variables.js';
import type { SourceLocation } from '@core/types/common.js';
import type { DirectiveProcessingContext } from '@core/types/index.js';
import type { ResolutionContext } from '@core/types/resolution.js';
import type { PathDirectiveData } from '@core/syntax/types/directives.js';
import type { DirectiveResult } from '@services/pipeline/DirectiveService/types.js';

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
    @inject('IResolutionService') private resolutionService: IResolutionService
  ) {}

  async execute(context: DirectiveProcessingContext): Promise<IStateService | DirectiveResult> {
    const state = context.state;
    const node = context.directiveNode as DirectiveNode;
    const resolutionContext = context.resolutionContext;
    const currentFilePath = state.getCurrentFilePath();
    const errorDetails = { 
      node: node, 
      context: { currentFilePath: currentFilePath ?? undefined } 
    };

    logger.debug('Processing path directive', {
      location: node.location,
      filePath: state.getCurrentFilePath(),
    });

    try {
      const directiveSourceLocation: SourceLocation | undefined = node.location?.start ? {
        filePath: currentFilePath ?? 'unknown',
        line: node.location.start.line,
        column: node.location.start.column
      } : undefined;

      // Uncomment validation call
      await this.validationService.validate(node);

      // Assert directive node structure
      if (!node.directive || node.directive.kind !== 'path') {
          throw new DirectiveError('Invalid node type provided to PathDirectiveHandler', this.kind, DirectiveErrorCode.VALIDATION_FAILED, errorDetails);
      }
      const directive = node.directive as PathDirectiveData; 
      const identifier = directive.identifier;
      const pathObject = directive.path;
      
      if (!identifier || typeof identifier !== 'string' || identifier.trim() === '') {
        throw new DirectiveError('Path directive requires a valid identifier', this.kind, DirectiveErrorCode.VALIDATION_FAILED, errorDetails);
      }
      if (!pathObject || typeof pathObject !== 'object' || !pathObject.raw || !pathObject.structured) {
        throw new DirectiveError('Path directive requires a valid path object structure', this.kind, DirectiveErrorCode.VALIDATION_FAILED, errorDetails);
      }

      // Resolve the path object using the provided resolution context
      let resolvedPathString: string;
      try {
          // Resolve path value which might contain interpolation
          const valueToResolve = pathObject.interpolatedValue ?? pathObject.raw;
          resolvedPathString = await this.resolutionService.resolveInContext(
              valueToResolve, 
              resolutionContext
          );
      } catch (error: unknown) {
           throw new DirectiveError(
            `Failed to resolve path value: ${error instanceof Error ? error.message : String(error)}`,
            this.kind,
            DirectiveErrorCode.RESOLUTION_FAILED,
            { ...errorDetails, cause: error instanceof Error ? error : undefined }
          );
      }
      
      logger.debug('Path directive resolved path string', { identifier, pathObject: JSON.stringify(pathObject), resolvedPathString });

      // Validate the resolved path string using the correct ResolutionService method
      let validatedMeldPath: MeldPath;
      try {
          // Use resolvePath for validation/normalization of the resolved string
          validatedMeldPath = await this.resolutionService.resolvePath(resolvedPathString, resolutionContext);
      } catch (error: unknown) {
          throw new DirectiveError(
            `Path validation failed for resolved path "${resolvedPathString}": ${error instanceof Error ? error.message : String(error)}`,
            this.kind,
            DirectiveErrorCode.VALIDATION_FAILED, 
            { ...errorDetails, cause: error instanceof Error ? error : undefined }
          );
      }
      
      // Store the validated path *state* (IFilesystemPathState or IUrlPathState)
      if (!validatedMeldPath.value) {
           throw new DirectiveError('Validated path object is missing internal state', this.kind, DirectiveErrorCode.EXECUTION_FAILED, errorDetails);
      }
      
      const metadata: Partial<VariableMetadata> = {
          origin: VariableOrigin.DIRECT_DEFINITION,
          definedAt: directiveSourceLocation
      };
      
      // Use the state from the context, remove metadata argument
      await state.setPathVar(identifier, validatedMeldPath.value); 

      logger.debug('Path directive processed successfully', {
        identifier,
        storedValue: validatedMeldPath.value,
        location: node.location
      });

      // Return IStateService or DirectiveResult (just state in this case)
      return state;
    } catch (error) {
      // Handle errors
      if (error instanceof DirectiveError) {
         // Ensure details are attached if missing
         if (!error.details?.context) {
            error.details = { ...(error.details || {}), ...errorDetails };
         }
        throw error;
      } 
      
      // Wrap unexpected errors
      const message = error instanceof Error ? error.message : 'Unknown error processing path directive';
      throw new DirectiveError(
        message,
        this.kind,
        DirectiveErrorCode.EXECUTION_FAILED,
        {
          ...errorDetails,
          cause: error instanceof Error ? error : undefined
        }
      );
    }
  }
} 