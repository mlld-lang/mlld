/// <reference types="vitest" />
import { parse } from '@core/ast';
import { expect, describe, it } from 'vitest';
import { VariableReferenceNode } from '@core/syntax/types/index';

describe('Array access tests', () => {
  it('should parse array access with numeric index', async () => {
    const input = 'Hello {{users[0]}}';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(2);
    expect(ast[0].type).toBe('Text');
    expect(ast[1].type).toBe('VariableReference');
    
    const varNode = ast[1] as VariableReferenceNode;
    expect(varNode.identifier).toBe('users');
    expect(varNode.valueType).toBe('data');
    expect(varNode.isVariableReference).toBe(true);
    expect(varNode.fields).toHaveLength(1);
    expect(varNode.fields[0].type).toBe('index');
    expect(varNode.fields[0].value).toBe(0);
  });

  it('should parse array access with string index', async () => {
    const input = 'Hello {{users["admin"]}}';
    const { ast } = await parse(input);
    
    const varNode = ast[1] as VariableReferenceNode;
    expect(varNode.identifier).toBe('users');
    expect(varNode.valueType).toBe('data');
    expect(varNode.isVariableReference).toBe(true);
    expect(varNode.fields).toHaveLength(1);
    expect(varNode.fields[0].type).toBe('index');
    expect(varNode.fields[0].value).toBe('admin');
  });

  it('should parse array access with variable index', async () => {
    const input = 'Hello {{users[index]}}';
    const { ast } = await parse(input);
    
    const varNode = ast[1] as VariableReferenceNode;
    expect(varNode.identifier).toBe('users');
    expect(varNode.valueType).toBe('data');
    expect(varNode.isVariableReference).toBe(true);
    expect(varNode.fields).toHaveLength(1);
    expect(varNode.fields[0].type).toBe('index');
    expect(varNode.fields[0].value).toBe('index');
  });

  it('should parse mixed field and array access', async () => {
    const input = 'Hello {{users[0].name}}';
    const { ast } = await parse(input);
    
    const varNode = ast[1] as VariableReferenceNode;
    expect(varNode.identifier).toBe('users');
    expect(varNode.valueType).toBe('data');
    expect(varNode.isVariableReference).toBe(true);
    expect(varNode.fields).toHaveLength(2);
    expect(varNode.fields[0].type).toBe('index');
    expect(varNode.fields[0].value).toBe(0);
    expect(varNode.fields[1].type).toBe('field');
    expect(varNode.fields[1].value).toBe('name');
  });

  it('should parse array access after field access', async () => {
    const input = 'Hello {{data.users[0]}}';
    const { ast } = await parse(input);
    
    const varNode = ast[1] as VariableReferenceNode;
    expect(varNode.identifier).toBe('data');
    expect(varNode.valueType).toBe('data');
    expect(varNode.isVariableReference).toBe(true);
    expect(varNode.fields).toHaveLength(2);
    expect(varNode.fields[0].type).toBe('field');
    expect(varNode.fields[0].value).toBe('users');
    expect(varNode.fields[1].type).toBe('index');
    expect(varNode.fields[1].value).toBe(0);
  });

  it('should parse nested array access', async () => {
    const input = 'Hello {{matrix[0][1]}}';
    const { ast } = await parse(input);
    
    const varNode = ast[1] as VariableReferenceNode;
    expect(varNode.identifier).toBe('matrix');
    expect(varNode.valueType).toBe('data');
    expect(varNode.isVariableReference).toBe(true);
    expect(varNode.fields).toHaveLength(2);
    expect(varNode.fields[0].type).toBe('index');
    expect(varNode.fields[0].value).toBe(0);
    expect(varNode.fields[1].type).toBe('index');
    expect(varNode.fields[1].value).toBe(1);
  });
});