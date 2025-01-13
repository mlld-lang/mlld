import type { DirectiveNode } from 'meld-spec';
import { InterpreterState } from '../../src/interpreter/state/state';
import { ErrorFactory } from '../../src/interpreter/errors/factory';
import { DirectiveHandler, HandlerContext } from '../../src/interpreter/directives/types';
import { vi } from 'vitest';
import type { MeldNode } from 'meld-spec';

class EmbedDirectiveHandler implements DirectiveHandler {
  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    return kind === '@embed';
  }

  handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): void {
    const data = node.directive;
    if (!data.path) {
      if (context.mode === 'rightside' && node.location && context.baseLocation) {
        throw ErrorFactory.createWithAdjustedLocation(
          ErrorFactory.createDirectiveError,
          'Embed path is required',
          node.location.start,
          context.baseLocation.start,
          'embed'
        );
      } else {
        throw ErrorFactory.createDirectiveError(
          'Embed path is required',
          'embed',
          node.location?.start
        );
      }
    }

    // Mock implementation
    const mockNode: MeldNode = {
      type: 'Text',
      content: 'Mock embedded content',
      location: context.mode === 'rightside' && node.location && context.baseLocation
        ? {
            start: ErrorFactory.adjustLocation(node.location.start, context.baseLocation.start),
            end: ErrorFactory.adjustLocation(node.location.end, context.baseLocation.start)
          }
        : node.location
    };
    state.addNode(mockNode);
  }
}

class ImportDirectiveHandler implements DirectiveHandler {
  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    return kind === '@import';
  }

  handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): void {
    const data = node.directive;
    if (!data.from) {
      if (context.mode === 'rightside' && node.location && context.baseLocation) {
        throw ErrorFactory.createWithAdjustedLocation(
          ErrorFactory.createDirectiveError,
          'Import source is required',
          node.location.start,
          context.baseLocation.start,
          'import'
        );
      } else {
        throw ErrorFactory.createDirectiveError(
          'Import source is required',
          'import',
          node.location?.start
        );
      }
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

export const embedDirectiveHandler = new EmbedDirectiveHandler();
export const importDirectiveHandler = new ImportDirectiveHandler(); 