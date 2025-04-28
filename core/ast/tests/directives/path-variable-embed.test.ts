/// <reference types="vitest" />
import { parse } from '@core/ast';
import { expect, describe, it } from 'vitest';
import { DirectiveNode } from '@core/syntax/types';

describe('directives/@embed with path variables', () => {
  it('should correctly parse basic path variables in embed directives', async () => {
    const input = '@embed [$file_path]';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('embed');
    expect(node.directive.path.raw).toBe('$file_path');
    // Check flags
    expect(node.directive.path.isAbsolute).toBe(false);
    expect(node.directive.path.isRelativeToCwd).toBe(false);
    expect(node.directive.path.hasVariables).toBe(true);
    expect(node.directive.path.hasPathVariables).toBe(true);
    expect(node.directive.path.hasTextVariables).toBe(false);
    expect(node.directive.path.variable_warning).toBe(false);
    // Check values array (already present and seems correct)
    expect(node.directive.path.values).toEqual([
      expect.objectContaining({ type: 'VariableReference', valueType: 'path', identifier: 'file_path' })
    ]);
  });
  
  it('should correctly parse path variables with subdirectories', async () => {
    const input = '@embed [$file_path/subdirectory/file.md]';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('embed');
    expect(node.directive.path.raw).toBe('$file_path/subdirectory/file.md');
    // Check flags
    expect(node.directive.path.isAbsolute).toBe(false);
    expect(node.directive.path.isRelativeToCwd).toBe(false);
    expect(node.directive.path.hasVariables).toBe(true);
    expect(node.directive.path.hasPathVariables).toBe(true);
    expect(node.directive.path.hasTextVariables).toBe(false);
    expect(node.directive.path.variable_warning).toBe(false);
    // Check values array (already present and seems correct)
    expect(node.directive.path.values).toEqual([
      expect.objectContaining({ type: 'VariableReference', valueType: 'path', identifier: 'file_path' }),
      expect.objectContaining({ type: 'PathSeparator', value: '/' }),
      expect.objectContaining({ type: 'Text', content: 'subdirectory' }),
      expect.objectContaining({ type: 'PathSeparator', value: '/' }),
      expect.objectContaining({ type: 'Text', content: 'file' }),
      expect.objectContaining({ type: 'DotSeparator', value: '.' }),
      expect.objectContaining({ type: 'Text', content: 'md' })
    ]);
  });
  
  // TODO: Fix grammar bug with text variables in path validation (issue #41)
  it('should correctly parse path variables with text variables', async () => {
    const input = '@embed [$file_path/{{text_var}}.md#section]';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('embed');
    expect(node.directive.path.raw).toBe('$file_path/{{text_var}}.md');
    // Check flags
    expect(node.directive.path.isAbsolute).toBe(false);
    expect(node.directive.path.isRelativeToCwd).toBe(false);
    expect(node.directive.path.hasVariables).toBe(true);
    expect(node.directive.path.hasPathVariables).toBe(true);
    expect(node.directive.path.hasTextVariables).toBe(true); // Contains text var
    expect(node.directive.path.variable_warning).toBe(true);
    // Check values array (already present and seems correct)
    expect(node.directive.path.values).toEqual([
      expect.objectContaining({ type: 'VariableReference', valueType: 'path', identifier: 'file_path' }),
      expect.objectContaining({ type: 'PathSeparator', value: '/' }),
      expect.objectContaining({ type: 'VariableReference', valueType: 'text', identifier: 'text_var' }),
      expect.objectContaining({ type: 'DotSeparator', value: '.' }),
      expect.objectContaining({ type: 'Text', content: 'md' }),
      expect.objectContaining({ type: 'SectionMarker', value: '#' }),
      expect.objectContaining({ type: 'Text', content: 'section' })
    ]);
  });
  
  it('should correctly parse path variables with section identifier', async () => {
    const input = '@embed [$file_path#section]';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('embed');
    expect(node.directive.path.raw).toBe('$file_path');
    // Check flags
    expect(node.directive.path.isAbsolute).toBe(false);
    expect(node.directive.path.isRelativeToCwd).toBe(false);
    expect(node.directive.path.hasVariables).toBe(true);
    expect(node.directive.path.hasPathVariables).toBe(true);
    expect(node.directive.path.hasTextVariables).toBe(false);
    expect(node.directive.path.variable_warning).toBe(false);
    expect(node.directive.section).toBe('section');
    // Check values array (already present and seems correct FOR THE PATH OBJECT)
    // UPDATED: Expect VariableRef, SectionMarker, and Text
    expect(node.directive.path.values).toEqual([
      expect.objectContaining({ type: 'VariableReference', valueType: 'path', identifier: 'file_path' }),
      expect.objectContaining({ type: 'SectionMarker', value: '#' }),
      expect.objectContaining({ type: 'Text', content: 'section' })
    ]);
  });
  
  it('should correctly parse path variables with header level', async () => {
    const input = '@embed [$file_path] as ##';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('embed');
    expect(node.directive.path.raw).toBe('$file_path');
    // Check flags
    expect(node.directive.path.isAbsolute).toBe(false);
    expect(node.directive.path.isRelativeToCwd).toBe(false);
    expect(node.directive.path.hasVariables).toBe(true);
    expect(node.directive.path.hasPathVariables).toBe(true);
    expect(node.directive.path.hasTextVariables).toBe(false);
    expect(node.directive.path.variable_warning).toBe(false);
    expect(node.directive.headerLevel).toBe(2);
    // Check values array (already present and seems correct)
    expect(node.directive.path.values).toEqual([
      expect.objectContaining({ type: 'VariableReference', valueType: 'path', identifier: 'file_path' })
    ]);
  });
  
  it('should correctly parse path variables with "under header" option', async () => {
    const input = '@embed [$file_path] under Custom Header';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('embed');
    expect(node.directive.path.raw).toBe('$file_path');
    // Check flags
    expect(node.directive.path.isAbsolute).toBe(false);
    expect(node.directive.path.isRelativeToCwd).toBe(false);
    expect(node.directive.path.hasVariables).toBe(true);
    expect(node.directive.path.hasPathVariables).toBe(true);
    expect(node.directive.path.hasTextVariables).toBe(false);
    expect(node.directive.path.variable_warning).toBe(false);
    expect(node.directive.underHeader).toBe('Custom Header');
    // Check values array (already present and seems correct)
    expect(node.directive.path.values).toEqual([
      expect.objectContaining({ type: 'VariableReference', valueType: 'path', identifier: 'file_path' })
    ]);
  });
  
  it('should correctly parse path variables with options', async () => {
    const input = '@embed [$file_path] lang="javascript"';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('embed');
    expect(node.directive.path.raw).toBe('$file_path');
    // Check flags
    expect(node.directive.path.isAbsolute).toBe(false);
    expect(node.directive.path.isRelativeToCwd).toBe(false);
    expect(node.directive.path.hasVariables).toBe(true);
    expect(node.directive.path.hasPathVariables).toBe(true);
    expect(node.directive.path.hasTextVariables).toBe(false);
    expect(node.directive.path.variable_warning).toBe(false);
    expect(node.directive.options.lang).toBe('javascript');
    // Check values array (already present and seems correct)
    expect(node.directive.path.values).toEqual([
      expect.objectContaining({ type: 'VariableReference', valueType: 'path', identifier: 'file_path' })
    ]);
  });
  
  // TODO: Fix grammar bug with text variables in path validation (issue #41)
  it('should correctly parse path variables with combination of features', async () => {
    const input = '@embed [$file_path/{{text_var}}.md#section] as ## under Custom Header lang="javascript"';
    const { ast } = await parse(input);
    expect(ast).toHaveLength(1);
    const node = ast[0] as DirectiveNode;
    expect(node.type).toBe('Directive');
    expect(node.directive.kind).toBe('embed');
    expect(node.directive.path.raw).toBe('$file_path/{{text_var}}.md');
    // Check flags first
    expect(node.directive.path.isAbsolute).toBe(false);
    expect(node.directive.path.isRelativeToCwd).toBe(false);
    expect(node.directive.path.hasVariables).toBe(true);
    expect(node.directive.path.hasPathVariables).toBe(true);
    expect(node.directive.path.hasTextVariables).toBe(true); // Contains text var
    expect(node.directive.path.variable_warning).toBe(true);
    expect(node.directive.section).toBe('section');
    expect(node.directive.headerLevel).toBe(2);
    expect(node.directive.underHeader).toBe('Custom Header lang="javascript"');
    // Check values array (already present and seems correct)
    expect(node.directive.path.values).toEqual([
      expect.objectContaining({ type: 'VariableReference', valueType: 'path', identifier: 'file_path' }),
      expect.objectContaining({ type: 'PathSeparator', value: '/' }),
      expect.objectContaining({ type: 'VariableReference', valueType: 'text', identifier: 'text_var' }),
      expect.objectContaining({ type: 'DotSeparator', value: '.' }),
      expect.objectContaining({ type: 'Text', content: 'md' }),
      expect.objectContaining({ type: 'SectionMarker', value: '#' }),
      expect.objectContaining({ type: 'Text', content: 'section' })
    ]);
  });
  
  it('should handle non-bracketed path variable syntax', async () => {
    const input = '@embed $file_path';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('embed');

    // UPDATED (Task 3.5): Check for subtype and values array
    expect(node.directive.subtype).toBe('embedVariable');
    expect(node.directive).not.toHaveProperty('path'); // Ensure old path property is gone
    expect(node.directive.values).toEqual([
      expect.objectContaining({ type: 'VariableReference', valueType: 'path', identifier: 'file_path' })
    ]);

    // REMOVED Old checks for node.directive.path.*
    // expect(node.directive.path.raw).toBe('$file_path');
    // expect(node.directive.path.isAbsolute).toBe(false);
    // expect(node.directive.path.isRelativeToCwd).toBe(false);
    // expect(node.directive.path.hasVariables).toBe(true);
    // expect(node.directive.path.hasPathVariables).toBe(true);
    // expect(node.directive.path.hasTextVariables).toBe(false);
    // expect(node.directive.path.variable_warning).toBe(false);
    // expect(node.directive.path.values).toEqual([...]);
  });
}); 