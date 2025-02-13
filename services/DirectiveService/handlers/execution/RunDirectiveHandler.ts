import { DirectiveNode } from 'meld-spec';
import { IDirectiveHandler, DirectiveContext } from '../../IDirectiveService';
import { IValidationService } from '../../../ValidationService/IValidationService';
import { IStateService } from '../../../StateService/IStateService';
import { IResolutionService } from '../../../ResolutionService/IResolutionService';
import { ResolutionContextFactory } from '../../../ResolutionService/ResolutionContextFactory';

/**
 * Handler for @run directives
 * Executes commands with resolved variables
 */
export class RunDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'run';

  constructor(
    private validationService: IValidationService,
    private resolutionService: IResolutionService,
    private stateService: IStateService
  ) {}

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<void> {
    // 1. Validate directive structure
    await this.validationService.validate(node);

    // 2. Extract command and args
    const { command, args = [] } = node.directive;

    // 3. Create resolution context
    const resolutionContext = ResolutionContextFactory.forRunDirective(
      context.currentFilePath
    );

    // 4. Resolve command
    const resolvedCommand = await this.resolutionService.resolveInContext(
      command,
      resolutionContext
    );

    // 5. Resolve arguments with command parameter context
    const paramContext = ResolutionContextFactory.forCommandParameters(
      context.currentFilePath
    );
    const resolvedArgs = await Promise.all(
      args.map(arg => this.resolutionService.resolveInContext(arg, paramContext))
    );

    // 6. Store result in state if needed
    if (node.directive.output) {
      await this.stateService.setTextVar(
        node.directive.output,
        resolvedCommand
      );
    }

    // Note: Actual command execution would be handled by a separate service
    // This is just the resolution part
  }
} 