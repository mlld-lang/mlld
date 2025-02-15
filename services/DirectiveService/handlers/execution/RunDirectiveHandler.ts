import { DirectiveNode, RunDirective } from 'meld-spec';
import { IDirectiveHandler, DirectiveContext } from '../../IDirectiveService';
import { IValidationService } from '../../../ValidationService/IValidationService';
import { IStateService } from '../../../StateService/IStateService';
import { IResolutionService } from '../../../ResolutionService/IResolutionService';
import { IFileSystemService } from '../../../FileSystemService/IFileSystemService';
import { ResolutionContextFactory } from '../../../ResolutionService/ResolutionContextFactory';
import { directiveLogger as logger } from '@core/utils/logger';
import { DirectiveError, DirectiveErrorCode } from '../../errors/DirectiveError';

/**
 * Handler for @run directives
 * Executes commands with resolved variables and captures output
 */
export class RunDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'run';

  constructor(
    private validationService: IValidationService,
    private resolutionService: IResolutionService,
    private stateService: IStateService,
    private fileSystemService: IFileSystemService
  ) {}

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<void> {
    logger.debug('Processing run directive', {
      location: node.location,
      context
    });

    try {
      // 1. Validate directive structure
      await this.validationService.validate(node);
      const directive = node.directive as RunDirective;

      // 2. Extract command
      const { command } = directive;

      // 3. Create resolution context for command
      const resolutionContext = ResolutionContextFactory.forRunDirective(
        context.currentFilePath
      );

      // 4. Resolve command with variables
      const resolvedCommand = await this.resolutionService.resolveInContext(
        command,
        resolutionContext
      );

      // 5. Execute command
      const cwd = context.workingDirectory || this.fileSystemService.getCwd();
      const { stdout, stderr } = await this.fileSystemService.executeCommand(
        resolvedCommand,
        { cwd }
      );

      // 6. Store output
      if (directive.output) {
        // If output variable specified, store there
        await this.stateService.setTextVar(directive.output, stdout || stderr || '');
      } else {
        // Otherwise store in stdout/stderr variables
        if (stdout) {
          await this.stateService.setTextVar('stdout', stdout);
        }
        if (stderr) {
          await this.stateService.setTextVar('stderr', stderr);
        }
      }

      logger.debug('Run directive processed successfully', {
        command: resolvedCommand,
        location: node.location
      });
    } catch (error) {
      logger.error('Failed to process run directive', {
        location: node.location,
        error
      });

      // Wrap in DirectiveError if needed
      if (error instanceof DirectiveError) {
        throw error;
      }
      throw new DirectiveError(
        error.message,
        this.kind,
        DirectiveErrorCode.EXECUTION_FAILED,
        {
          node,
          context,
          cause: error
        }
      );
    }
  }
} 