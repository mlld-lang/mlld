import { describe, it, expect } from 'vitest';
import { parse } from '@core/ast/parser';
import { TextAssignmentDirectiveNode, TextTemplateDirectiveNode } from '../types/text';
import { isTextAssignmentDirective, isTextTemplateDirective } from '../types/guards';

describe('Text Directive Tests', () => {
  describe('Text Assignment', () => {
    it('should parse a basic text assignment', async () => {
      const parseResult = await parse('@text greeting = "Hello, world!"');
      console.log("Basic text assignment parsed result:", JSON.stringify(parseResult, null, 2));
      const result = parseResult.ast[0] as TextAssignmentDirectiveNode;
      
      expect(result.type).toBe('Directive');
      expect(result.kind).toBe('text');
      expect(result.subtype).toBe('textAssignment');
      
      // Check values
      expect(result.values.identifier).toHaveLength(1);
      expect(result.values.identifier[0].identifier).toBe('greeting');
      expect(result.values.content).toBeDefined();
      expect(result.values.content.length).toBeGreaterThan(0);
      expect(result.values.source).toBe('literal');
      
      // Check raw
      expect(result.raw.identifier).toBe('greeting');
      expect(result.raw.content).toBeDefined();
      
      // Type guard
      expect(isTextAssignmentDirective(result)).toBe(true);
    });
    
    it('should parse a text assignment with embed', async () => {
      const result = (await parse('text content = @embed ./README.md')).ast[0] as TextAssignmentDirectiveNode;
      
      expect(result.type).toBe('Directive');
      expect(result.kind).toBe('text');
      expect(result.subtype).toBe('textAssignment');
      
      // Check values
      expect(result.values.identifier).toHaveLength(1);
      expect(result.values.identifier[0].identifier).toBe('content');
      expect(result.values.source).toBe('embed');
      
      // Check meta
      expect(result.meta.embed).toBeDefined();
      
      // Type guard
      expect(isTextAssignmentDirective(result)).toBe(true);
    });
    
    it('should parse a text assignment with run', async () => {
      const result = (await parse('text output = @run echo "Hello"')).ast[0] as TextAssignmentDirectiveNode;
      
      expect(result.type).toBe('Directive');
      expect(result.kind).toBe('text');
      expect(result.subtype).toBe('textAssignment');
      
      // Check values
      expect(result.values.identifier).toHaveLength(1);
      expect(result.values.identifier[0].identifier).toBe('output');
      expect(result.values.source).toBe('run');
      
      // Check meta
      expect(result.meta.run).toBeDefined();
      
      // Type guard
      expect(isTextAssignmentDirective(result)).toBe(true);
    });
    
    it('should parse a text assignment with call', async () => {
      const result = (await parse('text response = @call api.fetchData "param"')).ast[0] as TextAssignmentDirectiveNode;
      
      expect(result.type).toBe('Directive');
      expect(result.kind).toBe('text');
      expect(result.subtype).toBe('textAssignment');
      
      // Check values
      expect(result.values.identifier).toHaveLength(1);
      expect(result.values.identifier[0].identifier).toBe('response');
      expect(result.values.source).toBe('call');
      
      // Check meta
      expect(result.meta.call).toBeDefined();
      expect(result.meta.call.api).toBe('api');
      expect(result.meta.call.method).toBe('fetchData');
      
      // Type guard
      expect(isTextAssignmentDirective(result)).toBe(true);
    });
  });
  
  describe('Text Template', () => {
    it('should parse a basic template text', async () => {
      const result = (await parse('text [This is some text]')).ast[0] as TextTemplateDirectiveNode;
      
      expect(result.type).toBe('Directive');
      expect(result.kind).toBe('text');
      expect(result.subtype).toBe('textTemplate');
      
      // Check values
      expect(result.values.content).toBeDefined();
      expect(result.values.content.length).toBeGreaterThan(0);
      
      // Check raw
      expect(result.raw.content).toBeDefined();
      
      // Type guard
      expect(isTextTemplateDirective(result)).toBe(true);
    });
  });
});