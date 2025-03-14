/// <reference types="vitest" />
import { parse } from '@core/ast';
import { DataVarNode } from '@core/syntax/types';

describe('Array access tests', () => {
  it('should parse array access with numeric index', async () => {
    const input = 'Hello {{users[0]}}';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(2);
    expect(ast[0].type).toBe('Text');
    expect(ast[1].type).toBe('DataVar');
    
    const dataVar = ast[1] as DataVarNode;
    expect(dataVar.identifier).toBe('users');
    expect(dataVar.fields).toHaveLength(1);
    expect(dataVar.fields[0].type).toBe('index');
    expect(dataVar.fields[0].value).toBe(0);
  });

  it('should parse array access with string index', async () => {
    const input = 'Hello {{users["admin"]}}';
    const { ast } = await parse(input);
    
    const dataVar = ast[1] as DataVarNode;
    expect(dataVar.identifier).toBe('users');
    expect(dataVar.fields).toHaveLength(1);
    expect(dataVar.fields[0].type).toBe('index');
    expect(dataVar.fields[0].value).toBe('admin');
  });

  it('should parse array access with variable index', async () => {
    const input = 'Hello {{users[index]}}';
    const { ast } = await parse(input);
    
    const dataVar = ast[1] as DataVarNode;
    expect(dataVar.identifier).toBe('users');
    expect(dataVar.fields).toHaveLength(1);
    expect(dataVar.fields[0].type).toBe('index');
    expect(dataVar.fields[0].value).toBe('index');
  });

  it('should parse mixed field and array access', async () => {
    const input = 'Hello {{users[0].name}}';
    const { ast } = await parse(input);
    
    const dataVar = ast[1] as DataVarNode;
    expect(dataVar.identifier).toBe('users');
    expect(dataVar.fields).toHaveLength(2);
    expect(dataVar.fields[0].type).toBe('index');
    expect(dataVar.fields[0].value).toBe(0);
    expect(dataVar.fields[1].type).toBe('field');
    expect(dataVar.fields[1].value).toBe('name');
  });

  it('should parse array access after field access', async () => {
    const input = 'Hello {{data.users[0]}}';
    const { ast } = await parse(input);
    
    const dataVar = ast[1] as DataVarNode;
    expect(dataVar.identifier).toBe('data');
    expect(dataVar.fields).toHaveLength(2);
    expect(dataVar.fields[0].type).toBe('field');
    expect(dataVar.fields[0].value).toBe('users');
    expect(dataVar.fields[1].type).toBe('index');
    expect(dataVar.fields[1].value).toBe(0);
  });

  it('should parse nested array access', async () => {
    const input = 'Hello {{matrix[0][1]}}';
    const { ast } = await parse(input);
    
    const dataVar = ast[1] as DataVarNode;
    expect(dataVar.identifier).toBe('matrix');
    expect(dataVar.fields).toHaveLength(2);
    expect(dataVar.fields[0].type).toBe('index');
    expect(dataVar.fields[0].value).toBe(0);
    expect(dataVar.fields[1].type).toBe('index');
    expect(dataVar.fields[1].value).toBe(1);
  });
});