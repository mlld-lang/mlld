import { describe, expect, it } from 'vitest';
import { cloneErrorForTransport, sanitizeSerializableValue, serializeError, truncateText } from './errorSerialization';

describe('errorSerialization', () => {
  it('does not truncate normal payload strings by default', () => {
    const long = 'x'.repeat(5000);
    const sanitized = sanitizeSerializableValue({ output: long }) as { output: string };

    expect(sanitized.output).toBe(long);
    expect(sanitized.output).not.toContain('[truncated');
  });

  it('does not truncate error messages during transport cloning', () => {
    const long = 'x'.repeat(5000);
    const cloned = cloneErrorForTransport(new Error(long), { includeStack: false }) as Error;

    expect(cloned.message).toBe(long);
  });

  it('does not truncate serialized error messages', () => {
    const long = 'x'.repeat(5000);
    const serialized = serializeError(new Error(long), { includeStack: false }) as { message: string };

    expect(serialized.message).toBe(long);
  });

  it('truncateText preserves explicit truncation behavior', () => {
    const long = 'x'.repeat(5000);

    expect(truncateText(long, 4000)).toContain('[truncated');
    expect(truncateText(long, 0)).toBe(long);
  });
});
