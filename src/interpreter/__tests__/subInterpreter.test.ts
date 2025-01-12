import { describe, it, expect, beforeEach, vi } from 'vitest';
import { interpretSubDirectives } from '../subInterpreter.js';
import { InterpreterState } from '../state/state.js';
import type { DirectiveNode, Location } from 'meld-spec';

vi.mock('meld-ast', () => ({
  parse: vi.fn().mockImplementation((content: string) => {
    // Return a fake but valid array of MeldNodes for test content
    return [{
      type: 'Text',
      content,
      location: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: content.length }
      }
    }];
  })
}));

describe('subInterpreter', () => {
  let parentState: InterpreterState;

  beforeEach(() => {
    parentState = new InterpreterState();
  });

  it('should interpret nested directives', () => {
    const content = '@text test = "value"';
    const mockNode: DirectiveNode = {
      type: 'Directive',
      directive: {
        kind: 'text',
        name: 'test',
        value: 'value'
      }
    };

    interpretSubDirectives(content, parentState);
    
    expect(parentState.getNodes()).toHaveLength(1);
    expect(parentState.getNodes()[0]).toMatchObject(mockNode);
  });

  it('should handle location offsets correctly', () => {
    const content = '@text test = "value"';
    const baseLocation: Location = {
      start: { line: 10, column: 1 },
      end: { line: 10, column: 20 }
    };

    interpretSubDirectives(content, parentState, baseLocation.start);
    const nodes = parentState.getNodes();
    
    expect(nodes[0].location?.start.line).toBe(10);
    expect(nodes[0].location?.start.column).toBe(1);
    expect(nodes[0].location?.end.line).toBe(10);
    expect(nodes[0].location?.end.column).toBe(20);
  });

  it('should inherit parent state variables', () => {
    parentState.setText('parent', 'value');
    const content = '{parent}';

    interpretSubDirectives(content, parentState);
    
    expect(parentState.getNodes()[0].type).toBe('Text');
    expect(parentState.getNodes()[0].content).toBe('value');
  });

  it('should merge child state back to parent', () => {
    const content = '@text child = "value"';

    interpretSubDirectives(content, parentState);
    
    expect(parentState.getText('child')).toBe('value');
  });

  it('should handle nested errors with correct location', () => {
    const content = '@invalid';
    const baseLocation: Location = {
      start: { line: 5, column: 1 },
      end: { line: 5, column: 8 }
    };

    expect(() => interpretSubDirectives(content, parentState, baseLocation.start))
      .toThrow(/Failed to parse/);
  });
}); 