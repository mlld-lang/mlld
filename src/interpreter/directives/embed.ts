import { DirectiveNode } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from './types';
import { InterpreterState } from '../state/state';
import { ErrorFactory } from '../errors/factory';
import { throwWithContext } from '../utils/location-helpers';
import { directiveLogger } from '../../utils/logger';
import { readFile } from 'fs/promises';
import { dirname, resolve } from 'path';

export class EmbedDirectiveHandler implements DirectiveHandler {
  public static readonly directiveKind = 'embed';

  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    return kind === EmbedDirectiveHandler.directiveKind;
  }

  async handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): Promise<void> {
    const data = node.directive;
    directiveLogger.debug('Processing embed directive', {
      source: data.source,
      mode: context.mode,
      location: node.location
    });

    // Validate source parameter
    if (!data.source || typeof data.source !== 'string') {
      directiveLogger.error('Embed directive missing source', {
        location: node.location,
        mode: context.mode
      });
      throwWithContext(
        ErrorFactory.createEmbedError,
        'Embed source is required',
        node.location,
        context
      );
    }

    try {
      // Resolve the embed path
      const currentPath = context.currentPath || '';
      const currentDir = dirname(currentPath);
      const embedPath = resolve(currentDir, data.source);

      // Read the file
      const content = await readFile(embedPath, 'utf8');

      directiveLogger.info('Embed successful', {
        source: data.source,
        path: embedPath,
        contentLength: content.length
      });

      // Store the embedded content in state
      state.setTextVar(`embed:${data.source}`, content);
    } catch (error) {
      directiveLogger.error('Embed failed', {
        source: data.source,
        error: error instanceof Error ? error.message : String(error)
      });
      throwWithContext(
        ErrorFactory.createEmbedError,
        `Failed to embed file: ${error instanceof Error ? error.message : String(error)}`,
        node.location,
        context
      );
    }
  }
}

// Export a singleton instance
export const embedDirectiveHandler = new EmbedDirectiveHandler();