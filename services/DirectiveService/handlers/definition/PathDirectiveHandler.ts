import { DirectiveNode, DirectiveData } from 'meld-spec';
import { IDirectiveHandler, DirectiveContext } from '@services/DirectiveService/IDirectiveService.js';
import { IValidationService } from '@services/ValidationService/IValidationService.js';
import { IStateService } from '@services/StateService/IStateService.js';
import { IResolutionService } from '@services/ResolutionService/IResolutionService.js';
import { ResolutionContextFactory } from '@services/ResolutionService/ResolutionContextFactory.js';
import { DirectiveError, DirectiveErrorCode } from '@services/DirectiveService/errors/DirectiveError.js';
import { directiveLogger as logger } from '@core/utils/logger';

interface PathDirective extends DirectiveData {
  kind: 'path';
  identifier: string;
  value: string;
}

/**
 * Handler for @path directives
 * Stores path variables that must start with special path variables ($HOMEPATH/$~ or $PROJECTPATH/$.)
 * Format: @path identifier = "path/to/file"
 */
export class PathDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'path';

  constructor(
    private validationService: IValidationService,
    private stateService: IStateService,
    private resolutionService: IResolutionService
  ) {}

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<void> {
    try {
      // 1. Validate directive structure
      await this.validationService.validate(node);

      // 2. Extract directive details
      const directive = node.directive as PathDirective;
      const { identifier, value } = directive;

      if (!identifier) {
        throw new DirectiveError(
          'Path directive requires an identifier',
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          { node }
        );
      }

      if (!value) {
        throw new DirectiveError(
          'Path directive requires a value',
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          { node }
        );
      }

      // 3. Create appropriate resolution context
      const resolutionContext = ResolutionContextFactory.forPathDirective(
        context.currentFilePath
      );

      // 4. Resolve path value
      let resolvedPath: string;
      try {
        resolvedPath = await this.resolutionService.resolvePath(value, {
          allowedVariableTypes: {
            text: true,
            data: false,
            path: true,
            command: false
          },
          pathValidation: {
            requireAbsolute: true,
            allowedRoots: ['$PROJECTPATH', '$HOMEPATH', '$~', '$.']
          },
          location: node.location
        });
      } catch (error) {
        throw new DirectiveError(
          error instanceof Error ? error.message : 'Failed to resolve path',
          this.kind,
          DirectiveErrorCode.RESOLUTION_FAILED,
          {
            node,
            context,
            cause: error instanceof Error ? error : undefined
          }
        );
      }

      // 5. Store in state
      try {
        await this.stateService.setPathVar(identifier, resolvedPath);
      } catch (error) {
        throw new DirectiveError(
          error instanceof Error ? error.message : 'Failed to store path in state',
          this.kind,
          DirectiveErrorCode.STATE_ERROR,
          {
            node,
            context,
            cause: error instanceof Error ? error : undefined
          }
        );
      }

      logger.debug('Stored path variable', {
        identifier,
        originalPath: value,
        resolvedPath,
        location: node.location
      });
    } catch (error) {
      logger.error('Failed to process path directive', {
        location: node.location,
        error
      });

      // Preserve DirectiveError or wrap other errors
      if (error instanceof DirectiveError) {
        throw error;
      }
      throw new DirectiveError(
        error instanceof Error ? error.message : 'Unknown error in path directive',
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