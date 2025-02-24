import type { DirectiveNode, DirectiveContext, MeldNode, TextNode } from 'meld-spec';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { directiveLogger } from '../../../../../core/utils/logger.js';
import type { DirectiveResult } from '@services/pipeline/DirectiveService/types.js';
import type { IDirectiveHandler } from '@services/pipeline/DirectiveService/IDirectiveService.js';

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
      }
      if (stderr) {
        clonedState.setTextVar('stderr', stderr);
      }

      // In transformation mode, return a replacement node with the command output
      if (clonedState.isTransformationEnabled()) {
        const content = stdout && stderr ? `${stdout}\n${stderr}` : stdout || stderr || '';
        const replacement: TextNode = {
          type: 'Text',
          content,
          location: node.location
        };
        clonedState.transformNode(node, replacement);
        return { state: clonedState, replacement };
      }

      // In normal mode, return a placeholder node
      const placeholder: TextNode = {
        type: 'Text',
        content: '[run directive output placeholder]',
        location: node.location
      };
      return { state: clonedState, replacement: placeholder };
    } catch (error) {
      directiveLogger.error('Error executing run directive:', error);
      
      // If it's already a DirectiveError, just rethrow it
      if (error instanceof DirectiveError) {
        throw error;
      }

      // Otherwise wrap it with more context
      const message = error instanceof Error ? 
        `Failed to execute command: ${error.message}` :
        'Failed to execute command';

      throw new DirectiveError(
        message,
        this.kind,
        DirectiveErrorCode.EXECUTION_ERROR,
        { node, error }
      );
    }
  }
} 