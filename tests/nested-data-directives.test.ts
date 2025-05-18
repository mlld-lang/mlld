import { expect, test, describe } from 'vitest';
import { parse } from '@core/ast/parser';
import {
  isDataAssignmentDirective,
  isDataWithNestedDirective,
  isDataWithNestedEmbedDirective,
  isDataWithNestedRunDirective,
  hasDirectiveProperty,
  hasNestedDirectiveOfKind
} from '@core/ast/types/guards';
import {
  isDataObjectValue,
  isDataArrayValue,
  isDirectiveValue
} from '@core/ast/types/data';

describe('Data directive with nested directives', () => {
  test('Data directive with direct nested add directive', async () => {
    // Test a data directive with a direct nested add directive
    const content = `@data config = @add "path/to/config.json"`;
    
    const result = await parse(content);
    expect(result.ast).toHaveLength(1);
    
    const directive = result.ast[0];
    expect(directive.type).toBe('Directive');
    expect(directive.kind).toBe('data');
    expect(directive.subtype).toBe('dataAssignment');
    
    // Check that it's a data assignment directive
    expect(isDataAssignmentDirective(directive)).toBe(true);
    
    // Check that the add directive is nested directly in the value field
    expect(isDataWithNestedDirective(directive)).toBe(true);
    expect(isDataWithNestedEmbedDirective(directive)).toBe(true);
    
    // Check structure
    if (isDataAssignmentDirective(directive)) {
      // Check identifier
      expect(directive.values.identifier).toBeDefined();
      expect(directive.values.identifier[0].identifier).toBe('config');
      
      // Check value is a directive
      expect(isDirectiveValue(directive.values.value)).toBe(true);
      
      if (isDirectiveValue(directive.values.value)) {
        // Check nested directive
        const nestedDirective = directive.values.value;
        expect(nestedDirective.type).toBe('Directive');
        expect(nestedDirective.kind).toBe('add');
        expect(nestedDirective.values.path).toBeDefined();
      }
      
      // Verify raw values
      expect(directive.raw.identifier).toBe('config');
      expect(directive.raw.value).toContain('@add');
    }
  });
  
  test('Data directive with direct nested run directive', async () => {
    // Test a data directive with a direct nested run directive
    const content = `@data info = @run [echo "System info"]`;
    
    const result = await parse(content);
    expect(result.ast).toHaveLength(1);
    
    const directive = result.ast[0];
    expect(directive.type).toBe('Directive');
    expect(directive.kind).toBe('data');
    expect(directive.subtype).toBe('dataAssignment');
    
    // Check that it's a data assignment directive
    expect(isDataAssignmentDirective(directive)).toBe(true);
    
    // Check that the run directive is nested directly in the value field
    expect(isDataWithNestedDirective(directive)).toBe(true);
    expect(isDataWithNestedRunDirective(directive)).toBe(true);
    
    // Check structure
    if (isDataAssignmentDirective(directive)) {
      // Check identifier
      expect(directive.values.identifier).toBeDefined();
      expect(directive.values.identifier[0].identifier).toBe('info');
      
      // Check value is a directive
      expect(isDirectiveValue(directive.values.value)).toBe(true);
      
      if (isDirectiveValue(directive.values.value)) {
        // Check nested directive
        const nestedDirective = directive.values.value;
        expect(nestedDirective.type).toBe('Directive');
        expect(nestedDirective.kind).toBe('run');
        expect(nestedDirective.values.command).toBeDefined();
      }
      
      // Verify raw values
      expect(directive.raw.identifier).toBe('info');
      expect(directive.raw.value).toContain('@run');
    }
  });
  
  test('Data object with nested directive in property', async () => {
    // Test a data directive with an object that has a nested directive in a property
    const content = `@data config = {
      "content": @add "path/to/file.md",
      "name": "Test Config"
    }`;
    
    const result = await parse(content);
    expect(result.ast).toHaveLength(1);
    
    const directive = result.ast[0];
    expect(directive.type).toBe('Directive');
    expect(directive.kind).toBe('data');
    expect(directive.subtype).toBe('dataAssignment');
    
    // Check that it's a data assignment directive
    expect(isDataAssignmentDirective(directive)).toBe(true);
    
    if (isDataAssignmentDirective(directive)) {
      // Check value is an object
      expect(isDataObjectValue(directive.values.value)).toBe(true);
      
      if (isDataObjectValue(directive.values.value)) {
        // Check that it has properties
        expect(directive.values.value.properties).toBeDefined();
        
        // Check that the content property has a directive
        expect(hasDirectiveProperty(directive, 'content')).toBe(true);
        
        // Check the content property is an add directive
        const contentProp = directive.values.value.properties['content'];
        expect(isDirectiveValue(contentProp)).toBe(true);
        
        if (isDirectiveValue(contentProp)) {
          // Check nested directive
          expect(contentProp.type).toBe('Directive');
          expect(contentProp.kind).toBe('add');
          expect(contentProp.values.path).toBeDefined();
        }
        
        // Check the name property is a regular value
        const nameProp = directive.values.value.properties['name'];
        expect(nameProp).toBe('Test Config');
      }
      
      // General check for nested directives of a specific kind
      expect(hasNestedDirectiveOfKind(directive, 'add')).toBe(true);
    }
  });
  
  test('Data array with nested directives as items', async () => {
    // Test a data directive with an array that has nested directives as items
    const content = `@data results = [
      @add "report1.json",
      @run [echo "Report 2"],
      "Static Item"
    ]`;
    
    const result = await parse(content);
    expect(result.ast).toHaveLength(1);
    
    const directive = result.ast[0];
    expect(directive.type).toBe('Directive');
    expect(directive.kind).toBe('data');
    expect(directive.subtype).toBe('dataAssignment');
    
    // Check that it's a data assignment directive
    expect(isDataAssignmentDirective(directive)).toBe(true);
    
    if (isDataAssignmentDirective(directive)) {
      // Check value is an array
      expect(isDataArrayValue(directive.values.value)).toBe(true);
      
      if (isDataArrayValue(directive.values.value)) {
        // Check that it has items
        expect(directive.values.value.items).toBeDefined();
        expect(directive.values.value.items.length).toBe(3);
        
        // Check first item is an add directive
        const item0 = directive.values.value.items[0];
        expect(isDirectiveValue(item0)).toBe(true);
        
        if (isDirectiveValue(item0)) {
          // Check nested directive
          expect(item0.type).toBe('Directive');
          expect(item0.kind).toBe('add');
          expect(item0.values.path).toBeDefined();
        }
        
        // Check second item is a run directive
        const item1 = directive.values.value.items[1];
        expect(isDirectiveValue(item1)).toBe(true);
        
        if (isDirectiveValue(item1)) {
          // Check nested directive
          expect(item1.type).toBe('Directive');
          expect(item1.kind).toBe('run');
          expect(item1.values.command).toBeDefined();
        }
        
        // Check third item is a static string
        const item2 = directive.values.value.items[2];
        expect(item2).toBe('Static Item');
      }
      
      // General check for nested directives of specific kinds
      expect(hasNestedDirectiveOfKind(directive, 'add')).toBe(true);
      expect(hasNestedDirectiveOfKind(directive, 'run')).toBe(true);
    }
  });
  
  test('Complex data structure with nested directives', async () => {
    // Test a complex data structure with directives at different levels
    const content = `@data dashboard = {
      "header": "System Dashboard",
      "content": @add "dashboard.md",
      "sections": [
        {
          "title": "System Info",
          "data": @run [uname -a]
        },
        {
          "title": "Usage Stats",
          "data": @run [df -h]
        }
      ]
    }`;
    
    const result = await parse(content);
    expect(result.ast).toHaveLength(1);
    
    const directive = result.ast[0];
    expect(directive.type).toBe('Directive');
    expect(directive.kind).toBe('data');
    expect(directive.subtype).toBe('dataAssignment');
    
    // Check that it's a data assignment directive
    expect(isDataAssignmentDirective(directive)).toBe(true);
    
    if (isDataAssignmentDirective(directive)) {
      // Check value is an object
      expect(isDataObjectValue(directive.values.value)).toBe(true);
      
      if (isDataObjectValue(directive.values.value)) {
        // Check that it has properties
        expect(directive.values.value.properties).toBeDefined();
        
        // Check that the content property has a directive
        expect(hasDirectiveProperty(directive, 'content')).toBe(true);
        
        // Check the sections property is an array
        const sectionsProp = directive.values.value.properties['sections'];
        expect(isDataArrayValue(sectionsProp)).toBe(true);
        
        if (isDataArrayValue(sectionsProp)) {
          // Check the sections array has 2 items
          expect(sectionsProp.items.length).toBe(2);
          
          // Check both items are objects
          expect(isDataObjectValue(sectionsProp.items[0])).toBe(true);
          expect(isDataObjectValue(sectionsProp.items[1])).toBe(true);
          
          if (isDataObjectValue(sectionsProp.items[0])) {
            // Check first section has a run directive in data property
            const dataProp = sectionsProp.items[0].properties['data'];
            expect(isDirectiveValue(dataProp)).toBe(true);
            
            if (isDirectiveValue(dataProp)) {
              // Check nested directive
              expect(dataProp.type).toBe('Directive');
              expect(dataProp.kind).toBe('run');
            }
          }
        }
      }
      
      // General check for nested directives of specific kinds
      expect(hasNestedDirectiveOfKind(directive, 'add')).toBe(true);
      expect(hasNestedDirectiveOfKind(directive, 'run')).toBe(true);
    }
  });
});