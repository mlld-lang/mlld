/// <reference types="vitest" />
import { describe, it, expect } from 'vitest';
import { parse } from '@core/ast.js';
import { VariableReferenceNode } from '@core/syntax/types.js';

describe('Manual numeric field access tests', () => {
  it('should parse basic numeric index with dot notation', async () => {
    const input = 'Hello {{users.0}}';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(2);
    expect(ast[0].type).toBe('Text');
    expect(ast[1].type).toBe('VariableReference');
    
    const varNode = ast[1] as VariableReferenceNode;
    expect(varNode.identifier).toBe('users');
    expect(varNode.valueType).toBe('data');
    expect(varNode.isVariableReference).toBe(true);
    expect(varNode.fields).toHaveLength(1);
    expect(varNode.fields?.[0]?.type).toBe('index');
    expect(varNode.fields?.[0]?.value).toBe(0);
  });

  it('should parse mixed field and numeric index access', async () => {
    const input = 'Hello {{data.users.0.name}}';
    const { ast } = await parse(input);
    
    const varNode = ast[1] as VariableReferenceNode;
    expect(varNode.identifier).toBe('data');
    expect(varNode.valueType).toBe('data');
    expect(varNode.isVariableReference).toBe(true);
    expect(varNode.fields).toHaveLength(3);
    expect(varNode.fields?.[0]?.type).toBe('field');
    expect(varNode.fields?.[0]?.value).toBe('users');
    expect(varNode.fields?.[1]?.type).toBe('index');
    expect(varNode.fields?.[1]?.value).toBe(0);
    expect(varNode.fields?.[2]?.type).toBe('field');
    expect(varNode.fields?.[2]?.value).toBe('name');
  });

  it('should parse nested numeric indices with dot notation', async () => {
    const input = 'Hello {{matrix.0.1}}';
    const { ast } = await parse(input);
    
    const varNode = ast[1] as VariableReferenceNode;
    expect(varNode.identifier).toBe('matrix');
    expect(varNode.valueType).toBe('data');
    expect(varNode.isVariableReference).toBe(true);
    expect(varNode.fields).toHaveLength(2);
    expect(varNode.fields?.[0]?.type).toBe('index');
    expect(varNode.fields?.[0]?.value).toBe(0);
    expect(varNode.fields?.[1]?.type).toBe('index');
    expect(varNode.fields?.[1]?.value).toBe(1);
  });

  it('should parse complex expressions with both notations', async () => {
    const input = 'Hello {{data.items.0.children[1].name}}';
    const { ast } = await parse(input);
    
    const varNode = ast[1] as VariableReferenceNode;
    expect(varNode.identifier).toBe('data');
    expect(varNode.valueType).toBe('data');
    expect(varNode.isVariableReference).toBe(true);
    expect(varNode.fields).toHaveLength(5);
    expect(varNode.fields?.[0]?.type).toBe('field');
    expect(varNode.fields?.[0]?.value).toBe('items');
    expect(varNode.fields?.[1]?.type).toBe('index');
    expect(varNode.fields?.[1]?.value).toBe(0);
    expect(varNode.fields?.[2]?.type).toBe('field');
    expect(varNode.fields?.[2]?.value).toBe('children');
    expect(varNode.fields?.[3]?.type).toBe('index');
    expect(varNode.fields?.[3]?.value).toBe(1);
    expect(varNode.fields?.[4]?.type).toBe('field');
    expect(varNode.fields?.[4]?.value).toBe('name');
  });
}); 