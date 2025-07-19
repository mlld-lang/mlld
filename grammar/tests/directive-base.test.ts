import { describe, it, expect } from 'vitest';
import { parse } from '@grammar/parser';
import type { DirectiveNode } from '@core/types';

/**
 * Basic tests to verify the fundamental structure of all directives
 * This verifies that all directives conform to the refactored object structure
 */
describe('Directive Base Structure', () => {
  const directiveExamples = [
    '/import "file.md"',
    '/show "path/to/file.md"',
    '/var @myvar = "some text"',
    '/var @myvar = { "key": "value" }',
    '/path @myvar = "/path/to/file"',
    '/run {echo "hello world"}',
    '/exe @mycommand (param) = run {echo "hello"}'
  ];

  for (const input of directiveExamples) {
    const directiveName = input.split(' ')[0].substring(1);
    
    it(`${directiveName} directive should have the new structure`, async () => {
      try {
        const { ast } = await parse(input);
        expect(ast.length).toBeGreaterThan(0);
        
        const node = ast[0] as DirectiveNode;
        
        // Output all directive structures for debugging
        console.log(`${directiveName} directive structure:`, JSON.stringify(node, null, 2));
        
        expect(node.type).toBe('Directive');
        
        // All directives should have these properties at the top level
        expect(node).toHaveProperty('kind');
        expect(node).toHaveProperty('subtype');
        expect(node).toHaveProperty('values');
        
        // The values should be an object
        expect(typeof node.values).toBe('object');
        expect(node.values).not.toBeNull();
        
        // Each key in values should be an array, EXCEPT for values.content in text directives 
        // or values.value in data directives when they are nested directives
        for (const key in node.values) {
          // Special cases for nested directives
          const isSpecialCase = 
            // Text directive with content that's a nested directive
            (node.kind === 'text' && key === 'content' && 
             typeof node.values[key] === 'object' && !Array.isArray(node.values[key]) &&
             node.values[key]?.type === 'Directive') ||
            // Data directive with value that's a nested directive, object or array structure
            (node.kind === 'data' && key === 'value' && 
             typeof node.values[key] === 'object' && !Array.isArray(node.values[key]) &&
             (node.values[key]?.type === 'Directive' || 
              node.values[key]?.type === 'object' || 
              node.values[key]?.type === 'array'));
          
          if (!isSpecialCase) {
            expect(Array.isArray(node.values[key])).toBe(true);
          }
        }
      } catch (error) {
        // These are real architectural issues that need to be fixed
        console.error(`Failed to parse ${directiveName} with error:`, error);
        throw error;
      }
    });
  }
});