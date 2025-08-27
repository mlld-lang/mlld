import { describe, expect, test } from 'vitest';
import { parse } from '@grammar/parser';

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
    const content = `/show <@base/README.md>`;
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
    expect(directiveNode.kind).toBe('show');
    expect(directiveNode.subtype).toBe('showLoadContent');
    
    // Check values structure
    expect(directiveNode.values).toHaveProperty('loadContent');
    
    // Check path metadata
    expect(directiveNode.meta.sourceType).toBe('path');
  });
  
  // This test is replaced by the new AddSection tests
  // The old syntax @add [file.md # header] is deprecated
  
  test('Path add with headerLevel', async () => {
    const content = `/show <README.md> as "###"`;
    const parseResult = await parse(content);
    
    // Get the directive from the parse result (should be the first node)
    const directiveNode = parseResult.ast[0];
    
    // Verify structure
    expect(directiveNode.type).toBe('Directive');
    expect(directiveNode.kind).toBe('show');
    expect(directiveNode.subtype).toBe('showLoadContent');
    
    // Check values structure
    expect(directiveNode.values).toHaveProperty('loadContent');
    expect(directiveNode.values).toHaveProperty('newTitle');
    
    // Check that newTitle contains the expected content
    expect(directiveNode.values.newTitle[0].content).toBe('###');
  });
  
  test('Path add with underHeader', async () => {
    const content = `/show <code.js> under "Example Code"`;
    const parseResult = await parse(content);
    
    // Get the directive from the parse result (should be the first node)
    const directiveNode = parseResult.ast[0];
    
    // Verify structure
    expect(directiveNode.type).toBe('Directive');
    expect(directiveNode.kind).toBe('show');
    expect(directiveNode.subtype).toBe('showLoadContent');
    
    // Check values structure
    expect(directiveNode.values).toHaveProperty('loadContent');
    
    // Check raw structure
    expect(directiveNode.raw).toHaveProperty('loadContent');
  });
  
  test('Complex path add with all modifiers', async () => {
    // Updated to use separate path with no section
    const content = `/show <@base/doc.md> as "##" under "API Documentation"`;
    const parseResult = await parse(content);
    
    // Log the structure for debugging
    console.log('Complex Path Structure:', JSON.stringify(parseResult.ast[0], null, 2));
    
    // Get the directive from the parse result (should be the first node)
    const directiveNode = parseResult.ast[0];
    
    // Verify structure
    expect(directiveNode.type).toBe('Directive');
    expect(directiveNode.kind).toBe('show');
    expect(directiveNode.subtype).toBe('showLoadContent');
    
    // Check values structure
    expect(directiveNode.values).toHaveProperty('loadContent');
    expect(directiveNode.values).toHaveProperty('newTitle');
    
    // Check that newTitle contains the expected content
    expect(directiveNode.values.newTitle[0].content).toBe('##');
  });
  
  test('Complex section add with new title', async () => {
    // The new recommended syntax for section extraction with a new title
    const content = `/show <@base/doc.md # API Reference> as "## API"`;
    const parseResult = await parse(content);
    
    // Get the directive from the parse result
    const directiveNode = parseResult.ast[0];
    
    // Verify structure
    expect(directiveNode.type).toBe('Directive');
    expect(directiveNode.kind).toBe('show');
    expect(directiveNode.subtype).toBe('showLoadContent');
    
    // Check values structure
    expect(directiveNode.values).toHaveProperty('loadContent');
    expect(directiveNode.values).toHaveProperty('newTitle');
    
    // Check that section is in the loadContent options
    expect(directiveNode.values.loadContent.options).toHaveProperty('section');
    expect(directiveNode.values.loadContent.options.section.identifier.content).toBe('API Reference');
    
    // Check raw properties
    expect(directiveNode.raw).toHaveProperty('newTitle');
    expect(directiveNode.raw.newTitle).toBe('## API');
  });
  
  // ====================
  // AddTemplate Tests
  // ====================
  
  test('Basic template add', async () => {
    const content = `/show ::# Template Content::`;
    const parseResult = await parse(content);
    
    // Log the structure for debugging
    console.log('Add Template Directive Structure:', JSON.stringify(parseResult.ast[0], null, 2));
    
    // Get the directive from the parse result (should be the first node)
    const directiveNode = parseResult.ast[0];
    
    // Verify structure
    expect(directiveNode.type).toBe('Directive');
    expect(directiveNode.kind).toBe('show');
    expect(directiveNode.subtype).toBe('showTemplate');
    
    // Check values structure
    expect(directiveNode.values).toHaveProperty('content');
    expect(Array.isArray(directiveNode.values.content)).toBe(true);
    
    // Check meta structure
    expect(directiveNode.meta).toHaveProperty('isTemplateContent');
    expect(directiveNode.meta.isTemplateContent).toBe(true);
  });
  
  test('Template add with variable interpolation', async () => {
    const content = `/show :::Hello {{name}}!:::`;
    const parseResult = await parse(content);
    
    // Get the directive from the parse result (should be the first node)
    const directiveNode = parseResult.ast[0];
    
    // Verify structure
    expect(directiveNode.type).toBe('Directive');
    expect(directiveNode.kind).toBe('show');
    expect(directiveNode.subtype).toBe('showTemplate');
    
    // Check values structure
    expect(directiveNode.values).toHaveProperty('content');
    expect(Array.isArray(directiveNode.values.content)).toBe(true);
    
    // Verify content includes variable nodes - {{name}} should be preserved in raw
    const contentText = directiveNode.raw.content;
    expect(contentText.includes('{{name}}')).toBe(true);
  });
  
  test('Template add with headerLevel', async () => {
    const content = `/show ::# Content:: as ##`;
    const parseResult = await parse(content);
    
    // Get the directive from the parse result (should be the first node)
    const directiveNode = parseResult.ast[0];
    
    // Verify structure
    expect(directiveNode.type).toBe('Directive');
    expect(directiveNode.kind).toBe('show');
    expect(directiveNode.subtype).toBe('showTemplate');
    
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
    const content = `/show @content`;
    const parseResult = await parse(content);
    
    // Log the structure for debugging
    console.log('Add Variable Directive Structure:', JSON.stringify(parseResult.ast[0], null, 2));
    
    // Get the directive from the parse result (should be the first node)
    const directiveNode = parseResult.ast[0];
    
    // Verify structure
    expect(directiveNode.type).toBe('Directive');
    expect(directiveNode.kind).toBe('show');
    expect(directiveNode.subtype).toBe('showVariable');
    
    // Check values structure - now uses invocation instead of variable
    expect(directiveNode.values).toHaveProperty('invocation');
    expect(directiveNode.values.invocation).toBeDefined();
    expect(directiveNode.values.invocation.identifier).toBe('content');
  });
  
  test('Variable add with headerLevel and underHeader', async () => {
    const content = `/show @document as ## under Documentation`;
    const parseResult = await parse(content);
    
    // Get the directive from the parse result (should be the first node)
    const directiveNode = parseResult.ast[0];
    
    // Verify structure
    expect(directiveNode.type).toBe('Directive');
    expect(directiveNode.kind).toBe('show');
    expect(directiveNode.subtype).toBe('showVariable');
    
    // Check values structure - now uses invocation instead of variable
    expect(directiveNode.values).toHaveProperty('invocation');
    expect(directiveNode.values).toHaveProperty('headerLevel');
    expect(directiveNode.values).toHaveProperty('underHeader');
    
    // Check values content - now uses invocation instead of variable
    expect(directiveNode.values.invocation.identifier).toBe('document');
    expect(directiveNode.values.headerLevel[0].value).toBe(2);
    expect(directiveNode.values.underHeader[0].content).toBe('Documentation');
    
    // Check raw structure
    expect(directiveNode.raw).toHaveProperty('headerLevel');
    expect(directiveNode.raw).toHaveProperty('underHeader');
  });
  
  // ====================
  // AddSection Tests
  // ====================
  
  test('Basic section add', async () => {
    const content = `/show <document.md # Header Title>`;
    const parseResult = await parse(content);
    
    // Log the structure for debugging
    console.log('Add Section Directive Structure:', JSON.stringify(parseResult.ast[0], null, 2));
    
    // Get the directive from the parse result (should be the first node)
    const directiveNode = parseResult.ast[0];
    
    // Verify structure
    expect(directiveNode.type).toBe('Directive');
    expect(directiveNode.kind).toBe('show');
    expect(directiveNode.subtype).toBe('showLoadContent');
    expect(directiveNode.source).toBe('load-content'); // Check source field
    
    // Check values structure
    expect(directiveNode.values).toHaveProperty('loadContent');
    
    // Check that section is in the loadContent options
    expect(directiveNode.values.loadContent.options).toHaveProperty('section');
    expect(directiveNode.values.loadContent.options.section.identifier.content).toBe('Header Title');
  });
  
  test('Section add with as clause', async () => {
    const content = `/show <document.md # Original Header> as "## New Title"`;
    const parseResult = await parse(content);
    
    // Get the directive from the parse result (should be the first node)
    const directiveNode = parseResult.ast[0];
    
    // Verify structure
    expect(directiveNode.type).toBe('Directive');
    expect(directiveNode.kind).toBe('show');
    expect(directiveNode.subtype).toBe('showLoadContent');
    
    // Check values structure
    expect(directiveNode.values).toHaveProperty('loadContent');
    expect(directiveNode.values).toHaveProperty('newTitle');
    
    // Check that section is in the loadContent options
    expect(directiveNode.values.loadContent.options).toHaveProperty('section');
    expect(directiveNode.values.loadContent.options.section.identifier.content).toBe('Original Header');
    
    // Check that newTitle contains the expected content
    expect(directiveNode.values.newTitle[0].content).toBe('## New Title');
  });
  
  test('Section add with variable in path', async () => {
    const content = `/show <@base/docs/api.md # API Reference>`;
    const parseResult = await parse(content);
    
    // Get the directive from the parse result (should be the first node)
    const directiveNode = parseResult.ast[0];
    
    // Verify structure
    expect(directiveNode.type).toBe('Directive');
    expect(directiveNode.kind).toBe('show');
    expect(directiveNode.subtype).toBe('showLoadContent');
    
    // Check path has a variable
    expect(directiveNode.meta.sourceType).toBe('path');
    
    // Check values structure
    expect(directiveNode.values).toHaveProperty('loadContent');
    
    // Check that section is in the loadContent options
    expect(directiveNode.values.loadContent.options).toHaveProperty('section');
    expect(directiveNode.values.loadContent.options.section.identifier.content).toBe('API Reference');
  });
  
  // ====================
  // Multiline Template Test
  // ====================
  
  test('Multiline template add', async () => {
    const content = `/show ::
# Multiline Content
- Item 1
- Item 2
::`;
    const parseResult = await parse(content);
    
    // Log the structure for debugging
    console.log('Add Multiline Template Structure:', JSON.stringify(parseResult.ast[0], null, 2));
    
    // Get the directive from the parse result (should be the first node)
    const directiveNode = parseResult.ast[0];
    
    // Verify structure
    expect(directiveNode.type).toBe('Directive');
    expect(directiveNode.kind).toBe('show');
    expect(directiveNode.subtype).toBe('showTemplate');
    
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