import { expect, test, describe } from 'vitest';
import { parse } from '@core/ast/parser';
import {
  isTextAssignmentDirective,
  isTextWithEmbedSource,
  isTextWithRunSource
} from '@core/ast/types/guards';

describe('Text directive with nested directives', () => {
  test('Text directive with nested add directive', async () => {
    // Test a text directive with a nested add directive
    const content = `@text content = @add "path/to/file.txt"`;
    
    const result = await parse(content);
    expect(result.ast).toHaveLength(1);
    
    const directive = result.ast[0];
    expect(directive.type).toBe('Directive');
    expect(directive.kind).toBe('text');
    expect(directive.subtype).toBe('textAssignment');
    
    // Check that it's a text assignment directive
    expect(isTextAssignmentDirective(directive)).toBe(true);
    
    // Check that the add directive is nested in the content field
    expect(isTextWithEmbedSource(directive)).toBe(true);
    
    // Check structure
    if (isTextAssignmentDirective(directive)) {
      // Check identifier
      expect(directive.values.identifier).toBeDefined();
      expect(directive.values.identifier[0].identifier).toBe('content');
      
      // Check content is a directive
      expect(Array.isArray(directive.values.content)).toBe(false);
      
      // Check nested directive
      const nestedDirective = directive.values.content as any;
      expect(nestedDirective.type).toBe('Directive');
      expect(nestedDirective.kind).toBe('add');
      expect(nestedDirective.values.path).toBeDefined();
      
      // Verify raw values
      expect(directive.raw.identifier).toBe('content');
      expect(directive.raw.content).toContain('@add');
    }
  });
  
  test('Text directive with nested run directive', async () => {
    // Test a text directive with a nested run directive
    const content = `@text result = @run [echo "Hello, world!"]`;
    
    const result = await parse(content);
    expect(result.ast).toHaveLength(1);
    
    const directive = result.ast[0];
    expect(directive.type).toBe('Directive');
    expect(directive.kind).toBe('text');
    expect(directive.subtype).toBe('textAssignment');
    
    // Check that it's a text assignment directive
    expect(isTextAssignmentDirective(directive)).toBe(true);
    
    // Check that the run directive is nested in the content field
    expect(isTextWithRunSource(directive)).toBe(true);
    
    // Check structure
    if (isTextAssignmentDirective(directive)) {
      // Check identifier
      expect(directive.values.identifier).toBeDefined();
      expect(directive.values.identifier[0].identifier).toBe('result');
      
      // Check content is a directive
      expect(Array.isArray(directive.values.content)).toBe(false);
      
      // Check nested directive
      const nestedDirective = directive.values.content as any;
      expect(nestedDirective.type).toBe('Directive');
      expect(nestedDirective.kind).toBe('run');
      expect(nestedDirective.values.command).toBeDefined();
      
      // Verify raw values
      expect(directive.raw.identifier).toBe('result');
      expect(directive.raw.content).toContain('@run');
    }
  });
  
  test('Text template directive does not use nested directives', async () => {
    // Text templates should maintain their array-based content structure
    const content = `@text greeting = [Hello, {{name}}!]`;
    
    const result = await parse(content);
    expect(result.ast).toHaveLength(1);
    
    const directive = result.ast[0];
    expect(directive.type).toBe('Directive');
    expect(directive.kind).toBe('text');
    expect(directive.subtype).toBe('textTemplate');
    
    // Check structure - should have array-based content
    if (directive.kind === 'text' && directive.subtype === 'textTemplate') {
      // Check content is an array
      expect(Array.isArray(directive.values.content)).toBe(true);
      
      // Should have text and variable nodes
      expect(directive.values.content.length).toBeGreaterThan(0);
      
      // Verify raw values
      expect(directive.raw.identifier).toBe('greeting');
      expect(directive.raw.content).toContain('Hello');
    }
  });
  
  test('Text with literal string does not use nested directives', async () => {
    // Literal strings should maintain their array-based content structure
    const content = `@text greeting = "Hello, world!"`;
    
    const result = await parse(content);
    expect(result.ast).toHaveLength(1);
    
    const directive = result.ast[0];
    expect(directive.type).toBe('Directive');
    expect(directive.kind).toBe('text');
    expect(directive.subtype).toBe('textAssignment');
    
    // Check structure - should have array-based content
    if (isTextAssignmentDirective(directive)) {
      // Check content is an array
      expect(Array.isArray(directive.values.content)).toBe(true);
      
      // Should have text nodes
      expect(directive.values.content.length).toBeGreaterThan(0);
      
      // Verify raw values
      expect(directive.raw.identifier).toBe('greeting');
      expect(directive.raw.content).toBe('"Hello, world!"');
    }
  });
});