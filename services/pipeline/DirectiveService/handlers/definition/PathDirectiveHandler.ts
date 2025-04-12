import { DirectiveNode, DirectiveData } from '@core/syntax/types/index.js';
import { IDirectiveHandler, DirectiveContext } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import { DirectiveError, DirectiveErrorCode, DirectiveErrorSeverity } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { directiveLogger as logger } from '@core/utils/logger.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { inject, injectable, container } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import type { StateServiceLike } from '@core/shared-service-types.js';
// Import necessary types for path state
import { MeldPath, PathContentType, IFilesystemPathState, IUrlPathState, StructuredPath as AstStructuredPath, VariableMetadata } from '@core/types'; 
import { VariableOrigin } from '@core/types/variables.js';
import type { SourceLocation } from '@core/types/common.js';

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

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<StateServiceLike> {
    logger.debug('Processing path directive', {
      location: node.location,
      // context // Avoid logging potentially large state object
    });

    try {
      const newState = context.state.clone(); 
      const directiveSourceLocation: SourceLocation | undefined = node.location?.start ? {
        filePath: context.currentFilePath ?? 'unknown',
        line: node.location.start.line,
        column: node.location.start.column
      } : undefined;

      // 1. Validate directive structure
      // Temporarily comment out validation due to potential DirectiveNode/IDirectiveNode type conflict (See Issue #34)
      // await this.validationService.validate(node);

      // 2. Get identifier and path object from directive
      const { identifier, path: pathObject } = node.directive as { identifier: string, path: AstStructuredPath }; 
      
      if (!identifier || typeof identifier !== 'string' || identifier.trim() === '') {
        throw new DirectiveError('Path directive requires a valid identifier', this.kind, DirectiveErrorCode.VALIDATION_FAILED, { node: node as any, context });
      }
      if (!pathObject) {
        throw new DirectiveError('Path directive requires a path object', this.kind, DirectiveErrorCode.VALIDATION_FAILED, { node: node as any, context });
      }

      // Create resolution context using the ORIGINAL state for lookups
      const resolutionContext = ResolutionContextFactory.forPathDirective(
        context.state, // <<< USE ORIGINAL context.state >>>
        context.currentFilePath 
      );

      // 3. Resolve the path object (handles internal interpolation)
      let resolvedPathString: string;
      try {
          // Pass the AstStructuredPath from the node directly
          resolvedPathString = await this.resolutionService.resolveInContext(
              pathObject, 
              resolutionContext
          );
      } catch (error: unknown) {
           throw new DirectiveError(
            `Failed to resolve path value: ${error instanceof Error ? error.message : String(error)}`,
            this.kind,
            DirectiveErrorCode.RESOLUTION_FAILED,
            { node: node as any, context, cause: error instanceof Error ? error : undefined }
          );
      }
      
      logger.debug('Path directive resolved path string', { identifier, pathObject: JSON.stringify(pathObject), resolvedPathString });

      // 4. Validate the resolved path string using the correct ResolutionService method
      let validatedMeldPath: MeldPath;
      try {
          // Use resolvePath for validation/normalization of the resolved string
          validatedMeldPath = await this.resolutionService.resolvePath(resolvedPathString, resolutionContext);
      } catch (error: unknown) {
          throw new DirectiveError(
            `Path validation failed for resolved path "${resolvedPathString}": ${error instanceof Error ? error.message : String(error)}`,
            this.kind,
            DirectiveErrorCode.VALIDATION_FAILED, 
            { node: node as any, context, cause: error instanceof Error ? error : undefined }
          );
      }
      
      // 5. Store the validated path *state* (IFilesystemPathState or IUrlPathState)
      if (!validatedMeldPath.value) {
           throw new DirectiveError('Validated path object is missing internal state', this.kind, DirectiveErrorCode.EXECUTION_FAILED, { node: node as any, context });
      }
      
      const metadata: Partial<VariableMetadata> = {
          origin: VariableOrigin.DIRECT_DEFINITION,
          definedAt: directiveSourceLocation as any // Workaround for Issue #34
      };
      
      // Pass the state object (value) from MeldPath to setPathVar
      await newState.setPathVar(identifier, validatedMeldPath.value, metadata); 

      logger.debug('Path directive processed successfully', {
        identifier,
        storedValue: validatedMeldPath.value,
        location: node.location
      });

      return newState; // Return the modified clone
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
          node: node as any, // Add cast
          context,
          cause: error instanceof Error ? error : undefined
        }
      );
    }
  }
} 