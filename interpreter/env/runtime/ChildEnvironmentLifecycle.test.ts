import { describe, expect, it, vi } from 'vitest';
import { ChildEnvironmentLifecycle } from './ChildEnvironmentLifecycle';

describe('ChildEnvironmentLifecycle', () => {
  it('resolves child context with path-context override and legacy fallback', () => {
    const lifecycle = new ChildEnvironmentLifecycle();
    const context = {
      projectRoot: '/repo',
      fileDirectory: '/repo/src',
      executionDirectory: '/repo/src',
      invocationDirectory: '/repo'
    };

    expect(lifecycle.resolveChildContext(context as any, '/repo', '/repo/child')).toEqual({
      ...context,
      fileDirectory: '/repo/child',
      executionDirectory: '/repo/child'
    });
    expect(lifecycle.resolveChildContext(context as any, '/repo')).toBe(context);
    expect(lifecycle.resolveChildContext(undefined, '/repo')).toBe('/repo');
    expect(lifecycle.resolveChildContext(undefined, '/repo', '/repo/child')).toBe('/repo/child');
  });

  it('applies shared inheritance and optional trace/module-node settings', () => {
    const lifecycle = new ChildEnvironmentLifecycle();
    const child = {
      allowAbsolutePaths: false,
      initialNodeCount: 0,
      streamingOptions: { enabled: false } as any,
      provenanceEnabled: false,
      moduleIsolated: false,
      traceEnabled: false,
      directiveTrace: [] as any[],
      setAllowedTools: vi.fn()
    };
    const parent = {
      allowAbsolutePaths: true,
      nodes: [{ type: 'Text', content: 'a' }, { type: 'Text', content: 'b' }] as any[],
      streamingOptions: { enabled: true } as any,
      provenanceEnabled: true,
      moduleIsolated: true,
      traceEnabled: true,
      directiveTrace: [{ directive: 'show', depth: 0 }] as any[],
      allowedTools: new Set(['alpha'])
    };

    lifecycle.applyChildInheritance(child as any, parent as any, {
      includeInitialNodeCount: true,
      includeModuleIsolation: true,
      includeTraceInheritance: true
    });

    expect(child.allowAbsolutePaths).toBe(true);
    expect(child.streamingOptions).toEqual({ enabled: true });
    expect(child.provenanceEnabled).toBe(true);
    expect(child.initialNodeCount).toBe(2);
    expect(child.moduleIsolated).toBe(true);
    expect(child.traceEnabled).toBe(true);
    expect(child.directiveTrace).toBe(parent.directiveTrace);
    expect(child.setAllowedTools).toHaveBeenCalledWith(parent.allowedTools);
  });

  it('merges child variables excluding block-scoped bindings and appends child nodes', () => {
    const lifecycle = new ChildEnvironmentLifecycle();
    const setVariable = vi.fn();
    const childVariables = new Map<string, any>([
      ['visible', { name: 'visible', value: 'yes', mx: {} }],
      ['letScoped', { name: 'letScoped', value: 'no', mx: { importPath: 'let' } }],
      ['paramScoped', { name: 'paramScoped', value: 'no', mx: { importPath: 'exe-param' } }]
    ]);
    const parentNodes = [{ type: 'Text', content: 'parent' } as any];
    const childNodes = [{ type: 'Text', content: 'child' } as any];

    lifecycle.mergeChildVariables({ setVariable }, childVariables as any);
    lifecycle.mergeChildNodes(parentNodes as any, childNodes as any);

    expect(setVariable).toHaveBeenCalledTimes(1);
    expect(setVariable).toHaveBeenCalledWith('visible', childVariables.get('visible'));
    expect(parentNodes).toHaveLength(2);
    expect(parentNodes[1]).toEqual({ type: 'Text', content: 'child' });
  });
});
