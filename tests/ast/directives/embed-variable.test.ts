import { describe, it, expect } from 'vitest';
import { parse } from '@core/ast';

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
    expect(embedNode.directive.path.variable.type).toBe('TextVar');
    expect(embedNode.directive.path.variable.identifier).toBe('content');
  });

  it('should handle direct variable embedding with field access', async () => {
    const input = '@data content = {"text": "Hello World"}\n@embed {{content.text}}';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(3); // Data directive, newline, embed directive
    const embedNode = ast[2]; // The embed directive is the third node
    expect(embedNode.directive.path.raw).toBe('{{content.text}}');
    expect(embedNode.directive.path.isVariableReference).toBe(true);
    expect(embedNode.directive.path.variable.type).toBe('DataVar');
    expect(embedNode.directive.path.variable.identifier).toBe('content');
    expect(embedNode.directive.path.variable.fields).toHaveLength(1);
    expect(embedNode.directive.path.variable.fields[0].type).toBe('field');
    expect(embedNode.directive.path.variable.fields[0].value).toBe('text');
  });

  it('should handle direct variable embedding with array access using dot notation', async () => {
    const input = '@data list = ["item1", "item2"]\n@embed {{list.0}}';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(3); // Data directive, newline, embed directive
    const embedNode = ast[2]; // The embed directive is the third node
    expect(embedNode.directive.path.raw).toBe('{{list[0]}}');
    expect(embedNode.directive.path.isVariableReference).toBe(true);
    expect(embedNode.directive.path.variable.type).toBe('DataVar');
    expect(embedNode.directive.path.variable.identifier).toBe('list');
    expect(embedNode.directive.path.variable.fields).toHaveLength(1);
    expect(embedNode.directive.path.variable.fields[0].type).toBe('index');
    expect(embedNode.directive.path.variable.fields[0].value).toBe(0);
  });

  it('should handle direct variable embedding with array access using bracket notation', async () => {
    const input = '@data list = ["item1", "item2"]\n@embed {{list[0]}}';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(3); // Data directive, newline, embed directive
    const embedNode = ast[2]; // The embed directive is the third node
    expect(embedNode.directive.path.raw).toBe('{{list[0]}}');
    expect(embedNode.directive.path.isVariableReference).toBe(true);
    expect(embedNode.directive.path.variable.type).toBe('DataVar');
    expect(embedNode.directive.path.variable.identifier).toBe('list');
    expect(embedNode.directive.path.variable.fields).toHaveLength(1);
    expect(embedNode.directive.path.variable.fields[0].type).toBe('index');
    expect(embedNode.directive.path.variable.fields[0].value).toBe(0);
  });

  it('should handle direct variable embedding with complex nested access', async () => {
    const input = '@data users = [{"name": "Alice", "roles": ["admin", "user"]}]\n@embed {{users[0].roles[1]}}';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(3); // Data directive, newline, embed directive
    const embedNode = ast[2]; // The embed directive is the third node
    expect(embedNode.directive.path.raw).toBe('{{users[0].roles[1]}}');
    expect(embedNode.directive.path.isVariableReference).toBe(true);
    expect(embedNode.directive.path.variable.type).toBe('DataVar');
    expect(embedNode.directive.path.variable.identifier).toBe('users');
    expect(embedNode.directive.path.variable.fields).toHaveLength(3);
    expect(embedNode.directive.path.variable.fields[0].type).toBe('index');
    expect(embedNode.directive.path.variable.fields[0].value).toBe(0);
    expect(embedNode.directive.path.variable.fields[1].type).toBe('field');
    expect(embedNode.directive.path.variable.fields[1].value).toBe('roles');
    expect(embedNode.directive.path.variable.fields[2].type).toBe('index');
    expect(embedNode.directive.path.variable.fields[2].value).toBe(1);
  });
}); 