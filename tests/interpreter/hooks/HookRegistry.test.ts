import { describe, expect, test } from 'vitest';
import { parseSync } from '@grammar/parser';
import type { HookDirectiveNode } from '@core/types/hook';
import { HookRegistry } from '@interpreter/hooks/HookRegistry';

function parseHookDirective(source: string): HookDirectiveNode {
  return parseSync(source)[0] as HookDirectiveNode;
}

describe('HookRegistry', () => {
  test('returns hooks in registration order across parent and child registries', () => {
    const parent = new HookRegistry();
    const first = parent.register(parseHookDirective('/hook @first before op:exe = [ => @input ]'));

    const child = parent.createChild();
    const second = child.register(parseHookDirective('/hook @second before op:exe = [ => @input ]'));
    const third = parent.register(parseHookDirective('/hook @third before op:exe = [ => @input ]'));

    const hooks = child.getOperationHooks('exe', 'before');
    expect(hooks.map(hook => hook.name)).toEqual(['first', 'second', 'third']);
    expect(hooks.map(hook => hook.registrationOrder)).toEqual([
      first.registrationOrder,
      second.registrationOrder,
      third.registrationOrder
    ]);
  });

  test('filters hooks by timing', () => {
    const registry = new HookRegistry();
    registry.register(parseHookDirective('/hook @beforeHook before op:run = [ => @input ]'));
    registry.register(parseHookDirective('/hook @afterHook after op:run = [ => @output ]'));

    const beforeHooks = registry.getOperationHooks('run', 'before');
    const afterHooks = registry.getOperationHooks('run', 'after');

    expect(beforeHooks.map(hook => hook.name)).toEqual(['beforeHook']);
    expect(afterHooks.map(hook => hook.name)).toEqual(['afterHook']);
  });

  test('indexes function, operation, and data filters', () => {
    const registry = new HookRegistry();
    registry.register(parseHookDirective('/hook @fn before @summarize("review") = [ => @input ]'));
    registry.register(parseHookDirective('/hook @op before op:for:iteration = [ => @input ]'));
    registry.register(parseHookDirective('/hook @data after untrusted = [ => @output ]'));

    const functionHooks = registry.getFunctionHooks('summarize', 'before');
    const operationHooks = registry.getOperationHooks('for:iteration', 'before');
    const dataHooks = registry.getDataHooks('untrusted', 'after');

    expect(functionHooks).toHaveLength(1);
    expect(functionHooks[0].name).toBe('fn');
    expect(functionHooks[0].argPattern).toBe('review');

    expect(operationHooks).toHaveLength(1);
    expect(operationHooks[0].name).toBe('op');

    expect(dataHooks).toHaveLength(1);
    expect(dataHooks[0].name).toBe('data');
  });

  test('exposes parent and child registrations across the same environment tree', () => {
    const parent = new HookRegistry();
    parent.register(parseHookDirective('/hook @parentHook before op:show = [ => @input ]'));

    const child = parent.createChild();
    child.register(parseHookDirective('/hook @childHook before op:show = [ => @input ]'));

    expect(parent.getOperationHooks('show', 'before').map(hook => hook.name)).toEqual([
      'parentHook',
      'childHook'
    ]);
    expect(child.getOperationHooks('show', 'before').map(hook => hook.name)).toEqual([
      'parentHook',
      'childHook'
    ]);
  });

  test('rejects duplicate named hook registrations', () => {
    const registry = new HookRegistry();
    registry.register(parseHookDirective('/hook @audit before op:exe = [ => @input ]'));
    expect(() => registry.register(parseHookDirective('/hook @audit after op:exe = [ => @output ]'))).toThrow(
      /already exists/
    );
  });
});
