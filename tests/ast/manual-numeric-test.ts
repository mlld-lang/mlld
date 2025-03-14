/// <reference types="vitest" />
import { describe, it, expect } from 'vitest';
import { parse } from '@core/ast';
import { DataVarNode } from '@core/syntax/types';

describe('Manual numeric field access tests', () => {
  it('should parse basic numeric index with dot notation', async () => {
    const input = 'Hello {{users.0}}';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(2);
    expect(ast[0].type).toBe('Text');
    expect(ast[1].type).toBe('DataVar');
    
    const dataVar = ast[1] as DataVarNode;
    expect(dataVar.identifier).toBe('users');
    expect(dataVar.fields).toHaveLength(1);
    expect(dataVar.fields?.[0]?.type).toBe('index');
    expect(dataVar.fields?.[0]?.value).toBe(0);
  });

  it('should parse mixed field and numeric index access', async () => {
    const input = 'Hello {{data.users.0.name}}';
    const { ast } = await parse(input);
    
    const dataVar = ast[1] as DataVarNode;
    expect(dataVar.identifier).toBe('data');
    expect(dataVar.fields).toHaveLength(3);
    expect(dataVar.fields?.[0]?.type).toBe('field');
    expect(dataVar.fields?.[0]?.value).toBe('users');
    expect(dataVar.fields?.[1]?.type).toBe('index');
    expect(dataVar.fields?.[1]?.value).toBe(0);
    expect(dataVar.fields?.[2]?.type).toBe('field');
    expect(dataVar.fields?.[2]?.value).toBe('name');
  });

  it('should parse nested numeric indices with dot notation', async () => {
    const input = 'Hello {{matrix.0.1}}';
    const { ast } = await parse(input);
    
    const dataVar = ast[1] as DataVarNode;
    expect(dataVar.identifier).toBe('matrix');
    expect(dataVar.fields).toHaveLength(2);
    expect(dataVar.fields?.[0]?.type).toBe('index');
    expect(dataVar.fields?.[0]?.value).toBe(0);
    expect(dataVar.fields?.[1]?.type).toBe('index');
    expect(dataVar.fields?.[1]?.value).toBe(1);
  });

  it('should parse complex expressions with both notations', async () => {
    const input = 'Hello {{data.items.0.children[1].name}}';
    const { ast } = await parse(input);
    
    const dataVar = ast[1] as DataVarNode;
    expect(dataVar.identifier).toBe('data');
    expect(dataVar.fields).toHaveLength(5);
    expect(dataVar.fields?.[0]?.type).toBe('field');
    expect(dataVar.fields?.[0]?.value).toBe('items');
    expect(dataVar.fields?.[1]?.type).toBe('index');
    expect(dataVar.fields?.[1]?.value).toBe(0);
    expect(dataVar.fields?.[2]?.type).toBe('field');
    expect(dataVar.fields?.[2]?.value).toBe('children');
    expect(dataVar.fields?.[3]?.type).toBe('index');
    expect(dataVar.fields?.[3]?.value).toBe(1);
    expect(dataVar.fields?.[4]?.type).toBe('field');
    expect(dataVar.fields?.[4]?.value).toBe('name');
  });
}); 