import { describe, it, expect } from 'vitest';
import { parse } from '@core/ast';
import { VariableReferenceNode } from '@core/syntax/types';

describe('Numeric field access tests', () => {
  it('should parse numeric indices with dot notation', async () => {
    const input = 'Hello {{users.0}}';
    const result = await parse(input);

    expect(result.ast).toMatchObject([
      {
        type: 'Text',
        content: 'Hello '
      },
      {
        type: 'VariableReference',
        identifier: 'users',
        valueType: 'data',
        isVariableReference: true,
        fields: [
          {
            type: 'index',
            value: 0
          }
        ]
      }
    ]);
  });

  it('should parse mixed field and numeric index access', async () => {
    const input = 'Hello {{data.users.0.name}}';
    const result = await parse(input);

    expect(result.ast).toMatchObject([
      {
        type: 'Text',
        content: 'Hello '
      },
      {
        type: 'VariableReference',
        identifier: 'data',
        valueType: 'data',
        isVariableReference: true,
        fields: [
          {
            type: 'field',
            value: 'users'
          },
          {
            type: 'index',
            value: 0
          },
          {
            type: 'field',
            value: 'name'
          }
        ]
      }
    ]);
  });

  it('should parse nested numeric indices with dot notation', async () => {
    const input = 'Hello {{matrix.0.1}}';
    const result = await parse(input);

    expect(result.ast).toMatchObject([
      {
        type: 'Text',
        content: 'Hello '
      },
      {
        type: 'VariableReference',
        identifier: 'matrix',
        valueType: 'data',
        isVariableReference: true,
        fields: [
          {
            type: 'index',
            value: 0
          },
          {
            type: 'index',
            value: 1
          }
        ]
      }
    ]);
  });

  it('should parse complex expressions with both notations', async () => {
    const input = 'Hello {{data.items.0.children.1.name}}';
    const result = await parse(input);

    expect(result.ast).toMatchObject([
      {
        type: 'Text',
        content: 'Hello '
      },
      {
        type: 'VariableReference',
        identifier: 'data',
        valueType: 'data',
        isVariableReference: true,
        fields: [
          {
            type: 'field',
            value: 'items'
          },
          {
            type: 'index',
            value: 0
          },
          {
            type: 'field',
            value: 'children'
          },
          {
            type: 'index',
            value: 1
          },
          {
            type: 'field',
            value: 'name'
          }
        ]
      }
    ]);
  });
}); 