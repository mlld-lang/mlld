import { describe, expect, test } from 'vitest';
import { parse } from '@grammar/parser';
import { isGuardDirective } from '@core/types/guards';
import type { GuardDirectiveNode } from '@core/types/guard';

describe('Guard directive', () => {
  test('parses data-label guard', async () => {
    const content = `/guard for secret = when [
      @mx.op.type == "op:cmd" => deny "No secrets in shell"
      * => allow
    ]`;

    const parseResult = await parse(content);
    expect(parseResult.ast).toHaveLength(1);

    const directive = parseResult.ast[0];
    expect(isGuardDirective(directive)).toBe(true);

    const guard = directive as GuardDirectiveNode;
    expect(guard.kind).toBe('guard');
    expect(guard.subtype).toBe('guard');

    expect(guard.values.filter).toHaveLength(1);
    expect(guard.values.filter[0].filterKind).toBe('data');
    expect(guard.values.filter[0].value).toBe('secret');
    expect(guard.meta.scope).toBe('perInput');
    expect(guard.meta.timing).toBe('before');

    expect(guard.values.guard).toHaveLength(1);
    const block = guard.values.guard[0];
    expect(block.rules).toHaveLength(2);
    expect(block.rules[0].action.decision).toBe('deny');
    expect(block.rules[1].isWildcard).toBe(true);
    expect(block.rules[1].action.decision).toBe('allow');
  });

  test('parses named operation guard', async () => {
    const content = `/guard @shellRestrictions for op:run = when [
      @input.any.mx.labels.includes("secret") => deny "No secrets in run directives"
      * => allow
    ]`;

    const parseResult = await parse(content);
    expect(parseResult.ast).toHaveLength(1);

    const directive = parseResult.ast[0];
    expect(isGuardDirective(directive)).toBe(true);

    const guard = directive as GuardDirectiveNode;
    expect(guard.values.name).toBeDefined();
    const guardName = guard.values.name?.[0] as any;
    expect(guardName?.identifier).toBe('shellRestrictions');

    expect(guard.values.filter[0].filterKind).toBe('operation');
    expect(guard.values.filter[0].value).toBe('run');
    expect(guard.meta.scope).toBe('perOperation');
    expect(guard.meta.modifier).toBe('default');
    expect(guard.meta.ruleCount).toBe(2);
    expect(guard.meta.timing).toBe('before');
  });

  test('parses explicit timing variants', async () => {
    const beforeContent = `/guard before for secret = when [ * => allow ]`;
    const afterContent = `/guard after for secret = when [ * => allow ]`;
    const alwaysContent = `/guard always for secret = when [ * => allow ]`;

    const beforeResult = await parse(beforeContent);
    const beforeGuard = beforeResult.ast[0] as GuardDirectiveNode;
    expect(beforeGuard.meta.timing).toBe('before');

    const afterResult = await parse(afterContent);
    const afterGuard = afterResult.ast[0] as GuardDirectiveNode;
    expect(afterGuard.meta.timing).toBe('after');

    const alwaysResult = await parse(alwaysContent);
    const alwaysGuard = alwaysResult.ast[0] as GuardDirectiveNode;
    expect(alwaysGuard.meta.timing).toBe('always');
  });

  test('parses guard with privileged with-clause', async () => {
    const content = '/guard @privGuard before op:run = when [ * => deny "blocked" ] with { privileged: true }';
    const parseResult = await parse(content);
    const guard = parseResult.ast[0] as GuardDirectiveNode;

    expect(guard.meta.privileged).toBe(true);
    expect(guard.raw.privileged).toBe(true);
  });

  test('parses guard privileged prefix sugar', async () => {
    const content = '/guard privileged @privGuard before op:run = when [ * => deny "blocked" ]';
    const parseResult = await parse(content);
    const guard = parseResult.ast[0] as GuardDirectiveNode;

    expect(guard.meta.privileged).toBe(true);
    expect(guard.raw.privileged).toBe(true);
  });
});
