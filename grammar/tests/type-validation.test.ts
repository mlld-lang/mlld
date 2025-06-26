import { describe, it, expect } from 'vitest';
import { parse } from '@grammar/parser';
import { 
  isDirectiveNode,
  isVariableReferenceNode,
  DirectiveSubtype
} from '@core/types';
import { NodeType } from '@core/shared/types';

/**
 * Type validation tests for grammar output
 * 
 * These tests ensure that the AST produced by the grammar
 * matches the TypeScript type definitions exactly.
 */

describe('Grammar-Type System Alignment', () => {
  
  describe('Text Directive Type Validation', () => {
    it('should produce valid textAssignment nodes', async () => {
      const input = '/var @greeting = "Hello World"';
      const result = await parse(input);
      const ast = result.ast;
      
      const directive = ast[0];
      expect(isDirectiveNode(directive)).toBe(true);
      expect(directive.kind).toBe('var');
      
      // Check subtype is valid - unified var system uses 'var' subtype
      expect(directive.subtype).toBe('var');
      
      // Check required properties exist
      expect(directive.values).toBeDefined();
      expect(directive.raw).toBeDefined();
      expect(directive.meta).toBeDefined();
      
      // Check values structure - unified var has 'value' not 'content'
      expect(directive.values.identifier).toBeDefined();
      expect(directive.values.identifier.identifier).toBe('greeting');
      expect(directive.values.value).toBeDefined();
    });

    it('should produce valid textTemplate nodes', async () => {
      const input = '/var @message = [[Hello {{name}}!]]';
      const result = await parse(input);
      const ast = result.ast;
      
      const directive = ast[0];
      expect(directive.kind).toBe('var');
      // Unified var system uses 'var' subtype for all variables
      expect(directive.subtype).toBe('var');
      // Meta contains inferred type info
      expect(directive.meta.inferredType).toBe('template');
    });

    it('should reject invalid text subtypes', async () => {
      // This test would fail currently because grammar produces
      // subtypes like 'textPath' that don't exist in types
      const input = '/var @content = [file.md]';
      const result = await parse(input);
      const ast = result.ast;
      
      const directive = ast[0];
      // Unified var system uses 'var' subtype
      expect(directive.subtype).toBe('var');
    });
  });

  describe('Data Directive Type Validation', () => {
    it('should produce dataAssignment not dataDirective', async () => {
      const input = '/var @config = { "key": "value" }';
      const result = await parse(input);
      const ast = result.ast;
      
      const directive = ast[0];
      // Unified var system uses 'var' subtype for all variables
      expect(directive.subtype).toBe('var');
    });
  });

  describe('Variable Reference Type Validation', () => {
    it('should produce valid VariableReferenceNode structure', async () => {
      const input = '/var @message = [[Hello {{user.name}}!]]';
      const result = await parse(input);
      const ast = result.ast;
      
      const directive = ast[0];
      expect(directive.kind).toBe('var');
      expect(directive.subtype).toBe('var');
      
      // The value IS the template content (array of nodes)
      const value = directive.values.value;
      expect(value).toBeDefined();
      expect(Array.isArray(value)).toBe(true);
      
      // Find variable reference in the template content
      const varRef = findVariableReference(value);
      
      expect(varRef).toBeDefined();
      expect(varRef.identifier).toBe('user');
      expect(varRef.fields).toBeDefined();
      expect(Array.isArray(varRef.fields)).toBe(true);
      
      // Should NOT have deprecated properties
      expect(varRef.isVariableReference).toBeUndefined();
    });
  });

  describe('Node Type Constants', () => {
    it('should only use defined NodeType values', async () => {
      // Test various inputs to ensure they only produce valid node types
      const inputs = [
        '/var @val = "null"',
        '/var @str = "string"',
        '/show "# Section" from [file.md]'
      ];
      
      const validNodeTypes = Object.values(NodeType);
      
      for (const input of inputs) {
        const result = await parse(input);
        const ast = result.ast;
        // Walk the AST and check all node types
        walkAst(ast, (node) => {
          if (node.type) {
            expect(validNodeTypes).toContain(node.type);
          }
        });
      }
    });
  });

  describe('Directive Property Placement', () => {
    it('should place source at root level when present', async () => {
      const input = '/show [[template content]]';
      const result = await parse(input);
      const ast = result.ast;
      
      const directive = ast[0];
      
      // source should be at root level (nullable)
      expect('source' in directive).toBe(true);
      
      // When source is provided, it should be a string at root
      if (directive.source !== null) {
        expect(typeof directive.source).toBe('string');
      }
    });
  });
});

// Helper to find variable reference in nested structure
function findVariableReference(nodes: any[]): any {
  for (const node of nodes) {
    if (isVariableReferenceNode(node)) {
      return node;
    }
    if (Array.isArray(node)) {
      const found = findVariableReference(node);
      if (found) return found;
    } else if (node && typeof node === 'object') {
      if (node.content && Array.isArray(node.content)) {
        const found = findVariableReference(node.content);
        if (found) return found;
      }
    }
  }
  return null;
}

// Helper to walk AST
function walkAst(node: any, visitor: (node: any) => void) {
  visitor(node);
  
  if (Array.isArray(node)) {
    node.forEach(child => walkAst(child, visitor));
  } else if (node && typeof node === 'object') {
    Object.values(node).forEach(value => {
      if (value && typeof value === 'object') {
        walkAst(value, visitor);
      }
    });
  }
}