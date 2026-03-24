import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { ErrorSeverity, MlldError } from '@core/errors';
import { execute } from './execute';
import { ExecuteError } from './types';

const interpretMock = vi.hoisted(() => vi.fn());

vi.mock('@interpreter/index', async () => {
  const actual = await vi.importActual<typeof import('@interpreter/index')>('@interpreter/index');
  return {
    ...actual,
    interpret: interpretMock
  };
});

describe('execute error wrapping', () => {
  beforeEach(() => {
    interpretMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sanitizes large runtime error causes before wrapping them for SDK consumers', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    await fileSystem.writeFile('/routes/route.mlld', '/show "boom"');

    interpretMock.mockRejectedValueOnce(new MlldError('Cannot access field "model" on non-object value', {
      code: 'FIELD_ACCESS_ERROR',
      severity: ErrorSeverity.Recoverable,
      details: {
        env: {
          securityManagers: {
            huge: 'x'.repeat(20000)
          }
        },
        resolverManager: {
          caches: ['stale-entry']
        },
        context: {
          field: 'model'
        }
      }
    }));

    let thrown: unknown;
    try {
      await execute('/routes/route.mlld', undefined, { fileSystem, pathService });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ExecuteError);
    expect((thrown as InstanceType<typeof ExecuteError>).code).toBe('RUNTIME_ERROR');

    const cause = (thrown as InstanceType<typeof ExecuteError> & {
      cause?: Error & { details?: Record<string, unknown> };
    }).cause;

    expect(cause).toBeInstanceOf(Error);
    expect(cause?.details).toEqual({
      env: '[omitted internal state]',
      resolverManager: '[omitted internal state]',
      context: {
        field: 'model'
      }
    });

    const serializedCause = JSON.stringify(cause?.details ?? {});
    expect(serializedCause).not.toContain('securityManagers');
    expect(serializedCause.length).toBeLessThan(500);
  });
});
