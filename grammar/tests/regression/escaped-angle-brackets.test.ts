import { describe, expect, test } from 'vitest';
import { parse } from '@grammar/parser';

describe('Escaped angle bracket expressions', () => {
  test('parses <<hello>> as literal angle text in interpolation contexts', async () => {
    const result = await parse('/var @tag = `<<hello>>`', { mode: 'strict' });
    expect(result.success).toBe(true);
    if (!result.success) throw result.error;

    const directive = result.ast[0] as any;
    const value = directive.values.value;
    expect(value).toHaveLength(1);
    expect(value[0]).toMatchObject({
      type: 'Literal',
      value: '<hello>'
    });
  });

  test('parses @var interpolation inside <<...>>', async () => {
    const result = await parse('/var @x = "<<@tag>>"', { mode: 'strict' });
    expect(result.success).toBe(true);
    if (!result.success) throw result.error;

    const directive = result.ast[0] as any;
    const value = directive.values.value;
    expect(value).toHaveLength(1);
    expect(value[0].type).toBe('EscapedAngleBracketExpression');
    expect(value[0].content).toHaveLength(1);
    expect(value[0].content[0]).toMatchObject({
      type: 'VariableReference',
      identifier: 'tag'
    });
  });

  test('parses closing-tag form <</@tag>>', async () => {
    const result = await parse('/var @x = "<</@tag>>"', { mode: 'strict' });
    expect(result.success).toBe(true);
    if (!result.success) throw result.error;

    const directive = result.ast[0] as any;
    const escaped = directive.values.value[0];
    expect(escaped.type).toBe('EscapedAngleBracketExpression');
    expect(escaped.content[0]).toMatchObject({ type: 'Text', content: '/' });
    expect(escaped.content[1]).toMatchObject({ type: 'VariableReference', identifier: 'tag' });
  });

  test('keeps << at logical line start as a comment marker', async () => {
    const input = [
      '<< this is a comment at line start',
      '/var @x = `<<hello>>`'
    ].join('\n');
    const result = await parse(input, { mode: 'strict' });
    expect(result.success).toBe(true);
    if (!result.success) throw result.error;

    const comments = result.ast.filter((node: any) => node.type === 'Comment');
    const directives = result.ast.filter((node: any) => node.type === 'Directive');

    expect(comments).toHaveLength(1);
    expect(comments[0].marker).toBe('<<');
    expect(directives).toHaveLength(1);
  });

  test('treats <<file.md>> as literal text, not file-reference syntax', async () => {
    const result = await parse('/var @x = `<<file.md>>`', { mode: 'strict' });
    expect(result.success).toBe(true);
    if (!result.success) throw result.error;

    const directive = result.ast[0] as any;
    const value = directive.values.value;
    expect(value).toHaveLength(1);
    expect(value[0]).toMatchObject({
      type: 'Literal',
      value: '<file.md>'
    });
  });

  test('supports nested file reference interpolation in <<<file.md>.mx.filename>>', async () => {
    const result = await parse('/var @x = "<<<file.md>.mx.filename>>"', { mode: 'strict' });
    expect(result.success).toBe(true);
    if (!result.success) throw result.error;

    const directive = result.ast[0] as any;
    const escaped = directive.values.value[0];
    expect(escaped.type).toBe('EscapedAngleBracketExpression');
    expect(escaped.content[0]).toMatchObject({
      type: 'FileReference'
    });
  });
});

