import { describe, it, expect } from 'vitest';
import { normalizeOutput, normalizeOutputWithOptions } from '@interpreter/output/normalizer';

describe('normalizeOutput', () => {
  it('strips trailing whitespace per line', () => {
    const input = 'line1  \nline2\t\nline3';
    const output = normalizeOutput(input);
    expect(output).toBe('line1\nline2\nline3\n');
  });

  it('collapses 3+ newlines to max 2', () => {
    const input = 'line1\n\n\n\nline2';
    const output = normalizeOutput(input);
    expect(output).toBe('line1\n\nline2\n');
  });

  it('collapses even more newlines', () => {
    const input = 'line1\n\n\n\n\n\n\nline2';
    const output = normalizeOutput(input);
    expect(output).toBe('line1\n\nline2\n');
  });

  it('preserves single blank lines', () => {
    const input = 'line1\n\nline2';
    const output = normalizeOutput(input);
    expect(output).toBe('line1\n\nline2\n');
  });

  it('ensures single trailing newline', () => {
    const input = 'content';
    const output = normalizeOutput(input);
    expect(output).toBe('content\n');
  });

  it('removes multiple trailing newlines', () => {
    const input = 'content\n\n\n';
    const output = normalizeOutput(input);
    expect(output).toBe('content\n');
  });

  it('handles empty string', () => {
    const output = normalizeOutput('');
    expect(output).toBe('\n');
  });

  it('handles only newlines', () => {
    const output = normalizeOutput('\n\n\n\n');
    expect(output).toBe('\n');
  });

  it('preserves internal whitespace', () => {
    const input = 'hello  world\nfoo  bar';
    const output = normalizeOutput(input);
    expect(output).toBe('hello  world\nfoo  bar\n');
  });

  it('handles tabs and spaces', () => {
    const input = 'line1\t  \nline2 \t \nline3';
    const output = normalizeOutput(input);
    expect(output).toBe('line1\nline2\nline3\n');
  });
});

describe('normalizeOutputWithOptions', () => {
  it('respects stripTrailingWhitespace option', () => {
    const input = 'line1  \nline2  ';
    const output = normalizeOutputWithOptions(input, {
      stripTrailingWhitespace: false
    });
    expect(output).toBe('line1  \nline2  \n');
  });

  it('respects maxConsecutiveNewlines option', () => {
    const input = 'line1\n\n\n\nline2';
    const output = normalizeOutputWithOptions(input, {
      maxConsecutiveNewlines: 3
    });
    expect(output).toBe('line1\n\n\nline2\n');
  });

  it('respects maxConsecutiveNewlines = 1', () => {
    const input = 'line1\n\n\nline2';
    const output = normalizeOutputWithOptions(input, {
      maxConsecutiveNewlines: 1
    });
    expect(output).toBe('line1\nline2\n');
  });

  it('respects ensureTrailingNewline option', () => {
    const input = 'content';
    const output = normalizeOutputWithOptions(input, {
      ensureTrailingNewline: false
    });
    expect(output).toBe('content');
  });

  it('combines all options', () => {
    const input = 'line1  \n\n\n\nline2\t';
    const output = normalizeOutputWithOptions(input, {
      stripTrailingWhitespace: true,
      maxConsecutiveNewlines: 1,
      ensureTrailingNewline: true
    });
    expect(output).toBe('line1\nline2\n');
  });

  it('uses defaults when no options provided', () => {
    const input = 'line1  \n\n\nline2';
    const output1 = normalizeOutputWithOptions(input);
    const output2 = normalizeOutput(input);
    expect(output1).toBe(output2);
  });
});
