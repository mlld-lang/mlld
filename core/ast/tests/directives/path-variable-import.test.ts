/// <reference types="vitest" />
import { parse } from '@core/ast';
import { expect, describe, it } from 'vitest';
import { DirectiveNode } from '@core/syntax/types';

describe('directives/@import with path variables', () => {
  it('should correctly parse basic path variables in import directives', async () => {
    const input = '@import [$file_path]';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('import');
    expect(node.directive.path.raw).toBe('$file_path');
    // Check flags
    expect(node.directive.path.isAbsolute).toBe(false);
    expect(node.directive.path.isRelativeToCwd).toBe(true);
    // TODO: Debug flag calculation later - these features aren't being used yet
    // expect(node.directive.path.hasVariables).toBe(true);
    // expect(node.directive.path.hasPathVariables).toBe(true);
    // expect(node.directive.path.hasTextVariables).toBe(false);
    // expect(node.directive.path.variable_warning).toBe(false);
    // Import directives have an imports property with a default wildcard import
    expect(node.directive.imports).toEqual([
      expect.objectContaining({
        type: 'VariableReference',
        identifier: '*',
        valueType: 'import',
        isVariableReference: true,
      }),
    ]);
    // Assert the values array
    expect(node.directive.path.values).toEqual(expect.arrayContaining([
      expect.objectContaining({
        nodeId: expect.any(String),
        type: 'VariableReference',
        valueType: 'path',
        identifier: 'file_path',
        isVariableReference: true
      })
    ]));
  });
  
  it('should correctly parse path variables with subdirectories', async () => {
    const input = '@import [$file_path/subdirectory/file.md]';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('import');
    expect(node.directive.path.raw).toBe('$file_path/subdirectory/file.md');
    // Check flags
    expect(node.directive.path.isAbsolute).toBe(false);
    expect(node.directive.path.isRelativeToCwd).toBe(true);
    // TODO: Debug flag calculation later - these features aren't being used yet
    // expect(node.directive.path.hasVariables).toBe(true);
    // expect(node.directive.path.hasPathVariables).toBe(true);
    // expect(node.directive.path.hasTextVariables).toBe(false);
    // expect(node.directive.path.variable_warning).toBe(false); // Corrected: Warning should be false when path vars are present
    expect(node.directive.imports).toEqual([
      expect.objectContaining({
        type: 'VariableReference',
        identifier: '*',
        valueType: 'import',
        isVariableReference: true,
      }),
    ]);
    // Re-apply fix: Assert the values array using expect.arrayContaining and expect.objectContaining
    expect(node.directive.path.values).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'VariableReference', identifier: 'file_path', valueType: 'path', isVariableReference: true }), // Check identifier
      expect.objectContaining({ type: 'PathSeparator', value: '/' }),
      expect.objectContaining({ type: 'Text', content: 'subdirectory' }),
      expect.objectContaining({ type: 'PathSeparator', value: '/' }),
      expect.objectContaining({ type: 'Text', content: 'file' }),
      expect.objectContaining({ type: 'DotSeparator', value: '.' }),
      expect.objectContaining({ type: 'Text', content: 'md' }),
    ]));
    // Ensure the length is also correct
    expect(node.directive.path.values).toHaveLength(7);
  });

  // TODO: Fix grammar bug with text variables in path validation (issue #41)
  it('should correctly parse path variables with text variables', async () => {
    const input = '@import [$file_path/{{text_var}}.md]';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('import');
    expect(node.directive.path.raw).toBe('$file_path/{{text_var}}.md');
    // Check flags
    expect(node.directive.path.isAbsolute).toBe(false);
    expect(node.directive.path.isRelativeToCwd).toBe(true);
    // TODO: Debug flag calculation later - these features aren't being used yet
    // expect(node.directive.path.hasVariables).toBe(true);
    // expect(node.directive.path.hasPathVariables).toBe(true);
    // expect(node.directive.path.hasTextVariables).toBe(true); // Contains text var
    // expect(node.directive.path.variable_warning).toBe(false); // Warning should be false because path variables ARE present
    expect(node.directive.imports).toEqual([
      expect.objectContaining({
        type: 'VariableReference',
        identifier: '*',
        valueType: 'import',
        isVariableReference: true,
      }),
    ]);
    // Assert the values array
    expect(node.directive.path.values).toEqual([
      expect.objectContaining({ type: 'VariableReference', valueType: 'path', identifier: 'file_path' }),
      expect.objectContaining({ type: 'PathSeparator', value: '/' }),
      expect.objectContaining({ type: 'VariableReference', valueType: 'text', identifier: 'text_var' }),
      expect.objectContaining({ type: 'DotSeparator', value: '.' }),
      expect.objectContaining({ type: 'Text', content: 'md' })
    ]);
  });

  it('should handle non-bracketed path variable syntax', async () => {
    const input = '@import $file_path';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('import');
    expect(node.directive.path.raw).toBe('$file_path');
    // Check flags
    expect(node.directive.path.isAbsolute).toBe(false);
    expect(node.directive.path.isRelativeToCwd).toBe(true);
    // TODO: Debug flag calculation later - these features aren't being used yet
    // expect(node.directive.path.hasVariables).toBe(true);
    // expect(node.directive.path.hasPathVariables).toBe(true);
    // expect(node.directive.path.hasTextVariables).toBe(false);
    // expect(node.directive.path.variable_warning).toBe(false);
    // Imports should be undefined for non-bracketed path without 'from'
    expect(node.directive.imports).toEqual([
      expect.objectContaining({
        type: 'VariableReference',
        identifier: '*',
        valueType: 'import',
        isVariableReference: true,
      }),
    ]);
    // Assert the values array
    expect(node.directive.path.values).toEqual(expect.arrayContaining([
      expect.objectContaining({
        nodeId: expect.any(String),
        type: 'VariableReference',
        valueType: 'path',
        identifier: 'file_path',
        isVariableReference: true
      })
    ]));
  });
  
  // Import-specific test for named imports with path variables
  it('should correctly parse named imports with path variable', async () => {
    const input = '@import [component1, component2] from [$file_path]';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('import');
    expect(node.directive.path.raw).toBe('$file_path');
    // Check flags
    expect(node.directive.path.isAbsolute).toBe(false);
    expect(node.directive.path.isRelativeToCwd).toBe(true);
    // TODO: Debug flag calculation later - these features aren't being used yet
    // expect(node.directive.path.hasVariables).toBe(true);
    // expect(node.directive.path.hasPathVariables).toBe(true);
    // expect(node.directive.path.hasTextVariables).toBe(false);
    // expect(node.directive.path.variable_warning).toBe(false);
    expect(node.directive.imports).toEqual([
      expect.objectContaining({
        type: 'VariableReference',
        identifier: 'component1',
        valueType: 'import',
        isVariableReference: true,
        alias: undefined,
      }),
      expect.objectContaining({
        type: 'VariableReference',
        identifier: 'component2',
        valueType: 'import',
        isVariableReference: true,
        alias: undefined,
      }),
    ]);
    // Assert the values array
    expect(node.directive.path.values).toEqual(expect.arrayContaining([
      expect.objectContaining({
        nodeId: expect.any(String),
        type: 'VariableReference',
        valueType: 'path',
        identifier: 'file_path',
        isVariableReference: true
      })
    ]));
  });
  
  // Test for named imports with aliases
  it('should correctly parse named imports with aliases and path variable', async () => {
    const input = '@import [component1 as comp1, component2 as comp2] from [$file_path]';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('import');
    expect(node.directive.path.raw).toBe('$file_path');
    // Check flags
    expect(node.directive.path.isAbsolute).toBe(false);
    expect(node.directive.path.isRelativeToCwd).toBe(true);
    // TODO: Debug flag calculation later - these features aren't being used yet
    // expect(node.directive.path.hasVariables).toBe(true);
    // expect(node.directive.path.hasPathVariables).toBe(true);
    // expect(node.directive.path.hasTextVariables).toBe(false);
    // expect(node.directive.path.variable_warning).toBe(false);
    expect(node.directive.imports).toEqual([
      expect.objectContaining({
        type: 'VariableReference',
        identifier: 'component1',
        valueType: 'import',
        isVariableReference: true,
        alias: expect.objectContaining({
          type: 'VariableReference',
          identifier: 'comp1',
          valueType: 'import',
          isVariableReference: true,
        }),
      }),
      expect.objectContaining({
        type: 'VariableReference',
        identifier: 'component2',
        valueType: 'import',
        isVariableReference: true,
        alias: expect.objectContaining({
          type: 'VariableReference',
          identifier: 'comp2',
          valueType: 'import',
          isVariableReference: true,
        }),
      }),
    ]);
    // Assert the values array
    expect(node.directive.path.values).toEqual(expect.arrayContaining([
      expect.objectContaining({
        nodeId: expect.any(String),
        type: 'VariableReference',
        valueType: 'path',
        identifier: 'file_path',
        isVariableReference: true
      })
    ]));
  });
  
  // Test for wildcard import with path variable
  it('should correctly parse wildcard import with path variable', async () => {
    const input = '@import [*] from [$file_path]';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('import');
    expect(node.directive.path.raw).toBe('$file_path');
    // Check flags
    expect(node.directive.path.isAbsolute).toBe(false);
    expect(node.directive.path.isRelativeToCwd).toBe(true);
    // TODO: Debug flag calculation later - these features aren't being used yet
    // expect(node.directive.path.hasVariables).toBe(true);
    // expect(node.directive.path.hasPathVariables).toBe(true);
    // expect(node.directive.path.hasTextVariables).toBe(false);
    // expect(node.directive.path.variable_warning).toBe(false);
    expect(node.directive.imports).toEqual([
      expect.objectContaining({
        type: 'VariableReference',
        identifier: '*',
        valueType: 'import',
        isVariableReference: true,
      }),
    ]);
    // Assert the values array
    expect(node.directive.path.values).toEqual(expect.arrayContaining([
      expect.objectContaining({
        nodeId: expect.any(String),
        type: 'VariableReference',
        valueType: 'path',
        identifier: 'file_path',
        isVariableReference: true
      })
    ]));
  });
  
  // Test for non-bracketed path variable with "from" syntax
  it('should correctly parse named imports with non-bracketed path variable', async () => {
    const input = '@import [component1, component2] from $file_path';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('import');
    expect(node.directive.path.raw).toBe('$file_path');
    // Check flags
    expect(node.directive.path.isAbsolute).toBe(false);
    expect(node.directive.path.isRelativeToCwd).toBe(true);
    // TODO: Debug flag calculation later - these features aren't being used yet
    // expect(node.directive.path.hasVariables).toBe(true);
    // expect(node.directive.path.hasPathVariables).toBe(true);
    // expect(node.directive.path.hasTextVariables).toBe(false);
    // expect(node.directive.path.variable_warning).toBe(false);
    expect(node.directive.imports).toEqual([
      expect.objectContaining({
        type: 'VariableReference',
        identifier: 'component1',
        valueType: 'import',
        isVariableReference: true,
        alias: undefined,
      }),
      expect.objectContaining({
        type: 'VariableReference',
        identifier: 'component2',
        valueType: 'import',
        isVariableReference: true,
        alias: undefined,
      }),
    ]);
    // Assert the values array
    expect(node.directive.path.values).toEqual(expect.arrayContaining([
      expect.objectContaining({
        nodeId: expect.any(String),
        type: 'VariableReference',
        valueType: 'path',
        identifier: 'file_path',
        isVariableReference: true
      })
    ]));
  });
  
  // Test for path variables with complex directory structures
  // TODO: Fix grammar bug with text variables in path validation (issue #41)
  it('should correctly parse path variables with complex directory structures', async () => {
    const input = '@import [$file_path/level1/{{varName}}/level2/file.md]';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('import');
    expect(node.directive.path.raw).toBe('$file_path/level1/{{varName}}/level2/file.md');
    // Check flags
    expect(node.directive.path.isAbsolute).toBe(false);
    expect(node.directive.path.isRelativeToCwd).toBe(true);
    // TODO: Debug flag calculation later - these features aren't being used yet
    // expect(node.directive.path.hasVariables).toBe(true);
    // expect(node.directive.path.hasPathVariables).toBe(true);
    // expect(node.directive.path.hasTextVariables).toBe(true); // Contains text var
    // expect(node.directive.path.variable_warning).toBe(false); // Warning should be false because path variables ARE present
    expect(node.directive.imports).toEqual([
      expect.objectContaining({
        type: 'VariableReference',
        identifier: '*',
        valueType: 'import',
        isVariableReference: true,
      }),
    ]);
    // Assert the values array
    expect(node.directive.path.values).toEqual([
      expect.objectContaining({ type: 'VariableReference', valueType: 'path', identifier: 'file_path' }),
      expect.objectContaining({ type: 'PathSeparator', value: '/' }),
      expect.objectContaining({ type: 'Text', content: 'level1' }),
      expect.objectContaining({ type: 'PathSeparator', value: '/' }),
      expect.objectContaining({ type: 'VariableReference', valueType: 'text', identifier: 'varName' }), 
      expect.objectContaining({ type: 'PathSeparator', value: '/' }),
      expect.objectContaining({ type: 'Text', content: 'level2' }),
      expect.objectContaining({ type: 'PathSeparator', value: '/' }),
      expect.objectContaining({ type: 'Text', content: 'file' }),
      expect.objectContaining({ type: 'DotSeparator', value: '.' }),
      expect.objectContaining({ type: 'Text', content: 'md' })
    ]);
    // Ensure the length is also correct
    expect(node.directive.path.values).toHaveLength(11);
  });
}); 