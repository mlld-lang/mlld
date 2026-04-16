import { describe, expect, it } from 'vitest';
import { Environment } from '@interpreter/env/Environment';
import {
  ENVIRONMENT_SERIALIZE_PLACEHOLDER
} from '@interpreter/env/EnvironmentIdentity';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { builtinTransformers } from './transformers';

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

describe('builtin transformers', () => {
  it('pretty serializes object inputs before formatting them', async () => {
    const env = createEnv();
    const pretty = builtinTransformers.find(transformer => transformer.name === 'pretty');

    expect(pretty).toBeDefined();

    const rendered = await pretty!.implementation({ env });

    expect(JSON.parse(rendered)).toEqual({
      env: ENVIRONMENT_SERIALIZE_PLACEHOLDER
    });
  });

  it('pretty keeps the existing string-input behavior for non-JSON strings', async () => {
    const pretty = builtinTransformers.find(transformer => transformer.name === 'pretty');

    expect(pretty).toBeDefined();
    await expect(pretty!.implementation('not-json')).resolves.toBe('not-json');
  });
});
