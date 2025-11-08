import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import type { ExecInvocation } from '@core/types';
import { Environment } from '../env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { parse } from '@grammar/parser';
import { evaluate } from '../core/interpreter';
import { evaluateExecInvocation } from './exec-invocation';
import { asText, isStructuredValue } from '../utils/structured-value';

describe('evaluateExecInvocation (structured)', () => {
  let env: Environment;

  beforeEach(async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    env = new Environment(fileSystem, pathService, '/');

    const source = `
/exe @emitText() = js { return 'hello' }
/exe @emitJson() = js { return '{"count":3}' }
/exe @parseJson(value) = js { return JSON.parse(value) }
`;
    const { ast } = await parse(source);
    await evaluate(ast, env);
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
});
