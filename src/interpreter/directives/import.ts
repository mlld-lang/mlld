import * as fs from 'fs';
import { join, dirname } from 'path';
import { DirectiveNode } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from './types';
import { InterpreterState } from '../state/state';
import { MeldImportError } from '../errors/errors';
import { parseMeld } from '../parser';
import { interpret } from '../interpreter';
import { adjustLocation } from '../utils/location';

export class ImportDirectiveHandler implements DirectiveHandler {
  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    return kind === '@import';
  }

  handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): void {
    const data = node.directive;
    const errorLocation = context.mode === 'rightside'
      ? adjustLocation(node.location, context.baseLocation)?.start
      : node.location?.start;

    if (!data.from) {
      throw new MeldImportError('Import source is required', errorLocation);
    }

    // Resolve path relative to current file
    const currentDir = dirname(state.getCurrentFilePath() || '');
    const importPath = join(currentDir, data.from);

    // Check if file exists
    if (!fs.existsSync(importPath)) {
      throw new MeldImportError('File not found', errorLocation);
    }

    // Check for circular imports
    if (state.hasImport(importPath)) {
      throw new MeldImportError('Circular import detected', errorLocation);
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
      interpret(importedNodes, importedState, {
        mode: context.mode,
        baseLocation: context.baseLocation
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
          const textVar = importedState.getText(name);
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
      if (error instanceof Error) {
        throw new MeldImportError(
          `Failed to read or parse imported file: ${error.message}`,
          errorLocation
        );
      }
      throw error;
    }
  }
}

export const importDirectiveHandler = new ImportDirectiveHandler(); 