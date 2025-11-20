import { describe, expect, test } from 'vitest';
import { GuardRegistry } from '@interpreter/guards/GuardRegistry';
import type {
  GuardBlockNode,
  GuardDirectiveNode,
  GuardFilterNode,
  GuardScope,
  GuardTiming
} from '@core/types/guard';
import type { GuardFilterKind } from '@core/types/guard';

function makeGuardNode(options?: {
  filterKind?: GuardFilterKind;
  filterValue?: string;
  scope?: GuardScope;
  timing?: GuardTiming;
  name?: string;
}): GuardDirectiveNode {
  const filterKind = options?.filterKind ?? 'data';
  const filterValue = options?.filterValue ?? 'secret';
  const scope = options?.scope ?? 'perInput';
  const timing = options?.timing;
  const name = options?.name;

  const filterNode: GuardFilterNode = {
    type: 'GuardFilter',
    filterKind,
    scope,
    value: filterValue,
    raw: filterValue,
    location: null
  };

  const blockNode: GuardBlockNode = {
    type: 'GuardBlock',
    modifier: 'default',
    rules: [],
    location: null
  };

  return {
    type: 'Directive',
    kind: 'guard',
    subtype: 'guard',
    source: undefined,
    values: {
      filter: [filterNode],
      guard: [blockNode],
      ...(name
        ? {
            name: [
              {
                type: 'VariableReference',
                valueType: 'identifier',
                identifier: name,
                location: null
              }
            ]
          }
        : {})
    },
    raw: {
      filter: filterValue,
      ...(name ? { name: `@${name}` } : {}),
      timing: timing ?? 'before'
    },
    meta: {
      filterKind,
      filterValue,
      scope,
      modifier: 'default',
      ruleCount: 0,
      hasName: Boolean(name),
      timing: timing ?? 'before',
      location: null
    },
    location: null
  };
}

describe('GuardRegistry timing', () => {
  test('defaults timing to before', () => {
    const registry = new GuardRegistry();
    registry.register(makeGuardNode({ timing: undefined }));

    const guards = registry.getDataGuardsForTiming('secret', 'before');
    expect(guards).toHaveLength(1);
    expect(guards[0].timing).toBe('before');
  });

  test('filters by timing and preserves registration order', () => {
    const registry = new GuardRegistry();
    const before = registry.register(makeGuardNode({ timing: 'before', filterValue: 'secret' }));
    const after = registry.register(makeGuardNode({ timing: 'after', filterValue: 'secret' }));
    const always = registry.register(makeGuardNode({ timing: 'always', filterValue: 'secret' }));

    const beforeGuards = registry
      .getDataGuardsForTiming('secret', 'before')
      .map(def => def.id);
    expect(beforeGuards).toEqual([before.id, always.id]);

    const afterGuards = registry
      .getDataGuardsForTiming('secret', 'after')
      .map(def => def.id);
    expect(afterGuards).toEqual([after.id, always.id]);
  });
});
