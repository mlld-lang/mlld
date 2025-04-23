import { describe, it, expect } from 'vitest';
import { container } from 'tsyringe';
import { 
  INode, 
  IVariableReference, 
  NodeFactory, 
  VariableNodeFactory 
} from '@core/syntax/types/index';

describe('Circular Dependency Resolution', () => {
  it('should resolve factories from container', () => {
    const nodeFactory = container.resolve(NodeFactory);
    const variableNodeFactory = container.resolve(VariableNodeFactory);
    
    expect(nodeFactory).toBeDefined();
    expect(variableNodeFactory).toBeDefined();
  });
  
  it('should create nodes using factories', () => {
    const nodeFactory = container.resolve(NodeFactory);
    const baseNode = nodeFactory.createNode('Text');
    
    expect(baseNode.type).toBe('Text');
  });
  
  it('should create variable reference nodes', () => {
    const variableNodeFactory = container.resolve(VariableNodeFactory);
    const varNode = variableNodeFactory.createVariableReferenceNode('testVar', 'text');
    
    expect(varNode.type).toBe('VariableReference');
    expect(varNode.identifier).toBe('testVar');
    expect(varNode.valueType).toBe('text');
  });
  
  it('should properly implement interface inheritance', () => {
    const variableNodeFactory = container.resolve(VariableNodeFactory);
    const varNode = variableNodeFactory.createVariableReferenceNode('testVar', 'text');
    
    // Type assertion tests - these compile-time checks verify that 
    // our interfaces are properly related
    const asVariableRef: IVariableReference = varNode;
    const asNode: INode = varNode;
    
    expect(asVariableRef.type).toBe('VariableReference');
    expect(asNode.type).toBe('VariableReference');
  });
});