import { describe, expect, it, vi } from 'vitest';
import type { RecordDefinition } from '@core/types/record';
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

function createEnvWithExecutables(
  paramsByName: Record<
    string,
    string[] | {
      params: string[];
      controlArgs?: string[];
      updateArgs?: string[];
      exactPayloadArgs?: string[];
      sourceArgs?: string[];
    }
  >,
  records?: Record<string, RecordDefinition>
): Environment {
  const variables = new Map(
    Object.entries(paramsByName).map(([name, config]) => {
      const normalized = Array.isArray(config)
        ? { params: config }
        : config;
      return [
        name,
        createExecutableVariable(name, 'code', '', normalized.params, 'js', executableSource, {
          internal: {
            executableDef: {
              type: 'code',
              language: 'js',
              paramNames: normalized.params,
              sourceDirective: 'exec',
              ...(Array.isArray(normalized.controlArgs) ? { controlArgs: normalized.controlArgs } : {}),
              ...(Array.isArray(normalized.updateArgs) ? { updateArgs: normalized.updateArgs } : {}),
              ...(Array.isArray(normalized.exactPayloadArgs) ? { exactPayloadArgs: normalized.exactPayloadArgs } : {}),
              ...(Array.isArray(normalized.sourceArgs) ? { sourceArgs: normalized.sourceArgs } : {})
            }
          }
        })
      ];
    })
  );

  return {
    getVariable: vi.fn((name: string) => variables.get(name)),
    getRecordDefinition: vi.fn((name: string) => records?.[name])
  } as unknown as Environment;
}

