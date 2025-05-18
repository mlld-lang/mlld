import { DirectiveNode, DirectiveData } from '@core/syntax/types/index';
import { IDirectiveHandler } from '@services/pipeline/DirectiveService/IDirectiveService';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import { directiveLogger as logger } from '@core/utils/logger';
import { ErrorSeverity } from '@core/errors/MeldError';
import { inject, injectable, container } from 'tsyringe';
import { Service } from '@core/ServiceProvider';
import { MeldPath, PathContentType, IFilesystemPathState, IUrlPathState } from '@core/types/paths';
import { VariableOrigin, VariableType, type VariableMetadata, type VariableDefinition, createPathVariable } from '@core/types/variables';
import type { SourceLocation } from '@core/types/common';
import type { DirectiveProcessingContext } from '@core/types/index';
import type { ResolutionContext } from '@core/types/resolution';
import type { PathDirectiveData } from '@core/syntax/types/directives';
import type { DirectiveResult, StateChanges } from '@core/directives/DirectiveHandler.ts';
import type { StructuredPath } from '@core/syntax/types/nodes';

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

  async handle(context: DirectiveProcessingContext): Promise<DirectiveResult> {
    const state = context.state;
    const node = context.directiveNode as DirectiveNode;
    const resolutionContext = context.resolutionContext;
    const currentFilePath = resolutionContext.currentFilePath;
    const errorDetails = { 
      node: node, 
      context: context 
    };

    logger.debug('Processing path directive', {
      location: node.location,
      filePath: state.getCurrentFilePath(),
    });

    try {
      // Define source location for metadata
      const directiveSourceLocation: SourceLocation | undefined = node.location?.start ? {
        filePath: currentFilePath ?? 'unknown',
        line: node.location.start.line,
        column: node.location.start.column
      } : undefined;

      // Uncomment validation call
      await this.validationService.validate(node);

      // Assert directive node structure
      if (node.kind !== 'path') {
          throw new DirectiveError('Invalid node type provided to PathDirectiveHandler', this.kind, DirectiveErrorCode.VALIDATION_FAILED, errorDetails);
      }
      
      // Access properties directly from node values
      const values = node.values;
      const identifier = values?.identifier?.[0]?.identifier;
      const pathObject = values?.path;

      // Validate required fields
      if (!identifier) {
        throw new DirectiveError('Path directive requires an identifier', this.kind, DirectiveErrorCode.VALIDATION_FAILED, errorDetails);
      }
      
      if (!pathObject || !Array.isArray(pathObject)) {
        throw new DirectiveError('Path directive requires a path value', this.kind, DirectiveErrorCode.VALIDATION_FAILED, errorDetails);
      }

      // Resolve the path object using the provided resolution context
      let resolvedPathString: string;
      try {
          // Resolve path nodes which might contain interpolation
          resolvedPathString = await this.resolutionService.resolveNodes(
              pathObject, 
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
      
      // Adapt the MeldPath object returned by resolvePath to the structure expected by setPathVar
      let pathStateForStorage: IFilesystemPathState | IUrlPathState;
      if (validatedMeldPath.contentType === PathContentType.FILESYSTEM) {
          // For filesystem paths, MeldResolvedFilesystemPath maps directly to IFilesystemPathState
          pathStateForStorage = validatedMeldPath;
      } else if (validatedMeldPath.contentType === PathContentType.URL) {
          // For URL paths, we need to manually construct IUrlPathState from MeldResolvedUrlPath
          // Add the missing 'isValidated' property (defaulting to true as resolvePath succeeded)
          // and ensure fetchStatus is present (defaulting to 'not_fetched')
          pathStateForStorage = {
              ...validatedMeldPath,
              isValidated: true, // Assume validated since resolvePath didn't throw
              fetchStatus: validatedMeldPath.fetchStatus || 'not_fetched' // Ensure fetchStatus exists
          };
      } else {
          // Should not happen if MeldPath is correctly typed
           throw new DirectiveError('Unexpected content type in validated path object', this.kind, DirectiveErrorCode.EXECUTION_FAILED, errorDetails);
      }

      const metadata: VariableMetadata = {
          origin: VariableOrigin.DIRECT_DEFINITION,
          definedAt: directiveSourceLocation,
          createdAt: Date.now(),
          modifiedAt: Date.now()
      };
      
      // Construct the variable definition manually
      // Factory functions like createPathVariable return the old structure with 'name'
      const variableDefinition: VariableDefinition = {
        type: VariableType.PATH,
        value: pathStateForStorage,
        metadata: {
          origin: VariableOrigin.DIRECT_DEFINITION,
          definedAt: directiveSourceLocation,
          createdAt: Date.now(),
          modifiedAt: Date.now(),
        }
      };

      logger.debug('Path directive processed successfully', {
        identifier,
        storedPath: pathStateForStorage.validatedPath,
        contentType: pathStateForStorage.contentType,
        location: node.location
      });

      // Return NEW DirectiveResult shape
      return { 
         stateChanges: { 
            variables: { 
                [identifier]: variableDefinition
            }
         }
         // No replacement nodes for @path
      };
    } catch (error) {
      // Handle errors
      if (error instanceof DirectiveError) {
         // Ensure details are attached if missing
         // if (!error.details?.context) { // Remove read-only assignment attempt
         //    error.details = { ...(error.details || {}), ...errorDetails };
         // }
        // Re-throw original if details are sufficient or cannot be added
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