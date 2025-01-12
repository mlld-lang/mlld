import type { DirectiveNode, DirectiveKind, MeldNode } from 'meld-spec';
import { DirectiveHandler } from './index.js';
import { InterpreterState } from '../state/state.js';
import path from 'path';
import fs from 'fs';
import { parseMeldContent } from '../parser.js';
import { interpret } from '../interpreter.js';

interface ImportItem {
  source: string;
  alias?: string;
}

interface ImportDirectiveData {
  kind: 'import';
  items?: ImportItem[] | '*';
  from?: string;
  shorthand?: string; // For shorthand syntax: @import [file.md]
  location?: {
    line: number;
    column: number;
  };
}

/**
 * Handler for @import directives
 * Supports:
 * - @import [x,y,z] from [file.md]
 * - @import [x as y] from [file.md]
 * - @import [file.md] (shorthand for @import [*] from [file.md])
 */
export class ImportDirectiveHandler implements DirectiveHandler {
  canHandle(kind: DirectiveKind): boolean {
    return kind === 'import';
  }

  handle(node: DirectiveNode, state: InterpreterState): void {
    const data = node.directive as ImportDirectiveData;
    
    // Handle shorthand syntax
    if (data.shorthand) {
      data.from = data.shorthand;
      data.items = '*';
    }

    if (!data.from) {
      throw new Error('Import directive requires a source file path');
    }

    // Validate path
    if (!this.isValidPath(data.from)) {
      throw new Error('Import path must be a valid file path');
    }

    // Check for circular imports
    if (state.hasImport(data.from)) {
      throw new Error(`Circular import detected: ${data.from}`);
    }

    // Check if import is at top of file
    if (data.location && data.location.line > 1) {
      throw new Error('Import directives must appear at the top of the file');
    }

    // Validate items if not wildcard
    if (data.items !== '*' && Array.isArray(data.items)) {
      this.validateImportItems(data.items);
    }

    // Track this import to prevent cycles
    state.addImport(data.from);

    // Process the imported file
    try {
      const importedState = this.processImportedFile(data.from);
      // If items is undefined, treat it as a wildcard import
      this.mergeImportedState(state, importedState, data.items || '*');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to process import ${data.from}: ${message}`);
    }
  }

  private processImportedFile(filePath: string): InterpreterState {
    // Read and parse the file
    const content = fs.readFileSync(filePath, 'utf8');
    const ast = parseMeldContent(content) as MeldNode[];
    
    // Create a new state for the imported file
    const importedState = new InterpreterState();
    
    // Interpret the imported file's AST
    interpret(ast, importedState);
    
    return importedState;
  }

  private mergeImportedState(targetState: InterpreterState, importedState: InterpreterState, items: ImportItem[] | '*'): void {
    if (items === '*') {
      // Import all allowed variables
      this.mergeVariables(targetState, importedState, undefined);
    } else if (Array.isArray(items)) {
      // Import only specified items with potential aliases
      for (const item of items) {
        this.mergeVariables(targetState, importedState, item);
      }
    }
  }

  private mergeVariables(targetState: InterpreterState, importedState: InterpreterState, item?: ImportItem): void {
    const importVar = (sourceName: string, targetName: string) => {
      // Check each type of allowed variable
      const textVar = importedState.getTextVar(sourceName);
      if (textVar !== undefined) {
        targetState.setTextVar(targetName, textVar);
        return;
      }

      const dataVar = importedState.getDataVar(sourceName);
      if (dataVar !== undefined) {
        targetState.setDataVar(targetName, dataVar);
        return;
      }

      const command = importedState.getCommand(sourceName);
      if (command !== undefined) {
        targetState.setCommand(targetName, command);
        return;
      }
    };

    if (item) {
      // Import specific item with potential alias
      const targetName = item.alias || item.source;
      importVar(item.source, targetName);
    } else {
      // Import all variables
      importedState.textVariables.forEach((_, key) => importVar(key, key));
      importedState.dataVariables.forEach((_, key) => importVar(key, key));
      importedState.definedCommands.forEach((_, key) => importVar(key, key));
    }
  }

  private isValidPath(filePath: string): boolean {
    // Path must be non-empty and have a valid extension
    return filePath.length > 0 && 
           path.extname(filePath) !== '' &&
           !path.isAbsolute(filePath); // We want relative paths for security
  }

  private validateImportItems(items: ImportItem[]): void {
    for (const item of items) {
      if (!item.source) {
        throw new Error('Import items must have a source');
      }
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(item.source)) {
        throw new Error(`Invalid import source: ${item.source}`);
      }
      if (item.alias && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(item.alias)) {
        throw new Error(`Invalid import alias: ${item.alias}`);
      }
    }
  }
} 