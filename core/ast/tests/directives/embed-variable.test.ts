import { describe, it, expect } from 'vitest';
import { parse } from '@core/ast.js';

describe('embed directive with variable references', () => {
  it('should handle direct variable embedding with simple variables', async () => {
    const input = '@data content = {"text": "Hello World"}\n@embed {{content}}';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(3); // Data directive, newline, embed directive
    const embedNode = ast[2]; // The embed directive is the third node
    expect(embedNode.type).toBe('Directive');
    expect(embedNode.directive.kind).toBe('embed');
    expect(embedNode.directive.path.raw).toBe('{{content}}');
    expect(embedNode.directive.path.isVariableReference).toBe(true);
    expect(embedNode.directive.path.variable.type).toBe('VariableReference');
    expect(embedNode.directive.path.variable.valueType).toBe('text');
    expect(embedNode.directive.path.variable.identifier).toBe('content');
  });

  it('should handle direct variable embedding with field access', async () => {
    const input = '@data content = {"text": "Hello World"}\n@embed {{content.text}}';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(3); // Data directive, newline, embed directive
    const embedNode = ast[2]; // The embed directive is the third node
    expect(embedNode.directive.path.raw).toBe('{{content.text}}');
    expect(embedNode.directive.path.isVariableReference).toBe(true);
    expect(embedNode.directive.path.variable.type).toBe('VariableReference');
    expect(embedNode.directive.path.variable.valueType).toBe('data');
    expect(embedNode.directive.path.variable.identifier).toBe('content');
    expect(embedNode.directive.path.variable.fields).toEqual([{ type: 'field', value: 'text' }]);
  });

  it('should handle direct variable embedding with array access using dot notation in input', async () => {
    const input = '@data list = [1, 2, 3]\n@embed {{list.0}}';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(3); // Data directive, newline, embed directive
    const embedNode = ast[2]; // The embed directive is the third node
    expect(embedNode.directive.path.raw).toBe('{{list[0]}}');
    expect(embedNode.directive.path.isVariableReference).toBe(true);
    expect(embedNode.directive.path.variable.type).toBe('VariableReference');
    expect(embedNode.directive.path.variable.valueType).toBe('data');
    expect(embedNode.directive.path.variable.identifier).toBe('list');
    expect(embedNode.directive.path.variable.fields).toEqual([{ type: 'index', value: 0 }]);
  });

  it('should handle direct variable embedding with array access using bracket notation', async () => {
    const input = '@data list = [1, 2, 3]\n@embed {{list[0]}}';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(3); // Data directive, newline, embed directive
    const embedNode = ast[2]; // The embed directive is the third node
    expect(embedNode.directive.path.raw).toBe('{{list[0]}}');
    expect(embedNode.directive.path.isVariableReference).toBe(true);
    expect(embedNode.directive.path.variable.type).toBe('VariableReference');
    expect(embedNode.directive.path.variable.valueType).toBe('data');
    expect(embedNode.directive.path.variable.identifier).toBe('list');
    expect(embedNode.directive.path.variable.fields).toEqual([{ type: 'index', value: 0 }]);
  });

  it('should handle direct variable embedding with complex nested access', async () => {
    const input = '@data users = [{"roles": ["admin", "user"]}]\n@embed {{users[0].roles[1]}}';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(3); // Data directive, newline, embed directive
    const embedNode = ast[2]; // The embed directive is the third node
    expect(embedNode.directive.path.raw).toBe('{{users[0].roles[1]}}');
    expect(embedNode.directive.path.isVariableReference).toBe(true);
    expect(embedNode.directive.path.variable.type).toBe('VariableReference');
    expect(embedNode.directive.path.variable.valueType).toBe('data');
    expect(embedNode.directive.path.variable.identifier).toBe('users');
    expect(embedNode.directive.path.variable.fields).toEqual([
      { type: 'index', value: 0 },
      { type: 'field', value: 'roles' },
      { type: 'index', value: 1 }
    ]);
  });
}); 