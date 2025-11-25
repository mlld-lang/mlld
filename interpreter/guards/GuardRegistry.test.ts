import { describe, expect, test } from 'vitest';
import { GuardRegistry } from './GuardRegistry';
import type { GuardDirectiveNode, GuardBlockNode } from '@core/types/guard';

function createGuardDirective(name?: string | null, filterValue = 'secret'): GuardDirectiveNode {
  const block: GuardBlockNode = {
    type: 'GuardBlock',
    nodeId: 'block',
    modifier: 'default',
    rules: [
      {
        type: 'GuardRule',
        nodeId: 'rule',
        action: {
          type: 'GuardAction',
          nodeId: 'action',
          decision: 'allow',
          location: null
        },
        location: null
      }
    ],
    location: null
  };

  const directive: GuardDirectiveNode = {
    type: 'Directive',
    nodeId: 'guard',
    kind: 'guard',
    subtype: 'guard',
    values: {
      name: name
        ? [
            {
              type: 'VariableReference',
              nodeId: 'name',
              identifier: name,
              valueType: 'identifier',
              location: null
            }
          ]
        : undefined,
      filter: [
        {
          type: 'GuardFilter',
          nodeId: 'filter',
          filterKind: 'data',
          scope: 'perInput',
          value: filterValue,
          raw: filterValue,
          location: null
        }
      ],
      guard: [block]
    },
    raw: {},
    meta: {
      filterKind: 'data',
      filterValue: filterValue,
      scope: 'perInput',
      modifier: 'default',
      ruleCount: 1,
      hasName: Boolean(name)
    },
    location: null,
    source: undefined
  };

  return directive;
}

describe('GuardRegistry', () => {
  test('registers named guards and blocks duplicates', () => {
    const registry = new GuardRegistry();
    registry.register(createGuardDirective('secretProtector'));
    expect(() => registry.register(createGuardDirective('secretProtector'))).toThrow();
  });

  test('child registry inherits parent guards and serializes local definitions', () => {
    const parent = new GuardRegistry();
    parent.register(createGuardDirective('parentGuard'));

    const child = parent.createChild();
    child.register(createGuardDirective('childGuard', 'pii'));

    const dataGuards = child.getDataGuards('pii');
    expect(dataGuards).toHaveLength(1);
    expect(dataGuards[0].name).toBe('childGuard');

    const serialized = child.serializeOwn();
    expect(serialized).toHaveLength(1);
    expect(serialized[0].name).toBe('childGuard');

    const parentSerialized = parent.serializeOwn();
    expect(parentSerialized).toHaveLength(1);
    expect(parentSerialized[0].name).toBe('parentGuard');
  });

  test('returns guards in registration order across parent and child', () => {
    const parent = new GuardRegistry();
    const first = parent.register(createGuardDirective('first', 'secret'));
    const child = parent.createChild();
    const second = child.register(createGuardDirective('second', 'secret'));
    const third = parent.register(createGuardDirective('third', 'secret'));

    const guards = child.getDataGuards('secret');
    expect(guards.map(g => g.name)).toEqual(['first', 'second', 'third']);
    expect(guards.map(g => g.registrationOrder)).toEqual([
      first.registrationOrder,
      second.registrationOrder,
      third.registrationOrder
    ]);
  });

  test('assigns deterministic ids to unnamed guards', () => {
    const registry = new GuardRegistry();
    const first = registry.register(createGuardDirective(null, 'secret'));
    const second = registry.register(createGuardDirective(undefined, 'secret'));

    expect(first.id).toBe('<unnamed-guard-1>');
    expect(second.id).toBe('<unnamed-guard-2>');
  });
});
