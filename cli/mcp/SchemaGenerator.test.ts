import { describe, expect, it } from 'vitest';
import { createExecutableVariable } from '@core/types/variable/VariableFactories';
import { generateToolSchema, mlldNameToMCPName, mcpNameToMlldName } from './SchemaGenerator';

const source = {
  directive: 'var' as const,
  syntax: 'code' as const,
  hasInterpolation: false,
  isMultiLine: false,
};

describe('SchemaGenerator', () => {
  it('generates schema for executable variable', () => {
    const execVar = createExecutableVariable(
      'listIssues',
      'code',
      'return [];',
      ['owner', 'repo'],
      'node',
      source,
      undefined
    );
    execVar.description = 'List issues for a repository';

    const schema = generateToolSchema('listIssues', execVar);

    expect(schema).toEqual({
      name: 'list_issues',
      description: 'List issues for a repository',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string' },
          repo: { type: 'string' },
        },
        required: ['owner', 'repo'],
      },
    });
  });

  it('maps parameter types to JSON schema types', () => {
    const execVar = createExecutableVariable(
      'searchIssues',
      'code',
      'return [];',
      ['query', 'limit', 'includeClosed', 'labels', 'filters'],
      'node',
      source,
      undefined
    );
    execVar.paramTypes = {
      limit: 'number',
      includeClosed: 'boolean',
      labels: 'array',
      filters: 'object'
    };

    const schema = generateToolSchema('searchIssues', execVar);

    expect(schema.inputSchema.properties).toEqual({
      query: { type: 'string' },
      limit: { type: 'number' },
      includeClosed: { type: 'boolean' },
      labels: { type: 'array' },
      filters: { type: 'object' }
    });
  });

  it('converts mlld names to MCP snake_case', () => {
    expect(mlldNameToMCPName('listIssues')).toBe('list_issues');
    expect(mlldNameToMCPName('createIssue')).toBe('create_issue');
    expect(mlldNameToMCPName('fetchPPP')).toBe('fetch_p_p_p');
  });

  it('converts MCP names back to mlld camelCase', () => {
    expect(mcpNameToMlldName('list_issues')).toBe('listIssues');
    expect(mcpNameToMlldName('create_issue')).toBe('createIssue');
  });
});
