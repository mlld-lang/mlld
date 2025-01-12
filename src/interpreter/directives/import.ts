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
      // Resolve the import path
      const resolvedPath = path.resolve(data.from);

      // Check for circular imports
      if (state.hasImport(resolvedPath)) {
        throw new MeldImportError(
          `Circular import detected: ${data.from}`,
          node.location?.start
        );
      }

      // Read the file content
      let content: string;
      try {
        content = fs.readFileSync(resolvedPath, 'utf8');
      } catch (error) {
        if (error.code === 'ENOENT') {
          throw new MeldImportError(
            'File not found',
            node.location?.start
          );
        }
        throw error;
      }

      // Parse the content
      let importedNodes;
      try {
        importedNodes = parseMeldContent(content);
      } catch (error) {
        throw new MeldImportError(
          `Failed to parse imported content: ${error.message}`,
          node.location?.start
        );
      }

      // Add to import tracking to prevent circular imports
      state.addImport(resolvedPath);

      // Create a new state for the imported content
      const importState = new InterpreterState();

      // Process all nodes in the imported file
      try {
        interpret(importedNodes, importState);
      } catch (error) {
        throw new MeldImportError(
          `Failed to interpret imported content: ${error.message}`,
          node.location?.start
        );
      }

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

          if (textVar !== undefined) {
            state.setTextVar(alias, textVar);
          } else if (dataVar !== undefined) {
            state.setDataVar(alias, dataVar);
          } else if (command !== undefined) {
            state.setCommand(alias, command);
          } else {
            throw new MeldImportError(
              `Variable or command '${importName}' not found in imported file`,
              node.location?.start
            );
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