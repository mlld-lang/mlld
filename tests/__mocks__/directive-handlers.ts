import type { DirectiveNode } from 'meld-spec';
import { DirectiveHandler } from '../../src/interpreter/directives/types.js';
import { InterpreterState } from '../../src/interpreter/state/state.js';
import { MeldDirectiveError } from '../../src/interpreter/errors/errors.js';

export class EmbedDirectiveHandler implements DirectiveHandler {
  canHandle(kind: string): boolean {
    return kind === 'embed';
  }

  handle(node: DirectiveNode, state: InterpreterState): void {
    const data = node.properties;
    if (!data.path) {
      throw new MeldDirectiveError(
        'Embed directive requires a path',
        'embed',
        node.location?.start
      );
    }

    // Mock embedded content
    state.addNode({
      type: 'Text',
      content: 'Mock embedded content',
      location: node.location
    });
  }
}

export class ImportDirectiveHandler implements DirectiveHandler {
  canHandle(kind: string): boolean {
    return kind === 'import';
  }

  handle(node: DirectiveNode, state: InterpreterState): void {
    const data = node.properties;
    if (!data.from) {
      throw new MeldDirectiveError(
        'Import directive requires a from property',
        'import',
        node.location?.start
      );
    }

    if (state.hasImport(data.from)) {
      throw new MeldDirectiveError(
        `Circular import detected: ${data.from}`,
        'import',
        node.location?.start
      );
    }

    // Mock import behavior
    state.addImport(data.from);
    state.setTextVar('text1', 'value1');
    state.setDataVar('data1', { key: 'value' });
  }
}

// Export instances instead of classes
export const embedDirectiveHandler = new EmbedDirectiveHandler();
export const importDirectiveHandler = new ImportDirectiveHandler(); 