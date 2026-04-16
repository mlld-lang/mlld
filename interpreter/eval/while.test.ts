import { describe, expect, it } from 'vitest';
import type { WhilePipelineStage } from '@core/types';
import { Environment } from '@interpreter/env/Environment';
import {
  ENVIRONMENT_SERIALIZE_PLACEHOLDER,
  markEnvironment
} from '@interpreter/env/EnvironmentIdentity';
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

  it('normalizes plain object state with opaque environment placeholders', async () => {
    const env = createEnv();
    const stage: WhilePipelineStage = {
      type: 'whileStage',
      cap: 1,
      rateMs: null,
      processor: { type: 'VariableReference', identifier: 'processor', fields: [] } as any,
      rawIdentifier: 'while'
    };

    const envLike: Record<string, unknown> = {};
    markEnvironment(envLike);
    Object.defineProperty(envLike, 'danger', {
      enumerable: true,
      get() {
        throw new Error('environment getter should not be walked');
      }
    });

    const result = await evaluateWhileStage(
      stage,
      { holder: envLike } as any,
      env,
      async (_processor, state, iterEnv) => {
        expect(state.text).toContain(ENVIRONMENT_SERIALIZE_PLACEHOLDER);
        expect(state.text).not.toContain('danger');
        return {
          value: {
            type: 'Literal',
            valueType: 'done',
            value: [{ type: 'Literal', valueType: 'string', value: state.text }]
          },
          env: iterEnv
        };
      }
    );

    expect(result).toContain(ENVIRONMENT_SERIALIZE_PLACEHOLDER);
  });
});
