import { describe, expect, it, vi } from 'vitest';
import type { Environment } from '@interpreter/env/Environment';
import { createExecutableVariable } from '@core/types/variable';
import {
  enforceToolSubset,
  normalizeToolCollection,
  normalizeToolScopeValue,
  resolveWithClauseToolsValue
} from './tool-scope';

const executableSource = {
  directive: 'exe',
  syntax: 'code',
  hasInterpolation: false,
  isMultiLine: false
} as const;

function createEnvWithExecutables(paramsByName: Record<string, string[]>): Environment {
  const variables = new Map(
    Object.entries(paramsByName).map(([name, paramNames]) => [
      name,
      createExecutableVariable(name, 'code', '', paramNames, 'js', executableSource)
    ])
  );

  return {
    getVariable: vi.fn((name: string) => variables.get(name))
  } as unknown as Environment;
}

describe('tool scope helpers', () => {
  it('normalizes tool scope values from strings and arrays', () => {
    expect(normalizeToolScopeValue('*')).toEqual({
      tools: [],
      hasTools: false,
      isWildcard: true
    });

    expect(normalizeToolScopeValue(['read', 'write'])).toEqual({
      tools: ['read', 'write'],
      hasTools: true,
      isWildcard: false
    });
  });

  it('rejects invalid tool scope entries', () => {
    expect(() => normalizeToolScopeValue(['read', 42])).toThrow(/tools entries must be strings/i);
  });

  it('enforces child tool subsets', () => {
    expect(() => enforceToolSubset(['read'], ['read', 'write'])).toThrow(/outside parent/i);
  });

  it('normalizes tool collection entries and validates bind/expose coverage', () => {
    const env = createEnvWithExecutables({
      createIssue: ['owner', 'repo', 'title', 'body']
    });

    const collection = normalizeToolCollection(
      {
        issue: {
          mlld: '@createIssue',
          description: 'Create an issue',
          labels: ['internal'],
          bind: {
            owner: 'mlld',
            repo: 'mlld'
          },
          expose: ['title', 'body']
        }
      },
      env
    );

    expect(collection.issue).toEqual({
      mlld: 'createIssue',
      description: 'Create an issue',
      labels: ['internal'],
      bind: {
        owner: 'mlld',
        repo: 'mlld'
      },
      expose: ['title', 'body']
    });
  });

  it('rejects non-executable tool references', () => {
    const env = createEnvWithExecutables({});

    expect(() =>
      normalizeToolCollection(
        {
          issue: {
            mlld: '@missing'
          }
        },
        env
      )
    ).toThrow(/references non-executable/i);
  });

  it('rejects bind keys that do not match executable params', () => {
    const env = createEnvWithExecutables({
      createIssue: ['owner', 'repo', 'title']
    });

    expect(() =>
      normalizeToolCollection(
        {
          issue: {
            mlld: '@createIssue',
            bind: {
              owner: 'mlld',
              invalid: true
            }
          }
        },
        env
      )
    ).toThrow(/bind keys must match parameters/i);
  });

  it('rejects expose lists that skip required parameters', () => {
    const env = createEnvWithExecutables({
      createIssue: ['owner', 'repo', 'title']
    });

    expect(() =>
      normalizeToolCollection(
        {
          issue: {
            mlld: '@createIssue',
            expose: ['title']
          }
        },
        env
      )
    ).toThrow(/cover required parameters/i);
  });

  it('returns literal tools values unchanged when withClause.tools is not an AST node', async () => {
    const env = createEnvWithExecutables({});
    const tools = ['read', 'write'];

    await expect(resolveWithClauseToolsValue(tools, env)).resolves.toBe(tools);
  });
});
