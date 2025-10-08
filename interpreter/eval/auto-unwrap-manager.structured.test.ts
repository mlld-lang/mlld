import { describe, it, expect } from 'vitest';
import { AutoUnwrapManager } from './auto-unwrap-manager';
import { ensureStructuredValue, isStructuredValue } from '@interpreter/utils/structured-value';

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
      expect(result.metadata?.filename).toBe('example.md');
      expect(result.type).toBe('object');
      expect(result.data.content).toBe('Updated');
    }
  });
});
