import type { DirectiveNode } from 'meld-spec';
import { InterpreterState } from '../../src/interpreter/state/state.js';
import { MeldDirectiveError } from '../../src/interpreter/errors/errors.js';
import { DirectiveHandler } from '../../src/interpreter/directives/types.js';
import { vi } from 'vitest';
import type { MeldNode } from 'meld-spec';

class EmbedDirectiveHandler implements DirectiveHandler {
  canHandle(kind: string): boolean {
    return kind === '@embed';
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
    return kind === '@import';
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
      throw new Error('Parser input must be a string');
    }

    // Handle basic test directive
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
    throw new Error('Failed to parse content');
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

export const embedDirectiveHandler = new EmbedDirectiveHandler();
export const importDirectiveHandler = new ImportDirectiveHandler(); 