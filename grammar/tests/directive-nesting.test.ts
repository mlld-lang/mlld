import { describe, test, expect } from 'vitest';
import { parse } from '@core/ast/parser';

describe('Directive Nesting Tests', () => {
  test('Text directive with nested embed directive', async () => {
    const content = `@text content = @embed [path/to/file.txt]`;
    
    const result = await parse(content);
    expect(result.ast).toHaveLength(1);
    
    const directive = result.ast[0];
    console.log('Text directive parse result:');
    console.log(JSON.stringify(directive, null, 2));
    
    expect(directive.type).toBe('Directive');
    expect(directive.kind).toBe('text');
    expect(directive.subtype).toBe('textAssignment');
    
    // Check for Directive structure
    if (directive.type === 'Directive') {
      expect(directive.values).toBeDefined();
      console.log('Directive values:', directive.values);
      
      if (directive.values && directive.values.content) {
        console.log('Content value:', directive.values.content);
        
        // Verify the nested directive structure
        expect(directive.values.content).toHaveProperty('directive');
        expect(directive.values.content.directive.kind).toBe('embed');
        expect(directive.values.source).toBe('directive');
      }
    }
  });
  
  test('Text directive with nested run directive', async () => {
    const content = `@text result = @run [echo "Hello world"]`;
    
    const result = await parse(content);
    expect(result.ast).toHaveLength(1);
    
    const directive = result.ast[0];
    
    expect(directive.type).toBe('Directive');
    expect(directive.kind).toBe('text');
    
    // Check for Directive structure
    if (directive.type === 'Directive') {
      expect(directive.values).toBeDefined();
      
      if (directive.values && directive.values.content) {
        // Verify the nested directive structure
        expect(directive.values.content).toHaveProperty('directive');
        expect(directive.values.content.directive.kind).toBe('run');
        expect(directive.values.source).toBe('directive');
      }
    }
  });
  
  test('Data directive with nested embed directive', async () => {
    const content = `@data config = @embed [path/to/config.json]`;
    
    const result = await parse(content);
    expect(result.ast).toHaveLength(1);
    
    const directive = result.ast[0];
    console.log('Data directive parse result:');
    console.log(JSON.stringify(directive, null, 2));
    
    expect(directive.type).toBe('Directive');
    expect(directive.kind).toBe('data');
    
    // Check for Directive structure
    if (directive.type === 'Directive') {
      expect(directive.values).toBeDefined();
      console.log('Directive values:', directive.values);
      
      if (directive.values && directive.values.value) {
        console.log('Value field:', directive.values.value);
        
        // Verify the nested directive structure
        expect(directive.values.value).toHaveProperty('directive');
        expect(directive.values.value.directive.kind).toBe('embed');
      }
    }
  });
  
  test('Data directive with nested run directive', async () => {
    const content = `@data result = @run [ls -la]`;
    
    const result = await parse(content);
    expect(result.ast).toHaveLength(1);
    
    const directive = result.ast[0];
    
    expect(directive.type).toBe('Directive');
    expect(directive.kind).toBe('data');
    
    // Check for Directive structure
    if (directive.type === 'Directive') {
      expect(directive.values).toBeDefined();
      
      if (directive.values && directive.values.value) {
        // Verify the nested directive structure
        expect(directive.values.value).toHaveProperty('directive');
        expect(directive.values.value.directive.kind).toBe('run');
      }
    }
  });
  
  // TODO: Support nested directives in data objects and arrays in future implementation
  test.skip('Data directive with object containing nested embed directive', async () => {
    const content = `@data dashboard = { "content": @embed [path/to/content.md] }`;
    
    const result = await parse(content);
    expect(result.ast).toHaveLength(1);
    
    const directive = result.ast[0];
    console.log('Data object directive parse result:');
    console.log(JSON.stringify(directive, null, 2));
    
    expect(directive.type).toBe('Directive');
    expect(directive.kind).toBe('data');
    
    // Check for Directive structure
    if (directive.type === 'Directive') {
      expect(directive.values).toBeDefined();
      
      if (directive.values && directive.values.value) {
        expect(directive.values.value).toHaveProperty('type', 'object');
        expect(directive.values.value).toHaveProperty('properties');
        
        const properties = directive.values.value.properties;
        expect(properties).toHaveProperty('content');
        
        // Verify that the object property contains a nested directive
        const contentProperty = properties.content;
        expect(contentProperty).toHaveProperty('directive');
        expect(contentProperty.directive.kind).toBe('embed');
      }
    }
  });
  
  // TODO: Support nested directives in data arrays in future implementation
  test.skip('Data directive with array containing nested embed directive', async () => {
    const content = `@data items = [ @embed [path/to/items.json] ]`;
    
    const result = await parse(content);
    expect(result.ast).toHaveLength(1);
    
    const directive = result.ast[0];
    console.log('Data array directive parse result:');
    console.log(JSON.stringify(directive, null, 2));
    
    expect(directive.type).toBe('Directive');
    expect(directive.kind).toBe('data');
    
    // Check for Directive structure
    if (directive.type === 'Directive') {
      expect(directive.values).toBeDefined();
      
      if (directive.values && directive.values.value) {
        expect(directive.values.value).toHaveProperty('type', 'array');
        expect(directive.values.value).toHaveProperty('items');
        expect(Array.isArray(directive.values.value.items)).toBe(true);
        
        // Verify that the array contains a nested directive
        const firstItem = directive.values.value.items[0];
        expect(firstItem).toHaveProperty('directive');
        expect(firstItem.directive.kind).toBe('embed');
      }
    }
  });
});