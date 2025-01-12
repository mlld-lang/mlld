import { describe, it, expect, beforeEach } from 'vitest';
import { InterpreterState } from '../state/state';
import { DirectiveRegistry } from '../directives/registry';
import { textDirectiveHandler } from '../directives/text';
import { dataDirectiveHandler } from '../directives/data';
import { runDirectiveHandler } from '../directives/run';
import { MeldInterpretError } from '../errors/errors';
import type { DirectiveNode, Node } from 'meld-spec';

describe('Nested Directives', () => {
  let parentState: InterpreterState;

  beforeEach(() => {
    parentState = new InterpreterState();
    DirectiveRegistry.clear();
    DirectiveRegistry.registerHandler(textDirectiveHandler);
    DirectiveRegistry.registerHandler(dataDirectiveHandler);
    DirectiveRegistry.registerHandler(runDirectiveHandler);
  });

  describe('state inheritance', () => {
    it('should inherit parent state variables', () => {
      const parentNode: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'text',
          name: 'parent',
          value: 'value'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 20 }
        }
      };

      textDirectiveHandler.handle(parentNode, parentState, {});
      const childState = new InterpreterState(parentState);
      expect(childState.getText('parent')).toBe('value');
    });

    it('should merge child state back to parent', () => {
      const childState = new InterpreterState(parentState);
      const childNode: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'text',
          name: 'child',
          value: 'value'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 20 }
        }
      };

      textDirectiveHandler.handle(childNode, childState, {});
      childState.mergeToParent();
      expect(parentState.getText('child')).toBe('value');
    });

    it('should handle multiple levels of nesting', () => {
      const state1 = new InterpreterState(parentState);
      const state2 = new InterpreterState(state1);

      const node1: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'text',
          name: 'level1',
          value: 'value1'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 20 }
        }
      };

      const node2: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'text',
          name: 'level2',
          value: 'value2'
        },
        location: {
          start: { line: 2, column: 1 },
          end: { line: 2, column: 20 }
        }
      };

      textDirectiveHandler.handle(node1, state1, {});
      textDirectiveHandler.handle(node2, state2, {});

      state2.mergeToParent();
      state1.mergeToParent();

      expect(state1.getText('level2')).toBe('value2');
      expect(parentState.getText('level1')).toBe('value1');
      expect(parentState.getText('level2')).toBe('value2');
    });

    it('should track local changes in nested states', () => {
      const childState = new InterpreterState(parentState);
      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'text',
          name: 'local',
          value: 'value'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 20 }
        }
      };

      textDirectiveHandler.handle(node, childState, {});
      expect(childState.getLocalChanges().has('text:local')).toBe(true);
    });

    it('should inherit file path from parent', () => {
      parentState.setFilePath('/path/to/parent.meld');
      const childState = new InterpreterState(parentState);
      expect(childState.getFilePath()).toBe('/path/to/parent.meld');
    });
  });

  describe('location adjustments', () => {
    it('should adjust locations for nested content', () => {
      const childState = new InterpreterState(parentState);
      const nodes: Node[] = [
        {
          type: 'directive',
          directive: {
            kind: 'text',
            name: 'test1',
            value: 'value1'
          },
          location: {
            start: { line: 10, column: 5 },
            end: { line: 10, column: 25 }
          }
        },
        {
          type: 'text',
          content: 'Some text',
          location: {
            start: { line: 11, column: 1 },
            end: { line: 11, column: 10 }
          }
        }
      ];

      nodes.forEach(node => childState.addNode(node));
      const resultNodes = childState.getNodes();
      
      expect(resultNodes[0].location?.start).toEqual({ line: 10, column: 5 });
      expect(resultNodes[1].location?.start).toEqual({ line: 11, column: 1 });
    });

    it('should handle errors with adjusted locations', () => {
      const childState = new InterpreterState(parentState);
      const errorNode: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'text',
          name: 'error',
          value: undefined
        },
        location: {
          start: { line: 5, column: 1 },
          end: { line: 5, column: 20 }
        }
      };

      try {
        textDirectiveHandler.handle(errorNode, childState, {});
      } catch (error: any) {
        expect(error.location).toBeDefined();
        expect(error.location.line).toBe(5);
        expect(error.location.column).toBe(1);
      }
    });

    it('should adjust locations for multi-line content', () => {
      const childState = new InterpreterState(parentState);
      const nodes: Node[] = [
        {
          type: 'directive',
          directive: {
            kind: 'text',
            name: 'test1',
            value: 'value1'
          },
          location: {
            start: { line: 20, column: 5 },
            end: { line: 20, column: 25 }
          }
        },
        {
          type: 'text',
          content: 'Line 1\nLine 2',
          location: {
            start: { line: 22, column: 1 },
            end: { line: 23, column: 10 }
          }
        }
      ];

      nodes.forEach(node => childState.addNode(node));
      const resultNodes = childState.getNodes();
      
      expect(resultNodes[0].location?.start).toEqual({ line: 20, column: 5 });
      expect(resultNodes[1].location?.start).toEqual({ line: 22, column: 1 });
    });

    it('should preserve indentation in location adjustments', () => {
      const childState = new InterpreterState(parentState);
      const nodes: Node[] = [
        {
          type: 'directive',
          directive: {
            kind: 'text',
            name: 'test1',
            value: 'value1'
          },
          location: {
            start: { line: 10, column: 3 },
            end: { line: 10, column: 23 }
          }
        },
        {
          type: 'directive',
          directive: {
            kind: 'text',
            name: 'test2',
            value: 'value2'
          },
          location: {
            start: { line: 11, column: 3 },
            end: { line: 11, column: 23 }
          }
        }
      ];

      nodes.forEach(node => childState.addNode(node));
      const resultNodes = childState.getNodes();
      
      expect(resultNodes[0].location?.start).toEqual({ line: 10, column: 3 });
      expect(resultNodes[1].location?.start).toEqual({ line: 11, column: 3 });
    });

    it('should handle nested nodes with child nodes', () => {
      const childState = new InterpreterState(parentState);
      const nodes: Node[] = [
        {
          type: 'directive',
          directive: {
            kind: 'text',
            name: 'parent',
            value: 'value'
          },
          location: {
            start: { line: 5, column: 3 },
            end: { line: 5, column: 23 }
          }
        },
        {
          type: 'directive',
          directive: {
            kind: 'text',
            name: 'child',
            value: 'value'
          },
          location: {
            start: { line: 6, column: 1 },
            end: { line: 6, column: 20 }
          }
        }
      ];

      nodes.forEach(node => childState.addNode(node));
      const resultNodes = childState.getNodes();
      
      expect(resultNodes[0].location?.start).toEqual({ line: 5, column: 3 });
      expect(resultNodes[0].location?.end).toEqual({ line: 5, column: 23 });
      expect(resultNodes[1].location?.start).toEqual({ line: 6, column: 1 });
    });

    it('should handle complex multi-line content with mixed indentation', () => {
      const childState = new InterpreterState(parentState);
      const nodes: Node[] = [
        {
          type: 'directive',
          directive: {
            kind: 'text',
            name: 'test1',
            value: 'multi\nline\nvalue'
          },
          location: {
            start: { line: 10, column: 4 },
            end: { line: 12, column: 8 }
          }
        },
        {
          type: 'text',
          content: '  indented\n    more indented\nno indent',
          location: {
            start: { line: 13, column: 3 },
            end: { line: 15, column: 9 }
          }
        }
      ];

      nodes.forEach(node => childState.addNode(node));
      const resultNodes = childState.getNodes();
      
      // Verify start locations
      expect(resultNodes[0].location?.start).toEqual({ line: 10, column: 4 });
      expect(resultNodes[0].location?.end).toEqual({ line: 12, column: 8 });
      expect(resultNodes[1].location?.start).toEqual({ line: 13, column: 3 });
      expect(resultNodes[1].location?.end).toEqual({ line: 15, column: 9 });
    });

    it('should handle deeply nested directives with location inheritance', () => {
      const state1 = new InterpreterState(parentState);
      const state2 = new InterpreterState(state1);
      const state3 = new InterpreterState(state2);

      // Base location for first nesting level
      const baseLocation1 = {
        start: { line: 5, column: 3 },
        end: { line: 15, column: 3 }
      };

      // Base location for second nesting level
      const baseLocation2 = {
        start: { line: 7, column: 5 },
        end: { line: 12, column: 5 }
      };

      // Base location for third nesting level
      const baseLocation3 = {
        start: { line: 8, column: 7 },
        end: { line: 10, column: 7 }
      };

      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'text',
          name: 'deepNested',
          value: 'test'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 20 }
        }
      };

      // Handle node at each nesting level with appropriate context
      textDirectiveHandler.handle(node, state1, { mode: 'rightside', baseLocation: baseLocation1 });
      textDirectiveHandler.handle(node, state2, { mode: 'rightside', baseLocation: baseLocation2 });
      textDirectiveHandler.handle(node, state3, { mode: 'rightside', baseLocation: baseLocation3 });

      // Verify location adjustments at each level
      const nodes1 = state1.getNodes();
      const nodes2 = state2.getNodes();
      const nodes3 = state3.getNodes();

      expect(nodes1[0].location?.start).toEqual({ line: 5, column: 3 });
      expect(nodes2[0].location?.start).toEqual({ line: 7, column: 5 });
      expect(nodes3[0].location?.start).toEqual({ line: 8, column: 7 });
    });

    it('should handle edge case of zero-width locations', () => {
      const childState = new InterpreterState(parentState);
      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'text',
          name: 'test',
          value: ''
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 1 }  // Zero-width location
        }
      };

      textDirectiveHandler.handle(node, childState, {
        mode: 'rightside',
        baseLocation: {
          start: { line: 10, column: 5 },
          end: { line: 10, column: 5 }
        }
      });

      const resultNodes = childState.getNodes();
      expect(resultNodes[0].location?.start).toEqual({ line: 10, column: 5 });
      expect(resultNodes[0].location?.end).toEqual({ line: 10, column: 5 });
    });

    it('should handle location adjustments with large line numbers', () => {
      const childState = new InterpreterState(parentState);
      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'text',
          name: 'test',
          value: 'value'
        },
        location: {
          start: { line: 1000, column: 1 },
          end: { line: 1000, column: 20 }
        }
      };

      textDirectiveHandler.handle(node, childState, {
        mode: 'rightside',
        baseLocation: {
          start: { line: 5000, column: 5 },
          end: { line: 5000, column: 25 }
        }
      });

      const resultNodes = childState.getNodes();
      expect(resultNodes[0].location?.start).toEqual({ line: 5999, column: 1 });
      expect(resultNodes[0].location?.end).toEqual({ line: 5999, column: 20 });
    });

    it('should preserve location information in error scenarios', () => {
      const childState = new InterpreterState(parentState);
      const errorNode: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'text',
          name: 'error',
          value: undefined
        },
        location: {
          start: { line: 3, column: 5 },
          end: { line: 5, column: 7 }
        }
      };

      const baseLocation = {
        start: { line: 10, column: 3 },
        end: { line: 15, column: 3 }
      };

      try {
        textDirectiveHandler.handle(errorNode, childState, {
          mode: 'rightside',
          baseLocation
        });
      } catch (error: any) {
        expect(error.location).toBeDefined();
        // Error location should be adjusted relative to base location
        expect(error.location.line).toBe(12);
        expect(error.location.column).toBe(5);
      }
    });
  });

  describe('error handling', () => {
    it('should preserve error context in nested directives', () => {
      const childState = new InterpreterState(parentState);
      const errorNode: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'text',
          name: 'error',
          value: undefined
        },
        location: {
          start: { line: 5, column: 1 },
          end: { line: 5, column: 20 }
        }
      };

      try {
        textDirectiveHandler.handle(errorNode, childState, {});
      } catch (error: any) {
        expect(error.location).toBeDefined();
        expect(error.location.line).toBe(5);
      }
    });

    it('should handle syntax errors in nested content', () => {
      const childState = new InterpreterState(parentState);
      const invalidNode: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'text',
          name: 'invalid',
          value: '{invalid:json}'
        },
        location: {
          start: { line: 5, column: 1 },
          end: { line: 5, column: 20 }
        }
      };

      try {
        textDirectiveHandler.handle(invalidNode, childState, {});
      } catch (error: any) {
        expect(error.location).toBeDefined();
        expect(error.location.line).toBe(5);
      }
    });

    it('should adjust error locations from nested content', () => {
      const childState = new InterpreterState(parentState);
      const errorNode: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'text',
          name: 'error',
          value: undefined
        },
        location: {
          start: { line: 10, column: 5 },
          end: { line: 10, column: 25 }
        }
      };

      try {
        textDirectiveHandler.handle(errorNode, childState, {});
      } catch (error: any) {
        expect(error.location).toBeDefined();
        expect(error.location.line).toBe(10);
        expect(error.location.column).toBe(5);
      }
    });

    it('should handle errors in child nodes', () => {
      const childState = new InterpreterState(parentState);
      const errorNode: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'text',
          name: 'error',
          value: undefined
        },
        location: {
          start: { line: 6, column: 1 },
          end: { line: 6, column: 20 }
        }
      };

      try {
        textDirectiveHandler.handle(errorNode, childState, {});
      } catch (error: any) {
        expect(error.location).toBeDefined();
        expect(error.location.line).toBe(6);
        expect(error.location.column).toBe(1);
      }
    });
  });
}); 