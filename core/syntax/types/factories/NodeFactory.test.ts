import { container } from 'tsyringe';
import { NodeFactory } from './NodeFactory';
import { NodeType, SourceLocation } from '../interfaces/common';

describe('NodeFactory', () => {
  let factory: NodeFactory;
  
  beforeEach(() => {
    // Reset the container to ensure clean test state
    container.clearInstances();
    container.register(NodeFactory, { useClass: NodeFactory });
    factory = container.resolve(NodeFactory);
  });
  
  it('should create a basic node with default location', () => {
    const node = factory.createNode('Text');
    
    expect(node).toEqual({
      type: 'Text',
      location: {
        start: { line: 0, column: 0 },
        end: { line: 0, column: 0 }
      }
    });
  });
  
  it('should create a node with provided location', () => {
    const location: SourceLocation = {
      start: { line: 1, column: 1 },
      end: { line: 2, column: 2 }
    };
    
    const node = factory.createNode('Directive', location);
    
    expect(node).toEqual({
      type: 'Directive',
      location
    });
  });

  it('should handle all node types', () => {
    const nodeTypes: NodeType[] = [
      'Directive', 'Text', 'CodeFence', 'Comment', 'Error', 'VariableReference'
    ];

    for (const type of nodeTypes) {
      const node = factory.createNode(type);
      expect(node.type).toEqual(type);
    }
  });
});