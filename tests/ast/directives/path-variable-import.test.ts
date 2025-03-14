/// <reference types="vitest" />
import { parse } from '../../src/index';
import { expect, describe, it } from 'vitest';
import { DirectiveNode } from '../../src/types';

describe('directives/@import with path variables', () => {
  it('should correctly parse basic path variables in import directives', async () => {
    const input = '@import [$file_path]';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('import');
    expect(node.directive.path.raw).toBe('$file_path');
    expect(node.directive.path.isPathVariable).toBe(true);
    expect(node.directive.path.structured.variables.path).toEqual(['file_path']);
    expect(node.directive.path.structured.cwd).toBe(false);
    // Import directives have an imports property with a default wildcard import
    expect(node.directive.imports).toEqual([{name: "*", alias: null}]);
  });
  
  it('should correctly parse path variables with subdirectories', async () => {
    const input = '@import [$file_path/subdirectory/file.md]';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('import');
    expect(node.directive.path.raw).toBe('$file_path/subdirectory/file.md');
    expect(node.directive.path.isPathVariable).toBe(true);
    expect(node.directive.path.structured.variables.path).toEqual(['file_path']);
    expect(node.directive.path.structured.segments).toEqual(['subdirectory', 'file.md']);
    expect(node.directive.path.structured.cwd).toBe(false);
    expect(node.directive.imports).toEqual([{name: "*", alias: null}]);
  });
  
  it('should correctly parse path variables with text variables', async () => {
    const input = '@import [$file_path/{{text_var}}.md]';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('import');
    expect(node.directive.path.raw).toBe('$file_path/{{text_var}}.md');
    expect(node.directive.path.isPathVariable).toBe(true);
    expect(node.directive.path.structured.variables.path).toEqual(['file_path']);
    expect(node.directive.path.structured.variables.text).toEqual(['text_var']);
    expect(node.directive.path.variable_warning).toBe(true);
    expect(node.directive.imports).toEqual([{name: "*", alias: null}]);
  });
  
  it('should handle non-bracketed path variable syntax', async () => {
    const input = '@import $file_path';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('import');
    expect(node.directive.path.raw).toBe('$file_path');
    expect(node.directive.path.isPathVariable).toBe(true);
    expect(node.directive.path.structured.variables.path).toEqual(['file_path']);
    expect(node.directive.imports).toEqual([{name: "*", alias: null}]);
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
    expect(node.directive.path.isPathVariable).toBe(true);
    expect(node.directive.path.structured.variables.path).toEqual(['file_path']);
    expect(node.directive.imports).toEqual([
      {name: "component1", alias: null},
      {name: "component2", alias: null}
    ]);
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
    expect(node.directive.path.isPathVariable).toBe(true);
    expect(node.directive.path.structured.variables.path).toEqual(['file_path']);
    expect(node.directive.imports).toEqual([
      {name: "component1", alias: "comp1"},
      {name: "component2", alias: "comp2"}
    ]);
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
    expect(node.directive.path.isPathVariable).toBe(true);
    expect(node.directive.path.structured.variables.path).toEqual(['file_path']);
    expect(node.directive.imports).toEqual([{name: "*", alias: null}]);
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
    expect(node.directive.path.isPathVariable).toBe(true);
    expect(node.directive.path.structured.variables.path).toEqual(['file_path']);
    expect(node.directive.imports).toEqual([
      {name: "component1", alias: null},
      {name: "component2", alias: null}
    ]);
  });
  
  // Test for path variables with complex directory structures
  it('should correctly parse path variables with complex directory structures', async () => {
    const input = '@import [$file_path/level1/{{varName}}/level2/file.md]';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    const node = ast[0] as DirectiveNode;
    expect(node.directive.kind).toBe('import');
    expect(node.directive.path.raw).toBe('$file_path/level1/{{varName}}/level2/file.md');
    expect(node.directive.path.isPathVariable).toBe(true);
    expect(node.directive.path.structured.variables.path).toEqual(['file_path']);
    expect(node.directive.path.structured.variables.text).toEqual(['varName']);
    expect(node.directive.path.structured.segments).toContain('level1');
    expect(node.directive.path.structured.segments).toContain('level2');
    expect(node.directive.path.structured.segments).toContain('file.md');
    expect(node.directive.imports).toEqual([{name: "*", alias: null}]);
  });
}); 