import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { embedDirectiveHandler } from '../embed';
import { InterpreterState } from '../../state/state';
import type { DirectiveNode } from 'meld-spec';
import * as path from 'path';
import * as fs from 'fs';
import { DirectiveRegistry } from '../registry';

describe('EmbedDirectiveHandler', () => {
  let state: InterpreterState;

  beforeEach(() => {
    state = new InterpreterState();
    DirectiveRegistry.clear();
    DirectiveRegistry.registerHandler(embedDirectiveHandler);

    // Mock path module
    vi.mock('path', () => ({
      resolve: vi.fn((p: string) => p),
      join: vi.fn((...paths: string[]) => paths.join('/')),
      dirname: vi.fn((p: string) => p.split('/').slice(0, -1).join('/')),
      basename: vi.fn((p: string) => p.split('/').pop() || ''),
      extname: vi.fn(() => '.meld')
    }));

    // Mock fs module
    vi.mock('fs', () => ({
      existsSync: vi.fn((p: string) => p === 'test.meld'),
      readFileSync: vi.fn((p: string) => '@text test = "value"'),
      promises: {
        readFile: vi.fn().mockResolvedValue('@text test = "value"')
      }
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('canHandle', () => {
    it('should handle embed directives', () => {
      expect(embedDirectiveHandler.canHandle('@embed', 'toplevel')).toBe(true);
      expect(embedDirectiveHandler.canHandle('@embed', 'rightside')).toBe(true);
    });

    it('should not handle other directives', () => {
      expect(embedDirectiveHandler.canHandle('@run', 'toplevel')).toBe(false);
      expect(embedDirectiveHandler.canHandle('@data', 'toplevel')).toBe(false);
    });
  });

  describe('handle', () => {
    it('should handle basic embed', () => {
      const mockContent = 'Some content';
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: '@embed',
          content: mockContent
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      embedDirectiveHandler.handle(node, state, { mode: 'toplevel' });

      const nodes = state.getNodes();
      expect(nodes).toHaveLength(1);
      expect(nodes[0]).toEqual({
        type: 'Text',
        content: mockContent,
        location: node.location
      });
    });

    it('should throw error if content is missing', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: '@embed'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      expect(() => embedDirectiveHandler.handle(node, state, { mode: 'toplevel' })).toThrow('Embed directive requires content');
    });

    it('should throw error if location is missing', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: '@embed',
          content: 'Some content'
        }
      };

      expect(() => embedDirectiveHandler.handle(node, state, { mode: 'toplevel' })).toThrow('Embed directive requires a valid location');
    });

    it('should handle location adjustments in rightside mode', () => {
      const mockContent = 'Some content';
      const baseLocation = {
        start: { line: 5, column: 1 },
        end: { line: 5, column: 10 }
      };

      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: '@embed',
          content: mockContent
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      embedDirectiveHandler.handle(node, state, { mode: 'rightside', baseLocation });

      const nodes = state.getNodes();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].location).toEqual({
        start: { line: 5, column: 1 },
        end: { line: 5, column: 10 }
      });
    });
  });
}); 