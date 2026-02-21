import { describe, expect, test } from 'vitest';
import { parse, parseSync } from '@grammar/parser';
import type { HookDirectiveNode } from '@core/types/hook';
import { isHookDirective } from '@core/types/hook';

describe('Hook directive', () => {
  test('parses named operation hook with block body', async () => {
    const content = `/hook @progress after op:for:iteration = [
      show \`iter @mx.for.index\`
    ]`;

    const parseResult = await parse(content);
    expect(parseResult.ast).toHaveLength(1);

    const directive = parseResult.ast[0];
    expect(isHookDirective(directive)).toBe(true);

    const hook = directive as HookDirectiveNode;
    expect(hook.kind).toBe('hook');
    expect(hook.subtype).toBe('hook');
    expect(hook.meta.timing).toBe('after');
    expect(hook.meta.bodyKind).toBe('block');

    expect(hook.values.name?.[0]).toMatchObject({ identifier: 'progress' });
    expect(hook.values.filter[0].filterKind).toBe('operation');
    expect(hook.values.filter[0].value).toBe('for:iteration');
    expect(hook.values.body[0]).toMatchObject({ type: 'HookBlock' });
  });

  test('parses function hook with argument prefix filter and when body', async () => {
    const content = `/hook before @claudePoll("review") = when [
      @mx.op.name == "claudePoll" => show "hit"
      * => skip
    ]`;

    const parseResult = await parse(content);
    expect(parseResult.ast).toHaveLength(1);

    const hook = parseResult.ast[0] as HookDirectiveNode;
    expect(hook.meta.timing).toBe('before');
    expect(hook.meta.bodyKind).toBe('when');
    expect(hook.meta.hasArgPattern).toBe(true);
    expect(hook.values.filter[0]).toMatchObject({
      filterKind: 'function',
      value: 'claudePoll',
      argPattern: 'review'
    });
    expect(hook.values.body[0]).toMatchObject({ type: 'WhenExpression' });
  });

  test('parses data-label hook filter', async () => {
    const content = `/hook @sanitize before untrusted = [
      => @input
    ]`;

    const parseResult = await parse(content);
    const hook = parseResult.ast[0] as HookDirectiveNode;

    expect(hook.values.filter[0].filterKind).toBe('data');
    expect(hook.values.filter[0].value).toBe('untrusted');
    expect(hook.meta.scope).toBe('perInput');
  });

  test('parses strict-mode hook without slash prefix', () => {
    const ast = parseSync('hook @audit after op:exe = [ show "x" ]', { mode: 'strict' });
    const hook = ast[0] as HookDirectiveNode;

    expect(hook.kind).toBe('hook');
    expect(hook.subtype).toBe('hook');
    expect(hook.meta.timing).toBe('after');
    expect(hook.values.filter[0]).toMatchObject({
      filterKind: 'operation',
      value: 'exe'
    });
  });

  test('rejects legacy guard-style hook syntax with for keyword', () => {
    expect(() => parseSync('/hook @audit for op:exe = [ show "x" ]')).toThrow();
  });

  test('rejects hook declarations without timing keyword', () => {
    expect(() => parseSync('/hook @audit op:exe = [ show "x" ]')).toThrow();
  });

  test('rejects unquoted function argument filters', () => {
    expect(() => parseSync('/hook before @audit(test) = [ show "x" ]')).toThrow();
  });
});
