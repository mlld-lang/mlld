import { DirectiveNode, DataDirective } from 'meld-spec';
import { IDirectiveHandler, DirectiveContext } from '../../IDirectiveService';
import { IValidationService } from '../../../ValidationService/IValidationService';
import { IStateService } from '../../../StateService/IStateService';
import { IResolutionService } from '../../../ResolutionService/IResolutionService';
import { ResolutionContextFactory } from '../../../ResolutionService/ResolutionContextFactory';

/**
 * Handler for @data directives
 * Stores JSON-like data in state
 */
export class DataDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'data';

  constructor(
    private validationService: IValidationService,
    private stateService: IStateService,
    private resolutionService: IResolutionService
  ) {}

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<void> {
    // 1. Validate directive structure
    await this.validationService.validate(node);

    // 2. Extract name and value
    const directive = node.directive as DataDirective;
    const { name, value } = directive;

    // 3. Create resolution context
    const resolutionContext = ResolutionContextFactory.forDataDirective(
      context.currentFilePath
    );

    // 4. Resolve value if needed
    const resolvedValue = await this.resolutionService.resolveInContext(
      JSON.stringify(value),
      resolutionContext
    );

    // 5. Parse resolved value
    const parsedValue = JSON.parse(resolvedValue);

    // 6. Store in state
    await this.stateService.setDataVar(name, parsedValue);
  }
} 