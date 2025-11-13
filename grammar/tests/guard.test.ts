import { describe, expect, test } from 'vitest';
import { parse } from '@grammar/parser';
import { isGuardDirective } from '@core/types/guards';
import type { GuardDirectiveNode } from '@core/types/guard';

describe('Guard directive', () => {
  test('parses data-label guard', async () => {
    const content = `/guard for secret = when [
      @ctx.op.type == "op:cmd" => deny "No secrets in shell"
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

    expect(guard.values.guard).toHaveLength(1);
    const block = guard.values.guard[0];
    expect(block.rules).toHaveLength(2);
    expect(block.rules[0].action.decision).toBe('deny');
    expect(block.rules[1].isWildcard).toBe(true);
    expect(block.rules[1].action.decision).toBe('allow');
  });

  test('parses named operation guard', async () => {
    const content = `/guard @shellRestrictions for op:run = when first [
      @input.any.ctx.labels.includes("secret") => deny "No secrets in run directives"
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
    expect(guard.meta.modifier).toBe('first');
    expect(guard.meta.ruleCount).toBe(2);
  });
});
