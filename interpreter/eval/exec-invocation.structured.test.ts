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
import { asText, isStructuredValue } from '../utils/structured-value';
import { createExecutableVariable } from '@core/types/variable';
import type { VariableSource } from '@core/types/variable';

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

  it('labels keychain get output as secret', async () => {
    env.recordPolicyConfig('policy', {
      capabilities: { danger: ['@keychain'] },
      keychain: { allow: ['mlld-env-{projectname}/*'] }
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
          { type: 'Text', content: 'mlld-env-demo' } as any,
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
