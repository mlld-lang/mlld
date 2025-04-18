/// <reference types="vitest" />
import { parse } from '@core/ast';
import { expect, describe, it } from 'vitest';

describe('directives with variable syntax', () => {
  // Test text variables
  it('should parse text variables with the {{variable}} syntax', async () => {
    const input = '{{variable}}';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('VariableReference');
    expect(ast[0].valueType).toBe('text');
    expect(ast[0].identifier).toBe('variable');
    expect(ast[0].isVariableReference).toBe(true);
  });
  
  // Test bracketed vs non-bracketed embed directives
  it('should handle bracketed variable syntax in @embed directive', async () => {
    const input = '@embed [$file_path]';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    expect(ast[0].directive.kind).toBe('embed');
    expect(ast[0].directive.path.raw).toBe('$file_path');
    expect(ast[0].directive.path.structured.variables.path).toEqual(['file_path']);
    expect(ast[0].directive.path.variable_warning).toBeUndefined();
  });
  
  it('should handle non-bracketed variable syntax in @embed directive', async () => {
    const input = '@embed $file_path';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    expect(ast[0].directive.kind).toBe('embed');
    expect(ast[0].directive.path.raw).toBe('$file_path');
    expect(ast[0].directive.path.structured.variables.path).toEqual(['file_path']);
  });
  
  // Test bracketed vs non-bracketed import directives
  it('should handle bracketed variable syntax in @import directive', async () => {
    const input = '@import [$file_path]';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    expect(ast[0].directive.kind).toBe('import');
    expect(ast[0].directive.path.raw).toBe('$file_path');
    expect(ast[0].directive.path.structured.variables.path).toEqual(['file_path']);
  });
  
  it('should handle non-bracketed variable syntax in @import directive', async () => {
    const input = '@import $file_path';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    expect(ast[0].directive.kind).toBe('import');
    expect(ast[0].directive.path.raw).toBe('$file_path');
    expect(ast[0].directive.path.structured.variables.path).toEqual(['file_path']);
  });
  
  // Test bracketed vs non-bracketed run directives
  it('should handle bracketed variable syntax in @run directive', async () => {
    const input = '@run [$command]';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    expect(ast[0].directive.kind).toBe('run');
    // For bracketed syntax, command is InterpolatableValue array
    expect(ast[0].directive.command).toEqual([
      expect.objectContaining({
        type: 'VariableReference',
        identifier: 'command',
        valueType: 'path' // Since it's $command
      })
    ]);
  });
  
  it('should handle non-bracketed variable syntax in @run directive', async () => {
    const input = '@run $command';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    expect(ast[0].directive.kind).toBe('run');
    // For non-bracketed $command, it's parsed as CommandReference
    expect(ast[0].directive.command).toBeTypeOf('object');
    expect(ast[0].directive.command.name).toBe('command');
    expect(ast[0].directive.command.args).toEqual([]);
    expect(ast[0].directive.command.raw).toBe('$command');
    expect(ast[0].directive.subtype).toBe('runDefined'); // Check subtype
  });
  
  // Test combined path variables and text variables in @embed directive
  it('should handle both path variables and text variables in @embed directive', async () => {
    const input = '@embed [$path_variable/{{text_variable}}]';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    expect(ast[0].directive.kind).toBe('embed');
    expect(ast[0].directive.path.raw).toBe('$path_variable/{{text_variable}}');
    expect(ast[0].directive.path.structured.variables.path).toContain('path_variable');
    expect(ast[0].directive.path.structured.variables.text).toContain('text_variable');
    expect(ast[0].directive.path.variable_warning).toBe(true);
  });
  
  it('should not add variable_warning flag for paths without variables', async () => {
    const input = '@embed [$PROJECTPATH/simple/path/file.md]';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    expect(ast[0].directive.kind).toBe('embed');
    expect(ast[0].directive.path.raw).toBe('$PROJECTPATH/simple/path/file.md');
    expect(ast[0].directive.path.variable_warning).toBeUndefined();
  });
  
  it('should add variable_warning flag for paths with text variables only', async () => {
    const input = '@embed [$PROJECTPATH/path/to/{{text_variable}}.md]';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    expect(ast[0].directive.kind).toBe('embed');
    expect(ast[0].directive.path.raw).toBe('$PROJECTPATH/path/to/{{text_variable}}.md');
    expect(ast[0].directive.path.structured.variables.text).toContain('text_variable');
    expect(ast[0].directive.path.variable_warning).toBe(true);
  });
}); 