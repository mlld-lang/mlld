import { describe, expect, it, vi } from 'vitest';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import {
  createForIterationError,
  formatForIterationError,
  publishForErrorsContext,
  recordParallelExpressionIterationError
} from './error-reporting';
import type { ForIterationError } from './types';

function createEnvironment(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

describe('for error reporting helpers', () => {
  it('strips directive wrapper text from formatted iteration errors', () => {
    const err = new Error('Directive error (pipeline): Missing input at line 12, column 7');
    expect(formatForIterationError(err)).toBe('Missing input');
  });

  it('publishes forErrors to ambient @mx context', () => {
    const env = createEnvironment();
    const errors: ForIterationError[] = [
      createForIterationError({ index: 1, key: 'k', error: 'boom', value: { id: 1 } })
    ];

    publishForErrorsContext(env, errors);
    const ambient = env.getContextManager()?.buildAmbientContext();
    expect(Array.isArray((ambient as any).errors)).toBe(true);
    expect((ambient as any).errors).toEqual(errors);
  });

  it('records formatted stderr effects for parallel iteration failures', () => {
    const env = createEnvironment();
    const errors: ForIterationError[] = [];
    const emitSpy = vi.spyOn(env, 'emitEffect');
    const sourceLocation = {
      start: { offset: 0, line: 1, column: 1 },
      end: { offset: 0, line: 1, column: 1 }
    };

    const marker = recordParallelExpressionIterationError({
      env,
      errors,
      index: 2,
      key: 'item-2',
      error: new Error('Directive error (pipeline): Stage exploded at line 20, column 1'),
      value: { id: 2 },
      sourceLocation
    });

    expect(marker.message).toBe('Stage exploded');
    expect(errors).toEqual([marker]);
    expect(emitSpy).toHaveBeenCalledTimes(1);
    const [effectType, content] = emitSpy.mock.calls[0];
    expect(effectType).toBe('stderr');
    expect(content).toContain('for iteration 2 error: Stage exploded');
  });
});
