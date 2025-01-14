import type { DirectiveNode } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from './types';
import { InterpreterState } from '../state/state';
import { ErrorFactory } from '../errors/factory';
import { throwWithContext } from '../utils/location-helpers';
import { directiveLogger } from '../../utils/logger';
import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';

export class ImportDirectiveHandler implements DirectiveHandler {
  public static readonly directiveKind = 'import';

  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    return kind === ImportDirectiveHandler.directiveKind;
  }

  async handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): Promise<void> {
    const data = node.directive;
    directiveLogger.debug('Processing import directive', {
      source: data.source,
      mode: context.mode,
      location: node.location
    });

    // Validate source parameter
    if (!data.source || typeof data.source !== 'string') {
      directiveLogger.error('Import directive missing source', {
        location: node.location,
        mode: context.mode
      });
      throwWithContext(
        ErrorFactory.createImportError,
        'Import source is required',
        node.location,
        context
      );
    }

    try {
      // Resolve the import path
      const currentPath = context.currentPath || '';
      const currentDir = dirname(currentPath);
      const importPath = resolve(currentDir, data.source);

      // Read the file
      const content = await readFile(importPath, 'utf8');

      // Store the import in state
      state.addImport(importPath);

      directiveLogger.info('Import successful', {
        source: data.source,
        path: importPath,
        contentLength: content.length
      });

      // Store the imported content in state
      state.setTextVar(`import:${data.source}`, content);
    } catch (error) {
      directiveLogger.error('Import failed', {
        source: data.source,
        error: error instanceof Error ? error.message : String(error)
      });
      throwWithContext(
        ErrorFactory.createImportError,
        `Failed to import file: ${error instanceof Error ? error.message : String(error)}`,
        node.location,
        context
      );
    }
  }
}

// Export a singleton instance
export const importDirectiveHandler = new ImportDirectiveHandler(); 