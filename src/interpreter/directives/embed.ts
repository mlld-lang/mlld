import type { DirectiveNode } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from './types';
import { InterpreterState } from '../state/state';
import { ErrorFactory } from '../errors/factory';
import { interpretSubDirectives } from '../subInterpreter';
import { throwWithContext, maybeAdjustLocation } from '../utils/location-helpers';

export class EmbedDirectiveHandler implements DirectiveHandler {
  public static readonly directiveKind = 'embed';

  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    return kind === EmbedDirectiveHandler.directiveKind;
  }

  handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): void {
    const data = node.directive;
    if (!data.content) {
      throwWithContext(
        ErrorFactory.createDirectiveError,
        'Embed directive requires content',
        node.location,
        context,
        'embed'
      );
    }

    // Get the location for sub-directives
    const embedLocation = maybeAdjustLocation(node.location, context);

    if (!embedLocation) {
      throwWithContext(
        ErrorFactory.createDirectiveError,
        'Embed directive requires a valid location',
        node.location,
        context,
        'embed'
      );
    }

    // Check for circular embedding
    const currentPath = state.getCurrentFilePath();
    if (currentPath && state.hasImport(currentPath)) {
      throwWithContext(
        ErrorFactory.createDirectiveError,
        'Circular embedding detected',
        node.location,
        context,
        'embed'
      );
    }

    // Create a new state for the embedded content
    const embeddedState = interpretSubDirectives(
      data.content,
      embedLocation,
      state
    );

    // Merge the embedded state back to parent
    state.mergeChildState(embeddedState);
  }
}

export const embedDirectiveHandler = new EmbedDirectiveHandler();