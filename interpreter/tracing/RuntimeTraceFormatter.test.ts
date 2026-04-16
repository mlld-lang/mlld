import { describe, expect, it } from 'vitest';
import { formatRuntimeTraceLine } from './RuntimeTraceFormatter';
import {
  ENVIRONMENT_SERIALIZE_PLACEHOLDER,
  markEnvironment
} from '@interpreter/env/EnvironmentIdentity';

describe('formatRuntimeTraceLine', () => {
  it('treats tagged environments as opaque in trace output', () => {
    const envLike: Record<string, unknown> = {
      state: {
        secret: 'top-secret'
      }
    };
    markEnvironment(envLike);

    const line = formatRuntimeTraceLine({
      category: 'effects',
      event: 'toolEntryObject',
      scope: { requestId: 'req-1' },
      data: { payload: envLike }
    } as any);

    expect(line).toContain(`payload=\"${ENVIRONMENT_SERIALIZE_PLACEHOLDER}\"`);
    expect(line).not.toContain('top-secret');
  });
});
