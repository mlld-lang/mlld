import { describe, it, expect } from 'vitest';
import { AutoUnwrapManager } from './auto-unwrap-manager';
import { ensureStructuredValue, isStructuredValue } from '@interpreter/utils/structured-value';
import {
  ENVIRONMENT_SERIALIZE_PLACEHOLDER,
  markEnvironment
} from '@interpreter/env/EnvironmentIdentity';

describe('AutoUnwrapManager (structured values)', () => {
  it('restores structured metadata after unwrapping transformations', async () => {
    const structured = ensureStructuredValue(
      { filename: 'example.md', content: 'Initial' },
      'object',
      'Initial text',
      { source: 'load-content', filename: 'example.md' }
    );

    const result = await AutoUnwrapManager.executeWithPreservation(async () => {
      const data = AutoUnwrapManager.unwrap(structured);
      data.content = 'Updated';
      return data;
    });

    expect(isStructuredValue(result)).toBe(true);
    if (isStructuredValue(result)) {
      expect(result.mx.filename).toBe('example.md');
      expect(result.type).toBe('object');
      expect(result.data.content).toBe('Updated');
    }
  });

  it('keeps transformed structured text opaque when data contains tagged environments', async () => {
    const envLike: Record<string, unknown> = {};
    markEnvironment(envLike);
    Object.defineProperty(envLike, 'danger', {
      enumerable: true,
      get() {
        throw new Error('environment getter should not be walked');
      }
    });

    const structured = ensureStructuredValue(
      { holder: 'seed' },
      'object',
      '{"holder":"seed"}',
      { source: 'load-content', filename: 'example.json' }
    );

    const result = await AutoUnwrapManager.executeWithPreservation(async () => {
      const data = AutoUnwrapManager.unwrap(structured) as Record<string, unknown>;
      data.holder = envLike;
      return data;
    });

    expect(isStructuredValue(result)).toBe(true);
    if (isStructuredValue(result)) {
      expect(result.text).toContain(ENVIRONMENT_SERIALIZE_PLACEHOLDER);
      expect(result.text).not.toContain('danger');
    }
  });
});
