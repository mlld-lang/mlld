import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ExecInvocation } from '@core/types';
import { Environment } from '../env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { parse } from '@grammar/parser';
import { evaluate } from '../core/interpreter';
import { evaluateExecInvocation } from './exec-invocation';
import { asText, isStructuredValue, wrapStructured } from '../utils/structured-value';
import { createExecutableVariable } from '@core/types/variable';
import type { VariableSource } from '@core/types/variable';
import { makeSecurityDescriptor } from '@core/types/security';
import { accessField } from '../utils/field-access';
import { evaluateFyiFacts } from '@interpreter/fyi/facts-runtime';

describe('evaluateExecInvocation (structured)', () => {
  let env: Environment;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlld-exec-invocation-'));
    fs.writeFileSync(
      path.join(tempDir, 'mlld-config.json'),
      JSON.stringify({ projectname: 'demo' }, null, 2)
    );
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    env = new Environment(fileSystem, pathService, tempDir);

    const source = `
/exe @emitText() = js { return 'hello' }
/exe @emitJson() = js { return '{"count":3}' }
/exe @parseJson(value) = js { return JSON.parse(value) }
/var @sampleObject = { "nested": { "value": 1 } }
`;
    const { ast } = await parse(source);
    await evaluate(ast, env);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('wraps plain exec output when structured flag is enabled', async () => {
    const invocation: ExecInvocation = {
      type: 'ExecInvocation',
      nodeId: 'emit-text',
      commandRef: {
        type: 'CommandReference',
        nodeId: 'emit-text-ref',
        identifier: 'emitText',
        args: []
      }
    };

    const result = await evaluateExecInvocation(invocation, env);
    expect(isStructuredValue(result.value)).toBe(true);
    expect(result.value.type).toBe('text');
    expect(asText(result.value)).toBe('hello');
    expect(result.stdout).toBe('hello');
  });

  it('preserves structured pipeline output via with-clause', async () => {
    const invocation: ExecInvocation = {
      type: 'ExecInvocation',
      nodeId: 'emit-json',
      commandRef: {
        type: 'CommandReference',
        nodeId: 'emit-json-ref',
        identifier: 'emitJson',
        args: []
      },
      withClause: {
        pipeline: [
          {
            rawIdentifier: 'parseJson',
            identifier: [
              {
                type: 'VariableReference',
                nodeId: 'parse-json-stage',
                identifier: 'parseJson',
                fields: []
              } as any
            ],
            args: [],
            fields: [],
            rawArgs: []
          }
        ]
      }
    };

    const result = await evaluateExecInvocation(invocation, env);
    expect(isStructuredValue(result.value)).toBe(true);
    expect(result.value.type).toBe('object');
    expect(result.value.data).toEqual({ count: 3 });
    expect(asText(result.value)).toBe('{"count":3}');
    expect(result.stdout).toBe(asText(result.value));
  });

  it('coerces exec output through declared records before returning structured values', async () => {
    const src = `
/record @contact = {
  facts: [email: string, @input.organization as org: string?],
  data: [{ display: \`@input.first @input.last\` }: string]
}
/exe @emitContact() = js {
  return {
    email: 'ada@example.com',
    organization: 'analytical',
    first: 'Ada',
    last: 'Lovelace'
  };
} => contact
`;
    const { ast } = await parse(src);
    await evaluate(ast, env);

    const invocation: ExecInvocation = {
      type: 'ExecInvocation',
      nodeId: 'emit-contact',
      commandRef: {
        type: 'CommandReference',
        nodeId: 'emit-contact-ref',
        identifier: 'emitContact',
        args: []
      }
    };

    const result = await evaluateExecInvocation(invocation, env);
    expect(isStructuredValue(result.value)).toBe(true);
    expect(result.value.type).toBe('object');
    expect(result.value.mx.schema?.valid).toBe(true);
    expect(result.value.mx.factsources?.map(handle => handle.ref)).toEqual([
      '@contact.email',
      '@contact.org',
      '@contact.display'
    ]);

    const email = await accessField(result.value, { type: 'field', value: 'email' } as any);
    expect(isStructuredValue(email)).toBe(true);
    expect(email.text).toBe('ada@example.com');
    expect(email.mx.labels).toContain('fact:@contact.email');
    expect(email.mx.factsources?.map(handle => handle.ref)).toEqual(['@contact.email']);

    const display = await accessField(result.value, { type: 'field', value: 'display' } as any);
    expect(isStructuredValue(display)).toBe(true);
    expect(display.text).toBe('Ada Lovelace');
  });

  it('resolves exact handle wrappers back to live values before execution', async () => {
    const src = `
/record @contact = {
  facts: [email: string]
}
/exe @emitContact() = js {
  return { email: 'ada@example.com' };
} => contact
/var @contact = @emitContact()
/exe @echo(value) = @value
`;
    const { ast } = await parse(src);
    await evaluate(ast, env);
    const contact = env.getVariable('contact');
    expect(contact).toBeDefined();
    env.setScopedEnvironmentConfig({
      fyi: {
        facts: [contact!]
      }
    });

    const facts = await evaluateFyiFacts({ op: 'op:@email.send', arg: 'recipient' }, env);
    const handle = facts.data[0]?.handle;
    expect(handle).toBe('h_1');

    const result = await evaluateExecInvocation(
      {
        type: 'ExecInvocation',
        nodeId: 'echo-handle',
        commandRef: {
          type: 'CommandReference',
          nodeId: 'echo-handle-ref',
          identifier: 'echo',
          args: [{ handle } as any]
        }
      },
      env
    );

    expect(asText(result.value)).toBe('ada@example.com');
    expect(isStructuredValue(result.value)).toBe(true);
    expect(result.value.mx.has_label?.('fact:*.email')).toBe(true);
  });

  it('rejects unknown handle wrappers instead of passing them through', async () => {
    const src = '/exe @echo(value) = @value';
    const { ast } = await parse(src);
    await evaluate(ast, env);

    await expect(
      evaluateExecInvocation(
        {
          type: 'ExecInvocation',
          nodeId: 'echo-missing-handle',
          commandRef: {
            type: 'CommandReference',
            nodeId: 'echo-missing-handle-ref',
            identifier: 'echo',
            args: [{ handle: 'h_missing' } as any]
          }
        },
        env
      )
    ).rejects.toThrow(/unknown handle/i);
  });

  it('does not treat objects with extra keys as handle wrappers', async () => {
    const src = '/exe @echo(value) = @value';
    const { ast } = await parse(src);
    await evaluate(ast, env);

    const result = await evaluateExecInvocation(
      {
        type: 'ExecInvocation',
        nodeId: 'echo-extra-keys',
        commandRef: {
          type: 'CommandReference',
          nodeId: 'echo-extra-keys-ref',
          identifier: 'echo',
          args: [{ handle: 'h_1', label: 'not-a-wrapper' } as any]
        }
      },
      env
    );

    expect(isStructuredValue(result.value)).toBe(true);
    expect(result.value.data).toEqual({ handle: 'h_1', label: 'not-a-wrapper' });
  });

  it('lets call-site fyi roots override inherited scoped roots for a specific invocation', async () => {
    const src = `
/record @contact = { facts: [email: string] }
/exe @emitA() = js { return { email: 'ada@example.com' }; } => contact
/exe @emitB() = js { return { email: 'grace@example.com' }; } => contact
/var @contactA = @emitA()
/var @contactB = @emitB()
/exe @discover() = @fyi.facts({ op: "op:@email.send", arg: "recipient" })
`;
    const { ast } = await parse(src);
    await evaluate(ast, env);
    const contactA = env.getVariable('contactA');
    expect(contactA).toBeDefined();
    env.setScopedEnvironmentConfig({
      fyi: {
        facts: [contactA!]
      }
    });

    const result = await evaluateExecInvocation(
      {
        type: 'ExecInvocation',
        nodeId: 'discover-override',
        commandRef: {
          type: 'CommandReference',
          nodeId: 'discover-override-ref',
          identifier: 'discover',
          args: []
        },
        withClause: {
          fyi: {
            type: 'object',
            entries: [
              {
                type: 'pair',
                key: 'facts',
                value: {
                  type: 'array',
                  items: [
                    {
                      type: 'VariableReference',
                      nodeId: 'contact-b-ref',
                      identifier: 'contactB',
                      fields: []
                    }
                  ]
                }
              }
            ]
          }
        } as any
      },
      env
    );

    expect(isStructuredValue(result.value)).toBe(true);
    expect(result.value.data).toEqual([
      {
        handle: 'h_1',
        label: 'grace@example.com',
        field: 'email',
        fact: 'fact:@contact.email'
      }
    ]);
  });

  it('returns false for isDefined on missing variables', async () => {
    const invocation: ExecInvocation = {
      type: 'ExecInvocation',
      nodeId: 'missing-var',
      commandRef: {
        name: 'isDefined',
        objectReference: {
          type: 'VariableReference',
          nodeId: 'missing-ref',
          identifier: 'doesNotExist',
          fields: []
        },
        args: []
      }
    };

    const result = await evaluateExecInvocation(invocation, env);
    expect(asText(result.value)).toBe('false');
  });

  it('returns false for isDefined on missing fields', async () => {
    const invocation: ExecInvocation = {
      type: 'ExecInvocation',
      nodeId: 'missing-field',
      commandRef: {
        name: 'isDefined',
        objectReference: {
          type: 'VariableReference',
          nodeId: 'obj-ref',
          identifier: 'sampleObject',
          fields: [
            {
              type: 'Field',
              nodeId: 'missing-field-node',
              value: 'notPresent'
            }
          ]
        },
        args: []
      }
    };

    const result = await evaluateExecInvocation(invocation, env);
    expect(asText(result.value)).toBe('false');
  });

  it('resolves executable methods through nested object fields', async () => {
    const src = `
/exe @deep() = js { return "nested-ok" }
/var @nested = {
  child: {
    func: @deep
  }
}
`;
    const { ast } = await parse(src);
    await evaluate(ast, env);

    const invocation: ExecInvocation = {
      type: 'ExecInvocation',
      nodeId: 'nested-field-method',
      commandRef: {
        name: 'func',
        objectReference: {
          type: 'VariableReference',
          nodeId: 'nested-field-ref',
          identifier: 'nested',
          fields: [
            {
              type: 'Field',
              nodeId: 'nested-child-field',
              value: 'child'
            }
          ]
        },
        args: []
      } as any
    };

    const result = await evaluateExecInvocation(invocation, env);
    expect(asText(result.value)).toBe('nested-ok');
  });

  it('pipes RHS variable through inline command pipeline', async () => {
    const src = '/exe @pipe(value) = @value | cmd { cat }';
    const { ast } = await parse(src);
    await evaluate(ast, env);

    const invocation: ExecInvocation = {
      type: 'ExecInvocation',
      nodeId: 'pipe',
      commandRef: {
        type: 'CommandReference',
        nodeId: 'pipe-ref',
        identifier: 'pipe',
        args: [{ type: 'Text', content: 'hello' } as any]
      }
    };

    const result = await evaluateExecInvocation(invocation, env);
    expect(asText(result.value)).toBe('hello');
  });

  it('preserves null exec parameters for when guards instead of coercing them to text', async () => {
    const src = `
/exe @guard(x) = [
  when !@x => "missing"
  => "ok: @x"
]
`;
    const { ast } = await parse(src);
    await evaluate(ast, env);

    const nullInvocation: ExecInvocation = {
      type: 'ExecInvocation',
      nodeId: 'guard-null',
      commandRef: {
        type: 'CommandReference',
        nodeId: 'guard-null-ref',
        identifier: 'guard',
        args: [{ type: 'Literal', nodeId: 'null-arg', value: null, valueType: 'null' } as any]
      }
    };
    const helloInvocation: ExecInvocation = {
      type: 'ExecInvocation',
      nodeId: 'guard-hello',
      commandRef: {
        type: 'CommandReference',
        nodeId: 'guard-hello-ref',
        identifier: 'guard',
        args: [{ type: 'Text', nodeId: 'hello-arg', content: 'hello' } as any]
      }
    };

    const nullResult = await evaluateExecInvocation(nullInvocation, env);
    const helloResult = await evaluateExecInvocation(helloInvocation, env);

    expect(asText(nullResult.value)).toBe('missing');
    expect(asText(helloResult.value)).toBe('ok: hello');
  });

  it('supports legacy run-pipe sugar in exe RHS', async () => {
    const src = '/exe @pipeRun(value) = run @value | cmd { cat }';
    const { ast } = await parse(src);
    await evaluate(ast, env);

    const invocation: ExecInvocation = {
      type: 'ExecInvocation',
      nodeId: 'pipe-run',
      commandRef: {
        type: 'CommandReference',
        nodeId: 'pipe-run-ref',
        identifier: 'pipeRun',
        args: [{ type: 'Text', content: 'world' } as any]
      }
    };

    const result = await evaluateExecInvocation(invocation, env);
    expect(asText(result.value)).toBe('world');
  });

  it('processes value through inline pipeline structure (direct source)', async () => {
    const src = '/exe @func(value) = @value | cmd { tr a-z A-Z }';
    const { ast } = await parse(src);
    await evaluate(ast, env);

    const invocation: ExecInvocation = {
      type: 'ExecInvocation',
      nodeId: 'func-inline',
      commandRef: {
        type: 'CommandReference',
        nodeId: 'func-inline-ref',
        identifier: 'func',
        args: [{ type: 'Text', content: 'abc123' } as any]
      }
    };

    const result = await evaluateExecInvocation(invocation, env);
    expect(asText(result.value)).toBe('ABC123');
  });

  it('processes value through inline command body pipeline', async () => {
    const src = '/exe @func(value) = cmd { printf "%s" "@value" | tr a-z A-Z }';
    const { ast } = await parse(src);
    await evaluate(ast, env);

    const invocation: ExecInvocation = {
      type: 'ExecInvocation',
      nodeId: 'func-inline-body',
      commandRef: {
        type: 'CommandReference',
        nodeId: 'func-inline-body-ref',
        identifier: 'func',
        args: [{ type: 'Text', content: 'abc123' } as any]
      }
    };

    const result = await evaluateExecInvocation(invocation, env);
    expect(asText(result.value).trim()).toBe('ABC123');
  });

  it('processes delegated executable output through pipeline', async () => {
    const src = `
/exe @other(value) = js { return value + "-tail" }
/exe @func(value) = @other(value) | cmd { tr a-z A-Z }
`;
    const { ast } = await parse(src);
    await evaluate(ast, env);

    const invocation: ExecInvocation = {
      type: 'ExecInvocation',
      nodeId: 'func-delegate',
      commandRef: {
        type: 'CommandReference',
        nodeId: 'func-delegate-ref',
        identifier: 'func',
        args: [{ type: 'Text', content: 'abc' } as any]
      }
    };

    const result = await evaluateExecInvocation(invocation, env);
    expect(asText(result.value)).toBe('ABC-TAIL');
  });

  it('processes js output through inline pipeline', async () => {
    const src = '/exe @func(value) = js { return "hi-" + value } | cmd { tr a-z A-Z }';
    const { ast } = await parse(src);
    await evaluate(ast, env);

    const invocation: ExecInvocation = {
      type: 'ExecInvocation',
      nodeId: 'func-js',
      commandRef: {
        type: 'CommandReference',
        nodeId: 'func-js-ref',
        identifier: 'func',
        args: [{ type: 'Text', content: 'there' } as any]
      }
    };

    const result = await evaluateExecInvocation(invocation, env);
    expect(asText(result.value)).toBe('HI-THERE');
  });

  it('supports builtin chaining from exec-result objectSource values', async () => {
    const src = '/exe @emitRaw() = "  alpha,beta,gamma  "';
    const { ast } = await parse(src);
    await evaluate(ast, env);

    const invocation: ExecInvocation = {
      type: 'ExecInvocation',
      nodeId: 'builtin-chain-join',
      commandRef: {
        name: 'join',
        args: [{ type: 'Text', content: ':' } as any],
        objectSource: {
          type: 'ExecInvocation',
          nodeId: 'builtin-chain-split',
          commandRef: {
            name: 'split',
            args: [{ type: 'Text', content: ',' } as any],
            objectSource: {
              type: 'ExecInvocation',
              nodeId: 'builtin-chain-trim',
              commandRef: {
                name: 'trim',
                args: [],
                objectSource: {
                  type: 'ExecInvocation',
                  nodeId: 'builtin-chain-source',
                  commandRef: {
                    type: 'CommandReference',
                    nodeId: 'emit-raw-ref',
                    identifier: 'emitRaw',
                    args: []
                  }
                }
              }
            }
          }
        }
      } as any
    };

    const result = await evaluateExecInvocation(invocation, env);
    expect(asText(result.value)).toBe('alpha:beta:gamma');
  });

  it('preserves security labels for commandRef explicit argument forwarding', async () => {
    const src = `
/exe @leaf(value) = @value
/exe @forward(value) = @leaf(@value)
`;
    const { ast } = await parse(src);
    await evaluate(ast, env);

    const secureArg = wrapStructured('vault-token', 'text', 'vault-token', {
      security: makeSecurityDescriptor({
        labels: ['secret'],
        taint: ['secret'],
        sources: ['phase0-command-ref-explicit']
      })
    });

    const invocation: ExecInvocation = {
      type: 'ExecInvocation',
      nodeId: 'forward-explicit',
      commandRef: {
        type: 'CommandReference',
        nodeId: 'forward-explicit-ref',
        identifier: 'forward',
        args: [secureArg as any]
      }
    };

    const result = await evaluateExecInvocation(invocation, env);
    expect(asText(result.value)).toBe('vault-token');
    expect(isStructuredValue(result.value)).toBe(true);
    expect(result.value.mx?.labels).toEqual(expect.arrayContaining(['secret']));
    expect(result.value.mx?.taint).toEqual(expect.arrayContaining(['secret']));
  });

  it('preserves security labels for commandRef pass-through argument forwarding', async () => {
    const src = `
/exe @leaf(value) = @value
/exe @forward(value) = @leaf
`;
    const { ast } = await parse(src);
    await evaluate(ast, env);

    const forwardVar = env.getVariable('forward') as any;
    expect(forwardVar?.internal?.executableDef?.type).toBe('commandRef');
    expect(forwardVar?.internal?.executableDef?.commandArgs?.length ?? 0).toBe(0);

    const secureArg = wrapStructured('vault-token', 'text', 'vault-token', {
      security: makeSecurityDescriptor({
        labels: ['secret'],
        taint: ['secret'],
        sources: ['phase0-command-ref-pass-through']
      })
    });

    const invocation: ExecInvocation = {
      type: 'ExecInvocation',
      nodeId: 'forward-pass-through',
      commandRef: {
        type: 'CommandReference',
        nodeId: 'forward-pass-through-ref',
        identifier: 'forward',
        args: [secureArg as any]
      }
    };

    const result = await evaluateExecInvocation(invocation, env);
    expect(asText(result.value)).toBe('vault-token');
    expect(isStructuredValue(result.value)).toBe(true);
    expect(result.value.mx?.labels).toEqual(expect.arrayContaining(['secret']));
    expect(result.value.mx?.taint).toEqual(expect.arrayContaining(['secret']));
  });

  it('keeps invocation-level pipeline source retryable for exec invocations', async () => {
    const src = `
/exe @seed() = "seed"
/exe @retryer(input, pipeline) = when [
  @pipeline.try < 3 => retry "again"
  * => @pipeline.try
]
/var @out = @seed() with { pipeline: [@retryer(@p)] }
`;
    const { ast } = await parse(src);
    await evaluate(ast, env);

    const outVar = env.getVariable('out') as any;
    const outValue = outVar?.value;
    const outText = isStructuredValue(outValue) ? asText(outValue) : String(outValue ?? '');
    expect(outText).toBe('3');
  });

  it('labels keychain get output as secret', async () => {
    env.recordPolicyConfig('policy', {
      capabilities: { danger: ['@keychain'] },
      keychain: { allow: ['mlld-box-{projectname}/*'] }
    });
    const source: VariableSource = {
      directive: 'var',
      syntax: 'expression',
      hasInterpolation: false,
      isMultiLine: false
    };
    const execVar = createExecutableVariable(
      'kcGet',
      'code',
      '',
      ['service', 'account'],
      'js',
      source
    );
    execVar.internal = {
      ...(execVar.internal ?? {}),
      isBuiltinTransformer: true,
      keychainFunction: 'get',
      transformerImplementation: async () => 'top-secret'
    };
    env.setVariable('kcGet', execVar);

    const invocation: ExecInvocation = {
      type: 'ExecInvocation',
      nodeId: 'kc-get',
      commandRef: {
        type: 'CommandReference',
        nodeId: 'kc-get-ref',
        identifier: 'kcGet',
        args: [
          { type: 'Text', content: 'mlld-box-demo' } as any,
          { type: 'Text', content: 'account' } as any
        ]
      }
    };

    const result = await evaluateExecInvocation(invocation, env);
    expect(isStructuredValue(result.value)).toBe(true);
    expect(result.value.mx?.labels).toContain('secret');
    expect(result.value.mx?.taint).toEqual(expect.arrayContaining(['secret', 'src:keychain']));
    expect(result.value.mx?.sources).toContain('keychain.get');
  });
});
