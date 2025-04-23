/// <reference types="vitest" />
import { parse } from '@core/ast';
import { expect, describe, it } from 'vitest';
import { DirectiveNode } from '@core/ast/types';

describe('special path variables', () => {
  it('should parse $. in embed directive', async () => {
    const input = '@embed [$./docs/UX.md]';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('embed');
    expect(node.directive.path.raw).toBe('$./docs/UX.md');
    expect(node.directive.path.structured.variables.special).toContain('PROJECTPATH');
    expect(node.directive.path.structured.segments).toContain('docs');
    expect(node.directive.path.structured.segments).toContain('UX.md');
    
    // Check path normalization
    expect(node.directive.path.normalized).toBe('$PROJECTPATH/docs/UX.md');
    console.log('AST for $.:', JSON.stringify(node.directive.path, null, 2));
  });

  it('should parse $~ in embed directive', async () => {
    const input = '@embed [$~/docs/UX.md]';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('embed');
    expect(node.directive.path.raw).toBe('$~/docs/UX.md');
    expect(node.directive.path.structured.variables.special).toContain('HOMEPATH');
    expect(node.directive.path.structured.segments).toContain('docs');
    expect(node.directive.path.structured.segments).toContain('UX.md');
    
    // Check path normalization
    expect(node.directive.path.normalized).toBe('$HOMEPATH/docs/UX.md');
    console.log('AST for $~:', JSON.stringify(node.directive.path, null, 2));
  });
  
  // Let's also test the import directive with the same syntax
  it('should parse $. in import directive', async () => {
    const input = '@import [$./docs/UX.md]';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('import');
    expect(node.directive.path.raw).toBe('$./docs/UX.md');
    expect(node.directive.path.structured.variables.special).toContain('PROJECTPATH');
    expect(node.directive.path.structured.segments).toContain('docs');
    expect(node.directive.path.structured.segments).toContain('UX.md');
    
    console.log('AST for $. in import:', JSON.stringify(node.directive.path, null, 2));
  });
  
  // Test for non-bracketed path variable - this should NOT work as expected
  it('should NOT parse non-bracketed $. with segments correctly', async () => {
    const input = '@embed $./docs/UX.md';
    
    try {
      const { ast } = await parse(input);
      console.log('Non-bracketed AST:', JSON.stringify(ast, null, 2));
      // If it doesn't throw, it will likely parse differently than expected
      // The path likely won't have the segments properly included
    } catch (error) {
      // Expected to fail, but let's log the error
      console.log('Error parsing non-bracketed path:', error.message);
    }
  });
}); 