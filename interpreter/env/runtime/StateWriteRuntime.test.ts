import { describe, expect, it, vi } from 'vitest';
import { makeSecurityDescriptor } from '@core/types/security';
import { StateWriteRuntime } from './StateWriteRuntime';

type VariableStore = {
  vars: Map<string, any>;
  hasVariable(name: string): boolean;
  setVariable(name: string, variable: any): void;
  updateVariable(name: string, variable: any): void;
};

function createVariableStore(): VariableStore {
  const vars = new Map<string, any>();
  return {
    vars,
    hasVariable(name: string): boolean {
      return vars.has(name);
    },
    setVariable(name: string, variable: any): void {
      vars.set(name, variable);
    },
    updateVariable(name: string, variable: any): void {
      vars.set(name, variable);
    }
  };
}

describe('StateWriteRuntime', () => {
  it('tracks writes and mirrors updates into state variable and dynamic resolver', () => {
    const variableStore = createVariableStore();
    const runtime = new StateWriteRuntime(variableStore as any);
    const updateModule = vi.fn();

    runtime.registerDynamicStateSnapshot(
      { value: 'old', nested: { count: 1 } },
      { updateModule } as any,
      'user-data'
    );

    expect(variableStore.vars.get('state')?.value?.value).toBe('old');

    runtime.recordStateWrite({
      path: 'value',
      value: 'new',
      operation: 'set',
      security: makeSecurityDescriptor()
    });
    runtime.recordStateWrite({
      path: 'nested.count',
      value: 2,
      operation: 'set',
      security: makeSecurityDescriptor()
    });

    const stateVar = variableStore.vars.get('state');
    expect(stateVar?.value?.value).toBe('new');
    expect(stateVar?.value?.nested?.count).toBe(2);
    expect(stateVar?.mx?.labels).toEqual(expect.arrayContaining(['src:dynamic', 'src:user-data']));
    expect(updateModule).toHaveBeenCalled();

    const writes = runtime.getStateWrites();
    expect(writes).toHaveLength(2);
    expect(writes[0].index).toBe(0);
    expect(writes[1].index).toBe(1);
  });

  it('records writes even when no dynamic state snapshot exists', () => {
    const variableStore = createVariableStore();
    const runtime = new StateWriteRuntime(variableStore as any);

    runtime.recordStateWrite({
      path: 'missing.value',
      value: 'x',
      operation: 'set',
      security: makeSecurityDescriptor()
    });

    expect(runtime.getStateWrites()).toHaveLength(1);
    expect(variableStore.vars.has('state')).toBe(false);
  });
});
