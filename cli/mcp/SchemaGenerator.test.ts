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

    const schema = generateToolSchema('listIssues', execVar);

    expect(schema).toEqual({
      name: 'list_issues',
      description: '',
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
