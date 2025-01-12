import type { DirectiveNode } from 'meld-spec';
import { InterpreterState } from '../../src/interpreter/state/state.js';
import { MeldDirectiveError } from '../../src/interpreter/errors/errors.js';
import { DirectiveHandler } from '../../src/interpreter/directives/types.js';

class EmbedDirectiveHandler implements DirectiveHandler {
  canHandle(kind: string): boolean {
    return kind === 'embed';
  }

  handle(node: DirectiveNode, state: InterpreterState): void {
    const data = node.directive;
    if (!data.path) {
      throw new MeldDirectiveError('Embed path is required', 'embed', node.location?.start);
    }
    // Mock implementation
    state.addNode({
      type: 'Text',
      content: 'Mock embedded content'
    });
  }
}

class ImportDirectiveHandler implements DirectiveHandler {
  canHandle(kind: string): boolean {
    return kind === 'import';
  }

  handle(node: DirectiveNode, state: InterpreterState): void {
    const data = node.directive;
    if (!data.from) {
      throw new MeldDirectiveError('Import source is required', 'import', node.location?.start);
    }
    // Mock implementation
    state.setTextVar('text1', 'value1');
    state.setDataVar('data1', { key: 'value' });
  }
}

export const embedDirectiveHandler = new EmbedDirectiveHandler();
export const importDirectiveHandler = new ImportDirectiveHandler(); 