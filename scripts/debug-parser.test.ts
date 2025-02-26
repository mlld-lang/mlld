/**
 * Debug Parser Test
 * 
 * This test will check what the parser is producing for different directive formats.
 */

import { describe, it, expect } from 'vitest';
import { ParserService } from '@services/pipeline/ParserService/ParserService.js';

describe('Parser Debug', () => {
  it('should parse path directive correctly', async () => {
    const parser = new ParserService();
    
    const content = `
@path docs = "$PROJECTPATH/docs"
@text greeting = "Hello"
`;
    
    // Parse the content
    const ast = await parser.parse(content);
    
    // Print out the AST for debugging
    console.log('AST:', JSON.stringify(ast, null, 2));
    
    // Find the path directive
    const pathDirective = ast.find(node => 
      node.type === 'Directive' && node.directive.kind === 'path'
    )?.directive;
    
    console.log('Path Directive:', pathDirective);
    
    // The problem is that the path directive has 'id' instead of 'identifier'
    expect(pathDirective).toHaveProperty('id');
    expect(pathDirective.id).toBe('docs');
    expect(pathDirective.path).toBeDefined();
    expect(pathDirective.path.raw).toBe('$PROJECTPATH/docs');
    
    // It doesn't have the expected 'identifier' property
    expect(pathDirective).not.toHaveProperty('identifier');
  });
});