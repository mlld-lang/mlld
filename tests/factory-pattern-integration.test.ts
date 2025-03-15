import { describe, it, expect, beforeEach } from 'vitest';
import { container } from 'tsyringe';
import {
  NodeFactory,
  VariableNodeFactory,
  DirectiveNodeFactory,
  TextNodeFactory,
  CodeFenceNodeFactory,
  CommentNodeFactory,
  ErrorNodeFactory,
  // Interfaces
  INode,
  IVariableReference,
  IDirectiveNode,
  ITextNode,
  ICodeFenceNode,
  ICommentNode,
  IErrorNode,
  // Types
  NodeType,
  SourceLocation,
  // Legacy functions
  createNode,
  createDirectiveNode,
  createTextNode,
  createCodeFenceNode,
  createCommentNode,
  createErrorNode,
  createVariableReferenceNode
} from '@core/syntax/types/index.js';

describe('AST Factory Pattern Integration', () => {
  // Reset the container before each test
  beforeEach(() => {
    container.clearInstances();
    
    // Register factories with the container
    container.register(NodeFactory, { useClass: NodeFactory });
    container.register(VariableNodeFactory, { useClass: VariableNodeFactory });
    container.register(DirectiveNodeFactory, { useClass: DirectiveNodeFactory });
    container.register(TextNodeFactory, { useClass: TextNodeFactory });
    container.register(CodeFenceNodeFactory, { useClass: CodeFenceNodeFactory });
    container.register(CommentNodeFactory, { useClass: CommentNodeFactory });
    container.register(ErrorNodeFactory, { useClass: ErrorNodeFactory });
  });

  describe('Factory Classes', () => {
    it('should resolve all factory classes from the container', () => {
      const nodeFactory = container.resolve(NodeFactory);
      const variableNodeFactory = container.resolve(VariableNodeFactory);
      const directiveNodeFactory = container.resolve(DirectiveNodeFactory);
      const textNodeFactory = container.resolve(TextNodeFactory);
      const codeFenceNodeFactory = container.resolve(CodeFenceNodeFactory);
      const commentNodeFactory = container.resolve(CommentNodeFactory);
      const errorNodeFactory = container.resolve(ErrorNodeFactory);
      
      expect(nodeFactory).toBeInstanceOf(NodeFactory);
      expect(variableNodeFactory).toBeInstanceOf(VariableNodeFactory);
      expect(directiveNodeFactory).toBeInstanceOf(DirectiveNodeFactory);
      expect(textNodeFactory).toBeInstanceOf(TextNodeFactory);
      expect(codeFenceNodeFactory).toBeInstanceOf(CodeFenceNodeFactory);
      expect(commentNodeFactory).toBeInstanceOf(CommentNodeFactory);
      expect(errorNodeFactory).toBeInstanceOf(ErrorNodeFactory);
    });
    
    it('should create nodes with the base NodeFactory', () => {
      const factory = container.resolve(NodeFactory);
      const location: SourceLocation = {
        start: { line: 1, column: 1 },
        end: { line: 2, column: 2 }
      };
      
      // Test all node types
      const nodeTypes: NodeType[] = [
        'Directive', 'Text', 'CodeFence', 'Comment', 'Error', 'VariableReference'
      ];
      
      for (const type of nodeTypes) {
        const node = factory.createNode(type, location);
        expect(node.type).toBe(type);
        expect(node.location).toBe(location);
      }
    });
    
    it('should create variable reference nodes', () => {
      const factory = container.resolve(VariableNodeFactory);
      const varNode = factory.createVariableReferenceNode('testVar', 'text');
      
      expect(varNode.type).toBe('VariableReference');
      expect(varNode.identifier).toBe('testVar');
      expect(varNode.valueType).toBe('text');
      expect(varNode.isVariableReference).toBe(true);
    });
    
    it('should create directive nodes', () => {
      const factory = container.resolve(DirectiveNodeFactory);
      const directiveNode = factory.createDirectiveNode('text', { identifier: 'greet', value: 'Hello' });
      
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.directive.kind).toBe('text');
      expect(directiveNode.directive.identifier).toBe('greet');
      expect(directiveNode.directive.value).toBe('Hello');
    });
    
    it('should create text nodes', () => {
      const factory = container.resolve(TextNodeFactory);
      const textNode = factory.createTextNode('Sample text content');
      
      expect(textNode.type).toBe('Text');
      expect(textNode.content).toBe('Sample text content');
    });
    
    it('should create code fence nodes', () => {
      const factory = container.resolve(CodeFenceNodeFactory);
      const codeFenceNode = factory.createCodeFenceNode('console.log("Hello")', 'javascript');
      
      expect(codeFenceNode.type).toBe('CodeFence');
      expect(codeFenceNode.content).toBe('console.log("Hello")');
      expect(codeFenceNode.language).toBe('javascript');
    });
    
    it('should create comment nodes', () => {
      const factory = container.resolve(CommentNodeFactory);
      const commentNode = factory.createCommentNode('This is a comment');
      
      expect(commentNode.type).toBe('Comment');
      expect(commentNode.content).toBe('This is a comment');
    });
    
    it('should create error nodes', () => {
      const factory = container.resolve(ErrorNodeFactory);
      const errorNode = factory.createErrorNode('Error message', 'Stack trace');
      
      expect(errorNode.type).toBe('Error');
      expect(errorNode.message).toBe('Error message');
      expect(errorNode.stack).toBe('Stack trace');
    });
  });
  
  describe('Type Guards', () => {
    it('should validate variable reference nodes', () => {
      const factory = container.resolve(VariableNodeFactory);
      const varNode = factory.createVariableReferenceNode('testVar', 'text');
      
      expect(factory.isVariableReferenceNode(varNode)).toBe(true);
      expect(factory.isVariableReferenceNode({ type: 'Text' })).toBe(false);
    });
    
    it('should validate directive nodes', () => {
      const factory = container.resolve(DirectiveNodeFactory);
      const directiveNode = factory.createDirectiveNode('text', { identifier: 'greet', value: 'Hello' });
      
      expect(factory.isDirectiveNode(directiveNode)).toBe(true);
      expect(factory.isDirectiveNode({ type: 'Text' })).toBe(false);
    });
    
    it('should validate text nodes', () => {
      const factory = container.resolve(TextNodeFactory);
      const textNode = factory.createTextNode('Sample text content');
      
      expect(factory.isTextNode(textNode)).toBe(true);
      expect(factory.isTextNode({ type: 'Directive' })).toBe(false);
    });
  });
  
  describe('Legacy API Compatibility', () => {
    it('should create nodes with legacy functions', () => {
      // Test legacy node creation functions
      const node = createNode('Text');
      const directiveNode = createDirectiveNode('text', { identifier: 'greet', value: 'Hello' });
      const textNode = createTextNode('Sample text content');
      const codeFenceNode = createCodeFenceNode('console.log("Hello")', 'javascript');
      const commentNode = createCommentNode('This is a comment');
      const errorNode = createErrorNode('Error message', 'Stack trace');
      const varNode = createVariableReferenceNode('testVar', 'text');
      
      // Verify nodes created with legacy functions
      expect(node.type).toBe('Text');
      expect(directiveNode.type).toBe('Directive');
      expect(textNode.type).toBe('Text');
      expect(codeFenceNode.type).toBe('CodeFence');
      expect(commentNode.type).toBe('Comment');
      expect(errorNode.type).toBe('Error');
      expect(varNode.type).toBe('VariableReference');
    });
  });
  
  describe('Interface Typing', () => {
    it('should properly implement interface inheritance', () => {
      // Create nodes with factories
      const nodeFactory = container.resolve(NodeFactory);
      const variableFactory = container.resolve(VariableNodeFactory);
      const directiveFactory = container.resolve(DirectiveNodeFactory);
      const textFactory = container.resolve(TextNodeFactory);
      const codeFenceFactory = container.resolve(CodeFenceNodeFactory);
      const commentFactory = container.resolve(CommentNodeFactory);
      const errorFactory = container.resolve(ErrorNodeFactory);
      
      const baseNode = nodeFactory.createNode('Text');
      const varNode = variableFactory.createVariableReferenceNode('testVar', 'text');
      const directiveNode = directiveFactory.createDirectiveNode('text', { identifier: 'greet' });
      const textNode = textFactory.createTextNode('Sample text');
      const codeFenceNode = codeFenceFactory.createCodeFenceNode('code', 'js');
      const commentNode = commentFactory.createCommentNode('Comment');
      const errorNode = errorFactory.createErrorNode('Error');
      
      // Type assertions - verify interface inheritance works properly
      const baseNodeAsINode: INode = baseNode;
      const varNodeAsINode: INode = varNode;
      const directiveNodeAsINode: INode = directiveNode;
      const textNodeAsINode: INode = textNode;
      const codeFenceNodeAsINode: INode = codeFenceNode;
      const commentNodeAsINode: INode = commentNode;
      const errorNodeAsINode: INode = errorNode;
      
      // Specific interface assertions
      const varNodeAsIVariableReference: IVariableReference = varNode;
      const directiveNodeAsIDirectiveNode: IDirectiveNode = directiveNode;
      const textNodeAsITextNode: ITextNode = textNode;
      const codeFenceNodeAsICodeFenceNode: ICodeFenceNode = codeFenceNode;
      const commentNodeAsICommentNode: ICommentNode = commentNode;
      const errorNodeAsIErrorNode: IErrorNode = errorNode;
      
      // Verify the type property is consistent
      expect(baseNodeAsINode.type).toBe('Text');
      expect(varNodeAsINode.type).toBe('VariableReference');
      expect(directiveNodeAsINode.type).toBe('Directive');
      expect(textNodeAsINode.type).toBe('Text');
      expect(codeFenceNodeAsINode.type).toBe('CodeFence');
      expect(commentNodeAsINode.type).toBe('Comment');
      expect(errorNodeAsINode.type).toBe('Error');
    });
  });
});