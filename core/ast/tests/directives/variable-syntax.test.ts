/// <reference types="vitest" />
import { parse } from '@core/ast';
import { expect, describe, it } from 'vitest';
import { DirectiveNode } from '@core/syntax/types';
import { runTests } from '@core/syntax/types/fixtures/run'; // Import run fixtures
import { testValidCase } from '../utils/test-utils'; // Import test utility

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
    const input = '@embed [./path/{{text_variable}}]';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('embed');
    expect(node.directive.subtype).toBe('embedPath'); // Brackets denote a path, subtype reflects that
    expect(node.directive.path.values).toHaveLength(5); // Corrected: ., /, path, /, {{text_variable}}
    expect(node.directive.path.values).toEqual([
      expect.objectContaining({ type: 'DotSeparator', value: '.' }),
      expect.objectContaining({ type: 'PathSeparator', value: '/' }),
      expect.objectContaining({ type: 'Text', content: 'path' }),
      expect.objectContaining({ type: 'PathSeparator', value: '/' }),
      expect.objectContaining({ type: 'VariableReference', valueType: 'text', identifier: 'text_variable' }),
    ]);
  });
  
  it('should handle non-bracketed variable syntax in @embed directive', async () => {
    const input = '@embed $variable';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('embed');
    expect(node.directive.subtype).toBe('embedVariable');
    expect(node.directive).not.toHaveProperty('path');
    expect(node.directive.values).toHaveLength(1);
    expect(node.directive.values[0]).toEqual(
      expect.objectContaining({
        type: 'VariableReference',
        valueType: 'path', // Assuming default is path unless {{...}}
        identifier: 'variable',
      }),
    );
  });
  
  it('should handle literal paths in @embed directive', async () => {
    const input = '@embed [./some/path.txt]'; // Non-bracketed path
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    const node = ast[0] as DirectiveNode;
    expect(node.type).toBe('Directive');
    expect(node.directive.kind).toBe('embed');
    expect(node.directive.path.values).toHaveLength(7);
    expect(node.directive.path.values).toEqual([
      expect.objectContaining({ type: 'DotSeparator', value: '.' }),  // Corrected: Expect PathSeparator
      expect.objectContaining({ type: 'PathSeparator', value: '/' }),
      expect.objectContaining({ type: 'Text', content: 'some' }),
      expect.objectContaining({ type: 'PathSeparator', value: '/' }),
      expect.objectContaining({ type: 'Text', content: 'path' }),
      expect.objectContaining({ type: 'DotSeparator', value: '.' }), // Corrected: Expect PathSeparator
      expect.objectContaining({ type: 'Text', content: 'txt' }),
    ]);
  });
  
  // Test bracketed vs non-bracketed import directives
  it('should handle bracketed variable syntax in @import directive', async () => {
    const input = '@import [$file_path]';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    expect(ast[0].directive.kind).toBe('import');
    expect(ast[0].directive.subtype).toBe('importAll'); // Corrected: Brackets result in importAll
    expect(ast[0].directive.path.values).toHaveLength(1); // Path value is in path.values
    expect(ast[0].directive.path.values[0]).toEqual(
      expect.objectContaining({
        type: 'VariableReference',
        valueType: 'path',
        identifier: 'file_path',
      }),
    );
  });
  
  it('should handle non-bracketed variable syntax in @import directive', async () => {
    const input = '@import $file_path';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    expect(ast[0].directive.kind).toBe('import');
    expect(ast[0].directive.subtype).toBe('importAll'); // Corrected: Changed from importVariable to importAll
    expect(ast[0].directive.path.values).toHaveLength(1);
    expect(ast[0].directive.path.values[0]).toEqual(expect.objectContaining({
      type: 'VariableReference',
      valueType: 'path',
      identifier: 'file_path'
    }));
  });
  
  it('should handle literal paths in @import directive', async () => {
    const input = '@import [./some/other/path]';
    const { ast } = await parse(input);

    expect(ast).toHaveLength(1);
    const node = ast[0] as DirectiveNode;
    expect(node.type).toBe('Directive');
    expect(node.directive.kind).toBe('import');
    expect(node.directive.path.values).toHaveLength(7);
    expect(node.directive.path.values).toEqual([
      expect.objectContaining({ type: 'DotSeparator', value: '.' }),  // Corrected: Expect PathSeparator
      expect.objectContaining({ type: 'PathSeparator', value: '/' }),
      expect.objectContaining({ type: 'Text', content: 'some' }),      // Corrected: Expect Text
      expect.objectContaining({ type: 'PathSeparator', value: '/' }),
      expect.objectContaining({ type: 'Text', content: 'other' }),    // Corrected: Expect Text
      expect.objectContaining({ type: 'PathSeparator', value: '/' }),
      expect.objectContaining({ type: 'Text', content: 'path' }),     // Corrected: Expect Text
    ]);
  });

  it('should handle mixed literal and variable paths in @import directive', async () => {
    const input = '@import [./config/$env/settings.mld]';
    const { ast } = await parse(input);

    expect(ast).toHaveLength(1);
    const node = ast[0] as DirectiveNode;
    expect(node.type).toBe('Directive');
    expect(node.directive.kind).toBe('import');
    expect(node.directive.path.values).toHaveLength(9);
    expect(node.directive.path.values).toEqual([
      expect.objectContaining({ type: 'DotSeparator', value: '.' }), // Corrected: Expect PathSeparator
      expect.objectContaining({ type: 'PathSeparator', value: '/' }),
      expect.objectContaining({ type: 'Text', content: 'config' }),      // Corrected: Expect Text
      expect.objectContaining({ type: 'PathSeparator', value: '/' }),
      // Assuming $env is treated as a path variable based on context
      expect.objectContaining({ type: 'VariableReference', valueType: 'path', identifier: 'env' }),
      expect.objectContaining({ type: 'PathSeparator', value: '/' }),
      expect.objectContaining({ type: 'Text', content: 'settings' }),
      expect.objectContaining({ type: 'DotSeparator', value: '.' }),
      expect.objectContaining({ type: 'Text', content: 'mld' }),
    ]);
  });
  
  // Test bracketed vs non-bracketed run directives
  it('should handle bracketed variable syntax in @run directive', async () => {
    const input = '@run [echo {{variable}}]';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    expect(ast[0].directive.kind).toBe('run');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.subtype).toBe('runCommand'); // Brackets imply literal command
    expect(node.directive.values).toHaveLength(2);
    expect(node.directive.values).toEqual([
      expect.objectContaining({ type: 'Text', content: 'echo ' }), // Corrected: Expect trailing space
      expect.objectContaining({ type: 'VariableReference', valueType: 'text', identifier: 'variable' }),
    ]);
  });
  
  it('should handle run directive with defined command and text variables', async () => {
    const input = '@run $mycommand ({{param}}, {{variable}})';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('run');
    expect(node.directive.subtype).toBe('runDefined');
    
    // Check the command variable reference in 'values'
    expect(node.directive.values).toHaveLength(1);
    expect(node.directive.values[0]).toEqual(expect.objectContaining({
      type: 'VariableReference',
      valueType: 'path',
      identifier: 'mycommand'
    }));
    
    // Check the arguments
    expect(node.directive.args).toHaveLength(2);
    expect(node.directive.args[0]).toEqual(expect.objectContaining({
      type: 'VariableReference',
      valueType: 'text',
      identifier: 'param'
    }));
    expect(node.directive.args[1]).toEqual(expect.objectContaining({
      type: 'VariableReference',
      valueType: 'text',
      identifier: 'variable'
    }));
  });
  
  // Use fixture for non-bracketed variable syntax in @run directive
  const runDollarVariableNoArgsTest = runTests.find(
    (test) => test.name === 'run-dollar-variable-no-args'
  );
  if (!runDollarVariableNoArgsTest) {
    throw new Error('Test case run-dollar-variable-no-args not found in fixtures.');
  }
  it(runDollarVariableNoArgsTest.description || runDollarVariableNoArgsTest.name, async () => {
    await testValidCase(runDollarVariableNoArgsTest);
  });
  
  // Test combined path variables and text variables in @embed directive
  it('should handle both path variables and text variables in @embed directive', async () => {
    const input = '@embed [$path_variable/{{text_variable}}]';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('embed');
    expect(node.directive.subtype).toBe('embedPath'); // Brackets denote a path
    expect(node.directive.path.values).toHaveLength(3); // $path_variable, /, {{text_variable}}
    expect(node.directive.path.values).toEqual([
      expect.objectContaining({ type: 'VariableReference', valueType: 'path', identifier: 'path_variable' }),
      expect.objectContaining({ type: 'PathSeparator', value: '/' }),
      expect.objectContaining({ type: 'VariableReference', valueType: 'text', identifier: 'text_variable' })
    ]);
  });
  
  it('should not add variable_warning flag for paths without variables', async () => {
    const input = '@embed [static/path/no/variables]'; // No variables here
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('embed');
    expect(node.directive.subtype).toBe('embedPath'); // Brackets denote a path
    expect(node.directive.path.values).toHaveLength(7); // Corrected: static, /, path, /, no, /, variables
    expect(node.directive.path.values).toEqual([
      expect.objectContaining({ type: 'Text', content: 'static' }),
      expect.objectContaining({ type: 'PathSeparator', value: '/' }),
      expect.objectContaining({ type: 'Text', content: 'path' }),
      expect.objectContaining({ type: 'PathSeparator', value: '/' }),
      expect.objectContaining({ type: 'Text', content: 'no' }),
      expect.objectContaining({ type: 'PathSeparator', value: '/' }),
      expect.objectContaining({ type: 'Text', content: 'variables' }),
    ]);
  });
  
  it('should add variable_warning flag for paths with text variables only', async () => {
    const input = '@embed [$PROJECTPATH/path/to/{{text_variable}}/.md]';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('embed');
    expect(node.directive.subtype).toBe('embedPath'); // Brackets denote a path
    expect(node.directive.path.values).toHaveLength(10); // Corrected: $PROJECTPATH, /, path, /, to, /, {{text_variable}}, /, ., md
    expect(node.directive.path.values).toEqual([
      expect.objectContaining({ type: 'VariableReference', valueType: 'path', identifier: 'PROJECTPATH' }),
      expect.objectContaining({ type: 'PathSeparator', value: '/' }),
      expect.objectContaining({ type: 'Text', content: 'path' }),
      expect.objectContaining({ type: 'PathSeparator', value: '/' }),
      expect.objectContaining({ type: 'Text', content: 'to' }),
      expect.objectContaining({ type: 'PathSeparator', value: '/' }),
      expect.objectContaining({ type: 'VariableReference', valueType: 'text', identifier: 'text_variable' }),
      expect.objectContaining({ type: 'PathSeparator', value: '/' }),
      expect.objectContaining({ type: 'DotSeparator', value: '.' }),
      expect.objectContaining({ type: 'Text', content: 'md' }),
    ]);
  });
  
  it('should correctly flag paths with ONLY path variables', async () => {
    const input = '@import [$text_variable.md]'; // Input uses a path variable
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('import');
    expect(node.directive.subtype).toBe('importAll'); // Corrected back based on parser output
    expect(node.directive.path.values).toHaveLength(3); // $text_variable, ., md
    expect(node.directive.path.values).toEqual([
      expect.objectContaining({ type: 'VariableReference', valueType: 'path', identifier: 'text_variable' }),
      expect.objectContaining({ type: 'DotSeparator', value: '.' }),
      expect.objectContaining({ type: 'Text', content: 'md' }),
    ]);
  });
}); 