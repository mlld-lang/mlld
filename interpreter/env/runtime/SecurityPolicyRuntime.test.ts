import { describe, expect, it } from 'vitest';
import { makeSecurityDescriptor } from '@core/types/security';
import { SecurityPolicyRuntime } from './SecurityPolicyRuntime';

describe('SecurityPolicyRuntime', () => {
  it('enforces tool scope narrowing against parent runtime', () => {
    const parent = new SecurityPolicyRuntime();
    parent.setAllowedTools(['alpha', 'beta']);

    const child = new SecurityPolicyRuntime(parent);
    expect(() => child.setAllowedTools(['alpha', 'gamma'])).toThrow(/outside parent/i);
    expect(() => child.setAllowedTools(['alpha'])).not.toThrow();
    expect(child.isToolAllowed('alpha')).toBe(true);
    expect(child.isToolAllowed('beta')).toBe(false);
  });

  it('records policy config and policy environment context', () => {
    const runtime = new SecurityPolicyRuntime();
    runtime.setPolicyContext({ tier: 'strict', activePolicies: ['base'] });
    runtime.recordPolicyConfig('audit', { defaults: { trustconflict: 'error' } });
    runtime.setPolicyEnvironment('prod');

    const context = runtime.getPolicyContext() as any;
    expect(context.tier).toBe('strict');
    expect(context.activePolicies).toEqual(expect.arrayContaining(['base', 'audit']));
    expect(context.environment).toBe('prod');
    expect(context.configs).toBeDefined();
    expect(runtime.getPolicySummary()).toBeDefined();
  });

  it('creates capability context from security stack frames', () => {
    const runtime = new SecurityPolicyRuntime();
    runtime.pushSecurityContext({
      descriptor: makeSecurityDescriptor({ labels: ['secret'], sources: ['test'] }),
      kind: 'command',
      operation: { type: 'run' }
    });

    const snapshot = runtime.getSecuritySnapshot();
    expect(snapshot?.labels).toEqual(expect.arrayContaining(['secret']));
    expect(snapshot?.sources).toEqual(expect.arrayContaining(['test']));
    expect(snapshot?.operation).toEqual({ type: 'run' });

    runtime.recordSecurityDescriptor(makeSecurityDescriptor({ labels: ['network'] }));
    const mergedSnapshot = runtime.getSecuritySnapshot();
    expect(mergedSnapshot?.labels).toEqual(expect.arrayContaining(['secret', 'network']));

    const capability = runtime.popSecurityContext();
    expect(capability?.kind).toBe('command');
    expect(capability?.security.labels).toEqual(expect.arrayContaining(['secret', 'network']));

    const postPopSnapshot = runtime.getSecuritySnapshot();
    expect(postPopSnapshot?.labels ?? []).not.toContain('secret');
  });
});
