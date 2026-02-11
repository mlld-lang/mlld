import { describe, expect, it } from 'vitest';
import { createSimpleTextVariable } from '@core/types/variable';
import type { Environment } from '@interpreter/env/Environment';
import {
  evaluateArrayItem,
  evaluateCollectionObject,
  hasComplexArrayItems,
  hasComplexValues
} from './collection-evaluator';

const baseSource = {
  directive: 'var',
  syntax: 'quoted',
  hasInterpolation: false,
  isMultiLine: false
} as const;

function createEnvStub(variables: Record<string, unknown> = {}): Environment {
  return {
    getVariable: (name: string) => variables[name]
  } as unknown as Environment;
}

describe('collection evaluator', () => {
  it('detects complex collection shapes', () => {
    expect(hasComplexArrayItems([{ type: 'object', entries: [] }])).toBe(true);

    expect(
      hasComplexValues([
        {
          type: 'pair',
          key: 'users',
          value: {
            type: 'array',
            items: [{ type: 'object', entries: [] }]
          }
        }
      ])
    ).toBe(true);

    expect(
      hasComplexValues({
        title: {
          wrapperType: 'doubleQuote',
          content: [{ type: 'Text', content: 'ok' }]
        }
      })
    ).toBe(false);
  });

  it('recursively evaluates nested arrays and objects with wrapped text/literals', async () => {
    const env = createEnvStub();

    const valueNode = {
      type: 'object',
      entries: [
        {
          type: 'pair',
          key: 'users',
          value: {
            type: 'array',
            items: [
              {
                type: 'object',
                entries: [
                  {
                    type: 'pair',
                    key: 'name',
                    value: {
                      wrapperType: 'doubleQuote',
                      content: [
                        { type: 'Text', content: 'al' },
                        { type: 'Literal', value: 'ice' }
                      ]
                    }
                  },
                  {
                    type: 'pair',
                    key: 'roles',
                    value: {
                      type: 'array',
                      items: [
                        {
                          wrapperType: 'doubleQuote',
                          content: [{ type: 'Text', content: 'admin' }]
                        }
                      ]
                    }
                  }
                ]
              }
            ]
          }
        }
      ]
    };

    const result = await evaluateCollectionObject(valueNode, env);

    expect(result).toEqual({
      users: [
        {
          name: 'alice',
          roles: ['admin']
        }
      ]
    });
  });

  it('preserves variable references and collects descriptors in collection items', async () => {
    const secret = createSimpleTextVariable('secret', 'token', baseSource);
    secret.mx = {
      labels: ['secret'],
      taint: ['secret'],
      sources: []
    };

    const env = createEnvStub({ secret });
    const collected: Array<{ labels: string[] }> = [];

    const result = await evaluateArrayItem(
      { type: 'VariableReference', identifier: 'secret' },
      env,
      descriptor => {
        if (descriptor) {
          collected.push({ labels: descriptor.labels });
        }
      }
    );

    expect(result).toBe(secret);
    expect(collected).toEqual([{ labels: ['secret'] }]);
  });

  it('enforces pair-only object entries when requested', async () => {
    const env = createEnvStub();

    await expect(
      evaluateCollectionObject(
        {
          type: 'object',
          entries: [
            {
              type: 'spread',
              variable: { type: 'VariableReference', identifier: 'anything' }
            }
          ]
        },
        env,
        undefined,
        undefined,
        undefined,
        true
      )
    ).rejects.toThrow('Tool definitions must be plain object entries');
  });
});
