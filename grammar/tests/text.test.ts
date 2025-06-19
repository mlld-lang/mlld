import { describe, it, expect } from 'vitest';
import { parse } from '@grammar/parser';
import { TextAssignmentDirectiveNode, TextTemplateDirectiveNode } from '@core/types/text';
import { isTextAssignmentDirective, isTextTemplateDirective } from '@core/types/guards';

describe('Text Directive Tests', () => {
  describe('Text Assignment', () => {
    it('should parse a basic text assignment', async () => {
      const parseResult = await parse('@text greeting = "Hello, world!"');
      console.log('Basic text assignment parsed result:', JSON.stringify(parseResult, null, 2));
      const result = parseResult.ast[0] as TextAssignmentDirectiveNode;
      
      expect(result.type).toBe('Directive');
      expect(result.kind).toBe('text');
      expect(result.subtype).toBe('textAssignment');
      
      // Check values
      expect(result.values.identifier).toHaveLength(1);
      expect(result.values.identifier[0].identifier).toBe('greeting');
      expect(result.values.content).toBeDefined();
      expect(result.values.content.length).toBeGreaterThan(0);
      expect(result.source).toBe('literal');
      
      // Check raw
      expect(result.raw.identifier).toBe('greeting');
      expect(result.raw.content).toBeDefined();
      
      // Type guard
      expect(isTextAssignmentDirective(result)).toBe(true);
    });
    
    it('should parse a text assignment with path', async () => {
      const result = (await parse('@text content = [./README.md]')).ast[0];
      
      expect(result.type).toBe('Directive');
      expect(result.kind).toBe('text');
      expect(result.subtype).toBe('textPath');
      
      // Check values - textPath uses 'path' not 'content'
      expect(result.values.identifier).toHaveLength(1);
      expect(result.values.identifier[0].identifier).toBe('content');
      expect(result.values.path).toBeDefined();
      expect(result.source).toBe('path');
      
      // Check meta
      expect(result.meta.sourceType).toBe('path');
      expect(result.meta.hasVariables).toBe(false);
      
      // For textPath subtype, we might need a different type guard
      // For now, just check the subtype directly
      expect(result.subtype).toBe('textPath');
    });
    
    it('should parse a text assignment with run', async () => {
      const result = (await parse('@text output = @run [(echo "Hello")]')).ast[0] as TextAssignmentDirectiveNode;
      
      expect(result.type).toBe('Directive');
      expect(result.kind).toBe('text');
      expect(result.subtype).toBe('textAssignment');
      
      // Check values
      expect(result.values.identifier).toHaveLength(1);
      expect(result.values.identifier[0].identifier).toBe('output');
      expect(result.source).toBe('run');
      
      // Check meta
      expect(result.meta.sourceType).toBe('directive');
      expect(result.meta.directive).toBe('run');
      expect(result.meta.hasVariables).toBe(false);
      
      // Type guard
      expect(isTextAssignmentDirective(result)).toBe(true);
    });
  });
  
  describe('Text Template', () => {
    it('should parse a template text with identifier assignment', async () => {
      console.log('About to parse template text with identifier assignment...');
      const parseResult = await parse('@text message = [[This is some text]]');
      console.log('Parse result:', JSON.stringify(parseResult, null, 2));
      
      const result = parseResult.ast[0] as TextTemplateDirectiveNode;
      
      expect(result.type).toBe('Directive');
      expect(result.kind).toBe('text');
      expect(result.subtype).toBe('textTemplate');
      
      // Check values
      expect(result.values.content).toBeDefined();
      expect(result.values.content.length).toBeGreaterThan(0);
      
      // Check identifier
      expect(result.values.identifier).toBeDefined();
      expect(result.values.identifier.length).toBe(1);
      expect(result.values.identifier[0].identifier).toBe('message');
      
      // Check raw
      expect(result.raw.content).toBeDefined();
      expect(result.raw.identifier).toBe('message');
      
      // Type guard
      expect(isTextTemplateDirective(result)).toBe(true);
    });
    
    it('should parse a template text with variable interpolation', async () => {
      console.log('About to parse template text with variable interpolation...');
      const parseResult = await parse('@text greeting = [[Hello, {{name}}!]]');
      console.log('Parse result with interpolation:', JSON.stringify(parseResult, null, 2));
      
      const result = parseResult.ast[0] as TextTemplateDirectiveNode;
      
      expect(result.type).toBe('Directive');
      expect(result.kind).toBe('text');
      expect(result.subtype).toBe('textTemplate');
      
      // Check values
      expect(result.values.content).toBeDefined();
      expect(result.values.content.length).toBe(3); // Should have 3 parts: text, variable, text
      
      // Check identifier
      expect(result.values.identifier).toBeDefined();
      expect(result.values.identifier.length).toBe(1);
      expect(result.values.identifier[0].identifier).toBe('greeting');
      
      // Check that the second item is a variable reference
      expect(result.values.content[1].type).toBe('VariableReference');
      expect(result.values.content[1].valueType).toBe('varInterpolation');
      expect(result.values.content[1].identifier).toBe('name');
      
      // Check raw
      expect(result.raw.content).toBeDefined();
      expect(result.raw.identifier).toBe('greeting');
      
      // Type guard
      expect(isTextTemplateDirective(result)).toBe(true);
    });
    
    it('should reject a template text without an identifier', async () => {
      // A text directive without an identifier should be rejected as invalid syntax
      const result = await parse('@text [[This is invalid syntax]]');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});