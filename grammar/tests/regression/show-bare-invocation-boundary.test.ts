import { describe, expect, test } from 'vitest';
import { parse } from '@grammar/parser';

describe('show bare invocation boundary regression', () => {
  test('parses a bare top-level invocation after show on the next line', async () => {
    const input = `record @contact = {
  facts: [email: string, id: string],
  data: [name: string]
}

shelf @s = { candidates: contact[] }

exe @search() = js {
  return [{ email: "alice@example.com", id: "c1", name: "Alice" }];
} => contact

var @found = @search()

show "--- candidates before write ---"
@s.write(@s.candidates, @found.0)
show "--- candidates after write ---"
`;

    const result = await parse(input, { mode: 'strict' });
    expect(result.success).toBe(true);
    if (!result.success) throw result.error;

    const showDirectives = result.ast.filter((node: any) => node?.type === 'Directive' && node.kind === 'show');
    expect(showDirectives).toHaveLength(2);
  });

  test('reports same-line multiple arguments at the second argument location', async () => {
    const result = await parse('show "a" "b"', { mode: 'strict' });
    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected show parse to fail');

    const error = result.error as Error & {
      mlldErrorLocation?: { start: { line: number; column: number } };
    };

    expect(error.message).toContain('show accepts only a single argument');
    expect(error.mlldErrorLocation?.start.line).toBe(1);
    expect(error.mlldErrorLocation?.start.column).toBe(10);
  });
});
