import { describe, it, expect } from 'vitest';
import { AutoUnwrapManager } from './auto-unwrap-manager';
import type { LoadContentResult } from '@core/types/load-content';

function createLoadContentResult(id: string, content: string): LoadContentResult {
  return {
    content,
    filename: `${id}.txt`,
    relative: `./${id}.txt`,
    absolute: `/tmp/${id}.txt`,
    tokest: 0,
    tokens: 0,
    fm: undefined,
    json: undefined
  };
}

describe('AutoUnwrapManager', () => {
  it('throws when unwrap is called outside executeWithPreservation', () => {
    expect(() => AutoUnwrapManager.unwrap('value')).toThrow(
      /executeWithPreservation context/
    );
  });

  it('restores duplicate LoadContentResult entries in original order', async () => {
    const source = [
      createLoadContentResult('aws', 'sk-123'),
      createLoadContentResult('gcp', 'sk-123'),
      createLoadContentResult('azure', 'sk-123')
    ];

    const restored = await AutoUnwrapManager.executeWithPreservation(async () => {
      const unwrapped = AutoUnwrapManager.unwrap(source);
      expect(unwrapped).toEqual(['sk-123', 'sk-123', 'sk-123']);
      return unwrapped;
    });

    expect(Array.isArray(restored)).toBe(true);
    expect(restored[0]).toBe(source[0]);
    expect(restored[1]).toBe(source[1]);
    expect(restored[2]).toBe(source[2]);
  });
});
