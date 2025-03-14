/// <reference types="vitest" />
import { parse } from '@core/ast';
import { expect, describe, it } from 'vitest';
import { DirectiveNode } from '../../src/types';

describe('directives/@embed with path variables', () => {
  it('should correctly parse basic path variables in embed directives', async () => {
    const input = '@embed [$file_path]';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('embed');
    expect(node.directive.path.raw).toBe('$file_path');
    expect(node.directive.path.isPathVariable).toBe(true);
    expect(node.directive.path.structured.variables.path).toEqual(['file_path']);
    expect(node.directive.path.structured.cwd).toBe(false);
  });
  
  it('should correctly parse path variables with subdirectories', async () => {
    const input = '@embed [$file_path/subdirectory/file.md]';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('embed');
    expect(node.directive.path.raw).toBe('$file_path/subdirectory/file.md');
    expect(node.directive.path.isPathVariable).toBe(true);
    expect(node.directive.path.structured.variables.path).toEqual(['file_path']);
    expect(node.directive.path.structured.segments).toEqual(['subdirectory', 'file.md']);
    expect(node.directive.path.structured.cwd).toBe(false);
  });
  
  it('should correctly parse path variables with text variables', async () => {
    const input = '@embed [$file_path/{{text_var}}.md]';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('embed');
    expect(node.directive.path.raw).toBe('$file_path/{{text_var}}.md');
    expect(node.directive.path.isPathVariable).toBe(true);
    expect(node.directive.path.structured.variables.path).toEqual(['file_path']);
    expect(node.directive.path.structured.variables.text).toEqual(['text_var']);
    expect(node.directive.path.variable_warning).toBe(true);
  });
  
  it('should correctly parse path variables with section identifier', async () => {
    const input = '@embed [$file_path#section]';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('embed');
    expect(node.directive.path.raw).toBe('$file_path');
    expect(node.directive.path.isPathVariable).toBe(true);
    expect(node.directive.section).toBe('section');
  });
  
  it('should correctly parse path variables with header level', async () => {
    const input = '@embed [$file_path] as ##';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('embed');
    expect(node.directive.path.raw).toBe('$file_path');
    expect(node.directive.path.isPathVariable).toBe(true);
    expect(node.directive.headerLevel).toBe(2);
  });
  
  it('should correctly parse path variables with "under header" option', async () => {
    const input = '@embed [$file_path] under Custom Header';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('embed');
    expect(node.directive.path.raw).toBe('$file_path');
    expect(node.directive.path.isPathVariable).toBe(true);
    expect(node.directive.underHeader).toBe('Custom Header');
  });
  
  it('should correctly parse path variables with options', async () => {
    const input = '@embed [$file_path] lang="javascript"';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('embed');
    expect(node.directive.path.raw).toBe('$file_path');
    expect(node.directive.path.isPathVariable).toBe(true);
    expect(node.directive.options.lang).toBe('javascript');
  });
  
  it('should correctly parse path variables with combination of features', async () => {
    const input = '@embed [$file_path/{{text_var}}.md#section] as ## under Custom Header lang="javascript"';
    const { ast } = await parse(input);
    expect(ast).toHaveLength(1);
    const node = ast[0] as DirectiveNode;
    expect(node.type).toBe('Directive');
    expect(node.directive.kind).toBe('embed');
    expect(node.directive.path.raw).toBe('$file_path/{{text_var}}.md');
    expect(node.directive.path.isPathVariable).toBe(true);
    expect(node.directive.path.structured.segments).toEqual(['{{text_var}}.md']);
    expect(node.directive.section).toBe('section');
    expect(node.directive.headerLevel).toBe(2);
    expect(node.directive.underHeader).toBe('Custom Header lang="javascript"');
  });
  
  it('should handle non-bracketed path variable syntax', async () => {
    const input = '@embed $file_path';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('embed');
    expect(node.directive.path.raw).toBe('$file_path');
    expect(node.directive.path.isPathVariable).toBe(true);
    expect(node.directive.path.structured.variables.path).toEqual(['file_path']);
  });
}); 