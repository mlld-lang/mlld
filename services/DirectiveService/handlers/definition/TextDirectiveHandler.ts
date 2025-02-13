import { DirectiveNode } from 'meld-spec';
import { IDirectiveHandler, DirectiveContext } from '../../IDirectiveService';
import { IValidationService } from '../../../ValidationService/IValidationService';
import { IStateService } from '../../../StateService/IStateService';
import { IResolutionService } from '../../../ResolutionService/IResolutionService';
import { ResolutionContextFactory } from '../../../ResolutionService/ResolutionContextFactory';

/**
 * Handler for @text directives
 * Stores raw text values in state
 */
export class TextDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'text';

  constructor(
    private validationService: IValidationService,
    private stateService: IStateService,
    private resolutionService: IResolutionService
  ) {}

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<void> {
    // 1. Validate directive structure
    await this.validationService.validate(node);

    // 2. Extract name and value
    const { name, value } = node.directive;

    // 3. Create resolution context
    const resolutionContext = ResolutionContextFactory.forTextDirective(
      context.currentFilePath
    );

    // 4. Resolve value if needed
    const resolvedValue = await this.resolutionService.resolveInContext(
      value,
      resolutionContext
    );

    // 5. Store in state
    await this.stateService.setTextVar(name, resolvedValue);
  }
} 