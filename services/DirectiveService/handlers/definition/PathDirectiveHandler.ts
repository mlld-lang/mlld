import { DirectiveNode, DirectiveData } from '../../../../node_modules/meld-spec/dist/types';
import { IDirectiveHandler, DirectiveContext } from '../../IDirectiveService';
import { IValidationService } from '../../../ValidationService/IValidationService';
import { IStateService } from '../../../StateService/IStateService';
import { IResolutionService, ResolutionContext } from '../../../ResolutionService/IResolutionService';
import { ResolutionContextFactory } from '../../../ResolutionService/ResolutionContextFactory';
import { DirectiveError, DirectiveErrorCode } from '../../errors/DirectiveError';
import { directiveLogger as logger } from '../../../../core/utils/logger';

/**
 * Handler for @path directives
 * Stores path variables that must start with special path variables ($HOMEPATH/$~ or $PROJECTPATH/$.)
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
      const directive = node.directive as DirectiveData & {
        kind: 'path';
        name: string;
        path: string;
      };
      const { name, path } = directive;

      // 3. Create appropriate resolution context
      const resolutionContext = ResolutionContextFactory.forPathDirective(context.currentFilePath);

      // 4. Resolve path value
      const resolvedPath = await this.resolutionService.resolvePath(path, {
        allowedVariableTypes: {
          text: true,
          data: false,
          path: true,
          command: false
        },
        pathValidation: {
          requireAbsolute: true,
          allowedRoots: ['$PROJECTPATH', '$HOMEPATH', '$~', '$.']
        }
      });

      // 5. Store in state
      await this.stateService.setPathVar(name, resolvedPath);

      logger.debug('Stored path variable', {
        name,
        path: resolvedPath,
        location: node.location
      });
    } catch (error) {
      // Wrap non-DirectiveErrors
      if (error instanceof Error && !(error instanceof DirectiveError)) {
        throw new DirectiveError(
          error.message,
          'path',
          DirectiveErrorCode.EXECUTION_FAILED,
          {
            node,
            context,
            cause: error
          }
        );
      }
      throw error;
    }
  }
} 