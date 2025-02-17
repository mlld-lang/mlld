import { DirectiveNode } from 'meld-spec';
import { IDirectiveHandler, DirectiveContext } from '@services/DirectiveService/IDirectiveService.js';
import { IValidationService } from '@services/ValidationService/IValidationService.js';
import { IResolutionService } from '@services/ResolutionService/IResolutionService.js';
import { IStateService } from '@services/StateService/IStateService.js';
import { IFileSystemService } from '@services/FileSystemService/IFileSystemService.js';
import { DirectiveError, DirectiveErrorCode } from '@services/DirectiveService/errors/DirectiveError.js';
import { directiveLogger as logger } from '@core/utils/logger.js';

/**
 * Handler for @run directives
 * Executes commands and stores their output in state
 */
export class RunDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'run';

  constructor(
    private validationService: IValidationService,
    private resolutionService: IResolutionService,
    private stateService: IStateService,
    private fileSystemService: IFileSystemService
  ) {}

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<IStateService> {
    logger.debug('Processing run directive', {
      location: node.location,
      context
    });

    try {
      // 1. Validate directive structure
      await this.validationService.validate(node);

      // 2. Get command from directive
      const { command, output } = node.directive;

      // 3. Process command
      if (!command) {
        throw new DirectiveError(
          'Run directive requires a command',
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          { node }
        );
      }

      // Create a new state for modifications
      const newState = context.state.clone();

      // Create resolution context
      const resolutionContext = {
        currentFilePath: context.currentFilePath,
        state: context.state,
        allowedVariableTypes: {
          text: true,
          data: true,
          path: true,
          command: true
        }
      };

      // Resolve variables in command
      const resolvedCommand = await this.resolutionService.resolveInContext(
        command,
        resolutionContext
      );

      // Determine working directory
      const cwd = context.workingDirectory || 
        (context.currentFilePath ? this.fileSystemService.dirname(context.currentFilePath) : undefined);

      // Execute command
      const result = await this.fileSystemService.executeCommand(resolvedCommand, { cwd });

      // Store result in state
      if (output) {
        // If output is specified, store in that variable
        newState.setTextVar(output, result.stdout);
      } else {
        // Otherwise store in stdout/stderr variables
        if (result.stdout) {
          newState.setTextVar('stdout', result.stdout);
        }
        if (result.stderr) {
          newState.setTextVar('stderr', result.stderr);
        }
      }

      logger.debug('Run directive processed successfully', {
        command: resolvedCommand,
        output: result,
        location: node.location
      });

      return newState;
    } catch (error: any) {
      logger.error('Failed to process run directive', {
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