function createInputRecord(options: {
  name: string;
  facts?: Array<{ name: string; optional?: boolean; valueType?: string }>;
  data?: Array<{ name: string; optional?: boolean; valueType?: string; dataTrust?: 'trusted' | 'untrusted' }>;
  correlate?: boolean;
  inputPolicy?: RecordDefinition['inputPolicy'];
}): RecordDefinition {
  return {
    name: options.name,
    rootMode: 'object',
    display: { kind: 'open' },
    direction: 'input',
    validate: 'strict',
    ...(options.correlate !== undefined ? { correlate: options.correlate } : {}),
    ...(options.inputPolicy ? { inputPolicy: options.inputPolicy } : {}),
    fields: [
      ...(options.facts ?? []).map(field => ({
        kind: 'input' as const,
        name: field.name,
        classification: 'fact' as const,
        sourceRoot: 'input' as const,
        source: { type: 'VariableReference', identifier: 'input', fields: [] } as any,
        optional: field.optional === true,
        ...(field.valueType ? { valueType: field.valueType as any } : {})
      })),
      ...(options.data ?? []).map(field => ({
        kind: 'input' as const,
        name: field.name,
        classification: 'data' as const,
        sourceRoot: 'input' as const,
        source: { type: 'VariableReference', identifier: 'input', fields: [] } as any,
        optional: field.optional === true,
        ...(field.valueType ? { valueType: field.valueType as any } : {}),
        ...(field.dataTrust ? { dataTrust: field.dataTrust } : {})
      }))
    ]
  };
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

  it('normalizes wrapped tool collections from preserved variable references', () => {
    const wrappedTools = {
      type: 'object',
      name: 'allTools',
      value: {},
      source: executableSource,
      internal: {
        isToolsCollection: true,
        toolCollection: {
          read: { mlld: 'readData' },
          write: { mlld: 'writeData' }
        }
      }
    };

    expect(normalizeToolScopeValue(wrappedTools)).toEqual({
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
      createIssue: {
        params: ['owner', 'repo', 'title', 'body'],
        controlArgs: ['title']
      }
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
          expose: ['title', 'body'],
          controlArgs: ['title'],
          correlateControlArgs: true
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
      expose: ['title', 'body'],
      controlArgs: ['title'],
      correlateControlArgs: true
    });
  });

  it('normalizes tool collection entries that bind an input record', () => {
    const env = createEnvWithExecutables(
      {
        createIssue: ['owner', 'repo', 'title', 'body']
      },
      {
        create_issue_inputs: createInputRecord({
          name: 'create_issue_inputs',
          facts: [{ name: 'title', valueType: 'string' }],
          data: [{ name: 'body', valueType: 'string', optional: true }]
        })
      }
    );

    const collection = normalizeToolCollection(
      {
        issue: {
          mlld: '@createIssue',
          labels: ['execute:w'],
          bind: {
            owner: 'mlld',
            repo: 'mlld'
          },
          inputs: '@create_issue_inputs'
        }
      },
      env
    );

    expect(collection.issue).toEqual({
      mlld: 'createIssue',
      labels: ['execute:w'],
      bind: {
        owner: 'mlld',
        repo: 'mlld'
      },
      inputs: 'create_issue_inputs'
    });
  });

  it('accepts restrict-only overrides for controlArgs, updateArgs, exactPayloadArgs, and sourceArgs', () => {
    const env = createEnvWithExecutables({
      updateIssue: {
        params: ['owner', 'repo', 'id', 'title', 'body'],
        controlArgs: ['owner', 'repo', 'id'],
        updateArgs: ['title', 'body'],
        exactPayloadArgs: ['title', 'body'],
        sourceArgs: ['body']
      }
    });

    const collection = normalizeToolCollection(
      {
        issue: {
          mlld: '@updateIssue',
          bind: {
            owner: 'mlld',
            repo: 'mlld'
          },
          expose: ['id', 'title', 'body'],
          controlArgs: ['id'],
          updateArgs: ['title'],
          exactPayloadArgs: ['title'],
          sourceArgs: ['body']
        }
      },
      env
    );

    expect(collection.issue).toEqual({
      mlld: 'updateIssue',
      bind: {
        owner: 'mlld',
        repo: 'mlld'
      },
      expose: ['id', 'title', 'body'],
      controlArgs: ['id'],
      updateArgs: ['title'],
      exactPayloadArgs: ['title'],
      sourceArgs: ['body']
    });
  });

  it('rejects non-boolean correlateControlArgs values', () => {
    const env = createEnvWithExecutables({
      createIssue: ['owner', 'repo', 'title']
    });

    expect(() =>
      normalizeToolCollection(
        {
          issue: {
            mlld: '@createIssue',
            correlateControlArgs: 'yes'
          }
        },
        env
      )
    ).toThrow(/correlateControlArgs must be a boolean/i);
  });

  it('rejects legacy control metadata when inputs are declared', () => {
    const env = createEnvWithExecutables(
      {
        createIssue: ['owner', 'repo', 'title', 'body']
      },
      {
        create_issue_inputs: createInputRecord({
          name: 'create_issue_inputs',
          facts: [{ name: 'title', valueType: 'string' }],
          data: [{ name: 'body', valueType: 'string' }]
        })
      }
    );

    expect(() =>
      normalizeToolCollection(
        {
          issue: {
            mlld: '@createIssue',
            bind: {
              owner: 'mlld',
              repo: 'mlld'
            },
            inputs: '@create_issue_inputs',
            controlArgs: ['title']
          }
        },
        env
      )
    ).toThrow(/inputs cannot be combined with controlArgs/i);
  });

  it('rejects updateArgs and exactPayloadArgs when inputs are declared', () => {
    const env = createEnvWithExecutables(
      {
        updateIssue: ['id', 'subject', 'body']
      },
      {
        update_issue_inputs: createInputRecord({
          name: 'update_issue_inputs',
          facts: [{ name: 'id', valueType: 'string' }],
          data: [{ name: 'subject', valueType: 'string' }, { name: 'body', valueType: 'string' }]
        })
      }
    );

    expect(() =>
      normalizeToolCollection(
        {
          issue: {
            mlld: '@updateIssue',
            inputs: '@update_issue_inputs',
            updateArgs: ['subject']
          }
        },
        env
      )
    ).toThrow(/inputs cannot be combined with updateArgs/i);

    expect(() =>
      normalizeToolCollection(
        {
          issue: {
            mlld: '@updateIssue',
            inputs: '@update_issue_inputs',
            exactPayloadArgs: ['subject']
          }
        },
        env
      )
    ).toThrow(/inputs cannot be combined with exactPayloadArgs/i);
  });

  it('requires update:w when an input record declares update fields', () => {
    const env = createEnvWithExecutables(
      {
        updateIssue: ['id', 'subject', 'body']
      },
      {
        update_issue_inputs: createInputRecord({
          name: 'update_issue_inputs',
          facts: [{ name: 'id', valueType: 'string' }],
          data: [{ name: 'subject', valueType: 'string', optional: true }, { name: 'body', valueType: 'string', optional: true }],
          inputPolicy: {
            update: ['subject', 'body']
          }
        })
      }
    );

    expect(() =>
      normalizeToolCollection(
        {
          issue: {
            mlld: '@updateIssue',
            inputs: '@update_issue_inputs',
            labels: ['execute:w']
          }
        },
        env
      )
    ).toThrow(/require label 'update:w'/i);

    expect(
      normalizeToolCollection(
        {
          issue: {
            mlld: '@updateIssue',
            inputs: '@update_issue_inputs',
            labels: ['execute:w', 'update:w']
          }
        },
        env
      )
    ).toEqual({
      issue: {
        mlld: 'updateIssue',
        inputs: 'update_issue_inputs',
        labels: ['execute:w', 'update:w']
      }
    });
  });

  it('rejects allowlist targets that point at input records', () => {
    const env = createEnvWithExecutables(
      {
        sendEmail: ['recipient', 'subject']
      },
      {
        approved_recipients: createInputRecord({
          name: 'approved_recipients',
          facts: [{ name: 'recipient', valueType: 'string' }]
        }),
        send_email_inputs: createInputRecord({
          name: 'send_email_inputs',
          facts: [{ name: 'recipient', valueType: 'string' }],
          data: [{ name: 'subject', valueType: 'string' }],
          inputPolicy: {
            allowlist: {
              recipient: { kind: 'reference', name: 'approved_recipients' }
            }
          }
        })
      }
    );

    expect(() =>
      normalizeToolCollection(
        {
          email: {
            mlld: '@sendEmail',
            inputs: '@send_email_inputs',
            labels: ['execute:w']
          }
        },
        env
      )
    ).toThrow(/allowlist target '@approved_recipients'.*must not be an input record/i);
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

  it('rejects controlArgs that are not visible parameters', () => {
    const env = createEnvWithExecutables({
      createIssue: ['owner', 'repo', 'title']
    });

    expect(() =>
      normalizeToolCollection(
        {
          issue: {
            mlld: '@createIssue',
            bind: {
              owner: 'mlld'
            },
            expose: ['repo', 'title'],
            controlArgs: ['owner']
          }
        },
        env
      )
    ).toThrow(/controlArgs must reference visible parameters/i);
  });

  it('rejects controlArgs, updateArgs, exactPayloadArgs, and sourceArgs overrides that widen executable metadata', () => {
    const env = createEnvWithExecutables({
      updateIssue: {
        params: ['id', 'title', 'body'],
        controlArgs: ['id'],
        updateArgs: ['title'],
        exactPayloadArgs: ['title'],
        sourceArgs: ['body']
      }
    });

    expect(() =>
      normalizeToolCollection(
        {
          issue: {
            mlld: '@updateIssue',
            expose: ['id', 'title', 'body'],
            controlArgs: ['id', 'title']
          }
        },
        env
      )
    ).toThrow(/controlArgs must be a subset of executable controlArgs/i);

    expect(() =>
      normalizeToolCollection(
        {
          issue: {
            mlld: '@updateIssue',
            expose: ['id', 'title', 'body'],
            updateArgs: ['body']
          }
        },
        env
      )
    ).toThrow(/updateArgs must be a subset of executable updateArgs/i);

    expect(() =>
      normalizeToolCollection(
        {
          issue: {
            mlld: '@updateIssue',
            expose: ['id', 'title', 'body'],
            exactPayloadArgs: ['body']
          }
        },
        env
      )
    ).toThrow(/exactPayloadArgs must be a subset of executable exactPayloadArgs/i);

    expect(() =>
      normalizeToolCollection(
        {
          issue: {
            mlld: '@updateIssue',
            expose: ['id', 'title', 'body'],
            sourceArgs: ['title']
          }
        },
        env
      )
    ).toThrow(/sourceArgs must be a subset of executable sourceArgs/i);
  });

  it('returns literal tools values unchanged when withClause.tools is not an AST node', async () => {
    const env = createEnvWithExecutables({});
    const tools = ['read', 'write'];

    await expect(resolveWithClauseToolsValue(tools, env)).resolves.toBe(tools);
  });
});
