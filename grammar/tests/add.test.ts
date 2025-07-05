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
    const content = `/show [@PROJECTPATH/README.md]`;
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
    expect(directiveNode.subtype).toBe('showPath');
    
    // Check values structure
    expect(directiveNode.values).toHaveProperty('path');
    
    // Check path metadata
    expect(directiveNode.meta.path).toHaveProperty('hasVariables');
  });
  
  // This test is replaced by the new AddSection tests
  // The old syntax @add [file.md # header] is deprecated
  
  test('Path add with headerLevel', async () => {
    const content = `/show [README.md] as ###`;
    const parseResult = await parse(content);
    
    // Get the directive from the parse result (should be the first node)
    const directiveNode = parseResult.ast[0];
    
    // Verify structure
    expect(directiveNode.type).toBe('Directive');
    expect(directiveNode.kind).toBe('show');
    expect(directiveNode.subtype).toBe('showPath');
    
    // Check values structure
    expect(directiveNode.values).toHaveProperty('path');
    expect(directiveNode.values).toHaveProperty('headerLevel');
    expect(directiveNode.values.headerLevel[0].value).toBe(3);
    
    // Check raw structure
    expect(directiveNode.raw).toHaveProperty('headerLevel');
    expect(directiveNode.raw.headerLevel).toBe('###');
  });
  
  test('Path add with underHeader', async () => {
    const content = `/show [code.js] under Example Code`;
    const parseResult = await parse(content);
    
    // Get the directive from the parse result (should be the first node)
    const directiveNode = parseResult.ast[0];
    
    // Verify structure
    expect(directiveNode.type).toBe('Directive');
    expect(directiveNode.kind).toBe('show');
    expect(directiveNode.subtype).toBe('showPath');
    
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
    // Updated to use separate path with no section
    const content = `/show [@PROJECTPATH/doc.md] as ## under API Documentation`;
    const parseResult = await parse(content);
    
    // Log the structure for debugging
    console.log('Complex Path Structure:', JSON.stringify(parseResult.ast[0], null, 2));
    
    // Get the directive from the parse result (should be the first node)
    const directiveNode = parseResult.ast[0];
    
    // Verify structure
    expect(directiveNode.type).toBe('Directive');
    expect(directiveNode.kind).toBe('show');
    expect(directiveNode.subtype).toBe('showPath');
    
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
  
  test('Complex section add with new title', async () => {
    // The new recommended syntax for section extraction with a new title
    const content = `/show "# API Reference" from [@PROJECTPATH/doc.md] as "## API"`;
    const parseResult = await parse(content);
    
    // Get the directive from the parse result
    const directiveNode = parseResult.ast[0];
    
    // Verify structure
    expect(directiveNode.type).toBe('Directive');
    expect(directiveNode.kind).toBe('show');
    expect(directiveNode.subtype).toBe('showPathSection');
    
    // Check values structure
    expect(directiveNode.values).toHaveProperty('sectionTitle');
    expect(directiveNode.values).toHaveProperty('path');
    expect(directiveNode.values).toHaveProperty('newTitle');
    
    // Check raw properties
    expect(directiveNode.raw.sectionTitle).toBe('# API Reference');
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
    const content = `/show ::Hello {{name}}!::`;
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
    
    // Verify content includes variable nodes - normalized to @name in raw
    const contentText = directiveNode.raw.content;
    expect(contentText.includes('@name')).toBe(true);
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
    
    // Check values structure
    expect(directiveNode.values).toHaveProperty('variable');
    expect(Array.isArray(directiveNode.values.variable)).toBe(true);
    expect(directiveNode.values.variable[0].identifier).toBe('content');
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
  // AddSection Tests
  // ====================
  
  test('Basic section add', async () => {
    const content = `/show "# Header Title" from [document.md]`;
    const parseResult = await parse(content);
    
    // Log the structure for debugging
    console.log('Add Section Directive Structure:', JSON.stringify(parseResult.ast[0], null, 2));
    
    // Get the directive from the parse result (should be the first node)
    const directiveNode = parseResult.ast[0];
    
    // Verify structure
    expect(directiveNode.type).toBe('Directive');
    expect(directiveNode.kind).toBe('show');
    expect(directiveNode.subtype).toBe('showPathSection');
    expect(directiveNode.source).toBe('section'); // Check source field
    
    // Check values structure
    expect(directiveNode.values).toHaveProperty('sectionTitle');
    expect(directiveNode.values).toHaveProperty('path');
    expect(Array.isArray(directiveNode.values.sectionTitle)).toBe(true);
    
    // Check raw structure
    expect(directiveNode.raw).toHaveProperty('sectionTitle');
    expect(directiveNode.raw).toHaveProperty('path');
    expect(directiveNode.raw.sectionTitle).toBe('# Header Title');
  });
  
  test('Section add with as clause', async () => {
    const content = `/show "# Original Header" from [document.md] as "## New Title"`;
    const parseResult = await parse(content);
    
    // Get the directive from the parse result (should be the first node)
    const directiveNode = parseResult.ast[0];
    
    // Verify structure
    expect(directiveNode.type).toBe('Directive');
    expect(directiveNode.kind).toBe('show');
    expect(directiveNode.subtype).toBe('showPathSection');
    
    // Check values structure
    expect(directiveNode.values).toHaveProperty('sectionTitle');
    expect(directiveNode.values).toHaveProperty('path');
    expect(directiveNode.values).toHaveProperty('newTitle');
    
    // Check raw structure
    expect(directiveNode.raw).toHaveProperty('sectionTitle');
    expect(directiveNode.raw).toHaveProperty('path');
    expect(directiveNode.raw).toHaveProperty('newTitle');
    expect(directiveNode.raw.sectionTitle).toBe('# Original Header');
    expect(directiveNode.raw.newTitle).toBe('## New Title');
  });
  
  test('Section add with variable in path', async () => {
    const content = `/show "# API Reference" from [@PROJECTPATH/docs/api.md]`;
    const parseResult = await parse(content);
    
    // Get the directive from the parse result (should be the first node)
    const directiveNode = parseResult.ast[0];
    
    // Verify structure
    expect(directiveNode.type).toBe('Directive');
    expect(directiveNode.kind).toBe('show');
    expect(directiveNode.subtype).toBe('showPathSection');
    
    // Check path has a variable
    expect(directiveNode.meta.path.hasVariables).toBe(true);
    
    // Check values structure
    expect(directiveNode.values).toHaveProperty('sectionTitle');
    expect(directiveNode.values).toHaveProperty('path');
    expect(directiveNode.raw.sectionTitle).toBe('# API Reference');
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