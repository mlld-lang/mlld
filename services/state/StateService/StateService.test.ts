import { describe, it, expect } from 'vitest';
import { StateService } from './StateService';
import { createTextVariable, createDataVariable, VariableType } from '@core/types';

describe('Minimal StateService', () => {
  it('should store and retrieve variables', () => {
    const state = new StateService();
    
    const textVar = createTextVariable('greeting', 'Hello World');
    state.setVariable(textVar);
    
    const retrieved = state.getVariable('greeting');
    expect(retrieved).toBeDefined();
    expect(retrieved?.type).toBe(VariableType.TEXT);
    expect(retrieved?.value).toBe('Hello World');
  });
  
  it('should store multiple variable types', () => {
    const state = new StateService();
    
    const textVar = createTextVariable('name', 'John');
    const dataVar = createDataVariable('config', { debug: true });
    
    state.setVariable(textVar);
    state.setVariable(dataVar);
    
    const allVars = state.getAllVariables();
    expect(allVars.size).toBe(2);
    expect(allVars.get('name')?.value).toBe('John');
    expect(allVars.get('config')?.value).toEqual({ debug: true });
  });
  
  it('should store and retrieve nodes', () => {
    const state = new StateService();
    
    const node = {
      type: 'Text' as const,
      nodeId: 'test-123',
      content: 'Hello'
    };
    
    state.addNode(node);
    
    const nodes = state.getNodes();
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toEqual(node);
  });
  
  it('should create child states with inherited variables', () => {
    const parent = new StateService();
    const parentVar = createTextVariable('shared', 'parent value');
    parent.setVariable(parentVar);
    
    const child = parent.createChild();
    
    // Child should have parent's variable
    expect(child.getVariable('shared')?.value).toBe('parent value');
    
    // Child can override without affecting parent
    const childVar = createTextVariable('shared', 'child value');
    child.setVariable(childVar);
    
    expect(child.getVariable('shared')?.value).toBe('child value');
    expect(parent.getVariable('shared')?.value).toBe('parent value');
  });
  
  it('should handle file path correctly', () => {
    const state = new StateService();
    expect(state.currentFilePath).toBeNull();
    
    state.currentFilePath = '/path/to/file.mld';
    expect(state.currentFilePath).toBe('/path/to/file.mld');
  });
});