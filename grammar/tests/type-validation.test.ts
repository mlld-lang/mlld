import { describe, it, expect } from 'vitest';
import { parse } from '../parser';
import { 
  isDirectiveNode,
  isTextDirective,
  isDataDirective,
  isRunDirective,
  isExecDirective,
  isAddDirective,
  isPathDirective,
  isImportDirective,
  isVariableReferenceNode,
  DirectiveSubtype,
  NodeType
} from '@core/types';

/**
 * Type validation tests for grammar output
 * 
 * These tests ensure that the AST produced by the grammar
 * matches the TypeScript type definitions exactly.
 */

describe('Grammar-Type System Alignment', () => {
  
  describe('Text Directive Type Validation', () => {
    it('should produce valid textAssignment nodes', () => {
      const input = '@text greeting = "Hello World"';
      const ast = parse(input);
      
      const directive = ast[0];
      expect(isDirectiveNode(directive)).toBe(true);
      expect(isTextDirective(directive)).toBe(true);
      
      // Check subtype is valid
      const validTextSubtypes: DirectiveSubtype[] = ['textAssignment', 'textTemplate'];
      expect(validTextSubtypes).toContain(directive.subtype);
      
      // Check required properties exist
      expect(directive.values).toBeDefined();
      expect(directive.raw).toBeDefined();
      expect(directive.meta).toBeDefined();
      
      // Check values structure
      expect(directive.values.identifier).toBeDefined();
      expect(Array.isArray(directive.values.identifier)).toBe(true);
      expect(directive.values.content).toBeDefined();
    });

    it('should produce valid textTemplate nodes', () => {
      const input = '@text message = [[Hello {{name}}!]]';
      const ast = parse(input);
      
      const directive = ast[0];
      expect(directive.subtype).toBe('textTemplate');
      expect(directive.meta.hasVariables).toBe(true);
    });

    it('should reject invalid text subtypes', () => {
      // This test would fail currently because grammar produces
      // subtypes like 'textPath' that don't exist in types
      const input = '@text content = [file.md]';
      const ast = parse(input);
      
      const directive = ast[0];
      const validTextSubtypes: DirectiveSubtype[] = ['textAssignment', 'textTemplate'];
      
      // This should pass but currently fails
      expect(validTextSubtypes).toContain(directive.subtype);
    });
  });

  describe('Data Directive Type Validation', () => {
    it('should produce dataAssignment not dataDirective', () => {
      const input = '@data config = { "key": "value" }';
      const ast = parse(input);
      
      const directive = ast[0];
      expect(directive.subtype).toBe('dataAssignment'); // Currently fails
    });
  });

  describe('Variable Reference Type Validation', () => {
    it('should produce valid VariableReferenceNode structure', () => {
      const input = '@text message = [[Hello {{user.name}}!]]';
      const ast = parse(input);
      
      const directive = ast[0];
      const content = directive.values.content;
      const varRef = content.find(node => isVariableReferenceNode(node));
      
      expect(varRef).toBeDefined();
      expect(varRef.identifier).toBe('user');
      expect(varRef.fields).toBeDefined();
      expect(Array.isArray(varRef.fields)).toBe(true);
      
      // Should NOT have both valueType and isVariableReference
      expect(varRef.isVariableReference).toBeUndefined();
    });
  });

  describe('Node Type Constants', () => {
    it('should only use defined NodeType values', () => {
      // Test various inputs to ensure they only produce valid node types
      const inputs = [
        '@text val = null',
        '@text str = "string"',
        '@text section = "# Section" from [file.md]'
      ];
      
      const validNodeTypes = Object.values(NodeType);
      
      inputs.forEach(input => {
        const ast = parse(input);
        // Walk the AST and check all node types
        walkAst(ast, (node) => {
          if (node.type) {
            expect(validNodeTypes).toContain(node.type);
          }
        });
      });
    });
  });

  describe('Directive Property Placement', () => {
    it('should place source at root level when present', () => {
      const input = '@add [[template content]]';
      const ast = parse(input);
      
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