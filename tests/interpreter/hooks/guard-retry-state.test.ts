import { describe, expect, it } from 'vitest';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { Environment } from '@interpreter/env/Environment';
import { createSimpleTextVariable } from '@core/types/variable';
import {
  buildGuardAttemptKey,
  clearGuardAttemptState,
  clearGuardAttemptStates,
  getAttemptStore
} from '@interpreter/hooks/guard-retry-state';

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

function createInput(name: string) {
  return createSimpleTextVariable(
    name,
    `${name}-value`,
    {
      directive: 'var',
      syntax: 'quoted',
      hasInterpolation: false,
      isMultiLine: false
    },
    {}
  );
}

describe('guard retry-state utilities', () => {
  it('shares the same attempt store across a root environment tree', () => {
    const root = createEnv();
    const child = root.createChild();
    const grandChild = child.createChild();

    const rootStore = getAttemptStore(root);
    const childStore = getAttemptStore(child);
    const grandChildStore = getAttemptStore(grandChild);

    expect(childStore).toBe(rootStore);
    expect(grandChildStore).toBe(rootStore);
  });

  it('builds distinct attempt keys for scope and variable identity', () => {
    const operation = {
      type: 'show',
      name: 'preview',
      metadata: { trace: 'trace-1' }
    } as const;

    const first = createInput('first');
    const second = createInput('second');

    const perInputFirst = buildGuardAttemptKey(operation, 'perInput', first);
    const perInputSecond = buildGuardAttemptKey(operation, 'perInput', second);
    const perOperation = buildGuardAttemptKey(operation, 'perOperation');

    expect(perInputFirst).not.toEqual(perInputSecond);
    expect(perInputFirst).not.toEqual(perOperation);
    expect(perInputFirst).toContain('perInput');
    expect(perOperation).toContain('perOperation');
  });

  it('supports retry sequencing state and cleanup helpers', () => {
    const env = createEnv();
    const store = getAttemptStore(env);
    const input = createInput('retry-target');
    const operation = {
      type: 'run',
      name: 'execute',
      metadata: { trace: 'trace-2' }
    } as const;
    const key = buildGuardAttemptKey(operation, 'perInput', input);

    store.set(key, {
      nextAttempt: 3,
      history: [
        { attempt: 1, decision: 'retry', hint: 'first retry' },
        { attempt: 2, decision: 'retry', hint: 'second retry' }
      ]
    });

    expect(store.get(key)?.nextAttempt).toBe(3);
    expect(store.get(key)?.history).toHaveLength(2);

    clearGuardAttemptState(store, key);
    expect(store.has(key)).toBe(false);

    const firstKey = buildGuardAttemptKey(operation, 'perInput', createInput('a'));
    const secondKey = buildGuardAttemptKey(operation, 'perInput', createInput('b'));
    store.set(firstKey, { nextAttempt: 2, history: [] });
    store.set(secondKey, { nextAttempt: 2, history: [] });

    clearGuardAttemptStates(store, [firstKey, secondKey]);
    expect(store.has(firstKey)).toBe(false);
    expect(store.has(secondKey)).toBe(false);
  });
});
