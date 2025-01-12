import type { DirectiveNode, DirectiveKind } from 'meld-spec';
import { DirectiveHandler } from './index.js';
import { InterpreterState } from '../state/state.js';
import { MeldDirectiveError, MeldImportError } from '../errors/errors.js';
import * as fs from 'fs';
import * as path from 'path';
import { parseMeldContent } from '../parser.js';
import { interpret } from '../interpreter.js';

interface ImportDirectiveData {
  kind: 'import';
  from: string;
  imports?: string[];
  as?: string;
}

/**
 * Handler for @import directives
 */
class ImportDirectiveHandler implements DirectiveHandler {
  canHandle(kind: DirectiveKind): boolean {
    return kind === 'import';
  }

  handle(node: DirectiveNode, state: InterpreterState): void {
    const data = node.directive as ImportDirectiveData;
    
    if (!data.from) {
      throw new MeldDirectiveError(
        'Import directive requires a path',
        'import',
        node.location?.start
      );
    }

    try {
      // Check for circular imports
      const resolvedPath = path.resolve(data.from);
      if (state.hasImport(resolvedPath)) {
        throw new MeldImportError(
          `Circular import detected: ${data.from}`,
          node.location?.start
        );
      }
      state.addImport(resolvedPath);

      // Read and parse imported file
      let content: string;
      try {
        content = fs.readFileSync(resolvedPath, 'utf8');
      } catch (error) {
        throw new Error('File not found');
      }

      const importedNodes = parseMeldContent(content);

      // Create a new state for the imported content
      const importState = new InterpreterState();

      // Process all nodes in the imported file
      interpret(importedNodes, importState);

      // Import all nodes if no specific imports
      if (!data.imports) {
        // Copy all variables from import state to current state
        importState.getAllTextVars().forEach((value, key) => {
          state.setTextVar(key, value);
        });
        importState.getAllDataVars().forEach((value, key) => {
          state.setDataVar(key, value);
        });
        importState.getAllCommands().forEach((value, key) => {
          state.setCommand(key, value);
        });
      } else {
        // Import specific variables with optional aliases
        for (const importName of data.imports) {
          const alias = data.as || importName;
          const textVar = importState.getTextVar(importName);
          const dataVar = importState.getDataVar(importName);
          const command = importState.getCommand(importName);

          if (textVar) {
            state.setTextVar(alias, textVar);
          } else if (dataVar) {
            state.setDataVar(alias, dataVar);
          } else if (command) {
            state.setCommand(alias, command);
          }
        }
      }
    } catch (error) {
      if (error instanceof MeldImportError) {
        throw error;
      }
      throw new MeldImportError(
        `Failed to import from ${data.from}: ${error.message}`,
        node.location?.start
      );
    }
  }
}

export const importDirectiveHandler = new ImportDirectiveHandler(); 