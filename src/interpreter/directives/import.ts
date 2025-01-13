import * as fs from 'fs';
import { join, dirname } from 'path';
import { DirectiveNode } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from './types';
import { InterpreterState } from '../state/state';
import { ErrorFactory } from '../errors/factory';
import { parseMeld } from '../parser';
import { interpret } from '../interpreter';
import { throwWithContext } from '../utils/location-helpers';

export class ImportDirectiveHandler implements DirectiveHandler {
  public static readonly directiveKind = 'import';

  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    return kind === ImportDirectiveHandler.directiveKind;
  }

  async handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): Promise<void> {
    const data = node.directive;

    if (!data.from) {
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

    // Check if file exists
    if (!fs.existsSync(importPath)) {
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
      throwWithContext(
        ErrorFactory.createImportError,
        'Circular import detected',
        node.location,
        context,
        'import'
      );
    }

    try {
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
        // Import all variables
        for (const [key, value] of importedState.getAllTextVars()) {
          state.setTextVar(key, value);
        }
        for (const [key, value] of importedState.getAllDataVars()) {
          state.setDataVar(key, value);
        }
      } else if (Array.isArray(data.import)) {
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