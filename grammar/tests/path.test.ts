/**
 * Path directive tests - Verifies AST structure for path directives
 */
import { describe, expect, test } from 'vitest';
import { parse } from '@grammar/parser';

describe('Path Directive', () => {
  test('Basic path with special variable', async () => {
    // Using brackets for variable interpolation per new syntax rules
    const content = `@path docs = [@PROJECTPATH/documentation]`;
    const parseResult = await parse(content);
    
    // Log the structure
    console.log('Path Directive Structure:', JSON.stringify(parseResult.ast[0], null, 2));
    
    // Get the directive from the parse result (should be the first node)
    const directiveNode = parseResult.ast[0];
    
    // Verify we have a directive node
    expect(directiveNode.type).toBe('Directive');
    
    // Verify structure of the new format
    expect(directiveNode.kind).toBe('path');
    expect(directiveNode.subtype).toBe('pathAssignment');
    
    // Check values structure
    expect(directiveNode.values).toHaveProperty('identifier');
    expect(directiveNode.values).toHaveProperty('path');
    
    // Check identifier
    expect(Array.isArray(directiveNode.values.identifier)).toBe(true);
    expect(directiveNode.values.identifier.length).toBe(1);
    expect(directiveNode.values.identifier[0].identifier).toBe('docs');
    
    // Check path values
    expect(Array.isArray(directiveNode.values.path)).toBe(true);
    // Paths may have more nodes than expected due to how they're parsed
    expect(directiveNode.values.path.length).toBeGreaterThan(0);
    
    // Check for path variable reference in path values
    // Find the first VariableReference node - may not be the first node
    const variableNode = directiveNode.values.path.find(node => node.type === 'VariableReference');
    expect(variableNode).toBeDefined();
    expect(variableNode.type).toBe('VariableReference');
    expect(variableNode.valueType).toBe('varIdentifier');
    expect(variableNode.identifier).toBe('PROJECTPATH');
    
    // Check raw data
    expect(directiveNode.raw).toHaveProperty('identifier');
    expect(directiveNode.raw).toHaveProperty('path');
    expect(directiveNode.raw.identifier).toBe('docs');
    expect(directiveNode.raw.path).toBe('@PROJECTPATH/documentation');
    
    // Check metadata
    expect(directiveNode.meta).toHaveProperty('path');
    expect(directiveNode.meta.path.hasVariables).toBe(true);
  });
  
  test('Path with escape sequences', async () => {
    // Test escape sequence handling in paths
    const content = `@path social = [https://twitter.com/\@username]`;
    const parseResult = await parse(content);
    const directiveNode = parseResult.ast[0];
    
    // Verify structure of the new format
    expect(directiveNode.kind).toBe('path');
    expect(directiveNode.subtype).toBe('pathAssignment');
    
    // Check identifier
    expect(Array.isArray(directiveNode.values.identifier)).toBe(true);
    expect(directiveNode.values.identifier[0].identifier).toBe('social');
    
    // Check raw values
    expect(directiveNode.raw.identifier).toBe('social');
    expect(directiveNode.raw.path).toBe('https://twitter.com/@username');
    
    // Check path values - should contain literal @username, not a variable reference
    expect(Array.isArray(directiveNode.values.path)).toBe(true);
    expect(directiveNode.values.path.length).toBeGreaterThan(0);
    
    // Verify that @username appears as literal text, not a variable reference
    const textNodes = directiveNode.values.path.filter(node => node.type === 'Text');
    const usernameText = textNodes.find(node => node.content === '@username');
    expect(usernameText).toBeDefined();
    expect(usernameText.content).toBe('@username');
  });
  
  test('Path with variable interpolation', async () => {
    // Paths only use @var interpolation with brackets
    const content = '@path config = [@PROJECTPATH/@configDir/settings]';
    const parseResult = await parse(content);
    const directiveNode = parseResult.ast[0];
    
    // Verify structure of the new format
    expect(directiveNode.kind).toBe('path');
    expect(directiveNode.subtype).toBe('pathAssignment');
    
    // Check identifier
    expect(Array.isArray(directiveNode.values.identifier)).toBe(true);
    expect(directiveNode.values.identifier[0].identifier).toBe('config');
    
    // Check metadata (though text variables aren't detected yet)
    expect(directiveNode.meta.path.hasVariables).toBe(true);
  });
  
  test('Path with relative project path', async () => {
    // Using brackets for variable interpolation per new syntax rules
    const content = `@path src = [@./source]`;
    const parseResult = await parse(content);
    const directiveNode = parseResult.ast[0];
    
    // Verify structure of the new format
    expect(directiveNode.kind).toBe('path');
    expect(directiveNode.subtype).toBe('pathAssignment');
    
    // Check identifier
    expect(Array.isArray(directiveNode.values.identifier)).toBe(true);
    expect(directiveNode.values.identifier[0].identifier).toBe('src');
    
    // Check raw values
    expect(directiveNode.raw.identifier).toBe('src');
    expect(directiveNode.raw.path).toBe('@PROJECTPATH/source');
    
    // Check path values
    expect(Array.isArray(directiveNode.values.path)).toBe(true);
    expect(directiveNode.values.path.length).toBeGreaterThan(0);
    
    // Check for path variable reference to PROJECTPATH
    const variableNode = directiveNode.values.path.find(node => node.type === 'VariableReference');
    expect(variableNode).toBeDefined();
    expect(variableNode.type).toBe('VariableReference');
    expect(variableNode.valueType).toBe('varIdentifier');
    expect(variableNode.identifier).toBe('PROJECTPATH'); // Should be normalized
  });
  
  // This test helps verify path variable reference handling
  test('Path referencing another path variable', async () => {
    // Using brackets for variable interpolation per new syntax rules
    const content = `@path backup = [@mainPath/backup]`;
    const parseResult = await parse(content);
    const directiveNode = parseResult.ast[0];
    
    // Verify structure of the new format
    expect(directiveNode.kind).toBe('path');
    expect(directiveNode.subtype).toBe('pathAssignment');
    
    // Check identifier
    expect(Array.isArray(directiveNode.values.identifier)).toBe(true);
    expect(directiveNode.values.identifier[0].identifier).toBe('backup');
    
    // Check raw values
    expect(directiveNode.raw.identifier).toBe('backup');
    expect(directiveNode.raw.path).toBe('@mainPath/backup');
    
    // Check path values
    expect(Array.isArray(directiveNode.values.path)).toBe(true);
    
    // Check for variable reference
    const variableNode = directiveNode.values.path.find(node => node.type === 'VariableReference');
    expect(variableNode).toBeDefined();
    expect(variableNode.type).toBe('VariableReference');
    expect(variableNode.valueType).toBe('varIdentifier');
    expect(variableNode.identifier).toBe('mainPath');
    
    // Check metadata
    expect(directiveNode.meta.path.hasVariables).toBe(true);
  });
});