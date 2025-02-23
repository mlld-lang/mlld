import type { DirectiveNode, DirectiveContext, MeldNode, TextNode } from 'meld-spec';
import type { IValidationService } from '@services/ValidationService/IValidationService.js';
import type { IStateService } from '@services/StateService/IStateService.js';
import type { IResolutionService } from '@services/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/FileSystemService/IFileSystemService.js';
import { DirectiveError, DirectiveErrorCode } from '@services/DirectiveService/errors/DirectiveError.js';
import { directiveLogger } from '../../../../core/utils/logger.js';
import type { DirectiveResult } from '@services/DirectiveService/types.js';
import type { IDirectiveHandler } from '@services/DirectiveService/IDirectiveService.js';

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

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult> {
    const { directive } = node;
    const { state } = context;
    const clonedState = state.clone();

    try {
      // Validate the directive
      await this.validationService.validate(node);

      // Resolve the command
      const resolvedCommand = await this.resolutionService.resolveInContext(
        directive.command,
        context
      );

      // Execute the command
      const { stdout, stderr } = await this.fileSystemService.executeCommand(
        resolvedCommand,
        {
          cwd: context.workingDirectory || this.fileSystemService.getCwd()
        }
      );

      // Store the output in state variables
      if (directive.output) {
        clonedState.setTextVar(directive.output, stdout);
      } else {
        clonedState.setTextVar('stdout', stdout);
        if (stderr) {
          clonedState.setTextVar('stderr', stderr);
        }
      }

      // If transformation is enabled, return a replacement node with the command output
      if (clonedState.isTransformationEnabled()) {
        const content = stdout && stderr ? `${stdout}\n${stderr}` : stdout || stderr;
        const replacement: TextNode = {
          type: 'Text',
          content,
          location: node.location
        };
        return { state: clonedState, replacement };
      }

      return { state: clonedState };
    } catch (error) {
      directiveLogger.error('Error executing run directive:', error);
      if (error instanceof DirectiveError) {
        throw error;
      }
      throw new DirectiveError(
        `Failed to execute command: ${error.message}`,
        'run',
        DirectiveErrorCode.EXECUTION_FAILED
      );
    }
  }
} 