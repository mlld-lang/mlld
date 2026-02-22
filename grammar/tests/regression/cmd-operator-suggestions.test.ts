import { describe, expect, it } from 'vitest';
import { parse } from '@grammar/parser';

describe('cmd operator suggestion messages', () => {
  it('includes run and exe shell-block guidance for run cmd parse errors', async () => {
    const result = await parse('/run cmd { echo hi > out.txt }', { mode: 'strict' });
    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('run sh(@path)');
    expect(result.error?.message).toContain('exe @fn(path) = sh');
    expect(result.error?.message).not.toContain('sh(@myVar)');
  });

  it('includes run and exe shell-block guidance for exe cmd parse errors', async () => {
    const result = await parse('/exe @save(path) = cmd { echo "$path" > out.txt }', { mode: 'strict' });
    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('run sh(@path)');
    expect(result.error?.message).toContain('exe @fn(path) = sh');
    expect(result.error?.message).not.toContain('sh(@myVar)');
  });
});
