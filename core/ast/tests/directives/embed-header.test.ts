/// <reference types="vitest" />
import { parse } from '@core/ast';
import { expect, describe, it } from 'vitest';
import { DirectiveNode } from '@core/ast/types';

describe('directives/@embed with header levels', () => {
  it('should support header level with path syntax', async () => {
    const input = `@embed [file.md] as ###`;
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    const node = ast[0] as DirectiveNode;
    expect(node.type).toBe('Directive');
    expect(node.directive.kind).toBe('embed');
    expect(node.directive.headerLevel).toBe(3);
    
    // Ensure the path is structured correctly
    expect(node.directive.path).toBeDefined();
    expect(node.directive.path.raw).toBe('file.md');
    // normalized path is no longer used
    expect(node.directive.path.values).toBeDefined();
    expect(node.directive.path.values).toEqual([
      expect.objectContaining({ type: 'Text', content: 'file' }),
      expect.objectContaining({ type: 'DotSeparator', value: '.' }),
      expect.objectContaining({ type: 'Text', content: 'md' })
    ]);
    expect(node.directive.path.isRelativeToCwd).toBe(true);
    expect(node.directive.path.isAbsolute).toBe(false);
  });

  it('should support section with header level', async () => {
    const input = `@embed [file.md # Introduction] as ##`;
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    const node = ast[0] as DirectiveNode;
    expect(node.type).toBe('Directive');
    expect(node.directive.kind).toBe('embed');
    expect(node.directive.headerLevel).toBe(2);
    expect(node.directive.section).toBe('Introduction');
    
    // Ensure the path is structured correctly
    expect(node.directive.path).toBeDefined();
    expect(node.directive.path.raw).toBe('file.md');
    // normalized path is no longer used
    expect(node.directive.path.values).toBeDefined();
    expect(node.directive.path.values).toEqual([
      expect.objectContaining({ type: 'Text', content: 'file' }),
      expect.objectContaining({ type: 'DotSeparator', value: '.' }),
      expect.objectContaining({ type: 'Text', content: 'md' }),
      expect.objectContaining({ type: 'SectionMarker', value: '#' }),
      expect.objectContaining({ type: 'Text', content: ' Introduction' })
    ]);
    expect(node.directive.path.isRelativeToCwd).toBe(true);
    expect(node.directive.path.isAbsolute).toBe(false);
  });
}); 