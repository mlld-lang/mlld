/// <reference types="vitest" />
import { parse } from '@core/ast.js';
import { expect, describe, it } from 'vitest';
import type { MeldNode } from '@core/syntax/types.js';

interface DirectiveNode extends MeldNode {
  directive: {
    kind: string;
    content?: string;
    path?: {
      raw: string;
      structured?: {
        variables?: {
          path?: string[];
        };
      };
    };
    section?: string;
  };
}

describe('directives/@embed invalid syntax', () => {
  it('should interpret content in single brackets as a path, not content', async () => {
    const input = `@embed [This is content in single brackets]`;
    const result = await parse(input);
    
    // No errors expected - the content should be treated as a path
    expect(result.errors?.length || 0).toBe(0);
    // The input should be treated as a path, not content
    const node = result.ast[0] as DirectiveNode;
    expect(node.directive.path).toBeDefined();
    expect(node.directive.path?.raw).toBe('This is content in single brackets');
    expect(node.directive.content).toBeUndefined();
  });

  it('should interpret paths in double brackets as content, not a path', async () => {
    const input = `@embed [[ path/to/file.md ]]`;
    const result = await parse(input);
    
    // No errors expected
    expect(result.errors?.length || 0).toBe(0);
    // The input should be treated as content, not a path
    const node = result.ast[0] as DirectiveNode;
    expect(node.directive.content).toBeDefined();
    // Check for the InterpolatableValue structure
    expect(node.directive.content).toEqual([
      expect.objectContaining({
        type: 'Text',
        content: ' path/to/file.md '
      })
    ]);
    expect(node.directive.path).toBeUndefined();
    // No section should be parsed
    expect(node.directive.section).toBeUndefined();
  });

  it('should handle path variables differently based on bracket type', async () => {
    // Path variable in single brackets should be interpreted as a path variable
    const input1 = `@embed [$file_path]`;
    const result1 = await parse(input1);
    
    const node1 = result1.ast[0] as DirectiveNode;
    expect(node1.directive.path).toBeDefined();
    expect(node1.directive.path?.structured?.variables?.path).toContain('file_path');
    
    // Path variable in double brackets should be treated as literal text
    const input2 = `@embed [[ $file_path ]]`;
    const result2 = await parse(input2);
    
    const node2 = result2.ast[0] as DirectiveNode;
    expect(node2.directive.content).toBeDefined();
    // Check for the InterpolatableValue structure
    expect(node2.directive.content).toEqual([
      expect.objectContaining({
        type: 'Text',
        content: ' $file_path '
      })
    ]);
    // No path variable should be extracted
    expect(node2.directive.path).toBeUndefined();
  });

  it('should provide helpful error messages for syntax mistakes', async () => {
    const input = `@embed [ missing closing bracket`;
    try {
      await parse(input);
      // If we get here, the test should fail
      expect(true).toBe(false); // This should never execute
    } catch (error) {
      // We expect an error to be thrown
      expect(error.message).toMatch(/missing closing bracket|expected/i);
    }
  });
}); 