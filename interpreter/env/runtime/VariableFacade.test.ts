import { describe, expect, it } from 'vitest';
import { createSimpleTextVariable } from '@core/types/variable';
import { VariableFacade, type ImportBindingInfo } from './VariableFacade';

type VariableStore = {
  vars: Map<string, any>;
  setVariable(name: string, variable: any): void;
  setParameterVariable(name: string, variable: any): void;
  updateVariable(name: string, variable: any): void;
  getVariable(name: string): any;
  getVariableValue(name: string): any;
  hasVariable(name: string): boolean;
};

function createVariableStore(): VariableStore {
  const vars = new Map<string, any>();
  return {
    vars,
    setVariable(name: string, variable: any): void {
      vars.set(name, variable);
    },
    setParameterVariable(name: string, variable: any): void {
      vars.set(name, variable);
    },
    updateVariable(name: string, variable: any): void {
      vars.set(name, variable);
    },
    getVariable(name: string): any {
      return vars.get(name);
    },
    getVariableValue(name: string): any {
      return vars.get(name)?.value;
    },
    hasVariable(name: string): boolean {
      return vars.has(name);
    }
  };
}

describe('VariableFacade', () => {
  it('tracks import bindings in local registry', () => {
    const store = createVariableStore();
    const bindings = new Map<string, ImportBindingInfo>();
    const facade = new VariableFacade(store as any, bindings);

    facade.setImportBinding('token', { source: './module.mld' });
    expect(facade.getImportBinding('token')).toEqual({ source: './module.mld' });
  });

  it('supports variable access and frontmatter aliases', () => {
    const store = createVariableStore();
    const bindings = new Map<string, ImportBindingInfo>();
    const facade = new VariableFacade(store as any, bindings);

    const source = {
      directive: 'var',
      syntax: 'quoted',
      hasInterpolation: false,
      isMultiLine: false
    } as const;
    facade.setVariable('name', createSimpleTextVariable('name', 'Ada', source));

    expect(facade.getVariable('name')?.value).toBe('Ada');
    expect(facade.getVariableValue('name')).toBe('Ada');
    expect(facade.hasVariable('name')).toBe(true);

    facade.setFrontmatter({ title: 'Doc' });
    expect(store.vars.get('fm')).toBeDefined();
    expect(store.vars.get('frontmatter')).toBeDefined();
    expect(store.vars.get('fm')).toBe(store.vars.get('frontmatter'));
    expect(store.vars.get('fm')?.value?.title).toBe('Doc');
  });

  it('resolves transform lookup across built-ins and executable variables', () => {
    const store = createVariableStore();
    const bindings = new Map<string, ImportBindingInfo>();
    const facade = new VariableFacade(store as any, bindings);

    const source = {
      directive: 'var',
      syntax: 'quoted',
      hasInterpolation: false,
      isMultiLine: false
    } as const;
    const executable = createSimpleTextVariable('custom', 'noop', source, {
      internal: {
        isResolver: false
      }
    }) as any;
    executable.__executable = true;
    facade.setVariable('custom', executable);

    const builtins = {
      trim: () => 'trimmed'
    };
    expect(facade.getTransform('trim', builtins)).toBe(builtins.trim);
    expect(facade.getTransform('custom', builtins)).toBe(executable);
    expect(facade.getTransform('missing', builtins)).toBeUndefined();
  });
});
