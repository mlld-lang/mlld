import type { DirectiveNode } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from './types';
import { InterpreterState } from '../state/state';
import { ErrorFactory } from '../errors/factory';
import { interpretSubDirectives } from '../subInterpreter';
import { throwWithContext, maybeAdjustLocation } from '../utils/location-helpers';
import { directiveLogger } from '../../utils/logger';

export class EmbedDirectiveHandler implements DirectiveHandler {
  public static readonly directiveKind = 'embed';

  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    return kind === EmbedDirectiveHandler.directiveKind;
  }

  handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): void {
    const data = node.directive;
    directiveLogger.debug('Processing embed directive', {
      mode: context.mode,
      location: node.location
    });

    if (!data.content) {
      directiveLogger.error('Embed directive missing content', {
        location: node.location,
        mode: context.mode
      });
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
      directiveLogger.error('Embed directive has invalid location', {
        location: node.location,
        mode: context.mode
      });
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
      directiveLogger.error('Circular embedding detected', {
        path: currentPath,
        location: node.location,
        mode: context.mode
      });
      throwWithContext(
        ErrorFactory.createDirectiveError,
        'Circular embedding detected',
        node.location,
        context,
        'embed'
      );
    }

    directiveLogger.info('Interpreting embedded content', {
      location: embedLocation,
      mode: context.mode
    });

    // Create a new state for the embedded content
    const embeddedState = interpretSubDirectives(
      data.content,
      embedLocation,
      state
    );

    directiveLogger.debug('Merging embedded state', {
      mode: context.mode
    });

    // Merge the embedded state back to parent
    state.mergeChildState(embeddedState);
  }
}

export const embedDirectiveHandler = new EmbedDirectiveHandler();