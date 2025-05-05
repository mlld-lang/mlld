import { describe, expect, test } from 'vitest';
import { parse } from '@core/ast/parser';

// Helper function to log all keys and check if values are arrays
function checkValuesAreArrays(directive) {
  console.log('Values object keys and types:');
  for (const key in directive.values) {
    const value = directive.values[key];
    const isArray = Array.isArray(value);
    const type = isArray ? `Array[${value.length}]` : typeof value;
    console.log(`- ${key}: ${type}`);
  }
  return directive;
}

describe('Add Directive', () => {
  // ====================
  // AddPath Tests
  // ====================
  
  test('Basic path add', async () => {
    const content = `@add "$PROJECTPATH/README.md"`;
    const parseResult = await parse(content);
    
    // Log the structure for debugging
    console.log('Add Path Directive Structure:', JSON.stringify(parseResult.ast[0], null, 2));
    
    // Get the directive from the parse result (should be the first node)
    const directiveNode = parseResult.ast[0];
    
    // Log the values structure
    checkValuesAreArrays(directiveNode);
    
    // Verify we have a directive node
    expect(directiveNode.type).toBe('Directive');
    
    // Verify structure of the new format
    expect(directiveNode.kind).toBe('add');
    expect(directiveNode.subtype).toBe('addPath');
    
    // Check values structure
    expect(directiveNode.values).toHaveProperty('path');
    
    // Check path metadata
    expect(directiveNode.meta.path).toHaveProperty('isAbsolute');
    expect(directiveNode.meta.path).toHaveProperty('hasVariables');
  });
  
  test('Path add with section', async () => {
    const content = `@add "guide.md # Getting Started"`;
    const parseResult = await parse(content);
    
    // Log the structure for debugging
    console.log('Add Path with Section Structure:', JSON.stringify(parseResult.ast[0], null, 2));
    
    // Get the directive from the parse result (should be the first node)
    const directiveNode = parseResult.ast[0];
    
    // Verify structure
    expect(directiveNode.type).toBe('Directive');
    expect(directiveNode.kind).toBe('add');
    expect(directiveNode.subtype).toBe('addPath');
    
    // Check values structure
    expect(directiveNode.values).toHaveProperty('path');
    
    // In the current simplified tests just verify that node exists, not the specific values
  });
  
  test('Path add with headerLevel', async () => {
    const content = `@add "README.md" as ###`;
    const parseResult = await parse(content);
    
    // Get the directive from the parse result (should be the first node)
    const directiveNode = parseResult.ast[0];
    
    // Verify structure
    expect(directiveNode.type).toBe('Directive');
    expect(directiveNode.kind).toBe('add');
    expect(directiveNode.subtype).toBe('addPath');
    
    // Check values structure
    expect(directiveNode.values).toHaveProperty('path');
    expect(directiveNode.values).toHaveProperty('headerLevel');
    expect(directiveNode.values.headerLevel[0].value).toBe(3);
    
    // Check raw structure
    expect(directiveNode.raw).toHaveProperty('headerLevel');
    expect(directiveNode.raw.headerLevel).toBe('###');
  });
  
  test('Path add with underHeader', async () => {
    const content = `@add "code.js" under Example Code`;
    const parseResult = await parse(content);
    
    // Get the directive from the parse result (should be the first node)
    const directiveNode = parseResult.ast[0];
    
    // Verify structure
    expect(directiveNode.type).toBe('Directive');
    expect(directiveNode.kind).toBe('add');
    expect(directiveNode.subtype).toBe('addPath');
    
    // Check values structure
    expect(directiveNode.values).toHaveProperty('path');
    expect(directiveNode.values).toHaveProperty('underHeader');
    expect(Array.isArray(directiveNode.values.underHeader)).toBe(true);
    expect(directiveNode.values.underHeader[0].content).toBe('Example Code');
    
    // Check raw structure
    expect(directiveNode.raw).toHaveProperty('underHeader');
    expect(directiveNode.raw.underHeader).toBe('Example Code');
  });
  
  test('Complex path add with all modifiers', async () => {
    const content = `@add "$PROJECTPATH/doc.md # API Reference" as ## under API Documentation`;
    const parseResult = await parse(content);
    
    // Log the structure for debugging
    console.log('Complex Path Structure:', JSON.stringify(parseResult.ast[0], null, 2));
    
    // Get the directive from the parse result (should be the first node)
    const directiveNode = parseResult.ast[0];
    
    // Verify structure
    expect(directiveNode.type).toBe('Directive');
    expect(directiveNode.kind).toBe('add');
    expect(directiveNode.subtype).toBe('addPath');
    
    // Check values structure
    expect(directiveNode.values).toHaveProperty('path');
    expect(directiveNode.values).toHaveProperty('headerLevel');
    expect(directiveNode.values).toHaveProperty('underHeader');
    
    // Check values content
    expect(directiveNode.values.headerLevel[0].value).toBe(2);
    expect(directiveNode.values.underHeader[0].content).toBe('API Documentation');
    
    // Check raw structure
    expect(directiveNode.raw).toHaveProperty('headerLevel');
    expect(directiveNode.raw).toHaveProperty('underHeader');
    
    // Check raw content for header elements only for now
    expect(directiveNode.raw.headerLevel).toBe('##');
    expect(directiveNode.raw.underHeader).toBe('API Documentation');
  });
  
  // ====================
  // AddTemplate Tests
  // ====================
  
  test('Basic template add', async () => {
    const content = `@add [# Template Content]`;
    const parseResult = await parse(content);
    
    // Log the structure for debugging
    console.log('Add Template Directive Structure:', JSON.stringify(parseResult.ast[0], null, 2));
    
    // Get the directive from the parse result (should be the first node)
    const directiveNode = parseResult.ast[0];
    
    // Verify structure
    expect(directiveNode.type).toBe('Directive');
    expect(directiveNode.kind).toBe('add');
    expect(directiveNode.subtype).toBe('addTemplate');
    
    // Check values structure
    expect(directiveNode.values).toHaveProperty('content');
    expect(Array.isArray(directiveNode.values.content)).toBe(true);
    
    // Check meta structure
    expect(directiveNode.meta).toHaveProperty('isTemplateContent');
    expect(directiveNode.meta.isTemplateContent).toBe(true);
  });
  
  test('Template add with variable interpolation', async () => {
    const content = `@add [Hello {{name}}!]`;
    const parseResult = await parse(content);
    
    // Get the directive from the parse result (should be the first node)
    const directiveNode = parseResult.ast[0];
    
    // Verify structure
    expect(directiveNode.type).toBe('Directive');
    expect(directiveNode.kind).toBe('add');
    expect(directiveNode.subtype).toBe('addTemplate');
    
    // Check values structure
    expect(directiveNode.values).toHaveProperty('content');
    expect(Array.isArray(directiveNode.values.content)).toBe(true);
    
    // Verify content includes variable nodes - may need to adapt based on actual structure
    const contentText = directiveNode.raw.content;
    expect(contentText.includes('{{name}}')).toBe(true);
  });
  
  test('Template add with headerLevel', async () => {
    const content = `@add [# Content] as ##`;
    const parseResult = await parse(content);
    
    // Get the directive from the parse result (should be the first node)
    const directiveNode = parseResult.ast[0];
    
    // Verify structure
    expect(directiveNode.type).toBe('Directive');
    expect(directiveNode.kind).toBe('add');
    expect(directiveNode.subtype).toBe('addTemplate');
    
    // Check values structure
    expect(directiveNode.values).toHaveProperty('content');
    expect(directiveNode.values).toHaveProperty('headerLevel');
    expect(directiveNode.values.headerLevel[0].value).toBe(2);
    
    // Check raw structure
    expect(directiveNode.raw).toHaveProperty('headerLevel');
    expect(directiveNode.raw.headerLevel).toBe('##');
  });
  
  // ====================
  // AddVariable Tests
  // ====================
  
  test('Basic variable add', async () => {
    const content = `@add {{content}}`;
    const parseResult = await parse(content);
    
    // Log the structure for debugging
    console.log('Add Variable Directive Structure:', JSON.stringify(parseResult.ast[0], null, 2));
    
    // Get the directive from the parse result (should be the first node)
    const directiveNode = parseResult.ast[0];
    
    // Verify structure
    expect(directiveNode.type).toBe('Directive');
    expect(directiveNode.kind).toBe('add');
    expect(directiveNode.subtype).toBe('addVariable');
    
    // Check values structure
    expect(directiveNode.values).toHaveProperty('variable');
    expect(Array.isArray(directiveNode.values.variable)).toBe(true);
    expect(directiveNode.values.variable[0].identifier).toBe('content');
  });
  
  test('Variable add with headerLevel and underHeader', async () => {
    const content = `@add {{document}} as ## under Documentation`;
    const parseResult = await parse(content);
    
    // Get the directive from the parse result (should be the first node)
    const directiveNode = parseResult.ast[0];
    
    // Verify structure
    expect(directiveNode.type).toBe('Directive');
    expect(directiveNode.kind).toBe('add');
    expect(directiveNode.subtype).toBe('addVariable');
    
    // Check values structure
    expect(directiveNode.values).toHaveProperty('variable');
    expect(directiveNode.values).toHaveProperty('headerLevel');
    expect(directiveNode.values).toHaveProperty('underHeader');
    
    // Check values content
    expect(directiveNode.values.variable[0].identifier).toBe('document');
    expect(directiveNode.values.headerLevel[0].value).toBe(2);
    expect(directiveNode.values.underHeader[0].content).toBe('Documentation');
    
    // Check raw structure
    expect(directiveNode.raw).toHaveProperty('headerLevel');
    expect(directiveNode.raw).toHaveProperty('underHeader');
  });
  
  // ====================
  // Multiline Template Test
  // ====================
  
  test('Multiline template add', async () => {
    const content = `@add [
# Multiline Content
- Item 1
- Item 2
]`;
    const parseResult = await parse(content);
    
    // Log the structure for debugging
    console.log('Add Multiline Template Structure:', JSON.stringify(parseResult.ast[0], null, 2));
    
    // Get the directive from the parse result (should be the first node)
    const directiveNode = parseResult.ast[0];
    
    // Verify structure
    expect(directiveNode.type).toBe('Directive');
    expect(directiveNode.kind).toBe('add');
    expect(directiveNode.subtype).toBe('addTemplate');
    
    // Check values structure
    expect(directiveNode.values).toHaveProperty('content');
    expect(Array.isArray(directiveNode.values.content)).toBe(true);
    
    // Check raw structure
    expect(directiveNode.raw).toHaveProperty('content');
    // Verify content includes expected text
    const contentText = directiveNode.raw.content;
    expect(contentText.includes('# Multiline Content')).toBe(true);
    expect(contentText.includes('- Item 1')).toBe(true);
    expect(contentText.includes('- Item 2')).toBe(true);
  });
});