import { describe, it, expect, vi } from 'vitest';
import { interpretSubDirectives } from '../subInterpreter.js';
import { InterpreterState } from '../state/state.js';
import { parseMeldContent } from '../parser.js';
import { interpret } from '../interpreter.js';

vi.mock('../parser.js', () => ({
  parseMeldContent: vi.fn()
}));

vi.mock('../interpreter.js', () => ({
  interpret: vi.fn()
}));

describe('subInterpreter', () => {
  it('should interpret nested directives', () => {
    const content = '@text test = "value"';
    const parentState = new InterpreterState();
    const mockNode = {
      type: 'Directive',
      directive: {
        kind: 'text',
        name: 'test',
        value: 'value'
      }
    };

    vi.mocked(parseMeldContent).mockReturnValue([mockNode]);
    vi.mocked(interpret).mockImplementation((node, state) => {
      state.addNode(node);
    });

    interpretSubDirectives(content, parentState);

    expect(parentState.getNodes()).toHaveLength(1);
    expect(parentState.getNodes()[0]).toEqual(mockNode);
  });

  it('should handle location offsets correctly', () => {
    const content = '@text test = "value"';
    const parentState = new InterpreterState();
    const baseLocation = { line: 10, column: 5 };
    const mockNode = {
      type: 'Directive',
      directive: {
        kind: 'text',
        name: 'test',
        value: 'value'
      },
      location: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 10 }
      }
    };

    vi.mocked(parseMeldContent).mockReturnValue([mockNode]);
    vi.mocked(interpret).mockImplementation((node, state) => {
      state.addNode(node);
    });

    interpretSubDirectives(content, parentState, baseLocation);
    const nodes = parentState.getNodes();
    expect(nodes[0].location?.start.line).toBe(10);
    expect(nodes[0].location?.start.column).toBe(1);
    expect(nodes[0].location?.end.line).toBe(10);
    expect(nodes[0].location?.end.column).toBe(10);
  });

  it('should inherit parent state variables', () => {
    const content = '@text test2 = "value2"';
    const parentState = new InterpreterState();
    parentState.setTextVar('test1', 'value1');

    const mockNode = {
      type: 'Directive',
      directive: {
        kind: 'text',
        name: 'test2',
        value: 'value2'
      }
    };

    vi.mocked(parseMeldContent).mockReturnValue([mockNode]);
    vi.mocked(interpret).mockImplementation((node, state) => {
      state.addNode(node);
      state.setTextVar('test2', 'value2');
    });

    interpretSubDirectives(content, parentState);

    expect(parentState.getTextVar('test1')).toBe('value1');
    expect(parentState.getTextVar('test2')).toBe('value2');
  });

  it('should merge child state back to parent', () => {
    const content = '@text test = "value"';
    const parentState = new InterpreterState();
    const mockNode = {
      type: 'Directive',
      directive: {
        kind: 'text',
        name: 'test',
        value: 'value'
      }
    };

    vi.mocked(parseMeldContent).mockReturnValue([mockNode]);
    vi.mocked(interpret).mockImplementation((node, state) => {
      state.addNode(node);
      state.setTextVar('test', 'value');
    });

    interpretSubDirectives(content, parentState);

    expect(parentState.getNodes()).toHaveLength(1);
    expect(parentState.getTextVar('test')).toBe('value');
  });

  it('should handle nested errors with correct location', () => {
    const content = '@invalid';
    const parentState = new InterpreterState();
    const baseLocation = { line: 10, column: 5 };
    const mockNode = {
      type: 'Directive',
      directive: {
        kind: 'invalid'
      },
      location: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 10 }
      }
    };

    vi.mocked(parseMeldContent).mockReturnValue([mockNode]);
    vi.mocked(interpret).mockImplementation(() => {
      throw new Error('Invalid directive');
    });

    expect(() =>
      interpretSubDirectives(content, parentState, baseLocation)
    ).toThrow('Invalid directive');
  });
}); 