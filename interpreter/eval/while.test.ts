import { describe, expect, it } from 'vitest';
import type { WhilePipelineStage } from '@core/types';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { wrapStructured } from '@interpreter/utils/structured-value';
import { evaluateWhileStage } from './while';

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

describe('evaluateWhileStage', () => {
  it('terminates with null when processor returns done null', async () => {
    const env = createEnv();
    const stage: WhilePipelineStage = {
      type: 'whileStage',
      cap: 5,
      rateMs: null,
      processor: { type: 'VariableReference', identifier: 'processor', fields: [] } as any,
      rawIdentifier: 'while'
    };

    const result = await evaluateWhileStage(
      stage,
      wrapStructured('seed', 'text', 'seed'),
      env,
      async (_processor, _state, iterEnv) => ({
        value: {
          type: 'Literal',
          valueType: 'done',
          value: [{ type: 'Literal', valueType: 'null', value: null }]
        },
        env: iterEnv
      })
    );

    expect(result).toBeNull();
  });
});
