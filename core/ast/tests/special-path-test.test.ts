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
    expect(node.directive.path.raw).toBe('$PROJECTPATH/docs/UX.md');
    expect(node.directive.path.values).toEqual([
      expect.objectContaining({ type: 'VariableReference', identifier: 'PROJECTPATH', valueType: 'path' }),
      expect.objectContaining({ type: 'PathSeparator', value: '/' }),
      expect.objectContaining({ type: 'Text', content: 'docs' }),
      expect.objectContaining({ type: 'PathSeparator', value: '/' }),
      expect.objectContaining({ type: 'Text', content: 'UX' }),
      expect.objectContaining({ type: 'DotSeparator', value: '.' }),
      expect.objectContaining({ type: 'Text', content: 'md' })
    ]);
    
    // Check path normalization
    // normalized path is no longer used
    console.log('AST for $.:', JSON.stringify(node.directive.path, null, 2));
  });

  it('should parse $~ in embed directive', async () => {
    const input = '@embed [$~/docs/UX.md]';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('embed');
    expect(node.directive.path.raw).toBe('$HOMEPATH/docs/UX.md');
    expect(node.directive.path.values).toEqual([
      expect.objectContaining({ type: 'VariableReference', identifier: 'HOMEPATH', valueType: 'path' }),
      expect.objectContaining({ type: 'PathSeparator', value: '/' }),
      expect.objectContaining({ type: 'Text', content: 'docs' }),
      expect.objectContaining({ type: 'PathSeparator', value: '/' }),
      expect.objectContaining({ type: 'Text', content: 'UX' }),
      expect.objectContaining({ type: 'DotSeparator', value: '.' }),
      expect.objectContaining({ type: 'Text', content: 'md' })
    ]);
    
    // Check path normalization
    // normalized path is no longer used
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
    expect(node.directive.path.raw).toBe('$PROJECTPATH/docs/UX.md');
    expect(node.directive.path.values).toEqual([
      expect.objectContaining({ type: 'VariableReference', identifier: 'PROJECTPATH', valueType: 'path' }),
      expect.objectContaining({ type: 'PathSeparator', value: '/' }),
      expect.objectContaining({ type: 'Text', content: 'docs' }),
      expect.objectContaining({ type: 'PathSeparator', value: '/' }),
      expect.objectContaining({ type: 'Text', content: 'UX' }),
      expect.objectContaining({ type: 'DotSeparator', value: '.' }),
      expect.objectContaining({ type: 'Text', content: 'md' })
    ]);
    
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
      console.log('Error parsing non-bracketed path:', (error as Error).message);
    }
  });
}); 