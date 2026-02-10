import { describe, expect, it } from 'vitest';
import { parse } from '@grammar/parser';
import type { PipelineCommand } from '@core/types';
import { createSimpleTextVariable } from '@core/types/variable';
import type { VariableSource } from '@core/types/variable';
import { evaluate } from '@interpreter/core/interpreter';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { resolveCommandReference } from '../command-execution';

const TEXT_SOURCE: VariableSource = {
  directive: 'var',
  syntax: 'quoted',
  hasInterpolation: false,
  isMultiLine: false
};

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

async function evaluateSource(source: string, env: Environment): Promise<void> {
  const { ast } = await parse(source);
  await evaluate(ast, env);
}

function variableRefCommand(identifier: string, fields: unknown[] = []): PipelineCommand {
  return {
    rawIdentifier: identifier,
    identifier: [
      {
        type: 'VariableReference',
        identifier,
        fields
      } as any
    ],
    args: [],
    rawArgs: []
  };
}

describe('resolveCommandReference extraction parity', () => {
  it('throws the same missing variant error category', async () => {
    const env = createEnv();
    const base = createSimpleTextVariable('variants', 'seed', TEXT_SOURCE, {
      internal: {
        transformerVariants: {
          fromlist: { marker: 'ok' }
        }
      }
    });
    env.setVariable('variants', base);

    await expect(
      resolveCommandReference(
        variableRefCommand('variants', [{ type: 'field', value: 'missing' }]),
        env
      )
    ).rejects.toThrow(`Pipeline function '@variants.missing' is not defined`);
  });

  it('preserves invalid field-access error behavior', async () => {
    const env = createEnv();
    await evaluateSource('/var @plain = \"abc\"', env);

    await expect(
      resolveCommandReference(
        variableRefCommand('plain', [{ type: 'field', value: 'length' }]),
        env
      )
    ).rejects.toThrow(`Cannot access field 'length' on string`);
  });

  it('keeps nested path traversal behavior for mixed field and array tokens', async () => {
    const env = createEnv();
    await evaluateSource('/var @obj = { \"nested\": { \"items\": [{\"name\":\"a\"},{\"name\":\"b\"}] } }', env);

    const resolved = await resolveCommandReference(
      variableRefCommand('obj', [
        { type: 'field', value: 'nested' },
        { type: 'field', value: 'items' },
        { type: 'arrayIndex', value: 1 },
        { type: 'field', value: 'name' }
      ]),
      env
    );

    expect(resolved).toBe('b');
  });

  it('keeps transformer variant lookup parity across direct and dotted identifiers', async () => {
    const env = createEnv();
    const variantValue = { name: 'variant-output', nested: { value: 7 } };
    const base = createSimpleTextVariable('variants', 'seed', TEXT_SOURCE, {
      internal: {
        transformerVariants: {
          fromlist: variantValue
        }
      }
    });
    env.setVariable('variants', base);

    const direct = await resolveCommandReference(
      variableRefCommand('variants', [{ type: 'field', value: 'fromlist' }]),
      env
    );
    const dotted = await resolveCommandReference(
      variableRefCommand('variants.fromlist'),
      env
    );
    const dottedNested = await resolveCommandReference(
      variableRefCommand('variants.fromlist.nested.value'),
      env
    );

    expect(direct).toEqual(variantValue);
    expect(dotted).toEqual(variantValue);
    expect(dottedNested).toBe(7);
  });
});
