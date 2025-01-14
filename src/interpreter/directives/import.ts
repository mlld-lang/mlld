import type { DirectiveNode } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from './types';
import { InterpreterState } from '../state/state';
import { ErrorFactory } from '../errors/factory';
import { throwWithContext } from '../utils/location-helpers';
import { directiveLogger } from '../../utils/logger';
import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';

export class ImportDirectiveHandler implements DirectiveHandler {
  readonly directiveKind = 'import';

  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    return kind === 'import';
  }

  async handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): Promise<void> {
    const data = node.directive;

    // Validate source parameter
    if (!data.source) {
      throwWithContext(
        ErrorFactory.createDirectiveError,
        'Import directive requires a source parameter',
        node.location,
        context,
        'import'
      );
    }

    try {
      // Resolve the source path relative to the current file
      const basePath = context.currentPath ? dirname(context.currentPath) : context.workspaceRoot || process.cwd();
      const sourcePath = resolve(basePath, data.source);

      // Read the file
      const content = await readFile(sourcePath, 'utf8');

      // Store the content in state
      state.setTextVar('imported', content);
      state.addImport(sourcePath);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throwWithContext(
        ErrorFactory.createDirectiveError,
        `Import failed: ${errorMessage}`,
        node.location,
        context,
        'import'
      );
    }
  }
}

// Export a singleton instance
export const importDirectiveHandler = new ImportDirectiveHandler(); 