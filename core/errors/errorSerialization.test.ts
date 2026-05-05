import { describe, expect, it } from 'vitest';
import { cloneErrorForTransport, sanitizeSerializableValue, serializeError, truncateText } from './errorSerialization';
import {
  ENVIRONMENT_SERIALIZE_PLACEHOLDER,
  markEnvironment
} from '@core/utils/environment-identity';

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

  it('treats tagged environments as opaque even when they look like plain objects', () => {
    const envLike: Record<string, unknown> = {
      nested: {
        secret: 'top-secret'
      }
    };
    markEnvironment(envLike);

    expect(sanitizeSerializableValue({ holder: envLike })).toEqual({
      holder: ENVIRONMENT_SERIALIZE_PLACEHOLDER
    });
  });

  it('serializes structured values through data without invoking lazy text getters', () => {
    let textReads = 0;
    const structured = {
      type: 'object',
      data: { ok: true },
      [Symbol.for('mlld.StructuredValue')]: true
    };
    Object.defineProperty(structured, 'text', {
      enumerable: true,
      get() {
        textReads += 1;
        throw new Error('text should stay lazy');
      }
    });

    expect(sanitizeSerializableValue({ structured })).toEqual({
      structured: { ok: true }
    });
    expect(textReads).toBe(0);
  });

  it('truncateText preserves explicit truncation behavior', () => {
    const long = 'x'.repeat(5000);

    expect(truncateText(long, 4000)).toContain('[truncated');
    expect(truncateText(long, 0)).toBe(long);
  });
});
