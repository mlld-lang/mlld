import { describe, it, expect } from 'vitest';
import { parse } from '@core/ast';
import { DirectiveNode } from '@core/syntax/types';

describe('embed directive with variable references', () => {
  it('should handle direct variable embedding with simple variables', async () => {
    const input = '@data content = {"text": "Hello World"}\n@embed {{content}}';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(3); // Data directive, newline, embed directive
    const embedNode = ast[2] as DirectiveNode; // The embed directive is the third node
    expect(embedNode.type).toBe('Directive');
    expect(embedNode.directive.kind).toBe('embed');
    expect(embedNode.directive.subtype).toBe('embedVariable');
    expect(embedNode.directive.values).toHaveLength(1);
    const variable = embedNode.directive.values[0];
    expect(variable.type).toBe('VariableReference');
    expect(variable.valueType).toBe('text');
    expect(variable.identifier).toBe('content');
  });

  it('should handle direct variable embedding with field access', async () => {
    const input = '@data content = {"text": "Hello World"}\n@embed {{content.text}}';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(3); // Data directive, newline, embed directive
    const embedNode = ast[2] as DirectiveNode; // The embed directive is the third node
    expect(embedNode.directive.subtype).toBe('embedVariable');
    expect(embedNode.directive.values).toHaveLength(1);
    const variable = embedNode.directive.values[0];
    expect(variable.type).toBe('VariableReference');
    expect(variable.valueType).toBe('data');
    expect(variable.identifier).toBe('content');
    expect(variable.fields).toEqual([{ type: 'field', value: 'text' }]);
  });

  it('should handle direct variable embedding with array access using dot notation in input', async () => {
    const input = '@data list = [1, 2, 3]\n@embed {{list.0}}';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(3); // Data directive, newline, embed directive
    const embedNode = ast[2] as DirectiveNode; // The embed directive is the third node
    expect(embedNode.directive.subtype).toBe('embedVariable');
    expect(embedNode.directive.values).toHaveLength(1);
    const variable = embedNode.directive.values[0];
    expect(variable.type).toBe('VariableReference');
    expect(variable.valueType).toBe('data');
    expect(variable.identifier).toBe('list');
    expect(variable.fields).toEqual([{ type: 'index', value: 0 }]);
  });

  it('should handle direct variable embedding with array access using bracket notation', async () => {
    const input = '@data list = [1, 2, 3]\n@embed {{list[0]}}';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(3); // Data directive, newline, embed directive
    const embedNode = ast[2] as DirectiveNode; // The embed directive is the third node
    expect(embedNode.directive.subtype).toBe('embedVariable');
    expect(embedNode.directive.values).toHaveLength(1);
    const variable = embedNode.directive.values[0];
    expect(variable.type).toBe('VariableReference');
    expect(variable.valueType).toBe('data');
    expect(variable.identifier).toBe('list');
    expect(variable.fields).toEqual([{ type: 'index', value: 0 }]);
  });

  it('should handle direct variable embedding with complex nested access', async () => {
    const input = '@data users = [{"roles": ["admin", "user"]}]\n@embed {{users[0].roles[1]}}';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(3); // Data directive, newline, embed directive
    const embedNode = ast[2] as DirectiveNode; // The embed directive is the third node
    expect(embedNode.directive.subtype).toBe('embedVariable');
    expect(embedNode.directive.values).toHaveLength(1);
    const variable = embedNode.directive.values[0];
    expect(variable.type).toBe('VariableReference');
    expect(variable.valueType).toBe('data');
    expect(variable.identifier).toBe('users');
    expect(variable.fields).toEqual([
      { type: 'index', value: 0 },
      { type: 'field', value: 'roles' },
      { type: 'index', value: 1 }
    ]);
  });
}); 