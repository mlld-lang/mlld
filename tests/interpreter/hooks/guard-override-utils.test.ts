import { describe, expect, it } from 'vitest';
import type { GuardDefinition } from '@interpreter/guards';
import {
  applyGuardOverrideFilter,
  extractGuardOverride,
  normalizeGuardOverride,
  resolveWithClause
} from '@interpreter/hooks/guard-override-utils';

function createGuard(options: {
  id: string;
  name?: string;
  privileged?: boolean;
}): GuardDefinition {
  return {
    id: options.id,
    name: options.name,
    filterKind: 'data',
    filterValue: 'secret',
    scope: 'perInput',
    modifier: 'default',
    block: {
      type: 'GuardBlock',
      modifier: 'default',
      rules: [],
      location: null
    },
    registrationOrder: 1,
    timing: 'before',
    privileged: options.privileged
  };
}

describe('guard override utilities', () => {
  describe('with-clause resolution', () => {
    it('resolves withClause from exec hook targets', () => {
      const node = {
        type: 'ExecInvocation',
        withClause: { guards: false }
      } as any;

      expect(resolveWithClause(node)).toEqual({ guards: false });
      expect(extractGuardOverride(node)).toBe(false);
    });

    it('resolves withClause from effect hook metadata', () => {
      const node = {
        type: 'Effect',
        meta: { withClause: { guards: { only: ['@ga'] } } }
      } as any;

      expect(resolveWithClause(node)).toEqual({ guards: { only: ['@ga'] } });
      expect(extractGuardOverride(node)).toEqual({ only: ['@ga'] });
    });

    it('resolves nested withClause from directive values', () => {
      const node = {
        kind: 'show',
        values: {
          invocation: {
            withClause: { guards: { except: ['@gb'] } }
          }
        }
      } as any;

      expect(resolveWithClause(node)).toEqual({ guards: { except: ['@gb'] } });
      expect(extractGuardOverride(node)).toEqual({ except: ['@gb'] });
    });

    it('falls back to directive meta.withClause', () => {
      const node = {
        kind: 'show',
        meta: {
          withClause: { guards: { only: ['@metaGuard'] } }
        }
      } as any;

      expect(resolveWithClause(node)).toEqual({ guards: { only: ['@metaGuard'] } });
      expect(extractGuardOverride(node)).toEqual({ only: ['@metaGuard'] });
    });
  });

  describe('normalization', () => {
    it('normalizes undefined and empty overrides to none', () => {
      expect(normalizeGuardOverride(undefined)).toEqual({ kind: 'none' });
      expect(normalizeGuardOverride({} as any)).toEqual({ kind: 'none' });
    });

    it('normalizes false to disableAll', () => {
      expect(normalizeGuardOverride(false)).toEqual({ kind: 'disableAll' });
    });

    it('normalizes only and except lists', () => {
      const only = normalizeGuardOverride({ only: ['@ga', ' @gb '] });
      const except = normalizeGuardOverride({ except: ['@ga'] });

      expect(only.kind).toBe('only');
      expect(Array.from(only.names ?? [])).toEqual(['ga', 'gb']);
      expect(except.kind).toBe('except');
      expect(Array.from(except.names ?? [])).toEqual(['ga']);
    });

    it('throws with preserved errors for invalid payloads', () => {
      expect(() =>
        normalizeGuardOverride({ only: ['@ga'], except: ['@gb'] })
      ).toThrow('Guard override cannot specify both only and except');

      expect(() =>
        normalizeGuardOverride({ only: '@ga' } as any)
      ).toThrow('Guard override only value must be an array');

      expect(() =>
        normalizeGuardOverride({ except: '@gb' } as any)
      ).toThrow('Guard override except value must be an array');

      expect(() =>
        normalizeGuardOverride({ only: [1] } as any)
      ).toThrow('Guard override only entries must be strings starting with @');

      expect(() =>
        normalizeGuardOverride({ only: ['ga'] })
      ).toThrow('Guard override only entries must start with @');

      expect(() =>
        normalizeGuardOverride({ only: ['@'] })
      ).toThrow('Guard override only entries must include a name after @');

      expect(() =>
        normalizeGuardOverride('invalid' as any)
      ).toThrow('Guard override must be false or an object');
    });
  });

  describe('filtering', () => {
    const guards: GuardDefinition[] = [
      createGuard({ id: 'priv', name: 'policyGuard', privileged: true }),
      createGuard({ id: 'ga', name: 'ga' }),
      createGuard({ id: 'gb', name: 'gb' }),
      createGuard({ id: 'unnamed' })
    ];

    it('keeps all guards for kind none', () => {
      const filtered = applyGuardOverrideFilter(guards, { kind: 'none' });
      expect(filtered.map(guard => guard.id)).toEqual(['priv', 'ga', 'gb', 'unnamed']);
    });

    it('keeps only privileged guards for disableAll', () => {
      const filtered = applyGuardOverrideFilter(guards, { kind: 'disableAll' });
      expect(filtered.map(guard => guard.id)).toEqual(['priv']);
    });

    it('keeps privileged plus explicitly listed guards for only', () => {
      const filtered = applyGuardOverrideFilter(guards, {
        kind: 'only',
        names: new Set(['ga'])
      });
      expect(filtered.map(guard => guard.id)).toEqual(['priv', 'ga']);
    });

    it('keeps privileged and non-excluded guards for except', () => {
      const filtered = applyGuardOverrideFilter(guards, {
        kind: 'except',
        names: new Set(['gb', 'policyGuard'])
      });
      expect(filtered.map(guard => guard.id)).toEqual(['priv', 'ga', 'unnamed']);
    });
  });
});
