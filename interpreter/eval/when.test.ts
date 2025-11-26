import { describe, it, expect, beforeEach } from 'vitest';
import { evaluateWhen } from './when';
import { Environment } from '../env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import type { WhenSimpleNode, WhenBlockNode } from '@core/types/when';

describe('evaluateWhen', () => {
  let env: Environment;
  
  beforeEach(() => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    env = new Environment(fileSystem, pathService, '/');
  });
  
  describe('simple form', () => {
    it('should execute action when condition is true', async () => {
      // Set up a variable for the condition
      const { createSimpleTextVariable } = await import('@core/types/variable');
      env.setVariable('isEnabled', createSimpleTextVariable('isEnabled', 'true', {
        directive: 'var',
        syntax: 'quoted',
        hasInterpolation: false,
        isMultiLine: false
      }));
      
      const node: WhenSimpleNode = {
        type: 'Directive',
        kind: 'when',
        subtype: 'whenSimple',
        nodeId: 'test',
        values: {
          condition: [{
            type: 'VariableReference',
            identifier: 'isEnabled',
            nodeId: 'var1',
            valueType: 'variable'
          }],
          action: [{
            type: 'Text',
            content: 'Action executed!',
            nodeId: 'text1'
          }]
        }
      };
      
      const result = await evaluateWhen(node, env);
      expect(result.value).toBe('Action executed!');
    });
    
    it('should return empty string when condition is false', async () => {
      // Set up a variable for the condition
      const { createSimpleTextVariable } = await import('@core/types/variable');
      env.setVariable('isEnabled', createSimpleTextVariable('isEnabled', 'false', {
        directive: 'var',
        syntax: 'quoted',
        hasInterpolation: false,
        isMultiLine: false
      }));
      
      const node: WhenSimpleNode = {
        type: 'Directive',
        kind: 'when',
        subtype: 'whenSimple',
        nodeId: 'test',
        values: {
          condition: [{
            type: 'VariableReference',
            identifier: 'isEnabled',
            nodeId: 'var1',
            valueType: 'variable'
          }],
          action: [{
            type: 'Text',
            content: 'Action executed!',
            nodeId: 'text1'
          }]
        }
      };
      
      const result = await evaluateWhen(node, env);
      expect(result.value).toBe('');
    });
  });
  
  describe('block form with first modifier', () => {
    it('should execute first matching condition', async () => {
      const node: WhenBlockNode = {
        type: 'Directive',
        kind: 'when',
        subtype: 'whenBlock',
        nodeId: 'test',
        values: {
          modifier: [{ type: 'Text', content: 'first', nodeId: 'mod1' }],
          conditions: [
            {
              condition: [{ type: 'Text', content: 'false', nodeId: 'cond1' }],
              action: [{ type: 'Text', content: 'First action', nodeId: 'act1' }]
            },
            {
              condition: [{ type: 'Text', content: 'true', nodeId: 'cond2' }],
              action: [{ type: 'Text', content: 'Second action', nodeId: 'act2' }]
            },
            {
              condition: [{ type: 'Text', content: 'true', nodeId: 'cond3' }],
              action: [{ type: 'Text', content: 'Third action', nodeId: 'act3' }]
            }
          ]
        },
        meta: {
          modifier: 'first',
          conditionCount: 3,
          hasVariable: false
        }
      };
      
      const result = await evaluateWhen(node, env);
      expect(result.value).toBe('Second action');
    });
  });
  
  describe('truthiness', () => {
    it('should treat empty string as false', async () => {
      const node: WhenSimpleNode = {
        type: 'Directive',
        kind: 'when',
        subtype: 'whenSimple',
        nodeId: 'test',
        values: {
          condition: [{ type: 'Text', content: '', nodeId: 'cond1' }],
          action: [{ type: 'Text', content: 'Should not execute', nodeId: 'act1' }]
        }
      };
      
      const result = await evaluateWhen(node, env);
      expect(result.value).toBe('');
    });
    
    it('should treat "false" string as false', async () => {
      const node: WhenSimpleNode = {
        type: 'Directive',
        kind: 'when',
        subtype: 'whenSimple',
        nodeId: 'test',
        values: {
          condition: [{ type: 'Text', content: 'false', nodeId: 'cond1' }],
          action: [{ type: 'Text', content: 'Should not execute', nodeId: 'act1' }]
        }
      };
      
      const result = await evaluateWhen(node, env);
      expect(result.value).toBe('');
    });
    
    it('should treat "0" string as false', async () => {
      const node: WhenSimpleNode = {
        type: 'Directive',
        kind: 'when',
        subtype: 'whenSimple',
        nodeId: 'test',
        values: {
          condition: [{ type: 'Text', content: '0', nodeId: 'cond1' }],
          action: [{ type: 'Text', content: 'Should not execute', nodeId: 'act1' }]
        }
      };
      
      const result = await evaluateWhen(node, env);
      expect(result.value).toBe('');
    });
    
    it('should treat non-empty strings as true', async () => {
      const node: WhenSimpleNode = {
        type: 'Directive',
        kind: 'when',
        subtype: 'whenSimple',
        nodeId: 'test',
        values: {
          condition: [{ type: 'Text', content: 'any text', nodeId: 'cond1' }],
          action: [{ type: 'Text', content: 'Should execute', nodeId: 'act1' }]
        }
      };
      
      const result = await evaluateWhen(node, env);
      expect(result.value).toBe('Should execute');
    });
  });
});