import { describe, expect, it } from 'vitest';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { createHandleWrapper } from '@core/types/handle';
import { resolveValueHandles } from './handle-resolution';
import { wrapStructured } from './structured-value';

describe('resolveValueHandles', () => {
  it('preserves keepStructured internal state when rebuilding structured values', async () => {
    const env = new Environment(new MemoryFileSystem(), new PathService(), '/');
    const resolvedValue = { name: 'Ada', age: 42 };
    const handle = env.issueHandle(resolvedValue);
    const structured = wrapStructured(
      { recipient: createHandleWrapper(handle.handle) },
      'object',
      '{"recipient":{"handle":"' + handle.handle + '"}}',
      { filename: 'sample.json' }
    );
    structured.internal = { keepStructured: true };

    const resolved = await resolveValueHandles(structured, env);

    expect(resolved).not.toBe(structured);
    expect((resolved as any).internal.keepStructured).toBe(true);
    expect((resolved as any).mx.filename).toBe('sample.json');
    expect((resolved as any).data).toEqual({ recipient: resolvedValue });
    expect((resolved as any).text).toBe('{"recipient":{"handle":"' + handle.handle + '"}}');
  });
});
