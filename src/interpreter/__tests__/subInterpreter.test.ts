import { describe, it, expect, beforeEach, vi } from 'vitest';
import { interpretSubDirectives } from '../subInterpreter';
import { InterpreterState } from '../state/state';
import type { DirectiveNode, Location } from 'meld-spec';

vi.mock('../parser', () => ({
  parseMeld: vi.fn((content: string) => {
    if (content === '@text test = "value"') {
      return [{
        type: 'Directive',
        kind: '@text',
        data: { name: 'test', value: 'value' },
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 21 } }
      }];
    } else if (content === '{parent}') {
      return [{
        type: 'Text',
        content: 'value',
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 8 } }
      }];
    }
    throw new Error('Failed to parse');
  })
}));

vi.mock('../interpreter', () => ({
  interpretMeld: vi.fn((nodes, state) => {
    if (nodes[0].type === 'Directive' && nodes[0].kind === '@text') {
      state.setText(nodes[0].data.name, nodes[0].data.value);
    } else if (nodes[0].type === 'Text') {
      state.addNode(nodes[0]);
    }
    return state;
  })
}));

describe('subInterpreter', () => {
  let parentState: InterpreterState;
  let baseLocation: Location;

  beforeEach(() => {
    parentState = new InterpreterState();
    baseLocation = {
      start: { line: 1, column: 1 },
      end: { line: 1, column: 1 }
    };
  });

  it('should interpret nested directives', () => {
    const content = '@text test = "value"';
    const state = interpretSubDirectives(content, baseLocation, parentState);
    
    expect(state.getTextVar('test')).toBe('value');
  });

  it('should handle location offsets correctly', () => {
    const content = '@text test = "value"';
    baseLocation = {
      start: { line: 10, column: 5 },
      end: { line: 10, column: 25 }
    };

    const state = interpretSubDirectives(content, baseLocation, parentState);
    const nodes = state.getNodes();
    
    expect(nodes[0].location?.start.line).toBe(10);
    expect(nodes[0].location?.start.column).toBe(5);
  });

  it('should inherit parent state variables', () => {
    parentState.setText('parent', 'value');
    const content = '{parent}';

    const state = interpretSubDirectives(content, baseLocation, parentState);
    const nodes = state.getNodes();
    
    expect(nodes[0].type).toBe('Text');
    expect(nodes[0].content).toBe('value');
  });

  it('should merge child state back to parent', () => {
    const content = '@text child = "value"';
    const state = interpretSubDirectives(content, baseLocation, parentState);
    
    expect(state.getTextVar('child')).toBe('value');
  });

  it('should handle nested errors with correct location', () => {
    const content = '@invalid';
    baseLocation = {
      start: { line: 5, column: 1 },
      end: { line: 5, column: 8 }
    };

    expect(() => interpretSubDirectives(content, baseLocation, parentState))
      .toThrow(/Failed to parse/);
  });
}); 