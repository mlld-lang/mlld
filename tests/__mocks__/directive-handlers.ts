import { vi } from 'vitest';
import { DirectiveNode } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from '../../src/interpreter/directives/types';
import { InterpreterState } from '../../src/interpreter/state/state';
import { ErrorFactory } from '../../src/interpreter/errors/factory';

export class EmbedDirectiveHandler implements DirectiveHandler {
  readonly directiveKind = 'embed';

  canHandle(kind: string, mode: string): boolean {
    return kind === 'embed';
  }

  async handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): Promise<void> {
    const data = node.directive;
    if (!data.source) {
      throw ErrorFactory.createDirectiveError('Embed directive requires a source parameter', node.location);
    }
  }
}

export class ImportDirectiveHandler implements DirectiveHandler {
  readonly directiveKind = 'import';

  canHandle(kind: string, mode: string): boolean {
    return kind === 'import';
  }

  async handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): Promise<void> {
    const data = node.directive;
    if (!data.source) {
      throw ErrorFactory.createDirectiveError('Import directive requires a source parameter', node.location);
    }
  }
}

export const interpretMeld = vi.fn();
export const DirectiveRegistry = {
  findHandler: vi.fn(),
  registerHandler: vi.fn(),
  clear: vi.fn(),
  initializeBuiltInHandlers: vi.fn(),
  handle: vi.fn()
};

export const embedDirectiveHandler = new EmbedDirectiveHandler();
export const importDirectiveHandler = new ImportDirectiveHandler(); 