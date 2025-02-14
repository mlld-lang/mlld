import type { DirectiveNode } from 'meld-spec';
import { InterpreterState } from '../../_old/src/interpreter/state/state';
import { ErrorFactory } from '../../_old/src/interpreter/errors/factory';
import { DirectiveHandler, HandlerContext } from '../../_old/src/interpreter/directives/types';
import { vi } from 'vitest';
import type { MeldNode } from 'meld-spec';

export class EmbedDirectiveHandler implements DirectiveHandler {
  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    return kind === 'embed';
  }

  async handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): Promise<void> {
    const data = node.directive;
    if (!data.source) {
      throw ErrorFactory.createDirectiveError(
        'Embed source is required',
        'embed',
        node.location?.start
      );
    }
    // Mock implementation
    state.setTextVar(`embed:${data.source}`, 'Mock embedded content');
  }
}

export class ImportDirectiveHandler implements DirectiveHandler {
  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    return kind === 'import';
  }

  async handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): Promise<void> {
    const data = node.directive;
    if (!data.source) {
      throw ErrorFactory.createDirectiveError(
        'Import source is required',
        'import',
        node.location?.start
      );
    }
    // Mock implementation
    state.setTextVar(`import:${data.source}`, 'Mock imported content');
  }
}

// Mock parser with detailed logging
export const parseMeld = vi.fn((content: string): MeldNode[] => {
  console.log('[Parser Mock] Parsing content:', {
    content,
    length: content.length,
    type: typeof content
  });

  try {
    if (typeof content !== 'string') {
      console.error('[Parser Mock] Invalid input type:', typeof content);
      throw ErrorFactory.createParseError('Parser input must be a string');
    }

    // Handle basic text directive
    if (content.startsWith('@text')) {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          name: 'test',
          value: 'value'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: content.length }
        }
      };
      console.log('[Parser Mock] Created text directive node:', node);
      return [node];
    }

    // Handle basic data directive
    if (content.startsWith('@data')) {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'data',
          name: 'test',
          value: { key: 'value' }
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: content.length }
        }
      };
      console.log('[Parser Mock] Created data directive node:', node);
      return [node];
    }

    // Handle invalid content
    console.error('[Parser Mock] Failed to parse content:', content);
    throw ErrorFactory.createParseError('Failed to parse content');
  } catch (error) {
    console.error('[Parser Mock] Error during parsing:', {
      error: error instanceof Error ? error.message : String(error),
      content
    });
    throw error;
  }
});

// Export other mocks as needed
export const interpretMeld = vi.fn();
export const DirectiveRegistry = {
  findHandler: vi.fn(),
  registerHandler: vi.fn(),
  clear: vi.fn()
};

// Export singleton instances
export const embedDirectiveHandler = new EmbedDirectiveHandler();
export const importDirectiveHandler = new ImportDirectiveHandler(); 