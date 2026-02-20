import { describe, expect, it } from 'vitest';
import { parseSync } from '@grammar/parser';

function hasBailDirective(node: unknown): boolean {
  if (!node || typeof node !== 'object') {
    return false;
  }

  if ((node as any).type === 'Directive' && (node as any).kind === 'bail') {
    return true;
  }

  for (const value of Object.values(node as Record<string, unknown>)) {
    if (!value) {
      continue;
    }
    if (Array.isArray(value)) {
      if (value.some(item => hasBailDirective(item))) {
        return true;
      }
      continue;
    }
    if (typeof value === 'object' && hasBailDirective(value)) {
      return true;
    }
  }

  return false;
}

describe('bail directive grammar', () => {
  it('parses strict-mode bail with a message', () => {
    const ast = parseSync('bail "stop here"', { mode: 'strict' });
    const node = ast[0] as any;

    expect(node.type).toBe('Directive');
    expect(node.kind).toBe('bail');
    expect(node.subtype).toBe('bail');
    expect(Array.isArray(node.values.message)).toBe(true);
    expect(node.values.message).toHaveLength(1);
    expect(node.meta.hasMessage).toBe(true);
  });

  it('parses markdown-mode /bail with a message', () => {
    const ast = parseSync('/bail "stop here"', { mode: 'markdown' });
    const node = ast[0] as any;

    expect(node.type).toBe('Directive');
    expect(node.kind).toBe('bail');
    expect(node.subtype).toBe('bail');
    expect(node.meta.hasMessage).toBe(true);
  });

  it('parses bail without a message', () => {
    const ast = parseSync('bail', { mode: 'strict' });
    const node = ast[0] as any;

    expect(node.type).toBe('Directive');
    expect(node.kind).toBe('bail');
    expect(node.subtype).toBe('bail');
    expect(node.values.message).toEqual([]);
    expect(node.meta.hasMessage).toBe(false);
  });

  it('parses bail inside if/when/for action blocks', () => {
    const ast = parseSync(
      '/if true [ bail "if stop" ]\n/when true => [ bail "when stop" ]\n/for @x in [1] [ bail "for stop" ]',
      { mode: 'markdown' }
    );

    expect(hasBailDirective(ast)).toBe(true);
  });
});

