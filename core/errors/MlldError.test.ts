import { describe, expect, it } from 'vitest';
import { ErrorSeverity, MlldError } from './MlldError';

describe('MlldError serialization', () => {
  it('omits heavy internal detail trees from toJSON output', () => {
    const error = new MlldError('runtime failed', {
      code: 'RUNTIME_ERROR',
      severity: ErrorSeverity.Recoverable,
      details: {
        environment: {
          securityManager: { secret: 'top-secret' },
          resolverManager: { cache: { '@mlld/claude': '2.1.0' } }
        },
        baseValue: {
          model: 'haiku',
          nested: { shouldNot: 'expand' }
        },
        location: {
          line: 4,
          column: 2
        }
      }
    });

    const json = error.toJSON();
    const text = JSON.stringify(json);

    expect(json.details).toMatchObject({
      environment: '[omitted internal state]',
      location: {
        line: 4,
        column: 2
      }
    });
    expect(String((json.details as Record<string, unknown>).baseValue)).toContain('[Object');
    expect(text).not.toContain('securityManager');
    expect(text).not.toContain('resolverManager');
    expect(text).not.toContain('top-secret');
    expect(text).not.toContain('shouldNot');
  });
});
