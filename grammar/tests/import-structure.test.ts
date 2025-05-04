/**
 * Import directive structure test - Verifies AST structure for import directives
 */
import { describe, expect, test } from 'vitest';
import { parse } from '@core/ast/parser';

describe('Import Directive Structure', () => {
  test('Import All structure', async () => {
    const content = `@import { * } from "path/to/file.meld"`;
    const parseResult = await parse(content);
    
    // Log the structure
    console.log('Import Directive Structure:', JSON.stringify(parseResult.ast[0], null, 2));
    
    // Get the directive from the parse result
    const directiveNode = parseResult.ast[0];
    
    // Verify we have a directive node
    expect(directiveNode.type).toBe('Directive');
    
    // Verify structure of the new format
    expect(directiveNode.kind).toBe('import');
    expect(directiveNode.subtype).toBe('importAll');
    
    // Check values
    expect(directiveNode.values).toHaveProperty('imports');
    expect(directiveNode.values).toHaveProperty('path');
    expect(directiveNode.values.imports).toHaveLength(1);
    expect(directiveNode.values.imports[0].identifier).toBe('*');
    
    // Check raw data
    expect(directiveNode.raw).toHaveProperty('imports');
    expect(directiveNode.raw).toHaveProperty('path');
    expect(directiveNode.raw.imports).toBe('*');
    
    // Check metadata
    expect(directiveNode.meta).toHaveProperty('path');
    expect(directiveNode.meta.path.isAbsolute).toBe(false);
    expect(directiveNode.meta.path.isRelative).toBe(true);
  });
  
  test('Import Selected structure', async () => {
    const content = `@import { foo, bar } from "path/to/file.meld"`;
    const parseResult = await parse(content);
    
    // Get the directive from the parse result
    const directiveNode = parseResult.ast[0];
    
    // Verify we have a directive node
    expect(directiveNode.type).toBe('Directive');
    
    // Verify structure of the new format
    expect(directiveNode.kind).toBe('import');
    expect(directiveNode.subtype).toBe('importSelected');
    
    // Check values
    expect(directiveNode.values).toHaveProperty('imports');
    expect(directiveNode.values).toHaveProperty('path');
    expect(directiveNode.values.imports).toHaveLength(2);
    expect(directiveNode.values.imports[0].identifier).toBe('foo');
    expect(directiveNode.values.imports[1].identifier).toBe('bar');
    
    // Check raw data
    expect(directiveNode.raw).toHaveProperty('imports');
    expect(directiveNode.raw).toHaveProperty('path');
    expect(directiveNode.raw.imports).toBe('foo, bar');
    
    // Check metadata
    expect(directiveNode.meta).toHaveProperty('path');
  });
});