import { describe, expect, it } from 'vitest';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { createObjectVariable } from '@core/types/variable/VariableFactories';
import type { VariableSource } from '@core/types/variable';
import { wrapStructured } from '@interpreter/utils/structured-value';
import { AutoUnwrapManager } from '@interpreter/eval/auto-unwrap-manager';
import { PipelineCommandArgumentBinder } from './command-argument-binder';

const VARIABLE_SOURCE: VariableSource = {
  directive: 'var',
  syntax: 'object',
  hasInterpolation: false,
  isMultiLine: false
};

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

describe('pipeline command argument binder', () => {
  it('preserves explicit primitive and text arguments', async () => {
    const env = createEnv();
    const binder = new PipelineCommandArgumentBinder();

    const args = await binder.processArguments(
      [
        7,
        true,
        null,
        {
          type: 'Text',
          content: 'alpha'
        }
      ],
      env
    );

    expect(args).toEqual([7, true, null, 'alpha']);
  });

  it('resolves variable references with field access for argument nodes', async () => {
    const env = createEnv();
    const binder = new PipelineCommandArgumentBinder();
    env.setVariable(
      'payload',
      createObjectVariable('payload', { user: { id: 42, role: 'admin' } }, true, VARIABLE_SOURCE)
    );

    const args = await binder.processArguments(
      [
        {
          type: 'VariableReference',
          identifier: 'payload',
          fields: [
            { type: 'field', value: 'user', optional: false },
            { type: 'field', value: 'id', optional: false }
          ]
        }
      ],
      env
    );

    expect(args).toEqual([42]);
  });

  it('auto-binds single-parameter commands to structured input wrappers', async () => {
    const binder = new PipelineCommandArgumentBinder();
    const structuredInput = wrapStructured({ value: 9 }, 'object', '{"value":9}');

    const args = await AutoUnwrapManager.executeWithPreservation(async () => {
      return await binder.bindParametersAutomatically(
        {
          type: 'executable',
          value: { paramNames: ['input'] }
        },
        'ignored-text',
        structuredInput
      );
    });

    expect(args).toEqual([structuredInput]);
  });

  it('auto-binds multi-parameter commands using JSON object input', async () => {
    const binder = new PipelineCommandArgumentBinder();

    const args = await AutoUnwrapManager.executeWithPreservation(async () => {
      return await binder.bindParametersAutomatically(
        {
          type: 'executable',
          value: { paramNames: ['name', 'meta', 'missing'] }
        },
        '{"name":"Ada","meta":{"team":"mlld"}}'
      );
    });

    expect(args).toEqual([
      { type: 'Text', content: 'Ada' },
      { type: 'Text', content: '{"team":"mlld"}' },
      { type: 'Text', content: '' }
    ]);
  });
});
