import { DirectiveNode, DataDirective } from 'meld-spec';
// TODO: Use meld-ast nodes and types instead of meld-spec directly
// TODO: Import MeldDirectiveError from core/errors for proper error hierarchy

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
    // TODO: Per service-directive.md, definition handlers should store raw values without ANY resolution
    // Current implementation is resolving values which violates the architecture

    // TODO: Per UX.md, @data directive should support both JSON string values and object literals
    // Current implementation doesn't properly distinguish between these cases

    // TODO: Per UX.md, error handling should be silent in build output but warn on command line
    // Current implementation throws errors directly

    // 1. Validate directive structure
    await this.validationService.validate(node);

    // 2. Extract name and value
    const directive = node.directive as DataDirective;
    const { name, value } = directive;

    // TODO: This resolution step should not be in a definition handler
    // Definition handlers should store raw values only
    // 3. Create resolution context
    const resolutionContext = ResolutionContextFactory.forDataDirective(
      context.currentFilePath
    );

    // TODO: Remove resolution from definition handler
    // 4. Resolve value if needed
    const resolvedValue = await this.resolutionService.resolveInContext(
      JSON.stringify(value),
      resolutionContext
    );

    // TODO: Per UX.md, handle non-string values with proper coercion rules
    // 5. Parse resolved value
    const parsedValue = JSON.parse(resolvedValue);

    // TODO: Store raw value instead of resolved/parsed value
    // 6. Store in state
    await this.stateService.setDataVar(name, parsedValue);
  }
} 