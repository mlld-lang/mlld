import { DirectiveNode } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from './types';
import { InterpreterState } from '../state/state';
import { ErrorFactory } from '../errors/factory';
import { throwWithContext } from '../utils/location-helpers';
import { directiveLogger } from '../../utils/logger';
import { readFile } from 'fs/promises';
import { dirname, resolve } from 'path';

export class EmbedDirectiveHandler implements DirectiveHandler {
  readonly directiveKind = 'embed';

  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    return kind === 'embed';
  }

  async handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): Promise<void> {
    const data = node.directive;

    // Validate source parameter
    if (!data.source) {
      throwWithContext(
        ErrorFactory.createDirectiveError,
        'Embed directive requires a source parameter',
        node.location,
        context,
        'embed'
      );
    }

    try {
      // Resolve the source path relative to the current file
      const basePath = context.currentPath ? dirname(context.currentPath) : context.workspaceRoot || process.cwd();
      const sourcePath = resolve(basePath, data.source);

      // Read the file
      const content = await readFile(sourcePath, 'utf8');

      // Create a text node with the embedded content
      state.addNode({
        type: 'Text',
        content,
        location: node.location
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throwWithContext(
        ErrorFactory.createDirectiveError,
        `Embed failed: ${errorMessage}`,
        node.location,
        context,
        'embed'
      );
    }
  }
}

// Export a singleton instance
export const embedDirectiveHandler = new EmbedDirectiveHandler();