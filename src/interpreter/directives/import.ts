import * as fs from 'fs';
import { join, dirname } from 'path';
import { DirectiveNode } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from './types';
import { InterpreterState } from '../state/state';
import { ErrorFactory } from '../errors/factory';
import { parseMeld } from '../parser';
import { interpret } from '../interpreter';
import { throwWithContext } from '../utils/location-helpers';
import { directiveLogger } from '../../utils/logger';

export class ImportDirectiveHandler implements DirectiveHandler {
  public static readonly directiveKind = 'import';

  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    return kind === ImportDirectiveHandler.directiveKind;
  }

  async handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): Promise<void> {
    const data = node.directive;
    directiveLogger.debug('Processing import directive', {
      from: data.from,
      mode: context.mode,
      location: node.location
    });

    if (!data.from) {
      directiveLogger.error('Import directive missing source path', {
        location: node.location,
        mode: context.mode
      });
      throwWithContext(
        ErrorFactory.createImportError,
        'Import source is required',
        node.location,
        context,
        'import'
      );
    }

    // Resolve path relative to current file
    const currentDir = dirname(state.getCurrentFilePath() || '');
    const importPath = join(currentDir, data.from);
    directiveLogger.debug('Resolved import path', { importPath });

    // Check if file exists
    if (!fs.existsSync(importPath)) {
      directiveLogger.error('Import file not found', {
        path: importPath,
        location: node.location,
        mode: context.mode
      });
      throwWithContext(
        ErrorFactory.createImportError,
        'File not found',
        node.location,
        context,
        'import'
      );
    }

    // Check for circular imports
    if (state.hasImport(importPath)) {
      directiveLogger.error('Circular import detected', {
        path: importPath,
        location: node.location,
        mode: context.mode
      });
      throwWithContext(
        ErrorFactory.createImportError,
        'Circular import detected',
        node.location,
        context,
        'import'
      );
    }

    try {
      directiveLogger.info(`Importing file: ${importPath}`, {
        mode: context.mode
      });

      // Read and parse imported content
      const content = fs.readFileSync(importPath, 'utf-8');
      const importedNodes = parseMeld(content);

      // Create child state for imported content
      const importedState = new InterpreterState();
      importedState.parentState = state;
      importedState.setCurrentFilePath(importPath);

      // Interpret imported content
      await interpret(importedNodes, importedState, {
        mode: context.mode,
        baseLocation: context.baseLocation,
        currentPath: importPath
      });

      // Track import to prevent circular imports
      state.addImport(importPath);

      // Handle import specifiers
      if (data.import === '*') {
        directiveLogger.debug('Importing all variables', {
          path: importPath,
          mode: context.mode
        });
        // Import all variables
        for (const [key, value] of importedState.getAllTextVars()) {
          state.setTextVar(key, value);
        }
        for (const [key, value] of importedState.getAllDataVars()) {
          state.setDataVar(key, value);
        }
      } else if (Array.isArray(data.import)) {
        directiveLogger.debug('Importing specific variables', {
          variables: data.import,
          path: importPath,
          mode: context.mode
        });
        // Import specific variables with optional aliases
        for (const spec of data.import) {
          const { name, as } = typeof spec === 'string' ? { name: spec, as: spec } : spec;
          
          // Copy variables with aliases
          const textVar = importedState.getTextVar(name);
          if (textVar !== undefined) {
            state.setTextVar(as, textVar);
          }

          const dataVar = importedState.getDataVar(name);
          if (dataVar !== undefined) {
            state.setDataVar(as, dataVar);
          }
        }
      }
    } catch (error) {
      directiveLogger.error('Import failed', {
        path: importPath,
        error: error instanceof Error ? error.message : String(error),
        location: node.location,
        mode: context.mode
      });
      throwWithContext(
        ErrorFactory.createImportError,
        `Failed to read or parse imported file: ${error instanceof Error ? error.message : String(error)}`,
        node.location,
        context,
        'import'
      );
    }
  }
}

export const importDirectiveHandler = new ImportDirectiveHandler(); 