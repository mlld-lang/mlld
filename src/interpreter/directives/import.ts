import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { DirectiveNode } from 'meld-spec';
import { DirectiveHandler } from './types';
import { InterpreterState } from '../state/state';
import { MeldImportError } from '../errors/errors';
import { parseMeld } from '../parser';

class ImportDirectiveHandler implements DirectiveHandler {
  canHandle(kind: string): boolean {
    return kind === '@import' || kind === 'import';
  }

  handle(node: DirectiveNode, state: InterpreterState): void {
    const { from, import: importSpec } = node.data || {};

    if (!from) {
      throw new MeldImportError('Import source is required', node.location?.start);
    }

    // Resolve path relative to current file
    const currentDir = dirname(state.getCurrentFilePath() || '');
    const importPath = join(currentDir, from);

    // Check if file exists
    if (!existsSync(importPath)) {
      throw new MeldImportError('File not found', node.location?.start);
    }

    // Check for circular imports
    if (state.hasImport(importPath)) {
      throw new MeldImportError('Circular import detected', node.location?.start);
    }

    try {
      // Read and parse imported content
      const content = readFileSync(importPath, 'utf-8');
      const importedNodes = parseMeld(content);

      // Create child state for imported content
      const importedState = new InterpreterState();
      importedState.parentState = state;
      importedState.setCurrentFilePath(importPath);

      // Interpret imported content
      const { interpretMeld } = require('../interpreter');
      interpretMeld(importedNodes, importedState);

      // Track import to prevent circular imports
      state.addImport(importPath);

      // Handle import specifiers
      if (importSpec === '*') {
        // Import all variables
        state.mergeFrom(importedState);
      } else if (Array.isArray(importSpec)) {
        // Import specific variables with optional aliases
        for (const spec of importSpec) {
          const { name, as } = typeof spec === 'string' ? { name: spec, as: spec } : spec;
          
          // Copy variables with aliases
          const textVar = importedState.getText(name);
          if (textVar !== undefined) {
            state.setText(as, textVar);
          }

          const dataVar = importedState.getDataVar(name);
          if (dataVar !== undefined) {
            state.setDataVar(as, dataVar);
          }

          const pathVar = importedState.getPathVar(name);
          if (pathVar !== undefined) {
            state.setPathVar(as, pathVar);
          }

          const command = importedState.getCommand(name);
          if (command !== undefined) {
            state.setCommand(as, command);
          }
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new MeldImportError(
          `Failed to read or parse imported file: ${error.message}`,
          node.location?.start
        );
      }
      throw error;
    }
  }
}

export const importDirectiveHandler = new ImportDirectiveHandler(); 