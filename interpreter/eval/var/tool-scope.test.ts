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
    });
  });

  it('normalizes bare executable shorthand entries', () => {
    const env = createEnvWithExecutables({
      createIssue: ['owner', 'repo', 'title']
    });

    const executable = env.getVariable('createIssue');
    const collection = normalizeToolCollection(
      {
        issue: executable
      },
      env
    );

    expect(collection.issue).toEqual({
      mlld: executable
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
      mlld: '@createIssue',
      labels: ['execute:w'],
      bind: {
        owner: 'mlld',
        repo: 'mlld'
      },
      inputs: '@create_issue_inputs'
    });
  });

  it('accepts direct whole-object wrappers for input-record tools', () => {
    const env = createEnvWithExecutables(
      {
        createIssueTool: ['input']
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
          mlld: '@createIssueTool',
          labels: ['execute:w'],
          inputs: '@create_issue_inputs',
          direct: true
        }
      },
      env
    );

    expect(collection.issue).toEqual({
      mlld: '@createIssueTool',
      labels: ['execute:w'],
      inputs: '@create_issue_inputs',
      direct: true
    });
  });

  it('preserves returns and arbitrary authored entry keys without gating them', () => {
    const env = createEnvWithExecutables({
      searchContacts: ['query']
    });

    const collection = normalizeToolCollection(
      {
        search_contacts: {
          mlld: '@searchContacts',
          returns: '@contact',
          labels: ['resolve:r'],
          kind: 'read',
          semantics: 'Search contacts.',
          description: 'Search contacts.',
          can_authorize: false,
          custom_meta: { x: 1 }
        }
      },
      env
    );

    expect(collection.search_contacts).toEqual({
      mlld: '@searchContacts',
      returns: '@contact',
      labels: ['resolve:r'],
      kind: 'read',
      semantics: 'Search contacts.',
      description: 'Search contacts.',
      can_authorize: false,
      custom_meta: { x: 1 }
    });
  });

  it('passes through legacy control metadata fields without interpreting them', () => {
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
    });
  });

  it('passes through correlateControlArgs as inert metadata', () => {
    const env = createEnvWithExecutables({
      createIssue: ['owner', 'repo', 'title']
    });

    expect(
      normalizeToolCollection(
        {
          issue: {
            mlld: '@createIssue',
            correlateControlArgs: 'yes'
          }
        },
        env
      )
    ).toEqual({
      issue: {
        mlld: '@createIssue',
        correlateControlArgs: 'yes'
      }
    });
  });

  it('passes through legacy control metadata even when inputs are declared', () => {
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

    expect(
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
    ).toEqual({
      issue: {
        mlld: '@createIssue',
        bind: {
          owner: 'mlld',
          repo: 'mlld'
        },
        inputs: '@create_issue_inputs',
        controlArgs: ['title']
      }
    });
  });

  it('passes through updateArgs and exactPayloadArgs even when inputs are declared', () => {
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

    expect(
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
    ).toEqual({
      issue: {
        mlld: '@updateIssue',
        inputs: '@update_issue_inputs',
        updateArgs: ['subject']
      }
    });

    expect(
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
    ).toEqual({
      issue: {
        mlld: '@updateIssue',
        inputs: '@update_issue_inputs',
        exactPayloadArgs: ['subject']
      }
    });
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
        mlld: '@updateIssue',
        inputs: '@update_issue_inputs',
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

  it('passes through legacy expose metadata without coverage checks', () => {
    const env = createEnvWithExecutables({
      createIssue: ['owner', 'repo', 'title']
    });

    expect(
      normalizeToolCollection(
        {
          issue: {
            mlld: '@createIssue',
            expose: ['title']
          }
        },
        env
      )
    ).toEqual({
      issue: {
        mlld: '@createIssue',
        expose: ['title']
      }
    });
  });

  it('passes through legacy controlArgs metadata without visible-param checks', () => {
    const env = createEnvWithExecutables({
      createIssue: ['owner', 'repo', 'title']
    });

    expect(
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
    ).toEqual({
      issue: {
        mlld: '@createIssue',
        bind: {
          owner: 'mlld'
        },
        expose: ['repo', 'title'],
        controlArgs: ['owner']
      }
    });
  });

  it('passes through legacy override metadata without executable subset checks', () => {
    const env = createEnvWithExecutables({
      updateIssue: {
        params: ['id', 'title', 'body'],
        controlArgs: ['id'],
        updateArgs: ['title'],
        exactPayloadArgs: ['title'],
        sourceArgs: ['body']
      }
    });

    expect(
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
    ).toEqual({
      issue: {
        mlld: '@updateIssue',
        expose: ['id', 'title', 'body'],
        controlArgs: ['id', 'title']
      }
    });

    expect(
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
    ).toEqual({
      issue: {
        mlld: '@updateIssue',
        expose: ['id', 'title', 'body'],
        updateArgs: ['body']
      }
    });

    expect(
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
    ).toEqual({
      issue: {
        mlld: '@updateIssue',
        expose: ['id', 'title', 'body'],
        exactPayloadArgs: ['body']
      }
    });

    expect(
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
    ).toEqual({
      issue: {
        mlld: '@updateIssue',
        expose: ['id', 'title', 'body'],
        sourceArgs: ['title']
      }
    });
  });

  it('returns literal tools values unchanged when withClause.tools is not an AST node', async () => {
    const env = createEnvWithExecutables({});
    const tools = ['read', 'write'];

    await expect(resolveWithClauseToolsValue(tools, env)).resolves.toBe(tools);
  });
});
