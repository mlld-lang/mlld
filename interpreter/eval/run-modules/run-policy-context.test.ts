import { describe, expect, it, vi } from 'vitest';
import type { PolicyEnforcer } from '@interpreter/policy/PolicyEnforcer';
import type { EvaluationContext } from '@interpreter/core/interpreter';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import {
  applyRunOperationContext,
  buildRunCapabilityOperationUpdate,
  buildRunCommandOperationUpdate,
  checkRunInputLabelFlow,
  deriveRunOutputPolicyDescriptor,
  enforceRunCapabilityPolicy,
  enforceRunCommandPolicy
} from './run-policy-context';

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

describe('run policy/context helpers', () => {
  it('builds command operation updates with labels, sources, and metadata', () => {
    const update = buildRunCommandOperationUpdate('echo hello', { existing: true });

    expect(update.command).toBe('echo hello');
    expect(update.opLabels).toEqual(
      expect.arrayContaining(['op:cmd', 'op:cmd:echo', 'op:cmd:echo:hello', 'op:run'])
    );
    expect(update.sources).toEqual(expect.arrayContaining(['cmd:echo:hello']));
    expect(update.metadata).toEqual(expect.objectContaining({ existing: true, commandPreview: 'echo hello' }));
  });

  it('builds capability operation updates with optional subtype/source settings', () => {
    const updateWithSubtype = buildRunCapabilityOperationUpdate('js', {
      includeSubtype: true,
      includeSources: true
    });
    const updateWithoutSubtype = buildRunCapabilityOperationUpdate('js');

    expect(updateWithSubtype.opLabels).toEqual(expect.arrayContaining(['op:js']));
    expect(updateWithSubtype.subtype).toBe('js');
    expect(updateWithoutSubtype.subtype).toBeUndefined();
  });

  it('applies operation context updates to both context object and environment', () => {
    const env = createEnv();
    const context = {
      operationContext: {
        type: 'run',
        metadata: { seed: true }
      }
    } as unknown as EvaluationContext;

    applyRunOperationContext(env, context, {
      opLabels: ['op:cmd'],
      command: 'echo hello',
      metadata: { seed: true, commandPreview: 'echo hello' }
    });

    expect(context.operationContext?.command).toBe('echo hello');
    expect(context.operationContext?.opLabels).toEqual(['op:cmd']);
  });

  it('preserves command allow/deny behavior', () => {
    const env = createEnv();

    expect(() =>
      enforceRunCommandPolicy({ allow: { cmd: ['echo:*'] } } as any, 'echo allowed', env)
    ).not.toThrow();
    expect(() =>
      enforceRunCommandPolicy({ deny: { cmd: ['echo:*'] } } as any, 'echo denied', env)
    ).toThrow("Command 'echo' denied by policy");
  });

  it('preserves capability allow/deny behavior', () => {
    const env = createEnv();

    expect(() =>
      enforceRunCapabilityPolicy({ allow: { js: true } } as any, 'js', env)
    ).not.toThrow();
    expect(() =>
      enforceRunCapabilityPolicy({ deny: { js: true } } as any, 'js', env)
    ).toThrow('JavaScript access denied by policy');
  });

  it('checks label flow with channel-specific context and returns computed taint', () => {
    const env = createEnv();
    const checkLabelFlow = vi.fn();
    const policyEnforcer = {
      checkLabelFlow,
      applyOutputPolicyLabels: vi.fn()
    } as unknown as PolicyEnforcer;

    const taint = checkRunInputLabelFlow({
      descriptor: {
        labels: ['secret'],
        taint: ['secret'],
        sources: ['fixture']
      },
      policyEnforcer,
      policyChecksEnabled: true,
      opLabels: ['op:cmd'],
      exeLabels: ['secret'],
      flowChannel: 'stdin',
      env,
      sourceLocation: { line: 1, column: 1 },
      command: 'echo'
    });

    expect(taint).toEqual(['secret']);
    expect(checkLabelFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        flowChannel: 'stdin',
        opLabels: ['op:cmd'],
        exeLabels: ['secret'],
        command: 'echo'
      }),
      expect.objectContaining({ env })
    );
  });

  it('skips label-flow checks when policy checks are disabled', () => {
    const env = createEnv();
    const checkLabelFlow = vi.fn();
    const policyEnforcer = {
      checkLabelFlow,
      applyOutputPolicyLabels: vi.fn()
    } as unknown as PolicyEnforcer;

    const taint = checkRunInputLabelFlow({
      descriptor: {
        labels: ['secret'],
        taint: ['secret'],
        sources: []
      },
      policyEnforcer,
      policyChecksEnabled: false,
      opLabels: ['op:cmd'],
      exeLabels: [],
      flowChannel: 'arg',
      env,
      sourceLocation: { line: 1, column: 1 }
    });

    expect(taint).toEqual(['secret']);
    expect(checkLabelFlow).not.toHaveBeenCalled();
  });

  it('derives output policy descriptor through the shared helper', () => {
    const outputDescriptor = {
      labels: ['influenced'],
      taint: [],
      sources: []
    };
    const applyOutputPolicyLabels = vi.fn().mockReturnValue(outputDescriptor);
    const policyEnforcer = {
      checkLabelFlow: vi.fn(),
      applyOutputPolicyLabels
    } as unknown as PolicyEnforcer;

    const result = deriveRunOutputPolicyDescriptor({
      policyEnforcer,
      inputTaint: ['secret'],
      exeLabels: ['trusted']
    });

    expect(result).toBe(outputDescriptor);
    expect(applyOutputPolicyLabels).toHaveBeenCalledWith(undefined, {
      inputTaint: ['secret'],
      exeLabels: ['trusted']
    });
  });
});
