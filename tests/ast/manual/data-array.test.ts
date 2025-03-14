/// <reference types="vitest" />
import { parse } from '@core/ast';

describe('manual/data-array', () => {
  it('should parse @data with JSON object literal', async () => {
    const input = '@data var = { "my": "var" }';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    expect(ast[0].directive.kind).toBe('data');
    expect(ast[0].directive.identifier).toBe('var');
    expect(ast[0].directive.source).toBe('literal');
    expect(ast[0].directive.value).toEqual({ my: 'var' });
  });
  
  it('should parse @data with array containing objects', async () => {
    const input = '@data var = [ { "some": "var" }, { "another": "var" } ]';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    expect(ast[0].directive.kind).toBe('data');
    expect(ast[0].directive.identifier).toBe('var');
    expect(ast[0].directive.source).toBe('literal');
    expect(ast[0].directive.value).toEqual([{ some: 'var' }, { another: 'var' }]);
  });
  
  it('should parse @data with array containing comma at end', async () => {
    const input = '@data var = [ { "some": "var" }, { "another": "var" }, ]';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    expect(ast[0].directive.kind).toBe('data');
    expect(ast[0].directive.identifier).toBe('var');
    expect(ast[0].directive.source).toBe('literal');
    expect(ast[0].directive.value).toEqual([{ some: 'var' }, { another: 'var' }]);
  });
  
  it('should parse @data with nested arrays and objects', async () => {
    const input = '@data var = [ { "items": ["a", "b"] }, { "nested": { "x": 1 } } ]';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Directive');
    expect(ast[0].directive.kind).toBe('data');
    expect(ast[0].directive.identifier).toBe('var');
    expect(ast[0].directive.source).toBe('literal');
    expect(ast[0].directive.value).toEqual([{ items: ['a', 'b'] }, { nested: { x: 1 } }]);
  });
});